const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const moduleCache = new Map();

function resolveTsModulePath(fromDir, spec) {
  const base = spec.startsWith('@/')
    ? path.join(ROOT, 'src', spec.slice(2))
    : path.resolve(fromDir, spec);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  throw new Error(`Cannot resolve module "${spec}" from "${fromDir}"`);
}

function load(relative, imports = {}) {
  const filename = path.isAbsolute(relative) ? relative : path.join(ROOT, relative);
  const hasOverrides = Object.keys(imports).length > 0;
  if (!hasOverrides && moduleCache.has(filename)) {
    return moduleCache.get(filename);
  }
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;

  const mod = { exports: {} };
  if (!hasOverrides) {
    moduleCache.set(filename, mod.exports);
  }
  const localRequire = (spec) => {
    if (spec in imports) return imports[spec];
    if (spec.endsWith('.css')) {
      return new Proxy(
        {},
        {
          get: (_, prop) =>
            prop === '__esModule' || prop === 'then' || typeof prop === 'symbol'
              ? undefined
              : String(prop),
        }
      );
    }
    if (spec === 'lucide-react' || spec === 'recharts') {
      return new Proxy({}, { get: () => () => null });
    }
    if (spec.startsWith('@/') || spec.startsWith('.')) {
      return load(resolveTsModulePath(path.dirname(filename), spec), imports);
    }
    return require(spec);
  };

  const fn = vm.runInThisContext(
    `(function(exports, require, module, __filename, __dirname) { ${transpiled}\n})`,
    { filename }
  );
  fn(mod.exports, localRequire, mod, filename, path.dirname(filename));
  if (!hasOverrides) {
    moduleCache.set(filename, mod.exports);
  }
  return mod.exports;
}

function makeUnsignedTestJwt(accountId, sessionId, expiresAtEpochSeconds) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: 'fraudguard-service',
      aud: ['fraudguard-api'],
      sub: accountId,
      jti: sessionId,
      iat: expiresAtEpochSeconds - 900,
      exp: expiresAtEpochSeconds,
    })
  ).toString('base64url');
  return `${header}.${payload}.test-signature`;
}

/**
 * Contract-accurate local HTTP test double matching WorkspaceController,
 * WorkspaceServiceImpl, and AuthServiceImpl:
 * - GET /api/v1/workspaces
 * - GET /api/v1/workspaces/{id}
 * - PUT /api/v1/workspaces/{id}
 * - GET /api/v1/workspaces/{id}/history
 * - GET /api/v1/workspaces/{id}/eligible-staff
 * - GET /api/v1/workspaces/{id}/staff-assignments
 * - POST /api/v1/workspaces/{id}/staff-assignments
 */
async function startContractWorkspaceStaffUpstream({
  workspaces = [],
  staffAccounts = [],
  initialAssignmentsByWorkspaceId = {},
  accounts = [],
} = {}) {
  const store = new Map(workspaces.map((w) => [w.id, { ...w }]));
  const staffDirectory = new Map(staffAccounts.map((s) => [s.id, { ...s }]));
  const assignmentsStore = new Map();
  const historyStore = new Map();

  for (const w of workspaces) {
    const initList = (initialAssignmentsByWorkspaceId[w.id] ?? []).map((a) => ({
      staffId: a.staffId,
      assignedAt: a.assignedAt,
      active: a.active !== false,
    }));
    assignmentsStore.set(w.id, initList);
    historyStore.set(w.id, []);
  }

  const accountMap = new Map(accounts.map((a) => [a.token, a]));
  const receivedRequests = [];
  let nextForcedPostAssign = null;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ALLOWED_METADATA_KEYS = new Set([
    'version',
    'enterpriseName',
    'contactName',
    'contactEmail',
    'contactPhone',
  ]);
  const ALLOWED_ASSIGN_KEYS = new Set(['staffId', 'version']);

  const hasActiveAssignment = (wsId, staffId) =>
    (assignmentsStore.get(wsId) ?? []).some((a) => a.staffId === staffId && a.active);

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const parsedUrl = new URL(req.url, 'http://127.0.0.1');
      let parsedBody = null;
      if (rawBody) {
        try {
          parsedBody = JSON.parse(rawBody);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/problem+json' });
          res.end(JSON.stringify({ status: 400, detail: 'Malformed JSON' }));
          return;
        }
      }

      receivedRequests.push({
        method: req.method,
        pathname: parsedUrl.pathname,
        search: parsedUrl.search,
        authHeader: req.headers['authorization'] ?? null,
        body: parsedBody,
      });

      const auth = req.headers['authorization'] || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      const actor = accountMap.get(token);
      if (!actor || actor.expired) {
        res.writeHead(401, { 'WWW-Authenticate': 'Bearer error="invalid_token"' });
        res.end();
        return;
      }

      if (actor.mustChangePassword || actor.workspaceId !== null) {
        res.writeHead(403, { 'Content-Type': 'application/problem+json' });
        res.end(JSON.stringify({ status: 403, detail: 'Access denied' }));
        return;
      }

      if (req.method === 'GET' && parsedUrl.pathname === '/api/v1/workspaces') {
        if (actor.role !== 'PLATFORM_ADMIN' && actor.role !== 'IMPLEMENTATION_STAFF') {
          res.writeHead(403, { 'Content-Type': 'application/problem+json' });
          res.end(JSON.stringify({ status: 403, detail: 'Access denied' }));
          return;
        }
        const page = Number(parsedUrl.searchParams.get('page') ?? '0');
        const size = Number(parsedUrl.searchParams.get('size') ?? '20');
        const needle = (parsedUrl.searchParams.get('search') ?? '').trim().toLowerCase();
        const sorted = Array.from(store.values())
          .filter(
            (w) =>
              actor.role === 'PLATFORM_ADMIN' || hasActiveAssignment(w.id, actor.accountId)
          )
          .sort((a, b) => {
            if (a.enterpriseName !== b.enterpriseName) {
              return a.enterpriseName < b.enterpriseName ? -1 : 1;
            }
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
          });
        const filtered = sorted.filter(
          (w) =>
            !needle ||
            w.enterpriseName.toLowerCase().includes(needle) ||
            w.workspaceKey.toLowerCase().includes(needle)
        );
        const totalElements = filtered.length;
        const totalPages = totalElements === 0 ? 0 : Math.ceil(totalElements / size);
        const items = filtered.slice(page * size, page * size + size);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ items, page, size, totalElements, totalPages }));
        return;
      }

      if (parsedUrl.pathname.startsWith('/api/v1/workspaces/')) {
        const suffix = parsedUrl.pathname.slice('/api/v1/workspaces/'.length);
        let rawId = suffix;
        let subRoute = '';
        for (const candidate of ['/history', '/eligible-staff', '/staff-assignments']) {
          if (suffix.endsWith(candidate)) {
            rawId = suffix.slice(0, -candidate.length);
            subRoute = candidate;
            break;
          }
        }
        rawId = decodeURIComponent(rawId);

        if (!UUID_RE.test(rawId)) {
          res.writeHead(400, { 'Content-Type': 'application/problem+json' });
          res.end(JSON.stringify({ status: 400, detail: 'Invalid UUID' }));
          return;
        }

        if (subRoute === '/eligible-staff') {
          if (req.method !== 'GET') {
            res.writeHead(405, { 'Content-Type': 'application/problem+json' });
            res.end(JSON.stringify({ status: 405, detail: 'Method not allowed' }));
            return;
          }
          if (actor.role !== 'PLATFORM_ADMIN') {
            res.writeHead(403, { 'Content-Type': 'application/problem+json' });
            res.end(JSON.stringify({ status: 403, detail: 'Platform Admin access required' }));
            return;
          }
          if (!store.has(rawId)) {
            res.writeHead(404, { 'Content-Type': 'application/problem+json' });
            res.end(JSON.stringify({ status: 404, detail: 'Workspace not found' }));
            return;
          }
          const search = parsedUrl.searchParams.get('search') ?? '';
          const page = Number(parsedUrl.searchParams.get('page') ?? '0');
          const size = Number(parsedUrl.searchParams.get('size') ?? '20');
          if (
            search.length > 100 ||
            !Number.isInteger(page) ||
            page < 0 ||
            !Number.isInteger(size) ||
            size < 1 ||
            size > 100 ||
            page * size > 2147483647
          ) {
            res.writeHead(400, { 'Content-Type': 'application/problem+json' });
            res.end(JSON.stringify({ status: 400, detail: 'Invalid staff search or pagination' }));
            return;
          }
          const needle = search.trim().toLowerCase();
          const eligible = Array.from(staffDirectory.values())
            .filter(
              (s) =>
                s.enabled !== false &&
                s.role === 'IMPLEMENTATION_STAFF' &&
                s.workspaceId === null &&
                (!needle || s.loginName.toLowerCase().includes(needle))
            )
            .sort((a, b) => {
              if (a.loginName !== b.loginName) {
                return a.loginName < b.loginName ? -1 : 1;
              }
              return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
            });
          const totalElements = eligible.length;
          const totalPages = totalElements === 0 ? 0 : Math.ceil(totalElements / size);
          const items = eligible.slice(page * size, page * size + size).map((s) => ({
            id: s.id,
            loginName: s.loginName,
            ...(s.leakSecret ? { passwordHash: s.leakSecret } : {}),
          }));
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ items, page, size, totalElements, totalPages }));
          return;
        }

        if (subRoute === '/staff-assignments' && req.method === 'GET') {
          if (actor.role !== 'PLATFORM_ADMIN' && actor.role !== 'IMPLEMENTATION_STAFF') {
            res.writeHead(403, { 'Content-Type': 'application/problem+json' });
            res.end(JSON.stringify({ status: 403, detail: 'Access denied' }));
            return;
          }
          const existing = store.get(rawId);
          if (
            !existing ||
            (actor.role === 'IMPLEMENTATION_STAFF' && !hasActiveAssignment(rawId, actor.accountId))
          ) {
            res.writeHead(404, { 'Content-Type': 'application/problem+json' });
            res.end(JSON.stringify({ status: 404, detail: 'Workspace not found' }));
            return;
          }
          const page = Number(parsedUrl.searchParams.get('page') ?? '0');
          const size = Number(parsedUrl.searchParams.get('size') ?? '20');
          const activeList = (assignmentsStore.get(rawId) ?? [])
            .filter((a) => a.active)
            .sort((a, b) => (a.staffId < b.staffId ? -1 : a.staffId > b.staffId ? 1 : 0));
          const totalElements = activeList.length;
          const totalPages = totalElements === 0 ? 0 : Math.ceil(totalElements / size);
          const items = activeList.slice(page * size, page * size + size).map((a) => ({
            staffId: a.staffId,
            assignedAt: a.assignedAt,
          }));
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(
            JSON.stringify({
              items,
              workspaceVersion: existing.version,
              page,
              size,
              totalElements,
              totalPages,
            })
          );
          return;
        }

        if (subRoute === '/staff-assignments' && req.method === 'POST') {
          if (nextForcedPostAssign !== null) {
            const forced = nextForcedPostAssign;
            nextForcedPostAssign = null;
            res.writeHead(forced.status, {
              'Content-Type': 'application/problem+json',
              ...forced.headers,
            });
            res.end(JSON.stringify(forced.body));
            return;
          }
          if (actor.role !== 'PLATFORM_ADMIN') {
            res.writeHead(403, { 'Content-Type': 'application/problem+json' });
            res.end(JSON.stringify({ status: 403, detail: 'Access denied' }));
            return;
          }
          if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
            res.writeHead(400, { 'Content-Type': 'application/problem+json' });
            res.end(JSON.stringify({ status: 400, detail: 'Invalid payload' }));
            return;
          }
          for (const k of Object.keys(parsedBody)) {
            if (!ALLOWED_ASSIGN_KEYS.has(k)) {
              res.writeHead(400, { 'Content-Type': 'application/problem+json' });
              res.end(JSON.stringify({ status: 400, detail: 'Unknown property' }));
              return;
            }
          }
          const { staffId, version } = parsedBody;
          if (
            typeof staffId !== 'string' ||
            !UUID_RE.test(staffId) ||
            typeof version !== 'number' ||
            !Number.isInteger(version) ||
            version < 0
          ) {
            res.writeHead(400, { 'Content-Type': 'application/problem+json' });
            res.end(JSON.stringify({ status: 400, detail: 'Invalid staff assignment request' }));
            return;
          }
          const existing = store.get(rawId);
          if (!existing) {
            res.writeHead(404, { 'Content-Type': 'application/problem+json' });
            res.end(JSON.stringify({ status: 404, detail: 'Workspace not found' }));
            return;
          }
          // BE checks version BEFORE duplicate-assignment check!
          if (existing.version !== version) {
            res.writeHead(409, { 'Content-Type': 'application/problem+json' });
            res.end(JSON.stringify({ status: 409, detail: 'Record changed; reload before saving' }));
            return;
          }
          const targetStaff = staffDirectory.get(staffId);
          if (
            !targetStaff ||
            targetStaff.enabled === false ||
            targetStaff.role !== 'IMPLEMENTATION_STAFF' ||
            targetStaff.workspaceId !== null
          ) {
            res.writeHead(400, { 'Content-Type': 'application/problem+json' });
            res.end(JSON.stringify({ status: 400, detail: 'Eligible platform Staff required' }));
            return;
          }

          const wsAssignments = assignmentsStore.get(rawId) ?? [];
          const found = wsAssignments.find((a) => a.staffId === staffId);
          if (found && found.active) {
            // Idempotent no-op: keep version unchanged and record NO history event
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(
              JSON.stringify({
                workspaceId: rawId,
                staffId,
                assigned: true,
                workspaceVersion: existing.version,
              })
            );
            return;
          }

          const nowIso = new Date(Date.parse(existing.updatedAt) + 60_000).toISOString();
          if (found) {
            found.active = true;
            found.assignedAt = nowIso;
          } else {
            wsAssignments.push({ staffId, assignedAt: nowIso, active: true });
          }
          assignmentsStore.set(rawId, wsAssignments);

          const updatedWs = {
            ...existing,
            version: existing.version + 1,
            updatedAt: nowIso,
          };
          store.set(rawId, updatedWs);

          const events = historyStore.get(rawId) ?? [];
          events.push({
            id: crypto.randomUUID(),
            actorId: actor.accountId,
            action: 'STAFF_ASSIGNED',
            workspaceVersion: updatedWs.version,
            occurredAt: nowIso,
            details: { staffId },
          });
          historyStore.set(rawId, events);

          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(
            JSON.stringify({
              workspaceId: rawId,
              staffId,
              assigned: true,
              workspaceVersion: updatedWs.version,
            })
          );
          return;
        }

        if (subRoute === '/history' && req.method === 'GET') {
          const existing = store.get(rawId);
          if (!existing) {
            res.writeHead(404, { 'Content-Type': 'application/problem+json' });
            res.end(JSON.stringify({ status: 404, detail: 'Workspace not found' }));
            return;
          }
          const page = Number(parsedUrl.searchParams.get('page') ?? '0');
          const size = Number(parsedUrl.searchParams.get('size') ?? '20');
          const events = [...(historyStore.get(rawId) ?? [])].sort(
            (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)
          );
          const totalElements = events.length;
          const totalPages = totalElements === 0 ? 0 : Math.ceil(totalElements / size);
          const items = events.slice(page * size, page * size + size);
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ items, page, size, totalElements, totalPages }));
          return;
        }

        if (!subRoute && req.method === 'GET') {
          const existing = store.get(rawId);
          if (!existing) {
            res.writeHead(404, { 'Content-Type': 'application/problem+json' });
            res.end(JSON.stringify({ status: 404, detail: 'Workspace not found' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(existing));
          return;
        }

        if (!subRoute && req.method === 'PUT') {
          if (actor.role !== 'PLATFORM_ADMIN') {
            res.writeHead(403, { 'Content-Type': 'application/problem+json' });
            res.end(JSON.stringify({ status: 403, detail: 'Access denied' }));
            return;
          }
          for (const k of Object.keys(parsedBody ?? {})) {
            if (!ALLOWED_METADATA_KEYS.has(k)) {
              res.writeHead(400, { 'Content-Type': 'application/problem+json' });
              res.end(JSON.stringify({ status: 400, detail: 'Unknown property' }));
              return;
            }
          }
          const existing = store.get(rawId);
          if (!existing) {
            res.writeHead(404, { 'Content-Type': 'application/problem+json' });
            res.end(JSON.stringify({ status: 404, detail: 'Workspace not found' }));
            return;
          }
          if (existing.version !== parsedBody.version) {
            res.writeHead(409, { 'Content-Type': 'application/problem+json' });
            res.end(JSON.stringify({ status: 409, detail: 'Record changed; reload before saving' }));
            return;
          }
          const before = { ...existing };
          const nowIso = new Date(Date.parse(existing.updatedAt) + 60_000).toISOString();
          const updated = {
            ...existing,
            enterpriseName: parsedBody.enterpriseName.trim(),
            contactName: parsedBody.contactName.trim(),
            contactEmail: parsedBody.contactEmail.trim(),
            contactPhone:
              parsedBody.contactPhone == null ? null : parsedBody.contactPhone.trim(),
            version: existing.version + 1,
            updatedAt: nowIso,
          };
          store.set(rawId, updated);
          const events = historyStore.get(rawId) ?? [];
          events.push({
            id: crypto.randomUUID(),
            actorId: actor.accountId,
            action: 'METADATA_UPDATED',
            workspaceVersion: updated.version,
            occurredAt: nowIso,
            details: { before, after: { ...updated } },
          });
          historyStore.set(rawId, events);
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(updated));
          return;
        }
      }

      res.writeHead(405, { 'Content-Type': 'application/problem+json' });
      res.end(JSON.stringify({ status: 405, detail: 'Method not allowed' }));
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    store,
    staffDirectory,
    assignmentsStore,
    historyStore,
    receivedRequests,
    forceNextPostAssign(spec) {
      nextForcedPostAssign = spec;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function makeStatefulHarness() {
  const instances = new Map();
  let activeInstance = null;
  let pendingEffects = [];

  function depsChanged(prev, next) {
    if (!prev || !next) return true;
    if (prev.length !== next.length) return true;
    for (let i = 0; i < prev.length; i += 1) {
      if (!Object.is(prev[i], next[i])) return true;
    }
    return false;
  }

  function getInstance(id) {
    if (!instances.has(id)) {
      instances.set(id, {
        states: [],
        refs: [],
        memos: [],
        effectDeps: [],
        cleanups: [],
        sIdx: 0,
        rIdx: 0,
        mIdx: 0,
        eIdx: 0,
      });
    }
    return instances.get(id);
  }

  const mockReact = {
    ...React,
    useState(init) {
      const inst = activeInstance;
      const i = inst.sIdx++;
      if (!(i in inst.states)) {
        inst.states[i] = typeof init === 'function' ? init() : init;
      }
      return [
        inst.states[i],
        (next) => {
          inst.states[i] = typeof next === 'function' ? next(inst.states[i]) : next;
        },
      ];
    },
    useRef(init) {
      const inst = activeInstance;
      const i = inst.rIdx++;
      if (!(i in inst.refs)) {
        inst.refs[i] = { current: init };
      }
      return inst.refs[i];
    },
    useMemo(fn, deps) {
      const inst = activeInstance;
      const i = inst.mIdx++;
      if (!(i in inst.memos) || depsChanged(inst.memos[i].deps, deps)) {
        inst.memos[i] = { value: fn(), deps };
      }
      return inst.memos[i].value;
    },
    useCallback(fn, deps) {
      return mockReact.useMemo(() => fn, deps);
    },
    useEffect(fn, deps) {
      const inst = activeInstance;
      const i = inst.eIdx++;
      if (!(i in inst.effectDeps) || depsChanged(inst.effectDeps[i], deps)) {
        inst.effectDeps[i] = deps;
        pendingEffects.push({ inst, idx: i, fn });
      }
    },
  };

  function expandTree(node, pathKey, seenPaths) {
    if (node === null || node === undefined || typeof node === 'boolean') {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map((child, idx) =>
        expandTree(child, `${pathKey}[${child?.key ?? idx}]`, seenPaths)
      );
    }
    if (typeof node !== 'object') {
      return node;
    }
    if (typeof node.type === 'function') {
      const compName = node.type.displayName || node.type.name || 'Anon';
      const instKey = `${pathKey}/${compName}`;
      seenPaths.add(instKey);
      const prevInst = activeInstance;
      const inst = getInstance(instKey);
      inst.sIdx = 0;
      inst.rIdx = 0;
      inst.mIdx = 0;
      inst.eIdx = 0;
      activeInstance = inst;
      let rendered;
      try {
        rendered = node.type(node.props || {});
      } finally {
        activeInstance = prevInst;
      }
      return expandTree(rendered, instKey, seenPaths);
    }
    if (node.props && 'children' in node.props) {
      if (Array.isArray(node.props.children)) {
        const expandedChildren = node.props.children.map((c, idx) =>
          expandTree(c, `${pathKey}.${String(node.type)}[${c?.key ?? idx}]`, seenPaths)
        );
        return React.cloneElement(node, node.props, ...expandedChildren);
      }
      const expandedChild = expandTree(
        node.props.children,
        `${pathKey}.${String(node.type)}[0]`,
        seenPaths
      );
      return React.cloneElement(node, node.props, expandedChild);
    }
    return node;
  }

  return {
    mockReact,
    render(renderFn) {
      let tree;
      let safety = 0;
      do {
        pendingEffects = [];
        const seenPaths = new Set(['root']);
        const rootInst = getInstance('root');
        rootInst.sIdx = 0;
        rootInst.rIdx = 0;
        rootInst.mIdx = 0;
        rootInst.eIdx = 0;
        activeInstance = rootInst;
        let rawTree;
        try {
          rawTree = renderFn();
        } finally {
          activeInstance = null;
        }
        tree = expandTree(rawTree, 'root', seenPaths);

        for (const [key, inst] of instances.entries()) {
          if (!seenPaths.has(key)) {
            for (const cleanup of inst.cleanups) {
              if (typeof cleanup === 'function') cleanup();
            }
            instances.delete(key);
          }
        }

        const toRun = [...pendingEffects];
        pendingEffects = [];
        for (const eff of toRun) {
          if (typeof eff.inst.cleanups[eff.idx] === 'function') {
            eff.inst.cleanups[eff.idx]();
          }
          eff.inst.cleanups[eff.idx] = eff.fn();
        }
        safety += 1;
      } while (pendingEffects.length > 0 && safety < 10);
      return tree;
    },
    unmount() {
      for (const inst of instances.values()) {
        for (const cleanup of inst.cleanups) {
          if (typeof cleanup === 'function') cleanup();
        }
      }
      instances.clear();
    },
  };
}

function findNodes(node, pred, out = []) {
  if (!node) return out;
  if (Array.isArray(node)) {
    for (const child of node) findNodes(child, pred, out);
    return out;
  }
  if (typeof node === 'object') {
    if (pred(node)) out.push(node);
    if (node.props?.children) findNodes(node.props.children, pred, out);
  }
  return out;
}

function renderNodeHtml(node) {
  if (!node || typeof node !== 'object') return String(node ?? '');
  return renderToStaticMarkup(node);
}

test('Server bridges for GET/POST /staff-assignments and GET /eligible-staff enforce CSRF, UUIDs, version >= 0, strict whitelist, strip secrets, and map 400/401/403/404/409', async () => {
  const expSec = Math.floor(Date.now() / 1000) + 900;
  const adminAccountId = '99999999-9999-4999-8999-999999999999';
  const adminToken = makeUnsignedTestJwt(adminAccountId, crypto.randomUUID(), expSec);
  const staffActorId = '88888888-8888-4888-8888-888888888888';
  const staffToken = makeUnsignedTestJwt(staffActorId, crypto.randomUUID(), expSec);
  const expiredToken = makeUnsignedTestJwt(adminAccountId, crypto.randomUUID(), expSec);

  const wsId = '11111111-1111-4111-8111-111111111111';
  const eligibleId1 = '22222222-2222-4222-8222-222222222221';

  const upstream = await startContractWorkspaceStaffUpstream({
    workspaces: [
      {
        id: wsId,
        workspaceKey: 'alpha-commerce',
        enterpriseName: 'Alpha Commerce',
        contactName: 'Liên hệ A',
        contactEmail: 'a@alpha.vn',
        contactPhone: null,
        version: 0,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-11-28T08:00:00Z',
      },
    ],
    staffAccounts: [
      {
        id: eligibleId1,
        loginName: 'impl.staff.one',
        role: 'IMPLEMENTATION_STAFF',
        workspaceId: null,
        enabled: true,
        leakSecret: '$2a$10$secret-hash-must-never-reach-browser',
      },
    ],
    accounts: [
      {
        token: adminToken,
        accountId: adminAccountId,
        role: 'PLATFORM_ADMIN',
        workspaceId: null,
        mustChangePassword: false,
      },
      {
        token: staffToken,
        accountId: staffActorId,
        role: 'IMPLEMENTATION_STAFF',
        workspaceId: null,
        mustChangePassword: false,
      },
      {
        token: expiredToken,
        accountId: adminAccountId,
        role: 'PLATFORM_ADMIN',
        workspaceId: null,
        expired: true,
      },
    ],
  });

  try {
    const {
      handleWorkspaceStaffAssignmentsBridgeRequest,
      handleWorkspaceEligibleStaffBridgeRequest,
      handleWorkspaceStaffAssignBridgeRequest,
      validateWorkspaceAssignStaffInput,
    } = load('src/services/workspaces.ts');
    const env = { NODE_ENV: 'development', FRAUDGUARD_BACKEND_URL: upstream.baseUrl };
    const adminCookie = `fg_access_token=${encodeURIComponent(adminToken)}`;

    const makeGetHeaders = (cookie = adminCookie) => {
      const h = new Headers({
        host: 'localhost:3000',
        'sec-fetch-site': 'same-origin',
      });
      if (cookie) h.set('cookie', cookie);
      return h;
    };

    const makePostHeaders = ({
      cookie = adminCookie,
      csrf = true,
      origin = 'http://localhost:3000',
    } = {}) => {
      const h = new Headers({
        host: 'localhost:3000',
        origin,
        'content-type': 'application/json',
        'sec-fetch-site': 'same-origin',
      });
      if (csrf) h.set('x-fraudguard-csrf', '1');
      if (cookie) h.set('cookie', cookie);
      return h;
    };

    // 1) Payload validation: version 0 is valid; loginName in staffId or negative version rejected
    assert.deepEqual(validateWorkspaceAssignStaffInput({ staffId: eligibleId1, version: 0 }), {
      ok: true,
      payload: { staffId: eligibleId1, version: 0 },
    });
    assert.equal(
      validateWorkspaceAssignStaffInput({ staffId: 'impl.staff.one', version: 0 }).code,
      'INVALID_STAFF_ID'
    );
    assert.equal(
      validateWorkspaceAssignStaffInput({ staffId: eligibleId1, version: -1 }).code,
      'INVALID_VERSION'
    );

    // 2) Local guards reject CSRF, cross-origin, non-UUID workspaceId, unknown keys, and non-UUID staffId BEFORE upstream
    const noCsrf = await handleWorkspaceStaffAssignBridgeRequest({
      method: 'POST',
      workspaceId: wsId,
      requestUrl: `http://localhost:3000/api/workspaces/${wsId}/staff-assignments`,
      headers: makePostHeaders({ csrf: false }),
      readBodyText: async () => JSON.stringify({ staffId: eligibleId1, version: 0 }),
      env,
    });
    assert.equal(noCsrf.status, 403);
    assert.equal(noCsrf.body.errorCode, 'CSRF_REJECTED');

    const badOrigin = await handleWorkspaceStaffAssignBridgeRequest({
      method: 'POST',
      workspaceId: wsId,
      requestUrl: `http://localhost:3000/api/workspaces/${wsId}/staff-assignments`,
      headers: makePostHeaders({ origin: 'https://evil.example' }),
      readBodyText: async () => JSON.stringify({ staffId: eligibleId1, version: 0 }),
      env,
    });
    assert.equal(badOrigin.status, 403);
    assert.equal(badOrigin.body.errorCode, 'CSRF_REJECTED');

    const badWsId = await handleWorkspaceStaffAssignBridgeRequest({
      method: 'POST',
      workspaceId: 'alpha-commerce',
      requestUrl: 'http://localhost:3000/api/workspaces/alpha-commerce/staff-assignments',
      headers: makePostHeaders(),
      readBodyText: async () => JSON.stringify({ staffId: eligibleId1, version: 0 }),
      env,
    });
    assert.equal(badWsId.status, 400);
    assert.equal(badWsId.body.detail, 'INVALID_WORKSPACE_ID');

    const extraProp = await handleWorkspaceStaffAssignBridgeRequest({
      method: 'POST',
      workspaceId: wsId,
      requestUrl: `http://localhost:3000/api/workspaces/${wsId}/staff-assignments`,
      headers: makePostHeaders(),
      readBodyText: async () =>
        JSON.stringify({ staffId: eligibleId1, version: 0, role: 'PLATFORM_ADMIN' }),
      env,
    });
    assert.equal(extraProp.status, 400);
    assert.equal(extraProp.body.detail, 'UNKNOWN_ASSIGNMENT_PROPERTY');
    assert.equal(upstream.receivedRequests.length, 0);

    // 3) GET /eligible-staff strips leaked passwordHash, forbids IMPLEMENTATION_STAFF (403), and never exposes JWT
    const eligibleOk = await handleWorkspaceEligibleStaffBridgeRequest({
      method: 'GET',
      workspaceId: wsId,
      requestUrl: `http://localhost:3000/api/workspaces/${wsId}/eligible-staff?search=impl`,
      headers: makeGetHeaders(),
      env,
    });
    assert.equal(eligibleOk.status, 200);
    assert.deepEqual(eligibleOk.body.items, [{ id: eligibleId1, loginName: 'impl.staff.one' }]);
    assert.equal(JSON.stringify(eligibleOk.body).includes('secret-hash'), false);
    assert.equal(JSON.stringify(eligibleOk.body).includes(adminToken), false);

    const staffForbiddenEligible = await handleWorkspaceEligibleStaffBridgeRequest({
      method: 'GET',
      workspaceId: wsId,
      requestUrl: `http://localhost:3000/api/workspaces/${wsId}/eligible-staff`,
      headers: makeGetHeaders(`fg_access_token=${encodeURIComponent(staffToken)}`),
      env,
    });
    assert.equal(staffForbiddenEligible.status, 403);
    assert.equal(staffForbiddenEligible.body.errorCode, 'FORBIDDEN');

    // 4) GET /staff-assignments returns workspaceVersion: 0, then POST with version: 0 assigns and bumps to version: 1
    const initialAssignments = await handleWorkspaceStaffAssignmentsBridgeRequest({
      method: 'GET',
      workspaceId: wsId,
      requestUrl: `http://localhost:3000/api/workspaces/${wsId}/staff-assignments`,
      headers: makeGetHeaders(),
      env,
    });
    assert.equal(initialAssignments.status, 200);
    assert.equal(initialAssignments.body.workspaceVersion, 0);
    assert.equal(initialAssignments.body.totalElements, 0);

    const assignOk = await handleWorkspaceStaffAssignBridgeRequest({
      method: 'POST',
      workspaceId: wsId,
      requestUrl: `http://localhost:3000/api/workspaces/${wsId}/staff-assignments`,
      headers: makePostHeaders(),
      readBodyText: async () => JSON.stringify({ staffId: eligibleId1, version: 0 }),
      env,
    });
    assert.equal(assignOk.status, 200);
    assert.deepEqual(assignOk.body, {
      workspaceId: wsId,
      staffId: eligibleId1,
      assigned: true,
      workspaceVersion: 1,
    });
    assert.equal(JSON.stringify(assignOk.body).includes(adminToken), false);

    // Stale version 0 now returns 409 CONFLICT
    const staleAssign = await handleWorkspaceStaffAssignBridgeRequest({
      method: 'POST',
      workspaceId: wsId,
      requestUrl: `http://localhost:3000/api/workspaces/${wsId}/staff-assignments`,
      headers: makePostHeaders(),
      readBodyText: async () => JSON.stringify({ staffId: eligibleId1, version: 0 }),
      env,
    });
    assert.equal(staleAssign.status, 409);
    assert.equal(staleAssign.body.errorCode, 'CONFLICT');

    // Expired token -> 401 SESSION_EXPIRED + clears cookie
    const expiredAssign = await handleWorkspaceStaffAssignBridgeRequest({
      method: 'POST',
      workspaceId: wsId,
      requestUrl: `http://localhost:3000/api/workspaces/${wsId}/staff-assignments`,
      headers: makePostHeaders({
        cookie: `fg_access_token=${encodeURIComponent(expiredToken)}`,
      }),
      readBodyText: async () => JSON.stringify({ staffId: eligibleId1, version: 1 }),
      env,
    });
    assert.equal(expiredAssign.status, 401);
    assert.equal(expiredAssign.body.errorCode, 'SESSION_EXPIRED');
    assert.match(expiredAssign.setCookie, /Max-Age=0/);
  } finally {
    await upstream.close();
  }
});

test('End-to-end modal flow: disambiguates similar loginNames by UUID, blocks double-submit, handles existing-assignment no-op, shows distinct staffId vs actorId in History, and refreshes version for subsequent Edit', async () => {
  const expSec = Math.floor(Date.now() / 1000) + 900;
  const adminAccountId = '99999999-0000-4000-8000-999999999999';
  const adminToken = makeUnsignedTestJwt(adminAccountId, crypto.randomUUID(), expSec);
  const adminCookie = `fg_access_token=${encodeURIComponent(adminToken)}`;

  const wsId = 'aaaaaaaa-1111-4111-8111-111111111111';
  const staffSimilarShortId = '22222222-1111-4111-8111-000000000001';
  const staffSimilarTargetId = '22222222-1111-4111-8111-000000000002';

  const upstream = await startContractWorkspaceStaffUpstream({
    workspaces: [
      {
        id: wsId,
        workspaceKey: 'acme-commerce',
        enterpriseName: 'Acme Commerce VN',
        contactName: 'Liên hệ A',
        contactEmail: 'contact@acme.vn',
        contactPhone: '+84 909 000 111',
        version: 0, // Version 0 must work!
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-11-28T07:00:00Z',
      },
    ],
    staffAccounts: [
      {
        id: staffSimilarShortId,
        loginName: 'impl.staff.an',
        role: 'IMPLEMENTATION_STAFF',
        workspaceId: null,
        enabled: true,
      },
      {
        id: staffSimilarTargetId,
        loginName: 'impl.staff.anh',
        role: 'IMPLEMENTATION_STAFF',
        workspaceId: null,
        enabled: true,
      },
    ],
    accounts: [
      {
        token: adminToken,
        accountId: adminAccountId,
        role: 'PLATFORM_ADMIN',
        workspaceId: null,
        mustChangePassword: false,
      },
    ],
  });

  const harness = makeStatefulHarness();
  try {
    const { translations } = load('src/config/translations.ts');
    const {
      handleWorkspaceListBridgeRequest,
      handleWorkspaceDetailBridgeRequest,
      handleWorkspaceHistoryBridgeRequest,
      handleWorkspaceStaffAssignmentsBridgeRequest,
      handleWorkspaceEligibleStaffBridgeRequest,
      handleWorkspaceStaffAssignBridgeRequest,
      handleWorkspaceUpdateBridgeRequest,
      fetchWorkspacePage,
      fetchWorkspaceDetail,
      fetchWorkspaceHistory,
      fetchWorkspaceStaffAssignments,
      fetchWorkspaceEligibleStaff,
      assignWorkspaceStaff,
      updateWorkspaceMetadata,
    } = load('src/services/workspaces.ts');

    const env = { NODE_ENV: 'development', FRAUDGUARD_BACKEND_URL: upstream.baseUrl };
    let pendingBff = [];
    const flushBff = async () => {
      while (pendingBff.length > 0) {
        const batch = pendingBff;
        pendingBff = [];
        await Promise.allSettled(batch);
        await new Promise((r) => setImmediate(r));
      }
    };

    const bridgeFetch = (url, init = {}) => {
      const p = (async () => {
        const fullUrl = new URL(url, 'http://localhost:3000').toString();
        const parsed = new URL(fullUrl);
        const method = init.method || 'GET';
        const headers = new Headers({
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          cookie: adminCookie,
          'sec-fetch-site': 'same-origin',
          ...(init.headers || {}),
        });
        let result;
        if (parsed.pathname === '/api/workspaces') {
          result = await handleWorkspaceListBridgeRequest({
            method,
            requestUrl: fullUrl,
            headers,
            env,
          });
        } else if (parsed.pathname.startsWith('/api/workspaces/')) {
          const suffix = parsed.pathname.slice('/api/workspaces/'.length);
          if (suffix.endsWith('/history')) {
            result = await handleWorkspaceHistoryBridgeRequest({
              method,
              workspaceId: decodeURIComponent(suffix.slice(0, -'/history'.length)),
              requestUrl: fullUrl,
              headers,
              env,
            });
          } else if (suffix.endsWith('/eligible-staff')) {
            result = await handleWorkspaceEligibleStaffBridgeRequest({
              method,
              workspaceId: decodeURIComponent(suffix.slice(0, -'/eligible-staff'.length)),
              requestUrl: fullUrl,
              headers,
              env,
            });
          } else if (suffix.endsWith('/staff-assignments')) {
            const wsUuid = decodeURIComponent(suffix.slice(0, -'/staff-assignments'.length));
            if (method === 'POST') {
              result = await handleWorkspaceStaffAssignBridgeRequest({
                method: 'POST',
                workspaceId: wsUuid,
                requestUrl: fullUrl,
                headers,
                readBodyText: async () => String(init.body ?? ''),
                env,
              });
            } else {
              result = await handleWorkspaceStaffAssignmentsBridgeRequest({
                method: 'GET',
                workspaceId: wsUuid,
                requestUrl: fullUrl,
                headers,
                env,
              });
            }
          } else {
            const wsUuid = decodeURIComponent(suffix);
            if (method === 'PUT') {
              result = await handleWorkspaceUpdateBridgeRequest({
                method: 'PUT',
                workspaceId: wsUuid,
                requestUrl: fullUrl,
                headers,
                readBodyText: async () => String(init.body ?? ''),
                env,
              });
            } else {
              result = await handleWorkspaceDetailBridgeRequest({
                method: 'GET',
                workspaceId: wsUuid,
                requestUrl: fullUrl,
                headers,
                env,
              });
            }
          }
        } else {
          throw new Error(`Unexpected URL ${url}`);
        }
        return new Response(JSON.stringify(result.body), {
          status: result.status,
          headers: { 'Content-Type': 'application/json' },
        });
      })();
      pendingBff.push(p);
      return p;
    };

    const { PlatformWorkspaceListView } = load(
      'src/components/fraudguard-dashboard/PlatformWorkspaceListView.tsx',
      {
        react: harness.mockReact,
        '@/context/LanguageContext': {
          useLanguage: () => ({ language: 'vi', t: translations.vi, toggleLanguage() {} }),
        },
        '@/hooks/useDialogFocus': {
          useDialogFocus: () => ({ current: null }),
        },
      }
    );

    const renderView = () =>
      harness.render(() =>
        PlatformWorkspaceListView({
          loadPage: (q, opts) => fetchWorkspacePage(q, { ...opts, fetchImpl: bridgeFetch }),
          loadDetail: (id, opts) => fetchWorkspaceDetail(id, { ...opts, fetchImpl: bridgeFetch }),
          loadHistory: (id, q, opts) =>
            fetchWorkspaceHistory(id, q, { ...opts, fetchImpl: bridgeFetch }),
          loadStaffAssignments: (id, q, opts) =>
            fetchWorkspaceStaffAssignments(id, q, { ...opts, fetchImpl: bridgeFetch }),
          loadEligibleStaff: (id, q, opts) =>
            fetchWorkspaceEligibleStaff(id, q, { ...opts, fetchImpl: bridgeFetch }),
          assignStaff: (id, payload, opts) =>
            assignWorkspaceStaff(id, payload, { ...opts, fetchImpl: bridgeFetch }),
          saveMetadata: (id, payload, opts) =>
            updateWorkspaceMetadata(id, payload, { ...opts, fetchImpl: bridgeFetch }),
          searchDebounceMs: 0,
        })
      );

    // 1) Set outer search="acme" & size=10, then open enterprise modal
    let tree = renderView();
    await flushBff();
    tree = renderView();

    findNodes(tree, (n) => n.type === 'input' && n.props.name === 'workspaceSearch')[0].props.onChange({
      target: { value: 'acme' },
    });
    tree = renderView();
    await flushBff();
    tree = renderView();

    findNodes(tree, (n) => n.type === 'select')[0].props.onChange({
      target: { value: '10' },
    });
    tree = renderView();
    await flushBff();
    tree = renderView();

    findNodes(tree, (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger')[0].props.onClick();
    tree = renderView();
    await flushBff();
    tree = renderView();

    // Confirm lazy loading: 0 calls to /staff-assignments or /eligible-staff before clicking "Nhân sự phụ trách"
    assert.equal(
      upstream.receivedRequests.filter(
        (r) => r.pathname.endsWith('/staff-assignments') || r.pathname.endsWith('/eligible-staff')
      ).length,
      0
    );

    // 2) Click "Nhân sự phụ trách" -> shows empty assigned state ("Chưa có nhân sự phụ trách") + two near-identical loginNames
    let dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Nhân sự phụ trách')
    )[0].props.onClick();
    tree = renderView();
    await flushBff();
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(renderNodeHtml(dialog).includes('Chưa có nhân sự phụ trách'), true);

    // Filter eligible staff by "impl.staff.an" -> both impl.staff.an and impl.staff.anh match
    findNodes(
      dialog,
      (n) => n.type === 'input' && n.props.name === 'eligibleStaffSearch'
    )[0].props.onChange({ target: { value: 'impl.staff.an' } });
    tree = renderView();
    await flushBff();
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    const radios = findNodes(
      dialog,
      (n) => n.type === 'input' && n.props.name === 'eligibleStaffCandidate'
    );
    assert.equal(radios.length, 2);
    assert.equal(radios[0].props.value, staffSimilarShortId);
    assert.equal(radios[1].props.value, staffSimilarTargetId);

    // Select the second Staff ("impl.staff.anh", staffSimilarTargetId) -> double-click "Phân công"
    radios[1].props.onChange();
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];

    let assignBtn = findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Phân công')
    ).at(-1);
    assert.equal(assignBtn.props.disabled, false);

    const p1 = assignBtn.props.onClick();
    const p2 = assignBtn.props.onClick();
    await Promise.all([p1, p2]);
    await flushBff();
    tree = renderView();
    await flushBff();
    tree = renderView();

    // Verify exact POST payload: exact staffSimilarTargetId UUID, exact version: 0, exact wsId UUID, only 1 POST sent!
    const postAssignReqs = upstream.receivedRequests.filter(
      (r) => r.method === 'POST' && r.pathname.endsWith('/staff-assignments')
    );
    assert.equal(postAssignReqs.length, 1, 'Double click must send only 1 POST');
    assert.equal(postAssignReqs[0].pathname, `/api/v1/workspaces/${wsId}/staff-assignments`);
    assert.deepEqual(postAssignReqs[0].body, {
      staffId: staffSimilarTargetId,
      version: 0,
    });

    // Assigned section now reflects BE result: shows exact loginName "impl.staff.anh" + UUID + assignedAt!
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    const assignedRows = findNodes(
      dialog,
      (n) => n.type === 'li' && n.props.className === 'workspaceStaffAssignedRow'
    );
    assert.equal(assignedRows.length, 1);
    const assignedRowHtml = renderNodeHtml(assignedRows[0]);
    assert.equal(assignedRowHtml.includes('impl.staff.anh'), true);
    assert.equal(assignedRowHtml.includes(staffSimilarTargetId), true);

    // Eligible list marks impl.staff.anh as "Đang phụ trách" and NEVER claims impl.staff.an is "Chưa phân công"
    const candidateLabels = findNodes(
      dialog,
      (n) => n.type === 'label' && String(n.props.className).includes('workspaceStaffCandidateOption')
    );
    assert.equal(renderNodeHtml(candidateLabels[1]).includes('Đang phụ trách'), true);
    assert.equal(renderNodeHtml(candidateLabels[0]).includes('Chưa phân công'), false);

    // 3) Re-submit already-assigned impl.staff.anh at current version (1) -> BE returns assigned:true, workspaceVersion:1 (no-op, no extra row or history event!)
    assignBtn = findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Phân công')
    ).at(-1);
    await assignBtn.props.onClick();
    await flushBff();
    tree = renderView();
    await flushBff();
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(
      findNodes(dialog, (n) => n.type === 'li' && n.props.className === 'workspaceStaffAssignedRow')
        .length,
      1
    );
    assert.equal(upstream.historyStore.get(wsId).length, 1, 'Duplicate assign at current version records 0 extra history events');
    assert.match(renderNodeHtml(dialog), /không tạo thêm sự kiện lịch sử/);

    // 4) Open "Lịch sử" directly in the same modal -> expand STAFF_ASSIGNED event -> verify assigned Staff != performing Actor!
    findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Lịch sử')
    )[0].props.onClick();
    tree = renderView();
    await flushBff();
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(renderNodeHtml(dialog).includes('Phân công nhân sự'), true);
    findNodes(
      dialog,
      (n) => n.type === 'button' && n.props.className === 'workspaceHistoryToggleBtn'
    )[0].props.onClick();
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    const expandedHistoryHtml = renderNodeHtml(dialog);
    // Assigned Staff (impl.staff.anh / 22222222-...0002) vs Performing Admin Account (99999999-...9999) are two distinct roles!
    assert.equal(
      expandedHistoryHtml.includes('Nhân sự triển khai được phân công (Mã tài khoản):'),
      true
    );
    assert.equal(expandedHistoryHtml.includes('impl.staff.anh'), true);
    assert.equal(expandedHistoryHtml.includes(staffSimilarTargetId), true);
    assert.equal(expandedHistoryHtml.includes('Mã tài khoản thực hiện:'), true);
    assert.equal(expandedHistoryHtml.includes(adminAccountId), true);
    assert.notEqual(staffSimilarTargetId, adminAccountId);

    // 5) Return to enterprise info -> click "Chỉnh sửa" -> edit contactName -> Save -> uses refreshed version (1, NOT stale 0)!
    findNodes(
      dialog,
      (n) =>
        n.type === 'button' &&
        JSON.stringify(n.props.children).includes('Quay lại thông tin doanh nghiệp')
    )[0].props.onClick();
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];

    findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Chỉnh sửa')
    )[0].props.onClick();
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];

    findNodes(dialog, (n) => n.type === 'input')
      .find((i) => i.props.name === 'contactName')
      .props.onChange({ target: { value: 'Liên hệ B Sau Phân Công' } });
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    await findNodes(dialog, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
    await flushBff();
    tree = renderView();
    await flushBff();
    tree = renderView();

    const putReqs = upstream.receivedRequests.filter((r) => r.method === 'PUT');
    assert.equal(putReqs.length, 1);
    assert.equal(
      putReqs[0].body.version,
      1,
      'Subsequent metadata PUT must use updated version (1) after staff assignment, never stale version (0)'
    );

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(renderNodeHtml(dialog).includes('Liên hệ B Sau Phân Công'), true);

    // Close modal -> outer directory search="acme" and size=10 preserved!
    findNodes(dialog, (n) => n.type === 'button' && n.props.children === 'Đóng')[0].props.onClick();
    tree = renderView();
    assert.equal(
      findNodes(tree, (n) => n.type === 'input' && n.props.name === 'workspaceSearch')[0].props.value,
      'acme'
    );
    assert.equal(findNodes(tree, (n) => n.type === 'select')[0].props.value, 10);
  } finally {
    harness.unmount();
    await upstream.close();
  }
});

test('Staff mode handles unknown-login staffId without per-row requests, independent paginations, no-matches search, workspace switch race (A -> B), 409 stale reload without auto-POST, disconnect check, and 401/403/404', async () => {
  const { translations } = load('src/config/translations.ts');
  const { WorkspaceServiceError } = load('src/services/workspaces.ts');
  const harness = makeStatefulHarness();

  const itemA = {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    workspaceKey: 'alpha-ws',
    enterpriseName: 'Doanh nghiệp Alpha',
    contactName: 'Liên hệ Alpha',
    contactEmail: 'alpha@example.vn',
    contactPhone: null,
    version: 2,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-11-28T08:00:00Z',
  };
  const itemB = {
    id: 'bbbbbbbb-0000-4000-8000-000000000002',
    workspaceKey: 'beta-ws',
    enterpriseName: 'Doanh nghiệp Beta',
    contactName: 'Liên hệ Beta',
    contactEmail: 'beta@example.vn',
    contactPhone: null,
    version: 0,
    createdAt: '2026-10-02T00:00:00Z',
    updatedAt: '2026-11-28T08:30:00Z',
  };

  const unindexedStaffId = '33333333-3333-4333-8333-333333333333';
  const candidateId = '44444444-4444-4444-8444-444444444444';

  const assignmentCalls = [];
  const eligibleCalls = [];
  const postAssignCalls = [];
  let sessionExpiredCount = 0;

  let assignmentsHandler = null;
  let eligibleHandler = null;
  let postAssignHandler = null;

  try {
    const { PlatformWorkspaceListView } = load(
      'src/components/fraudguard-dashboard/PlatformWorkspaceListView.tsx',
      {
        react: harness.mockReact,
        '@/context/LanguageContext': {
          useLanguage: () => ({ language: 'vi', t: translations.vi, toggleLanguage() {} }),
        },
        '@/hooks/useDialogFocus': {
          useDialogFocus: () => ({ current: null }),
        },
      }
    );

    const renderView = () =>
      harness.render(() =>
        PlatformWorkspaceListView({
          loadPage: async () => ({
            items: [itemA, itemB],
            page: 0,
            size: 20,
            totalElements: 2,
            totalPages: 1,
          }),
          loadDetail: async (id) => (id === itemA.id ? { ...itemA, version: 5 } : { ...itemB }),
          loadStaffAssignments: (id, q, opts) => {
            assignmentCalls.push({ id, ...q, signal: opts?.signal });
            return assignmentsHandler(id, q, opts);
          },
          loadEligibleStaff: (id, q, opts) => {
            eligibleCalls.push({ id, ...q, signal: opts?.signal });
            return eligibleHandler(id, q, opts);
          },
          assignStaff: (id, payload, opts) => {
            postAssignCalls.push({ id, payload, signal: opts?.signal });
            return postAssignHandler(id, payload, opts);
          },
          onSessionExpired: () => {
            sessionExpiredCount += 1;
          },
          searchDebounceMs: 0,
        })
      );

    let tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    // 1) Assigned staff whose UUID is NOT in eligible-staff page 0 -> displays "Mã nhân sự" + timestamp with ZERO extra requests and ZERO fabricated names
    assignmentsHandler = async (_id, q) => ({
      items: [
        {
          staffId: unindexedStaffId,
          assignedAt: '2026-11-28T08:00:00Z',
        },
      ],
      workspaceVersion: 2,
      page: q.page,
      size: q.size,
      totalElements: 25,
      totalPages: 2,
    });
    eligibleHandler = async (_id, q) => ({
      items:
        q.search === 'khong-khop'
          ? []
          : [{ id: candidateId, loginName: 'impl.candidate.one' }],
      page: q.page,
      size: q.size,
      totalElements: q.search === 'khong-khop' ? 0 : 25,
      totalPages: q.search === 'khong-khop' ? 0 : 2,
    });

    findNodes(tree, (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger')[0].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    let dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Nhân sự phụ trách')
    )[0].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    assert.equal(assignmentCalls.length, 1);
    assert.equal(eligibleCalls.length, 1, 'Must NOT fire N+1 requests to look up loginName per row');

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    const assignedRowHtml = renderNodeHtml(
      findNodes(dialog, (n) => n.type === 'li' && n.props.className === 'workspaceStaffAssignedRow')[0]
    );
    assert.equal(assignedRowHtml.includes('Mã nhân sự:'), true);
    assert.equal(assignedRowHtml.includes(unindexedStaffId), true);
    assert.equal(assignedRowHtml.includes('Thời điểm phân công'), true);

    // 2) Independent pagination: paginate Assigned list to page 1 WITHOUT changing Eligible list page (still 0)!
    const page2Buttons = findNodes(
      dialog,
      (n) => n.type === 'button' && n.props['aria-label'] === 'Chuyển tới trang 2'
    );
    assert.equal(page2Buttons.length, 2);
    page2Buttons[0].props.onClick(); // Assigned list page 2
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    assert.equal(assignmentCalls.at(-1).page, 1);
    assert.equal(eligibleCalls.length, 1, 'Paginating assigned list must not re-fetch eligible list');

    // Search eligible staff with unmatched keyword -> shows "Không tìm thấy nhân sự phù hợp", then clear search
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(
      dialog,
      (n) => n.type === 'input' && n.props.name === 'eligibleStaffSearch'
    )[0].props.onChange({ target: { value: 'khong-khop' } });
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(renderNodeHtml(dialog).includes('Không tìm thấy nhân sự phù hợp'), true);

    findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Xóa tìm kiếm')
    )[0].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    // 3) 409 Stale version on POST: preserves selection, explains conflict, "Tải lại danh sách phân công" updates version to 5 with ZERO auto-POST!
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(
      dialog,
      (n) => n.type === 'input' && n.props.name === 'eligibleStaffCandidate'
    )[0].props.onChange();
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];

    postAssignHandler = async () => {
      throw new WorkspaceServiceError('CONFLICT', 409, 'Record changed; reload before saving');
    };
    await findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Phân công')
    )
      .at(-1)
      .props.onClick();
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];

    assert.equal(postAssignCalls.length, 1);
    assert.equal(postAssignCalls[0].payload.version, 2);
    assert.match(renderNodeHtml(dialog), /phiên bản không còn khớp/);

    assignmentsHandler = async (_id, q) => ({
      items: [{ staffId: unindexedStaffId, assignedAt: '2026-11-28T08:00:00Z' }],
      workspaceVersion: 5,
      page: q.page,
      size: q.size,
      totalElements: 1,
      totalPages: 1,
    });
    const reloadAssignmentsBtn = findNodes(
      dialog,
      (n) =>
        n.type === 'button' &&
        JSON.stringify(n.props.children).includes('Tải lại danh sách phân công')
    )[0];
    assert.ok(reloadAssignmentsBtn);
    await reloadAssignmentsBtn.props.onClick();
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];

    assert.equal(postAssignCalls.length, 1, 'Reloading assignments on 409 must NEVER auto-retry POST');

    // 4) Disconnect (503) on POST -> "Tải lại trạng thái hiện tại" checks current assignments without auto-POST
    postAssignHandler = async () => {
      throw new WorkspaceServiceError('BACKEND_UNAVAILABLE', 503);
    };
    await findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Phân công')
    )
      .at(-1)
      .props.onClick();
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(postAssignCalls.length, 2);
    assert.equal(postAssignCalls[1].payload.version, 5, 'Uses newly reloaded workspaceVersion 5');
    assert.match(renderNodeHtml(dialog), /Mất kết nối/);

    const reloadStatusBtn = findNodes(
      dialog,
      (n) =>
        n.type === 'button' &&
        JSON.stringify(n.props.children).includes('Tải lại trạng thái hiện tại')
    )[0];
    assert.ok(reloadStatusBtn);
    await reloadStatusBtn.props.onClick();
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    assert.equal(postAssignCalls.length, 2, 'Reloading status after disconnect must NEVER auto-retry POST');

    // 5) Workspace switch race (A -> B): slow eligible/assignments response from A never leaks into B; test 403/404/401
    let resolveSlowEligibleA;
    eligibleHandler = () =>
      new Promise((resolve) => {
        resolveSlowEligibleA = resolve;
      });
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(
      dialog,
      (n) => n.type === 'button' && n.props['aria-label'] === 'Làm mới danh sách chọn'
    )[0].props.onClick();
    tree = renderView();

    // Close A, open B, open B's Staff panel where B has 0 assignments & 403 on eligible-staff
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(dialog, (n) => n.type === 'button' && n.props.children === 'Đóng')[0].props.onClick();
    tree = renderView();

    assignmentsHandler = async () => ({
      items: [],
      workspaceVersion: 0,
      page: 0,
      size: 20,
      totalElements: 0,
      totalPages: 0,
    });
    eligibleHandler = async () => {
      throw new WorkspaceServiceError('FORBIDDEN', 403);
    };

    findNodes(tree, (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger')[1].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Nhân sự phụ trách')
    )[0].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    // Resolve slow Eligible A late!
    resolveSlowEligibleA({
      items: [{ id: candidateId, loginName: 'late.from.workspace.a' }],
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    });
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    const htmlB = renderNodeHtml(dialog);
    assert.equal(htmlB.includes('late.from.workspace.a'), false);
    assert.equal(htmlB.includes('Chưa có nhân sự phụ trách'), true);
    assert.equal(htmlB.includes('Không có quyền phân công nhân sự'), true);

    // 404 on assignments refresh, then 401 session expiry triggers redirect
    assignmentsHandler = async () => {
      throw new WorkspaceServiceError('NOT_FOUND', 404);
    };
    findNodes(
      dialog,
      (n) => n.type === 'button' && n.props['aria-label'] === 'Làm mới danh sách phụ trách'
    )[0].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(renderNodeHtml(dialog).includes('Không tìm thấy doanh nghiệp'), true);

    assignmentsHandler = async () => {
      throw new WorkspaceServiceError('SESSION_EXPIRED', 401);
    };
    findNodes(
      dialog,
      (n) => n.type === 'button' && n.props['aria-label'] === 'Làm mới danh sách phụ trách'
    )[0].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    assert.equal(sessionExpiredCount, 1);
    assert.equal(findNodes(tree, (n) => n.props?.role === 'dialog').length, 0);
  } finally {
    harness.unmount();
  }

  // Static audit: zero em dashes (\u2014), zero demo imports, and no unassign DELETE leaked into scope
  for (const rel of [
    'src/types/workspace.ts',
    'src/services/workspaces.ts',
    'src/app/api/workspaces/route.ts',
    'src/app/api/workspaces/[id]/route.ts',
    'src/app/api/workspaces/[id]/history/route.ts',
    'src/app/api/workspaces/[id]/staff-assignments/route.ts',
    'src/app/api/workspaces/[id]/eligible-staff/route.ts',
    'src/components/fraudguard-dashboard/PlatformWorkspaceListView.tsx',
  ]) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.equal(src.includes('\u2014'), false, `Unexpected em dash in ${rel}`);
    assert.equal(
      /@\/data\/|useOnboardingWorkflow|workspace-storage|OnboardingEnterpriseListScreen/.test(src),
      false,
      `Demo import leaked into ${rel}`
    );
    assert.equal(
      /export\s+async\s+function\s+DELETE/.test(src),
      false,
      `Out-of-scope DELETE handler found in ${rel}`
    );
  }
});

test('Regression (An -> Bình): viewing Staff assignments after another Admin updated contactName from "An" (v3) to "Bình" (v4) reloads full detail and NEVER sends "An" + version 4 on PUT', async () => {
  const { translations } = load('src/config/translations.ts');
  const harness = makeStatefulHarness();

  const wsId = 'aaaaaaaa-3333-4333-8333-333333333333';
  let serverRecord = {
    id: wsId,
    workspaceKey: 'sao-viet',
    enterpriseName: 'Công ty Sao Việt',
    contactName: 'An',
    contactEmail: 'contact@saoviet.vn',
    contactPhone: '0901111111',
    version: 3,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-11-28T08:00:00Z',
  };

  const putPayloads = [];
  let detailHandler = async () => ({ ...serverRecord });

  try {
    const { PlatformWorkspaceListView } = load(
      'src/components/fraudguard-dashboard/PlatformWorkspaceListView.tsx',
      {
        react: harness.mockReact,
        '@/context/LanguageContext': {
          useLanguage: () => ({ language: 'vi', t: translations.vi, toggleLanguage() {} }),
        },
        '@/hooks/useDialogFocus': {
          useDialogFocus: () => ({ current: null }),
        },
      }
    );

    const renderView = () =>
      harness.render(() =>
        PlatformWorkspaceListView({
          loadPage: async () => ({
            items: [{ ...serverRecord }],
            page: 0,
            size: 20,
            totalElements: 1,
            totalPages: 1,
          }),
          loadDetail: (id, opts) => detailHandler(id, opts),
          loadStaffAssignments: async () => ({
            items: [],
            workspaceVersion: serverRecord.version,
            page: 0,
            size: 20,
            totalElements: 0,
            totalPages: 0,
          }),
          loadEligibleStaff: async () => ({
            items: [],
            page: 0,
            size: 20,
            totalElements: 0,
            totalPages: 0,
          }),
          saveMetadata: async (_id, payload) => {
            putPayloads.push({ ...payload });
            assert.equal(
              payload.version,
              serverRecord.version,
              'PUT version must match current server version'
            );
            serverRecord = {
              ...serverRecord,
              enterpriseName: payload.enterpriseName,
              contactName: payload.contactName,
              contactEmail: payload.contactEmail,
              contactPhone: payload.contactPhone,
              version: serverRecord.version + 1,
              updatedAt: '2026-11-28T09:00:00Z',
            };
            return { ...serverRecord };
          },
          searchDebounceMs: 0,
        })
      );

    // Step 1: Admin A opens modal at version=3, contactName="An"
    let tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    findNodes(tree, (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger')[0].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    let dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(renderNodeHtml(dialog).includes('An'), true);

    // Step 2: Admin B changes contactName to "Bình" and saves -> BE is now at version=4!
    serverRecord = {
      ...serverRecord,
      contactName: 'Bình',
      version: 4,
      updatedAt: '2026-11-28T08:30:00Z',
    };

    // Hold the background GET /workspaces/{id} promise so we verify BOTH while pending AND after resolving!
    let resolveBackgroundDetail;
    detailHandler = () =>
      new Promise((resolve) => {
        resolveBackgroundDetail = resolve;
      });

    // Step 3: Admin A opens "Nhân sự phụ trách" -> GET /staff-assignments returns workspaceVersion=4 (without contactName)
    findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Nhân sự phụ trách')
    )[0].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    // Step 4a: Admin A clicks "Quay lại thông tin doanh nghiệp" and clicks "Chỉnh sửa" BEFORE GET detail resolves:
    // Edit form must NOT open with "An" + version 4!
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(
      dialog,
      (n) =>
        n.type === 'button' &&
        JSON.stringify(n.props.children).includes('Quay lại thông tin doanh nghiệp')
    )[0].props.onClick();
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Chỉnh sửa')
    )[0].props.onClick();
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(
      findNodes(dialog, (n) => n.type === 'form').length,
      0,
      'Must NOT open edit form with stale metadata while full detail v4 is still loading'
    );
    assert.equal(putPayloads.length, 0);

    // Step 4b: Full GET /workspaces/{id} resolves with version=4 and contactName="Bình"
    resolveBackgroundDetail({ ...serverRecord });
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    // Admin A sees "Bình" in the opened form, changes ONLY contactPhone, and clicks "Lưu"
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    const inputs = findNodes(dialog, (n) => n.type === 'input');
    const contactNameInput = inputs.find((i) => i.props.name === 'contactName');
    const phoneInput = inputs.find((i) => i.props.name === 'contactPhone');
    assert.equal(contactNameInput.props.value, 'Bình');
    assert.equal(phoneInput.props.value, '0901111111');

    phoneInput.props.onChange({ target: { value: '0909999999' } });
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    await findNodes(dialog, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    // Step 5: Verify exact PUT payload sent to BE: "Bình" + version 4, ZERO requests with "An" + version 4!
    assert.equal(putPayloads.length, 1);
    assert.deepEqual(putPayloads[0], {
      version: 4,
      enterpriseName: 'Công ty Sao Việt',
      contactName: 'Bình',
      contactEmail: 'contact@saoviet.vn',
      contactPhone: '0909999999',
    });
    assert.equal(
      putPayloads.some((p) => p.contactName === 'An' && p.version === 4),
      false,
      'Forbidden torn-snapshot payload ("An" + version 4) must NEVER be sent'
    );

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(renderNodeHtml(dialog).includes('Bình'), true);
    assert.equal(renderNodeHtml(dialog).includes('0909999999'), true);
  } finally {
    harness.unmount();
  }
});

test('Regression: post-assign pending window, failed detail reload retry, concurrent Admin B edit after draft opened, out-of-order detail responses, and A -> B switch', async () => {
  const { translations } = load('src/config/translations.ts');
  const { WorkspaceServiceError } = load('src/services/workspaces.ts');
  const harness = makeStatefulHarness();

  const idA = 'aaaaaaaa-4444-4444-8444-444444444444';
  const idB = 'bbbbbbbb-5555-4555-8555-555555555555';
  const staffId = 'cccccccc-6666-4666-8666-666666666666';

  let recordA = {
    id: idA,
    workspaceKey: 'alpha-sync',
    enterpriseName: 'Alpha Sync Co',
    contactName: 'An',
    contactEmail: 'an@alpha.vn',
    contactPhone: '0900000001',
    version: 3,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-11-28T08:00:00Z',
  };
  const recordB = {
    id: idB,
    workspaceKey: 'beta-sync',
    enterpriseName: 'Beta Sync Co',
    contactName: 'Liên hệ B Riêng Biệt',
    contactEmail: 'b@beta.vn',
    contactPhone: null,
    version: 0,
    createdAt: '2026-10-02T00:00:00Z',
    updatedAt: '2026-11-28T08:05:00Z',
  };

  const putPayloads = [];
  let detailHandler = async (id) => (id === idA ? { ...recordA } : { ...recordB });
  let saveHandler = null;

  try {
    const { PlatformWorkspaceListView } = load(
      'src/components/fraudguard-dashboard/PlatformWorkspaceListView.tsx',
      {
        react: harness.mockReact,
        '@/context/LanguageContext': {
          useLanguage: () => ({ language: 'vi', t: translations.vi, toggleLanguage() {} }),
        },
        '@/hooks/useDialogFocus': {
          useDialogFocus: () => ({ current: null }),
        },
      }
    );

    const renderView = () =>
      harness.render(() =>
        PlatformWorkspaceListView({
          loadPage: async () => ({
            items: [{ ...recordA }, { ...recordB }],
            page: 0,
            size: 20,
            totalElements: 2,
            totalPages: 1,
          }),
          loadDetail: (id, opts) => detailHandler(id, opts),
          loadStaffAssignments: async (id) => ({
            items: [],
            workspaceVersion: id === idA ? recordA.version : recordB.version,
            page: 0,
            size: 20,
            totalElements: 0,
            totalPages: 0,
          }),
          loadEligibleStaff: async () => ({
            items: [{ id: staffId, loginName: 'impl.staff.sync' }],
            page: 0,
            size: 20,
            totalElements: 1,
            totalPages: 1,
          }),
          assignStaff: async (id, payload) => {
            assert.equal(payload.version, recordA.version);
            recordA = {
              ...recordA,
              version: recordA.version + 1,
              updatedAt: '2026-11-28T08:10:00Z',
            };
            return {
              workspaceId: id,
              staffId: payload.staffId,
              assigned: true,
              workspaceVersion: recordA.version,
            };
          },
          saveMetadata: (id, payload, opts) => {
            putPayloads.push({ id, ...payload });
            return saveHandler(id, payload, opts);
          },
          searchDebounceMs: 0,
        })
      );

    // 1) Open Workspace A at version=3 ("An"), enter Staff mode, assign Staff -> POST returns workspaceVersion=4
    //    Meanwhile hold GET /workspaces/{idA} pending AND simulate Admin B also updating contactName="Bình" (v5) before GET finishes!
    let tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    findNodes(tree, (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger')[0].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    let dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Nhân sự phụ trách')
    )[0].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    let rejectPendingDetailAfterAssign;
    detailHandler = () =>
      new Promise((_resolve, reject) => {
        rejectPendingDetailAfterAssign = reject;
      });

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(
      dialog,
      (n) => n.type === 'input' && n.props.name === 'eligibleStaffCandidate'
    )[0].props.onChange();
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];

    await findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Phân công')
    )
      .at(-1)
      .props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    // Immediately click "Quay lại thông tin doanh nghiệp" and "Chỉnh sửa" WHILE GET detail is still pending!
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(
      dialog,
      (n) =>
        n.type === 'button' &&
        JSON.stringify(n.props.children).includes('Quay lại thông tin doanh nghiệp')
    )[0].props.onClick();
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Chỉnh sửa')
    )[0].props.onClick();
    tree = renderView();

    // Must NOT open form with old "An" + version 4 during pending window!
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(findNodes(dialog, (n) => n.type === 'form').length, 0);
    assert.equal(putPayloads.length, 0);

    // 2) Fail that GET detail reload (503) -> UI stays in view with "Thử lại", keeps known "An" (v3) pair, sends 0 PUTs!
    rejectPendingDetailAfterAssign(new WorkspaceServiceError('BACKEND_UNAVAILABLE', 503));
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(findNodes(dialog, (n) => n.type === 'form').length, 0);
    assert.equal(putPayloads.length, 0);
    assert.match(renderNodeHtml(dialog), /chưa thể tải lại thông tin chi tiết/);
    assert.equal(renderNodeHtml(dialog).includes('An'), true);

    // Retry succeeds with Admin B's latest record ("Bình", version 5) -> opens Edit with "Bình" + version 5!
    recordA = {
      ...recordA,
      contactName: 'Bình',
      version: 5,
    };
    detailHandler = async (id) => (id === idA ? { ...recordA } : { ...recordB });

    const retryRefreshBtn = findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Thử lại')
    )[0];
    assert.ok(retryRefreshBtn);
    await retryRefreshBtn.props.onClick();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    let inputs = findNodes(dialog, (n) => n.type === 'input');
    assert.equal(inputs.find((i) => i.props.name === 'contactName').props.value, 'Bình');

    // 3) Admin B edits AFTER Admin A already opened the form (recordA advances to v6 "Cường"):
    //    - Admin A edits phone to '0977777777' and submits using initial draft version (5) -> gets 409, keeps draft, 0 auto-PUT!
    //    - Admin A clicks "Tải lại dữ liệu hiện tại" and GET fails (503) -> keeps draft '0977777777', keeps version 5, allows retry, 0 auto-PUT!
    recordA = {
      ...recordA,
      contactName: 'Cường',
      version: 6,
    };
    inputs.find((i) => i.props.name === 'contactPhone').props.onChange({
      target: { value: '0977777777' },
    });
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];

    saveHandler = async (_id, payload) => {
      if (payload.version !== recordA.version) {
        throw new WorkspaceServiceError('CONFLICT', 409, 'Record changed; reload before saving');
      }
      recordA = {
        ...recordA,
        enterpriseName: payload.enterpriseName,
        contactName: payload.contactName,
        contactEmail: payload.contactEmail,
        contactPhone: payload.contactPhone,
        version: recordA.version + 1,
      };
      return { ...recordA };
    };

    await findNodes(dialog, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];

    assert.equal(putPayloads.length, 1);
    assert.equal(putPayloads[0].version, 5, 'Must submit with the draft initial version (5)');
    assert.equal(putPayloads[0].contactPhone, '0977777777');
    assert.equal(
      findNodes(dialog, (n) => n.type === 'input').find((i) => i.props.name === 'contactPhone')
        .props.value,
      '0977777777',
      'Must preserve user draft after 409'
    );

    // Click "Tải lại dữ liệu hiện tại" while GET fails with 503 -> must preserve draft '0977777777', keep version 5, allow retry, and send 0 PUTs!
    detailHandler = async () => {
      throw new WorkspaceServiceError('BACKEND_UNAVAILABLE', 503);
    };
    const reloadInEditBtn = findNodes(
      dialog,
      (n) =>
        n.type === 'button' &&
        JSON.stringify(n.props.children).includes('Tải lại dữ liệu hiện tại')
    )[0];
    assert.ok(reloadInEditBtn);
    await reloadInEditBtn.props.onClick();
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];

    assert.equal(putPayloads.length, 1, 'Failed reload in edit mode must NEVER auto-send PUT');
    assert.equal(
      findNodes(dialog, (n) => n.type === 'input').find((i) => i.props.name === 'contactPhone')
        .props.value,
      '0977777777',
      'Failed reload must NOT lose open draft'
    );
    // Retry button "Tải lại dữ liệu hiện tại" is STILL rendered so user can retry!
    const retryReloadInEditBtn = findNodes(
      dialog,
      (n) =>
        n.type === 'button' &&
        JSON.stringify(n.props.children).includes('Tải lại dữ liệu hiện tại')
    )[0];
    assert.ok(retryReloadInEditBtn, 'UI must still allow retrying reload after failure');

    // Confirm version was NOT bumped by submitting once more (still sends version 5!)
    await findNodes(dialog, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
    tree = renderView();
    assert.equal(putPayloads.length, 2);
    assert.equal(putPayloads[1].version, 5, 'Version must remain 5 after failed reload');

    // Now restore detailHandler -> retry "Tải lại dữ liệu hiện tại" -> loads "Cường" + version 6 -> edit phone and save!
    detailHandler = async (id) => (id === idA ? { ...recordA } : { ...recordB });
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    await findNodes(
      dialog,
      (n) =>
        n.type === 'button' &&
        JSON.stringify(n.props.children).includes('Tải lại dữ liệu hiện tại')
    )[0].props.onClick();
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    inputs = findNodes(dialog, (n) => n.type === 'input');
    assert.equal(inputs.find((i) => i.props.name === 'contactName').props.value, 'Cường');
    inputs.find((i) => i.props.name === 'contactPhone').props.onChange({
      target: { value: '0977777777' },
    });
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    await findNodes(dialog, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    assert.equal(putPayloads.at(-1).version, 6);
    assert.equal(putPayloads.at(-1).contactName, 'Cường');
    assert.equal(putPayloads.at(-1).contactPhone, '0977777777');
    // Now recordA is at version 7!

    // 4) Out-of-order older detail response (returning stale version 5 when v7 is already loaded and v8 is observed)
    //    MUST NOT roll back loaded v7 ("Cường") to v5 ("Dữ Liệu Cũ v5")!
    recordA = { ...recordA, version: 8 }; // Staff assignments now reports workspaceVersion = 8
    detailHandler = async (id) =>
      id === idA
        ? { ...recordA, contactName: 'Dữ Liệu Cũ v5', version: 5 }
        : { ...recordB };

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Nhân sự phụ trách')
    )[0].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    // Return to info: "Cường" (v7) is STILL displayed (stale v5 was rejected by monotonic guard!), and refresh error banner allows retry!
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(
      dialog,
      (n) =>
        n.type === 'button' &&
        JSON.stringify(n.props.children).includes('Quay lại thông tin doanh nghiệp')
    )[0].props.onClick();
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(renderNodeHtml(dialog).includes('Cường'), true);
    assert.equal(renderNodeHtml(dialog).includes('Dữ Liệu Cũ v5'), false);

    // Retry returns complete v8 ("Đặng Văn Tám"), then verify PUT sends "Đặng Văn Tám" + version 8!
    recordA = { ...recordA, contactName: 'Đặng Văn Tám', version: 8 };
    detailHandler = async (id) => (id === idA ? { ...recordA } : { ...recordB });
    await findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Thử lại')
    )[0].props.onClick();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Chỉnh sửa')
    )[0].props.onClick();
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    await findNodes(dialog, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    assert.equal(putPayloads.at(-1).contactName, 'Đặng Văn Tám');
    assert.equal(putPayloads.at(-1).version, 8);

    // 5) Advance Staff workspaceVersion to 10 and hold A's refresh pending, then switch to Workspace B!
    recordA = { ...recordA, contactName: 'Dữ Liệu Của A Không Sang B', version: 10 };
    let resolveLateDetailA;
    detailHandler = (id) => {
      if (id === idA) {
        return new Promise((resolve) => {
          resolveLateDetailA = resolve;
        });
      }
      return Promise.resolve({ ...recordB });
    };

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Nhân sự phụ trách')
    )[0].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    // Close A, open Workspace B
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(dialog, (n) => n.type === 'button' && n.props.children === 'Đóng')[0].props.onClick();
    tree = renderView();

    findNodes(tree, (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger')[1].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    // Resolve late Detail A -> must NEVER appear in Workspace B!
    resolveLateDetailA({ ...recordA });
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    const htmlB = renderNodeHtml(dialog);
    assert.equal(htmlB.includes('Liên hệ B Riêng Biệt'), true);
    assert.equal(htmlB.includes('Dữ Liệu Của A Không Sang B'), false);
  } finally {
    harness.unmount();
  }
});

