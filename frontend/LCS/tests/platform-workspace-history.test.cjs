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
 * Contract-accurate local HTTP test double for:
 * - GET /api/v1/workspaces
 * - GET /api/v1/workspaces/{id}
 * - PUT /api/v1/workspaces/{id} (appends METADATA_UPDATED history event with { before, after })
 * - GET /api/v1/workspaces/{id}/history?page=&size= (sorted occurredAt DESC, id DESC)
 */
async function startContractWorkspaceHistoryUpstream({
  workspaces = [],
  historyByWorkspaceId = {},
  accounts = [],
} = {}) {
  const store = new Map(workspaces.map((w) => [w.id, { ...w }]));
  const historyStore = new Map();
  for (const w of workspaces) {
    historyStore.set(w.id, [...(historyByWorkspaceId[w.id] ?? [])]);
  }
  for (const [wsId, list] of Object.entries(historyByWorkspaceId)) {
    if (!historyStore.has(wsId)) {
      historyStore.set(wsId, [...list]);
    }
  }
  const accountMap = new Map(accounts.map((a) => [a.token, a]));
  const receivedRequests = [];
  let nextForcedHistoryResponse = null;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ALLOWED_KEYS = new Set([
    'version',
    'enterpriseName',
    'contactName',
    'contactEmail',
    'contactPhone',
  ]);

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
        const sorted = Array.from(store.values()).sort((a, b) => {
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
        const isHistoryRoute = suffix.endsWith('/history');
        const rawId = decodeURIComponent(
          isHistoryRoute ? suffix.slice(0, -'/history'.length) : suffix
        );

        if (!UUID_RE.test(rawId)) {
          res.writeHead(400, { 'Content-Type': 'application/problem+json' });
          res.end(JSON.stringify({ status: 400, detail: 'Invalid UUID' }));
          return;
        }

        if (isHistoryRoute) {
          if (req.method !== 'GET') {
            res.writeHead(405, { 'Content-Type': 'application/problem+json' });
            res.end(JSON.stringify({ status: 405, detail: 'Method not allowed' }));
            return;
          }
          if (nextForcedHistoryResponse !== null) {
            const forced = nextForcedHistoryResponse;
            nextForcedHistoryResponse = null;
            res.writeHead(forced.status, {
              'Content-Type': forced.contentType ?? 'application/problem+json',
              ...forced.headers,
            });
            res.end(typeof forced.body === 'string' ? forced.body : JSON.stringify(forced.body));
            return;
          }
          if (actor.role !== 'PLATFORM_ADMIN' && actor.role !== 'IMPLEMENTATION_STAFF') {
            res.writeHead(403, { 'Content-Type': 'application/problem+json' });
            res.end(JSON.stringify({ status: 403, detail: 'Access denied' }));
            return;
          }
          const existing = store.get(rawId);
          if (
            !existing ||
            (actor.role === 'IMPLEMENTATION_STAFF' &&
              !(actor.assignedWorkspaces ?? []).includes(rawId))
          ) {
            res.writeHead(404, { 'Content-Type': 'application/problem+json' });
            res.end(JSON.stringify({ status: 404, detail: 'Workspace not found' }));
            return;
          }

          const page = Number(parsedUrl.searchParams.get('page') ?? '0');
          const size = Number(parsedUrl.searchParams.get('size') ?? '20');
          if (
            !Number.isInteger(page) ||
            page < 0 ||
            !Number.isInteger(size) ||
            size < 1 ||
            size > 100 ||
            page * size > 2147483647
          ) {
            res.writeHead(400, { 'Content-Type': 'application/problem+json' });
            res.end(JSON.stringify({ status: 400, detail: 'Invalid history pagination' }));
            return;
          }

          const events = [...(historyStore.get(rawId) ?? [])].sort((a, b) => {
            const tDiff = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
            if (tDiff !== 0) return tDiff;
            return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
          });
          const totalElements = events.length;
          const totalPages = totalElements === 0 ? 0 : Math.ceil(totalElements / size);
          const items = events.slice(page * size, page * size + size);

          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ items, page, size, totalElements, totalPages }));
          return;
        }

        if (req.method === 'GET') {
          if (actor.role !== 'PLATFORM_ADMIN' && actor.role !== 'IMPLEMENTATION_STAFF') {
            res.writeHead(403, { 'Content-Type': 'application/problem+json' });
            res.end(JSON.stringify({ status: 403, detail: 'Access denied' }));
            return;
          }
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

        if (req.method === 'PUT') {
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
            if (!ALLOWED_KEYS.has(k)) {
              res.writeHead(400, { 'Content-Type': 'application/problem+json' });
              res.end(JSON.stringify({ status: 400, detail: 'Unknown workspace metadata property' }));
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

          const beforeSnapshot = { ...existing };
          const nextUpdatedAt = new Date(Date.parse(existing.updatedAt) + 60_000).toISOString();
          const updated = {
            ...existing,
            enterpriseName: parsedBody.enterpriseName.trim(),
            contactName: parsedBody.contactName.trim(),
            contactEmail: parsedBody.contactEmail.trim(),
            contactPhone:
              parsedBody.contactPhone == null ? null : parsedBody.contactPhone.trim(),
            version: existing.version + 1,
            updatedAt: nextUpdatedAt,
          };
          store.set(rawId, updated);

          const existingEvents = historyStore.get(rawId) ?? [];
          existingEvents.push({
            id: crypto.randomUUID(),
            actorId: actor.accountId,
            action: 'METADATA_UPDATED',
            workspaceVersion: updated.version,
            occurredAt: nextUpdatedAt,
            details: {
              before: beforeSnapshot,
              after: { ...updated },
            },
          });
          historyStore.set(rawId, existingEvents);

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
    historyStore,
    receivedRequests,
    forceNextHistoryResponse(spec) {
      nextForcedHistoryResponse = spec;
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

test('Server GET /api/workspaces/[id]/history validates UUID and page/size bounds, forwards Bearer token, strips unexpected fields, and maps 401/403/404/502', async () => {
  const expSec = Math.floor(Date.now() / 1000) + 900;
  const adminAccountId = '99999999-9999-4999-8999-999999999999';
  const adminToken = makeUnsignedTestJwt(adminAccountId, crypto.randomUUID(), expSec);
  const unassignedStaffToken = makeUnsignedTestJwt(crypto.randomUUID(), crypto.randomUUID(), expSec);
  const enterpriseScopedToken = makeUnsignedTestJwt(crypto.randomUUID(), crypto.randomUUID(), expSec);
  const expiredToken = makeUnsignedTestJwt(crypto.randomUUID(), crypto.randomUUID(), expSec);

  const wsId = '11111111-1111-4111-8111-111111111111';
  const eventId = 'eeeeeeee-1111-4111-8111-111111111111';

  const upstream = await startContractWorkspaceHistoryUpstream({
    workspaces: [
      {
        id: wsId,
        workspaceKey: 'alpha-commerce',
        enterpriseName: 'Alpha Commerce',
        contactName: 'Liên hệ A',
        contactEmail: 'a@alpha.vn',
        contactPhone: '+84 909 111 222',
        version: 1,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-11-20T10:00:00Z',
      },
    ],
    historyByWorkspaceId: {
      [wsId]: [
        {
          id: eventId,
          actorId: adminAccountId,
          action: 'METADATA_UPDATED',
          workspaceVersion: 1,
          occurredAt: '2026-11-20T10:00:00Z',
          details: {
            before: { contactName: 'Liên hệ Cũ' },
            after: { contactName: 'Liên hệ A' },
          },
          internalAuditSecret: 'must-be-stripped',
        },
      ],
    },
    accounts: [
      {
        token: adminToken,
        accountId: adminAccountId,
        role: 'PLATFORM_ADMIN',
        workspaceId: null,
        mustChangePassword: false,
      },
      {
        token: unassignedStaffToken,
        accountId: crypto.randomUUID(),
        role: 'IMPLEMENTATION_STAFF',
        workspaceId: null,
        mustChangePassword: false,
        assignedWorkspaces: [],
      },
      {
        token: enterpriseScopedToken,
        accountId: crypto.randomUUID(),
        role: 'SME_ADMIN',
        workspaceId: wsId,
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
      handleWorkspaceHistoryBridgeRequest,
      validateWorkspaceHistoryQuery,
    } = load('src/services/workspaces.ts');
    const env = { NODE_ENV: 'development', FRAUDGUARD_BACKEND_URL: upstream.baseUrl };
    const adminCookie = `fg_access_token=${encodeURIComponent(adminToken)}`;

    const makeHeaders = (cookie = adminCookie, fetchSite = 'same-origin') => {
      const h = new Headers({
        host: 'localhost:3000',
        'sec-fetch-site': fetchSite,
      });
      if (cookie) h.set('cookie', cookie);
      return h;
    };

    // 1) History query validator bounds
    assert.deepEqual(validateWorkspaceHistoryQuery({}), {
      ok: true,
      query: { page: 0, size: 20 },
    });
    assert.equal(validateWorkspaceHistoryQuery({ page: 'abc' }).detail, 'INVALID_PAGE');
    assert.equal(validateWorkspaceHistoryQuery({ size: 'xyz' }).detail, 'INVALID_SIZE');
    assert.equal(validateWorkspaceHistoryQuery({ page: -1 }).detail, 'INVALID_PAGINATION');
    assert.equal(validateWorkspaceHistoryQuery({ size: 0 }).detail, 'INVALID_PAGINATION');
    assert.equal(validateWorkspaceHistoryQuery({ size: 101 }).detail, 'INVALID_PAGINATION');
    assert.equal(
      validateWorkspaceHistoryQuery({ page: 30_000_000, size: 100 }).detail,
      'INVALID_PAGINATION'
    );

    // 2) Rejects workspaceKey (non-UUID), bad query params, cross-site, and missing cookie BEFORE upstream
    const nonUuidRes = await handleWorkspaceHistoryBridgeRequest({
      method: 'GET',
      workspaceId: 'alpha-commerce',
      requestUrl: 'http://localhost:3000/api/workspaces/alpha-commerce/history',
      headers: makeHeaders(),
      env,
    });
    assert.equal(nonUuidRes.status, 400);
    assert.equal(nonUuidRes.body.detail, 'INVALID_WORKSPACE_ID');

    const badSizeRes = await handleWorkspaceHistoryBridgeRequest({
      method: 'GET',
      workspaceId: wsId,
      requestUrl: `http://localhost:3000/api/workspaces/${wsId}/history?page=0&size=500`,
      headers: makeHeaders(),
      env,
    });
    assert.equal(badSizeRes.status, 400);
    assert.equal(badSizeRes.body.detail, 'INVALID_PAGINATION');

    const crossSiteRes = await handleWorkspaceHistoryBridgeRequest({
      method: 'GET',
      workspaceId: wsId,
      requestUrl: `http://localhost:3000/api/workspaces/${wsId}/history`,
      headers: makeHeaders(adminCookie, 'cross-site'),
      env,
    });
    assert.equal(crossSiteRes.status, 403);
    assert.equal(crossSiteRes.body.errorCode, 'FORBIDDEN');

    const noCookieRes = await handleWorkspaceHistoryBridgeRequest({
      method: 'GET',
      workspaceId: wsId,
      requestUrl: `http://localhost:3000/api/workspaces/${wsId}/history`,
      headers: makeHeaders(''),
      env,
    });
    assert.equal(noCookieRes.status, 401);
    assert.equal(noCookieRes.body.errorCode, 'UNAUTHENTICATED');
    assert.equal(upstream.receivedRequests.length, 0, 'Zero upstream requests on local rejections');

    // 3) Valid Platform Admin GET defaults page=0&size=20, strips unknown query params & unexpected item fields, never leaks token
    const okHistory = await handleWorkspaceHistoryBridgeRequest({
      method: 'GET',
      workspaceId: wsId,
      requestUrl: `http://localhost:3000/api/workspaces/${wsId}/history?foo=bar&search=ignored`,
      headers: makeHeaders(),
      env,
    });
    assert.equal(okHistory.status, 200);
    assert.equal(okHistory.body.totalElements, 1);
    assert.equal(okHistory.body.items[0].id, eventId);
    assert.equal('internalAuditSecret' in okHistory.body.items[0], false);
    assert.equal(JSON.stringify(okHistory.body).includes(adminToken), false);

    const lastUpstreamReq = upstream.receivedRequests.at(-1);
    assert.equal(lastUpstreamReq.pathname, `/api/v1/workspaces/${wsId}/history`);
    assert.equal(lastUpstreamReq.search, '?page=0&size=20');
    assert.equal(lastUpstreamReq.authHeader, `Bearer ${adminToken}`);

    // 4) 403 for Enterprise role, 404 for unassigned Implementation Staff or unknown UUID, 401 for expired JWT, 502 for upstream 500
    const forbiddenRes = await handleWorkspaceHistoryBridgeRequest({
      method: 'GET',
      workspaceId: wsId,
      requestUrl: `http://localhost:3000/api/workspaces/${wsId}/history`,
      headers: makeHeaders(`fg_access_token=${encodeURIComponent(enterpriseScopedToken)}`),
      env,
    });
    assert.equal(forbiddenRes.status, 403);
    assert.equal(forbiddenRes.body.errorCode, 'FORBIDDEN');

    const unassignedStaffRes = await handleWorkspaceHistoryBridgeRequest({
      method: 'GET',
      workspaceId: wsId,
      requestUrl: `http://localhost:3000/api/workspaces/${wsId}/history`,
      headers: makeHeaders(`fg_access_token=${encodeURIComponent(unassignedStaffToken)}`),
      env,
    });
    assert.equal(unassignedStaffRes.status, 404);
    assert.equal(unassignedStaffRes.body.errorCode, 'NOT_FOUND');

    const expiredRes = await handleWorkspaceHistoryBridgeRequest({
      method: 'GET',
      workspaceId: wsId,
      requestUrl: `http://localhost:3000/api/workspaces/${wsId}/history`,
      headers: makeHeaders(`fg_access_token=${encodeURIComponent(expiredToken)}`),
      env,
    });
    assert.equal(expiredRes.status, 401);
    assert.equal(expiredRes.body.errorCode, 'SESSION_EXPIRED');
    assert.match(expiredRes.setCookie, /Max-Age=0/);

    upstream.forceNextHistoryResponse({
      status: 500,
      body: { status: 500, detail: 'Database error' },
    });
    const upstream500 = await handleWorkspaceHistoryBridgeRequest({
      method: 'GET',
      workspaceId: wsId,
      requestUrl: `http://localhost:3000/api/workspaces/${wsId}/history`,
      headers: makeHeaders(),
      env,
    });
    assert.equal(upstream500.status, 502);
    assert.equal(upstream500.body.errorCode, 'BACKEND_UNAVAILABLE');
  } finally {
    await upstream.close();
  }
});

test('Primary acceptance flow: Edit contactName "Liên hệ A" -> "Liên hệ B" -> Save -> Open History in same modal without reload shows newest METADATA_UPDATED diff immediately, plus phone clear/add and lazy loading', async () => {
  const expSec = Math.floor(Date.now() / 1000) + 900;
  const adminAccountId = '77777777-7777-4777-8777-777777777777';
  const adminToken = makeUnsignedTestJwt(adminAccountId, crypto.randomUUID(), expSec);
  const adminCookie = `fg_access_token=${encodeURIComponent(adminToken)}`;
  const wsId = 'aaaaaaaa-1111-4111-8111-111111111111';

  const upstream = await startContractWorkspaceHistoryUpstream({
    workspaces: [
      {
        id: wsId,
        workspaceKey: 'acme-vn',
        enterpriseName: 'Công ty Cổ phần Acme Việt Nam',
        contactName: 'Liên hệ A',
        contactEmail: 'contact@acme.vn',
        contactPhone: '+84 909 111 222',
        version: 2,
        createdAt: '2026-09-01T08:00:00Z',
        updatedAt: '2026-11-28T07:00:00Z',
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
      handleWorkspaceUpdateBridgeRequest,
      fetchWorkspacePage,
      fetchWorkspaceDetail,
      fetchWorkspaceHistory,
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
            const id = decodeURIComponent(suffix.slice(0, -'/history'.length));
            result = await handleWorkspaceHistoryBridgeRequest({
              method,
              workspaceId: id,
              requestUrl: fullUrl,
              headers,
              env,
            });
          } else {
            const id = decodeURIComponent(suffix);
            if (method === 'PUT') {
              result = await handleWorkspaceUpdateBridgeRequest({
                method: 'PUT',
                workspaceId: id,
                requestUrl: fullUrl,
                headers,
                readBodyText: async () => String(init.body ?? ''),
                env,
              });
            } else {
              result = await handleWorkspaceDetailBridgeRequest({
                method: 'GET',
                workspaceId: id,
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
          saveMetadata: (id, payload, opts) =>
            updateWorkspaceMetadata(id, payload, { ...opts, fetchImpl: bridgeFetch }),
          searchDebounceMs: 0,
        })
      );

    // 1) Initial directory load + open enterprise detail modal
    let tree = renderView();
    await flushBff();
    tree = renderView();

    const rowTrigger = findNodes(
      tree,
      (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger'
    )[0];
    rowTrigger.props.onClick();
    tree = renderView();

    // While detail is loading, "Lịch sử" button must not be visible yet
    let dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(
      findNodes(dialog, (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Lịch sử'))
        .length,
      0
    );

    await flushBff();
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];

    // Confirm lazy loading: opening detail modal must make ZERO /history requests!
    assert.equal(
      upstream.receivedRequests.filter((r) => r.pathname.endsWith('/history')).length,
      0,
      'History endpoint must only be called when user clicks Lịch sử'
    );

    // 2) Click "Chỉnh sửa", change contactName from "Liên hệ A" -> "Liên hệ B", click "Lưu"
    findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Chỉnh sửa')
    )[0].props.onClick();
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];

    let inputs = findNodes(dialog, (n) => n.type === 'input');
    const contactNameInput = inputs.find((i) => i.props.name === 'contactName');
    assert.equal(contactNameInput.props.value, 'Liên hệ A');
    contactNameInput.props.onChange({ target: { value: 'Liên hệ B' } });

    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    await findNodes(dialog, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
    await flushBff();
    tree = renderView();
    await flushBff();
    tree = renderView();

    // Still 0 /history requests until user clicks "Lịch sử"!
    assert.equal(
      upstream.receivedRequests.filter((r) => r.pathname.endsWith('/history')).length,
      0
    );

    // 3) Click "Lịch sử" inside the SAME modal without reloading the page
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    const historyBtn = findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Lịch sử')
    )[0];
    assert.ok(historyBtn);
    historyBtn.props.onClick();
    tree = renderView();
    await flushBff();
    tree = renderView();

    const historyCalls = upstream.receivedRequests.filter((r) => r.pathname.endsWith('/history'));
    assert.equal(historyCalls.length, 1);
    assert.equal(historyCalls[0].pathname, `/api/v1/workspaces/${wsId}/history`);
    assert.equal(historyCalls[0].search, '?page=0&size=20');

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    let historyHtml = renderNodeHtml(dialog);

    // First row shows action title, update timestamp, and exact diff "Người liên hệ: Liên hệ A → Liên hệ B"
    assert.equal(historyHtml.includes('Cập nhật thông tin doanh nghiệp'), true);
    assert.equal(historyHtml.includes('Người liên hệ: Liên hệ A → Liên hệ B'), true);
    // Unchanged fields and technical fields (workspaceVersion, raw JSON, actor UUID before expand) are NOT dumped on main row
    assert.equal(historyHtml.includes('Tên doanh nghiệp:'), false);
    assert.equal(historyHtml.includes('Email:'), false);
    assert.equal(historyHtml.includes('workspaceVersion'), false);
    assert.equal(historyHtml.includes(adminAccountId), false, 'Raw actor UUID hidden until row expanded');

    // Expand row -> reveals actorId labeled as "Mã tài khoản thực hiện", then collapse
    const expandBtn = findNodes(
      dialog,
      (n) => n.type === 'button' && n.props.className === 'workspaceHistoryToggleBtn'
    )[0];
    assert.equal(expandBtn.props['aria-expanded'], false);
    expandBtn.props.onClick();
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    historyHtml = renderNodeHtml(dialog);
    assert.equal(historyHtml.includes('Mã tài khoản thực hiện:'), true);
    assert.equal(historyHtml.includes(adminAccountId), true);

    const collapseBtn = findNodes(
      dialog,
      (n) => n.type === 'button' && n.props.className === 'workspaceHistoryToggleBtn'
    )[0];
    assert.equal(collapseBtn.props['aria-expanded'], true);
    collapseBtn.props.onClick();
    tree = renderView();

    // 4) Return to enterprise info -> re-edit to CLEAR phone number -> Save -> re-open History fetches fresh event at top!
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(
      dialog,
      (n) =>
        n.type === 'button' &&
        JSON.stringify(n.props.children).includes('Quay lại thông tin doanh nghiệp')
    )[0].props.onClick();
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(renderNodeHtml(dialog).includes('Liên hệ B'), true);

    findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Chỉnh sửa')
    )[0].props.onClick();
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    inputs = findNodes(dialog, (n) => n.type === 'input');
    inputs.find((i) => i.props.name === 'contactPhone').props.onChange({ target: { value: '' } });
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    await findNodes(dialog, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
    await flushBff();
    tree = renderView();
    await flushBff();
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Lịch sử')
    )[0].props.onClick();
    tree = renderView();
    await flushBff();
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    const itemsAfterPhoneClear = findNodes(
      dialog,
      (n) => n.type === 'li' && n.props.className === 'workspaceHistoryItem'
    );
    assert.equal(itemsAfterPhoneClear.length, 2);
    // Newest event is FIRST (index 0): phone removed! Older event is SECOND (index 1): Liên hệ A -> Liên hệ B!
    assert.match(
      renderNodeHtml(itemsAfterPhoneClear[0]),
      /Số điện thoại: Đã xóa \+84 909 111 222/
    );
    assert.match(
      renderNodeHtml(itemsAfterPhoneClear[1]),
      /Người liên hệ: Liên hệ A → Liên hệ B/
    );

    // 5) Re-edit to ADD phone number back -> Save -> re-open History shows "Số điện thoại: Đã thêm ..." at index 0
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
      .find((i) => i.props.name === 'contactPhone')
      .props.onChange({ target: { value: '+84 988 777 666' } });
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    await findNodes(dialog, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
    await flushBff();
    tree = renderView();
    await flushBff();
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Lịch sử')
    )[0].props.onClick();
    tree = renderView();
    await flushBff();
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    const itemsAfterPhoneAdd = findNodes(
      dialog,
      (n) => n.type === 'li' && n.props.className === 'workspaceHistoryItem'
    );
    assert.equal(itemsAfterPhoneAdd.length, 3);
    assert.match(
      renderNodeHtml(itemsAfterPhoneAdd[0]),
      /Số điện thoại: Đã thêm \+84 988 777 666/
    );
  } finally {
    harness.unmount();
    await upstream.close();
  }
});

test('History renders STAFF_ASSIGNED, STAFF_REMOVED, SPECIFICATION_CREATED, SPECIFICATION_UPDATED, and unknown/partial events without raw JSON or actor/staff confusion', async () => {
  const { translations } = load('src/config/translations.ts');
  const harness = makeStatefulHarness();

  const wsId = 'bbbbbbbb-2222-4222-8222-222222222222';
  const adminActorId = '10101010-1010-4010-8010-101010101010';
  const implStaffAccountId = '20202020-2020-4020-8020-202020202020';

  const eventsFixture = [
    {
      id: 'e0000005-0000-4000-8000-000000000005',
      actorId: adminActorId,
      action: 'CUSTOM_FUTURE_EVENT',
      workspaceVersion: 5,
      occurredAt: '2026-11-28T12:00:00Z',
      details: null,
    },
    {
      id: 'e0000004-0000-4000-8000-000000000004',
      actorId: implStaffAccountId,
      action: 'SPECIFICATION_UPDATED',
      workspaceVersion: 4,
      occurredAt: '2026-11-28T11:30:00Z',
      details: {
        before: {
          workspaceId: wsId,
          businessSpecification: 'Đặc tả COD ban đầu cho sàn thương mại điện tử.',
          fieldDescriptions: 'order_id, cod_amount, receiver_phone',
          knownAnomalyConditions: 'Đặt nhiều đơn COD trùng số điện thoại trong 5 phút.',
          version: 0,
          updatedAt: '2026-11-28T11:00:00Z',
        },
        after: {
          workspaceId: wsId,
          businessSpecification:
            'Đặc tả COD mở rộng: giám sát cả đơn hoàn trả liên tỉnh và tài khoản mới tạo dưới 24 giờ.',
          fieldDescriptions: 'order_id, cod_amount, receiver_phone',
          knownAnomalyConditions:
            'Đặt trên 5 đơn COD giá trị cao (> 5.000.000 VNĐ) từ cùng thiết bị.',
          version: 1,
          updatedAt: '2026-11-28T11:30:00Z',
        },
      },
    },
    {
      id: 'e0000003-0000-4000-8000-000000000003',
      actorId: implStaffAccountId,
      action: 'SPECIFICATION_CREATED',
      workspaceVersion: 3,
      occurredAt: '2026-11-28T11:00:00Z',
      // Exact backend shape: top-level SpecificationResponse (not wrapped in before/after)
      details: {
        workspaceId: wsId,
        businessSpecification: 'Đặc tả COD ban đầu cho sàn thương mại điện tử.',
        fieldDescriptions: 'order_id, cod_amount, receiver_phone',
        knownAnomalyConditions: null,
        version: 0,
        updatedAt: '2026-11-28T11:00:00Z',
      },
    },
    {
      id: 'e0000002-0000-4000-8000-000000000002',
      actorId: adminActorId,
      action: 'STAFF_REMOVED',
      workspaceVersion: 2,
      occurredAt: '2026-11-28T10:30:00Z',
      details: { staffId: implStaffAccountId },
    },
    {
      id: 'e0000001-0000-4000-8000-000000000001',
      actorId: adminActorId,
      action: 'STAFF_ASSIGNED',
      workspaceVersion: 1,
      occurredAt: '2026-11-28T10:00:00Z',
      details: { staffId: implStaffAccountId },
    },
  ];

  try {
    const {
      PlatformWorkspaceListView,
      describeWorkspaceHistoryEvent,
    } = load('src/components/fraudguard-dashboard/PlatformWorkspaceListView.tsx', {
      react: harness.mockReact,
      '@/context/LanguageContext': {
        useLanguage: () => ({ language: 'vi', t: translations.vi, toggleLanguage() {} }),
      },
      '@/hooks/useDialogFocus': {
        useDialogFocus: () => ({ current: null }),
      },
    });

    // Also unit-check English formatting via describeWorkspaceHistoryEvent
    const enMetadataDesc = describeWorkspaceHistoryEvent(
      {
        id: eventsFixture[0].id,
        actorId: adminActorId,
        action: 'METADATA_UPDATED',
        workspaceVersion: 1,
        occurredAt: '2026-11-28T10:00:00Z',
        details: {
          before: { contactName: 'Contact A', contactPhone: '+84 900' },
          after: { contactName: 'Contact B', contactPhone: null },
        },
      },
      translations.en.platformWorkspaces.detail
    );
    assert.equal(enMetadataDesc.title, 'Enterprise details updated');
    assert.deepEqual(enMetadataDesc.summaryLines, [
      'Contact person: Contact A → Contact B',
      'Phone number: Removed +84 900',
    ]);

    const item = {
      id: wsId,
      workspaceKey: 'beta-logistics',
      enterpriseName: 'Beta Logistics',
      contactName: 'Trần Minh',
      contactEmail: 'minh@beta.vn',
      contactPhone: null,
      version: 5,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-11-28T12:00:00Z',
    };

    const renderView = () =>
      harness.render(() =>
        PlatformWorkspaceListView({
          loadPage: async () => ({
            items: [item],
            page: 0,
            size: 20,
            totalElements: 1,
            totalPages: 1,
          }),
          loadDetail: async () => item,
          loadHistory: async () => ({
            items: eventsFixture,
            page: 0,
            size: 20,
            totalElements: eventsFixture.length,
            totalPages: 1,
          }),
          searchDebounceMs: 0,
        })
      );

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
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Lịch sử')
    )[0].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    const collapsedHtml = renderNodeHtml(dialog);

    // Verify all 5 event titles render cleanly in newest-first order
    assert.equal(collapsedHtml.includes('Sự kiện hệ thống (CUSTOM_FUTURE_EVENT)'), true);
    assert.equal(collapsedHtml.includes('Cập nhật đặc tả'), true);
    assert.equal(collapsedHtml.includes('Tạo đặc tả'), true);
    assert.equal(collapsedHtml.includes('Gỡ phân công'), true);
    assert.equal(collapsedHtml.includes('Phân công nhân sự'), true);

    // Long specification body text is NOT dumped into collapsed list!
    assert.equal(
      collapsedHtml.includes('giám sát cả đơn hoàn trả liên tỉnh'),
      false,
      'Long specification body must remain collapsed initially'
    );
    // Summary line for SPECIFICATION_UPDATED lists only the changed sections (omits unchanged fieldDescriptions!)
    assert.equal(
      collapsedHtml.includes(
        'Đã cập nhật nội dung: Đặc tả nghiệp vụ, Điều kiện bất thường đã biết'
      ),
      true
    );

    // Expand SPECIFICATION_UPDATED (index 1), SPECIFICATION_CREATED (index 2), and STAFF_ASSIGNED (index 4)
    let toggleButtons = findNodes(
      dialog,
      (n) => n.type === 'button' && n.props.className === 'workspaceHistoryToggleBtn'
    );
    assert.equal(toggleButtons.length, 5);
    toggleButtons[1].props.onClick();
    toggleButtons[2].props.onClick();
    toggleButtons[4].props.onClick();
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];

    const historyRows = findNodes(
      dialog,
      (n) => n.type === 'li' && n.props.className === 'workspaceHistoryItem'
    );

    // Row 1 (SPECIFICATION_UPDATED): shows Trước thay đổi / Sau thay đổi for changed sections, hides unchanged fieldDescriptions
    const specUpdatedHtml = renderNodeHtml(historyRows[1]);
    assert.equal(specUpdatedHtml.includes('Trước thay đổi'), true);
    assert.equal(specUpdatedHtml.includes('Sau thay đổi'), true);
    assert.equal(
      specUpdatedHtml.includes('giám sát cả đơn hoàn trả liên tỉnh'),
      true
    );
    assert.equal(
      specUpdatedHtml.includes('order_id, cod_amount, receiver_phone'),
      false,
      'Unchanged fieldDescriptions must not clutter SPECIFICATION_UPDATED diff'
    );

    // Row 2 (SPECIFICATION_CREATED): renders top-level SpecificationResponse fields cleanly
    const specCreatedHtml = renderNodeHtml(historyRows[2]);
    assert.equal(specCreatedHtml.includes('Đặc tả COD ban đầu cho sàn thương mại điện tử.'), true);
    assert.equal(specCreatedHtml.includes('order_id, cod_amount, receiver_phone'), true);

    // Row 4 (STAFF_ASSIGNED): distinguishes assigned staffId (2020...) from actorId (1010...) without inventing names!
    const staffAssignedHtml = renderNodeHtml(historyRows[4]);
    assert.equal(
      staffAssignedHtml.includes('Nhân sự triển khai được phân công (Mã tài khoản):'),
      true
    );
    assert.equal(staffAssignedHtml.includes(implStaffAccountId), true);
    assert.equal(staffAssignedHtml.includes('Mã tài khoản thực hiện:'), true);
    assert.equal(staffAssignedHtml.includes(adminActorId), true);
  } finally {
    harness.unmount();
  }
});

test('History handles empty state, independent pagination, workspace switch race (A -> B), error isolation (503/403/404/401), outer list preservation, and static antislop audit', async () => {
  const { translations } = load('src/config/translations.ts');
  const { WorkspaceServiceError } = load('src/services/workspaces.ts');
  const harness = makeStatefulHarness();

  const itemA = {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    workspaceKey: 'alpha-two',
    enterpriseName: 'Alpha Enterprise Page Two',
    contactName: 'Liên hệ Alpha',
    contactEmail: 'alpha@example.vn',
    contactPhone: '0901112222',
    version: 3,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-11-28T09:00:00Z',
  };
  const itemB = {
    id: 'bbbbbbbb-0000-4000-8000-000000000002',
    workspaceKey: 'alpha-three',
    enterpriseName: 'Alpha Empty History Corp',
    contactName: 'Liên hệ Beta',
    contactEmail: 'beta@example.vn',
    contactPhone: null,
    version: 0,
    createdAt: '2026-10-02T00:00:00Z',
    updatedAt: '2026-11-28T09:30:00Z',
  };

  const pageCalls = [];
  const historyCalls = [];
  let nextHistoryHandler = null;
  let sessionExpiredTriggered = 0;

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

    const loadPage = async (q) => {
      pageCalls.push({ ...q });
      // Simulate 12 matching enterprises across 2 pages of size 10
      return {
        items: [itemA, itemB],
        page: q.page ?? 0,
        size: q.size ?? 20,
        totalElements: 12,
        totalPages: 2,
      };
    };

    const loadDetail = async (id) => (id === itemA.id ? { ...itemA } : { ...itemB });

    const loadHistory = (id, q, opts) => {
      historyCalls.push({ id, ...q, signal: opts?.signal });
      return nextHistoryHandler(id, q, opts);
    };

    const renderView = () =>
      harness.render(() =>
        PlatformWorkspaceListView({
          loadPage,
          loadDetail,
          loadHistory,
          onSessionExpired: () => {
            sessionExpiredTriggered += 1;
          },
          searchDebounceMs: 0,
        })
      );

    // 1) Set outer directory to search="alpha", size=10, page=1 (Page 2 of directory)
    let tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    findNodes(tree, (n) => n.type === 'input' && n.props.name === 'workspaceSearch')[0].props.onChange({
      target: { value: 'alpha' },
    });
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    findNodes(tree, (n) => n.type === 'select')[0].props.onChange({ target: { value: '10' } });
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    // Navigate outer directory to page index 1 ("Trang 2/2")
    const outerPage2Btn = findNodes(
      tree,
      (n) => n.type === 'button' && n.props['aria-label'] === 'Chuyển tới trang 2'
    )[0];
    outerPage2Btn.props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    assert.deepEqual(pageCalls.at(-1), { search: 'alpha', page: 1, size: 10 });
    const outerCallsCountBeforeModal = pageCalls.length;

    // 2) Open Enterprise A -> open History -> paginate History to page 1 (Trang 2/3)
    nextHistoryHandler = async (_id, q) => ({
      items: [
        {
          id: `00000000-0000-4000-8000-00000000000${q.page + 1}`,
          actorId: '99999999-9999-4999-8999-999999999999',
          action: 'METADATA_UPDATED',
          workspaceVersion: q.page + 1,
          occurredAt: '2026-11-28T09:00:00Z',
          details: {
            before: { contactName: `Trước Trang ${q.page + 1}` },
            after: { contactName: `Sau Trang ${q.page + 1}` },
          },
        },
      ],
      page: q.page,
      size: q.size,
      totalElements: 45,
      totalPages: 3,
    });

    findNodes(tree, (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger')[0].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    let dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Lịch sử')
    )[0].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.match(renderNodeHtml(dialog), /Sau Trang 1/);

    // Move History to page index 1 ("Trang 2/3")
    findNodes(
      dialog,
      (n) => n.type === 'button' && n.props['aria-label'] === 'Chuyển tới trang 2'
    )[0].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.match(renderNodeHtml(dialog), /Sau Trang 2/);
    assert.equal(
      pageCalls.length,
      outerCallsCountBeforeModal,
      'Paginating history inside modal must NOT re-query or alter outer enterprise directory'
    );

    // 3) Trigger slow refresh on A's history, then close A and open Enterprise B -> open History:
    //    - History resets to page=0!
    //    - Empty state ("Chưa có lịch sử thay đổi") renders for B!
    //    - Late response from A is discarded and NEVER pollutes B!
    let resolveSlowHistoryA;
    nextHistoryHandler = () =>
      new Promise((resolve) => {
        resolveSlowHistoryA = resolve;
      });
    findNodes(
      dialog,
      (n) => n.type === 'button' && n.props['aria-label'] === 'Làm mới lịch sử'
    )[0].props.onClick();
    tree = renderView();

    // Close modal A
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(dialog, (n) => n.type === 'button' && n.props.children === 'Đóng')[0].props.onClick();
    tree = renderView();

    // Verify outer directory search="alpha", page=1 (Trang 2/2), size=10 is completely intact!
    assert.equal(
      findNodes(tree, (n) => n.type === 'input' && n.props.name === 'workspaceSearch')[0].props.value,
      'alpha'
    );
    assert.match(renderNodeHtml(tree), /Trang 2\/2/);

    // Open Enterprise B and open B's History (empty list)
    nextHistoryHandler = async () => ({
      items: [],
      page: 0,
      size: 20,
      totalElements: 0,
      totalPages: 0,
    });
    findNodes(tree, (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger')[1].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Lịch sử')
    )[0].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    // Verify B requested page=0 (reset from A's page=1!) and shows empty state
    assert.equal(historyCalls.at(-1).id, itemB.id);
    assert.equal(historyCalls.at(-1).page, 0);
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(renderNodeHtml(dialog).includes('Chưa có lịch sử thay đổi'), true);

    // Resolve slow History A late -> must NOT overwrite B!
    resolveSlowHistoryA({
      items: [
        {
          id: 'ffffffff-0000-4000-8000-000000000099',
          actorId: '99999999-9999-4999-8999-999999999999',
          action: 'METADATA_UPDATED',
          workspaceVersion: 99,
          occurredAt: '2026-11-28T10:00:00Z',
          details: {
            before: { contactName: 'Cũ' },
            after: { contactName: 'Dữ Liệu Muộn Của A Không Được Hiện Ở B' },
          },
        },
      ],
      page: 1,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    });
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(
      renderNodeHtml(dialog).includes('Dữ Liệu Muộn Của A Không Được Hiện Ở B'),
      false
    );
    assert.equal(renderNodeHtml(dialog).includes('Chưa có lịch sử thay đổi'), true);

    // 4) Error isolation: 503 error (+ Retry), 403, and 404 inside History NEVER wipe loaded enterprise detail!
    nextHistoryHandler = async () => {
      throw new WorkspaceServiceError('BACKEND_UNAVAILABLE', 503);
    };
    findNodes(
      dialog,
      (n) => n.type === 'button' && n.props['aria-label'] === 'Làm mới lịch sử'
    )[0].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(renderNodeHtml(dialog).includes('Không thể tải lịch sử thay đổi'), true);

    // Click "Quay lại thông tin doanh nghiệp" -> loaded enterprise detail is still intact!
    findNodes(
      dialog,
      (n) =>
        n.type === 'button' &&
        JSON.stringify(n.props.children).includes('Quay lại thông tin doanh nghiệp')
    )[0].props.onClick();
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(renderNodeHtml(dialog).includes('Liên hệ Beta'), true);
    assert.equal(renderNodeHtml(dialog).includes('alpha-three'), true);

    // Re-open History with 503, then test "Thử lại" button recovering to 403, then 404, then 401 session expiry!
    findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Lịch sử')
    )[0].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];

    nextHistoryHandler = async () => {
      throw new WorkspaceServiceError('FORBIDDEN', 403);
    };
    findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Thử lại')
    )[0].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(renderNodeHtml(dialog).includes('Không có quyền xem lịch sử thay đổi'), true);

    nextHistoryHandler = async () => {
      throw new WorkspaceServiceError('NOT_FOUND', 404);
    };
    findNodes(
      dialog,
      (n) => n.type === 'button' && n.props['aria-label'] === 'Làm mới lịch sử'
    )[0].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(renderNodeHtml(dialog).includes('Không tìm thấy lịch sử doanh nghiệp'), true);

    nextHistoryHandler = async () => {
      throw new WorkspaceServiceError('SESSION_EXPIRED', 401);
    };
    findNodes(
      dialog,
      (n) => n.type === 'button' && n.props['aria-label'] === 'Làm mới lịch sử'
    )[0].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    assert.equal(sessionExpiredTriggered, 1);
    assert.equal(findNodes(tree, (n) => n.props?.role === 'dialog').length, 0);
  } finally {
    harness.unmount();
  }

  // Static audit: zero em dashes (\u2014) and zero demo imports across all workspace files
  for (const rel of [
    'src/types/workspace.ts',
    'src/services/workspaces.ts',
    'src/app/api/workspaces/route.ts',
    'src/app/api/workspaces/[id]/route.ts',
    'src/app/api/workspaces/[id]/history/route.ts',
    'src/components/fraudguard-dashboard/PlatformWorkspaceListView.tsx',
  ]) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.equal(src.includes('\u2014'), false, `Unexpected em dash in ${rel}`);
    assert.equal(
      /@\/data\/|useOnboardingWorkflow|workspace-storage|OnboardingEnterpriseListScreen/.test(src),
      false,
      `Demo import leaked into ${rel}`
    );
  }
});
