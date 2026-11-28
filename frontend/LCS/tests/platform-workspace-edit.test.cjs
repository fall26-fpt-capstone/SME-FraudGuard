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
 * Contract-accurate local HTTP test double for GET /api/v1/workspaces,
 * GET /api/v1/workspaces/{id}, and PUT /api/v1/workspaces/{id}
 * matching WorkspaceController, WorkspaceMetadataRequest, WorkspaceServiceImpl, and ApiExceptionHandler.
 */
async function startContractWorkspaceCrudUpstream({ workspaces = [], accounts = [] } = {}) {
  const store = new Map(workspaces.map((w) => [w.id, { ...w }]));
  const accountMap = new Map(accounts.map((a) => [a.token, a]));
  const receivedRequests = [];
  let nextForcedPutResponse = null;

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
        const rawId = decodeURIComponent(parsedUrl.pathname.slice('/api/v1/workspaces/'.length));
        if (!UUID_RE.test(rawId)) {
          res.writeHead(400, { 'Content-Type': 'application/problem+json' });
          res.end(JSON.stringify({ status: 400, detail: 'Invalid UUID' }));
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
          if (nextForcedPutResponse !== null) {
            const forced = nextForcedPutResponse;
            nextForcedPutResponse = null;
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
            if (!ALLOWED_KEYS.has(k)) {
              res.writeHead(400, { 'Content-Type': 'application/problem+json' });
              res.end(JSON.stringify({ status: 400, detail: 'Unknown workspace metadata property' }));
              return;
            }
          }

          const { version, enterpriseName, contactName, contactEmail, contactPhone } = parsedBody;
          if (
            typeof version !== 'number' ||
            !Number.isInteger(version) ||
            version < 0 ||
            typeof enterpriseName !== 'string' ||
            !enterpriseName.trim() ||
            enterpriseName.length > 255 ||
            typeof contactName !== 'string' ||
            !contactName.trim() ||
            contactName.length > 120 ||
            typeof contactEmail !== 'string' ||
            !contactEmail.trim() ||
            contactEmail.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) ||
            (contactPhone !== null &&
              contactPhone !== undefined &&
              (typeof contactPhone !== 'string' || contactPhone.length > 40))
          ) {
            res.writeHead(400, { 'Content-Type': 'application/problem+json' });
            res.end(
              JSON.stringify({
                status: 400,
                detail: 'Check required fields and permitted lengths',
              })
            );
            return;
          }

          const existing = store.get(rawId);
          if (!existing) {
            res.writeHead(404, { 'Content-Type': 'application/problem+json' });
            res.end(JSON.stringify({ status: 404, detail: 'Workspace not found' }));
            return;
          }

          if (existing.version !== version) {
            res.writeHead(409, { 'Content-Type': 'application/problem+json' });
            res.end(
              JSON.stringify({
                status: 409,
                detail: 'Record changed; reload before saving',
              })
            );
            return;
          }

          const cleanName = enterpriseName.trim();
          for (const other of store.values()) {
            if (other.id !== rawId && other.enterpriseName.toLowerCase() === cleanName.toLowerCase()) {
              res.writeHead(409, { 'Content-Type': 'application/problem+json' });
              res.end(
                JSON.stringify({
                  status: 409,
                  detail: 'Enterprise name already exists',
                })
              );
              return;
            }
          }

          const updated = {
            ...existing,
            enterpriseName: cleanName,
            contactName: contactName.trim(),
            contactEmail: contactEmail.trim(),
            contactPhone: contactPhone == null ? null : contactPhone.trim(),
            version: existing.version + 1,
            updatedAt: new Date(Date.parse(existing.updatedAt) + 60_000).toISOString(),
          };
          store.set(rawId, updated);
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
    receivedRequests,
    forceNextPutResponse(spec) {
      nextForcedPutResponse = spec;
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

test('Server PUT /api/workspaces/[id] enforces CSRF/Origin, UUID, strict 5-field whitelist, validation limits, and maps 401/403/404/409/502', async () => {
  const expSec = Math.floor(Date.now() / 1000) + 900;
  const adminToken = makeUnsignedTestJwt(crypto.randomUUID(), crypto.randomUUID(), expSec);
  const staffToken = makeUnsignedTestJwt(crypto.randomUUID(), crypto.randomUUID(), expSec);
  const expiredToken = makeUnsignedTestJwt(crypto.randomUUID(), crypto.randomUUID(), expSec);

  const idA = '11111111-1111-4111-8111-111111111111';
  const idB = '22222222-2222-4222-8222-222222222222';

  const upstream = await startContractWorkspaceCrudUpstream({
    workspaces: [
      {
        id: idA,
        workspaceKey: 'alpha-commerce',
        enterpriseName: 'Alpha Commerce',
        contactName: 'Nguyễn Văn A',
        contactEmail: 'a@alpha.vn',
        contactPhone: '+84 909 111 222',
        version: 2,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-11-20T00:00:00Z',
      },
      {
        id: idB,
        workspaceKey: 'beta-fintech',
        enterpriseName: 'Beta FinTech',
        contactName: 'Trần Thị B',
        contactEmail: 'b@beta.vn',
        contactPhone: null,
        version: 0,
        createdAt: '2026-09-05T00:00:00Z',
        updatedAt: '2026-11-21T00:00:00Z',
      },
    ],
    accounts: [
      { token: adminToken, role: 'PLATFORM_ADMIN', workspaceId: null, mustChangePassword: false },
      { token: staffToken, role: 'IMPLEMENTATION_STAFF', workspaceId: null, mustChangePassword: false },
      { token: expiredToken, role: 'PLATFORM_ADMIN', workspaceId: null, expired: true },
    ],
  });

  try {
    const {
      handleWorkspaceUpdateBridgeRequest,
      validateWorkspaceMetadataInput,
      classifyWorkspaceConflict,
    } = load('src/services/workspaces.ts');
    const env = { NODE_ENV: 'development', FRAUDGUARD_BACKEND_URL: upstream.baseUrl };
    const adminCookie = `fg_access_token=${encodeURIComponent(adminToken)}`;

    const makePutHeaders = ({
      cookie = adminCookie,
      csrf = true,
      origin = 'http://localhost:3000',
      json = true,
    } = {}) => {
      const h = new Headers({
        host: 'localhost:3000',
        origin,
        'sec-fetch-site': 'same-origin',
      });
      if (csrf) h.set('x-fraudguard-csrf', '1');
      if (json) h.set('content-type', 'application/json');
      if (cookie) h.set('cookie', cookie);
      return h;
    };

    // 1) Metadata validation rules (255, 120, 254 + email, 40 + optional phone clearing)
    assert.equal(
      validateWorkspaceMetadataInput({
        version: 0,
        enterpriseName: '   ',
        contactName: 'A',
        contactEmail: 'a@b.vn',
        contactPhone: '',
      }).code,
      'ENTERPRISE_NAME_REQUIRED'
    );
    assert.equal(
      validateWorkspaceMetadataInput({
        version: 0,
        enterpriseName: 'x'.repeat(256),
        contactName: 'A',
        contactEmail: 'a@b.vn',
      }).code,
      'ENTERPRISE_NAME_TOO_LONG'
    );
    assert.equal(
      validateWorkspaceMetadataInput({
        version: 0,
        enterpriseName: 'Valid',
        contactName: 'x'.repeat(121),
        contactEmail: 'a@b.vn',
      }).code,
      'CONTACT_NAME_TOO_LONG'
    );
    assert.equal(
      validateWorkspaceMetadataInput({
        version: 0,
        enterpriseName: 'Valid',
        contactName: 'Name',
        contactEmail: 'not-an-email',
      }).code,
      'CONTACT_EMAIL_INVALID'
    );
    assert.equal(
      validateWorkspaceMetadataInput({
        version: 0,
        enterpriseName: 'Valid',
        contactName: 'Name',
        contactEmail: `${'a'.repeat(246)}@example.com`, // 258 chars > 254
      }).code,
      'CONTACT_EMAIL_TOO_LONG'
    );
    assert.equal(
      validateWorkspaceMetadataInput({
        version: 0,
        enterpriseName: 'Valid',
        contactName: 'Name',
        contactEmail: 'a@b.vn',
        contactPhone: '1'.repeat(41),
      }).code,
      'CONTACT_PHONE_TOO_LONG'
    );
    const clearedPhone = validateWorkspaceMetadataInput({
      version: 2,
      enterpriseName: '  Alpha Updated  ',
      contactName: '  Lê Minh  ',
      contactEmail: '  minh@alpha.vn  ',
      contactPhone: '   ',
    });
    assert.equal(clearedPhone.ok, true);
    assert.deepEqual(clearedPhone.payload, {
      version: 2,
      enterpriseName: 'Alpha Updated',
      contactName: 'Lê Minh',
      contactEmail: 'minh@alpha.vn',
      contactPhone: null,
    });

    // Conflict classifier distinguishes stale version, duplicate name, and ambiguous 409
    assert.equal(classifyWorkspaceConflict('Record changed; reload before saving'), 'STALE_VERSION');
    assert.equal(classifyWorkspaceConflict('Concurrent change; retry the request'), 'STALE_VERSION');
    assert.equal(classifyWorkspaceConflict('Enterprise name already exists'), 'DUPLICATE_NAME');
    assert.equal(classifyWorkspaceConflict('Data conflicts with an existing record'), 'DUPLICATE_NAME');
    assert.equal(classifyWorkspaceConflict('Conflict'), 'UNKNOWN');
    assert.equal(classifyWorkspaceConflict(undefined), 'UNKNOWN');

    // 2) CSRF, Origin, non-UUID, and unknown property rejection BEFORE hitting upstream
    const csrfBlocked = await handleWorkspaceUpdateBridgeRequest({
      method: 'PUT',
      workspaceId: idA,
      requestUrl: `http://localhost:3000/api/workspaces/${idA}`,
      headers: makePutHeaders({ csrf: false }),
      readBodyText: async () => JSON.stringify(clearedPhone.payload),
      env,
    });
    assert.equal(csrfBlocked.status, 403);
    assert.equal(csrfBlocked.body.errorCode, 'CSRF_REJECTED');

    const crossOriginBlocked = await handleWorkspaceUpdateBridgeRequest({
      method: 'PUT',
      workspaceId: idA,
      requestUrl: `http://localhost:3000/api/workspaces/${idA}`,
      headers: makePutHeaders({ origin: 'https://evil.example' }),
      readBodyText: async () => JSON.stringify(clearedPhone.payload),
      env,
    });
    assert.equal(crossOriginBlocked.status, 403);
    assert.equal(crossOriginBlocked.body.errorCode, 'CSRF_REJECTED');

    const badUuidBlocked = await handleWorkspaceUpdateBridgeRequest({
      method: 'PUT',
      workspaceId: 'alpha-commerce',
      requestUrl: 'http://localhost:3000/api/workspaces/alpha-commerce',
      headers: makePutHeaders(),
      readBodyText: async () => JSON.stringify(clearedPhone.payload),
      env,
    });
    assert.equal(badUuidBlocked.status, 400);
    assert.equal(badUuidBlocked.body.detail, 'INVALID_WORKSPACE_ID');

    const extraKeyBlocked = await handleWorkspaceUpdateBridgeRequest({
      method: 'PUT',
      workspaceId: idA,
      requestUrl: `http://localhost:3000/api/workspaces/${idA}`,
      headers: makePutHeaders(),
      readBodyText: async () =>
        JSON.stringify({ ...clearedPhone.payload, workspaceKey: 'hacked-key' }),
      env,
    });
    assert.equal(extraKeyBlocked.status, 400);
    assert.equal(extraKeyBlocked.body.detail, 'UNKNOWN_METADATA_PROPERTY');
    assert.equal(upstream.receivedRequests.length, 0);

    // 3) Implementation Staff gets 403 FORBIDDEN on PUT
    const staffForbidden = await handleWorkspaceUpdateBridgeRequest({
      method: 'PUT',
      workspaceId: idA,
      requestUrl: `http://localhost:3000/api/workspaces/${idA}`,
      headers: makePutHeaders({
        cookie: `fg_access_token=${encodeURIComponent(staffToken)}`,
      }),
      readBodyText: async () => JSON.stringify(clearedPhone.payload),
      env,
    });
    assert.equal(staffForbidden.status, 403);
    assert.equal(staffForbidden.body.errorCode, 'FORBIDDEN');

    // 4) Valid Platform Admin PUT updates metadata, clears phone to null, increments version to 3
    const okUpdate = await handleWorkspaceUpdateBridgeRequest({
      method: 'PUT',
      workspaceId: idA,
      requestUrl: `http://localhost:3000/api/workspaces/${idA}`,
      headers: makePutHeaders(),
      readBodyText: async () => JSON.stringify(clearedPhone.payload),
      env,
    });
    assert.equal(okUpdate.status, 200);
    assert.equal(okUpdate.body.version, 3);
    assert.equal(okUpdate.body.enterpriseName, 'Alpha Updated');
    assert.equal(okUpdate.body.contactPhone, null);

    const sentUpstream = upstream.receivedRequests.at(-1);
    assert.equal(sentUpstream.method, 'PUT');
    assert.equal(sentUpstream.pathname, `/api/v1/workspaces/${idA}`);
    assert.deepEqual(Object.keys(sentUpstream.body), [
      'version',
      'enterpriseName',
      'contactName',
      'contactEmail',
      'contactPhone',
    ]);
    assert.equal(sentUpstream.body.contactPhone, null);

    // 5) Stale version (version: 2 when store is now 3) -> 409 CONFLICT
    const staleConflict = await handleWorkspaceUpdateBridgeRequest({
      method: 'PUT',
      workspaceId: idA,
      requestUrl: `http://localhost:3000/api/workspaces/${idA}`,
      headers: makePutHeaders(),
      readBodyText: async () => JSON.stringify(clearedPhone.payload),
      env,
    });
    assert.equal(staleConflict.status, 409);
    assert.equal(staleConflict.body.errorCode, 'CONFLICT');

    // 6) Duplicate enterprise name (case-insensitive collision with Beta FinTech) -> 409 CONFLICT
    const dupConflict = await handleWorkspaceUpdateBridgeRequest({
      method: 'PUT',
      workspaceId: idA,
      requestUrl: `http://localhost:3000/api/workspaces/${idA}`,
      headers: makePutHeaders(),
      readBodyText: async () =>
        JSON.stringify({
          ...clearedPhone.payload,
          version: 3,
          enterpriseName: 'BETA FINTECH',
        }),
      env,
    });
    assert.equal(dupConflict.status, 409);
    assert.equal(dupConflict.body.errorCode, 'CONFLICT');

    // 7) Expired token -> 401 SESSION_EXPIRED + clears cookie
    const expiredPut = await handleWorkspaceUpdateBridgeRequest({
      method: 'PUT',
      workspaceId: idA,
      requestUrl: `http://localhost:3000/api/workspaces/${idA}`,
      headers: makePutHeaders({
        cookie: `fg_access_token=${encodeURIComponent(expiredToken)}`,
      }),
      readBodyText: async () => JSON.stringify({ ...clearedPhone.payload, version: 3 }),
      env,
    });
    assert.equal(expiredPut.status, 401);
    assert.equal(expiredPut.body.errorCode, 'SESSION_EXPIRED');
    assert.match(expiredPut.setCookie, /Max-Age=0/);
  } finally {
    await upstream.close();
  }
});

test('Inline modal edit flow covers Edit visibility, fresh version payload, Cancel, phone clearing, double-submit block, 2nd consecutive edit, and list refresh on rename with active filter', async () => {
  const expSec = Math.floor(Date.now() / 1000) + 900;
  const adminToken = makeUnsignedTestJwt(crypto.randomUUID(), crypto.randomUUID(), expSec);
  const adminCookie = `fg_access_token=${encodeURIComponent(adminToken)}`;

  const uuidAlpha = 'aaaaaaaa-1111-4111-8111-111111111111';
  const uuidAlphaTwo = 'aaaaaaaa-2222-4222-8222-222222222222';

  const upstream = await startContractWorkspaceCrudUpstream({
    workspaces: [
      {
        id: uuidAlpha,
        workspaceKey: 'ws-first',
        enterpriseName: 'Alpha One Retail',
        contactName: 'Người liên hệ Một',
        contactEmail: 'one@alpha.vn',
        contactPhone: '+84 901 111 111',
        version: 1, // List initially loads version 1
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-11-20T00:00:00Z',
      },
      {
        id: uuidAlphaTwo,
        workspaceKey: 'ws-second',
        enterpriseName: 'Alpha Two Services',
        contactName: 'Người liên hệ Hai',
        contactEmail: 'two@alpha.vn',
        contactPhone: null,
        version: 0,
        createdAt: '2026-08-05T00:00:00Z',
        updatedAt: '2026-11-21T00:00:00Z',
      },
    ],
    accounts: [
      { token: adminToken, role: 'PLATFORM_ADMIN', workspaceId: null, mustChangePassword: false },
    ],
  });

  const harness = makeStatefulHarness();
  try {
    const { translations } = load('src/config/translations.ts');
    const {
      handleWorkspaceListBridgeRequest,
      handleWorkspaceDetailBridgeRequest,
      handleWorkspaceUpdateBridgeRequest,
      fetchWorkspacePage,
      fetchWorkspaceDetail,
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
          const id = decodeURIComponent(parsed.pathname.slice('/api/workspaces/'.length));
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
          saveMetadata: (id, payload, opts) =>
            updateWorkspaceMetadata(id, payload, { ...opts, fetchImpl: bridgeFetch }),
          searchDebounceMs: 0,
        })
      );

    // 1) Initial load, then apply search="alpha" and page size=10
    let tree = renderView();
    await flushBff();
    tree = renderView();

    findNodes(tree, (n) => n.type === 'input' && n.props.name === 'workspaceSearch')[0].props.onChange({
      target: { value: 'alpha' },
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

    // Simulate server version advancing to version=5 BEFORE detail modal opens,
    // while table row in memory still holds version=1!
    upstream.store.get(uuidAlpha).version = 5;
    upstream.store.get(uuidAlpha).contactName = 'Người liên hệ Mới Từ GET Chi Tiết';

    // 2) Click Alpha One Retail -> while loading, "Chỉnh sửa" button MUST NOT be visible
    const triggers = findNodes(
      tree,
      (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger'
    );
    assert.equal(triggers.length, 2);
    triggers[0].props.onClick();
    tree = renderView();
    let dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(
      findNodes(dialog, (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Chỉnh sửa'))
        .length,
      0
    );

    await flushBff();
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];

    // 3) Detail loaded -> "Chỉnh sửa" button is now visible; click it -> prefills from GET detail, workspaceKey stays read-only
    let editBtn = findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Chỉnh sửa')
    )[0];
    assert.ok(editBtn);
    editBtn.props.onClick();
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];

    let formInputs = findNodes(dialog, (n) => n.type === 'input');
    assert.deepEqual(
      formInputs.map((i) => i.props.name),
      ['enterpriseName', 'contactName', 'contactEmail', 'contactPhone']
    );
    assert.equal(formInputs[1].props.value, 'Người liên hệ Mới Từ GET Chi Tiết');
    assert.equal(formInputs[3].props.value, '+84 901 111 111');
    assert.equal(renderNodeHtml(dialog).includes('ws-first'), true);

    // 4) Modify fields then click "Hủy" -> returns to view mode, discards draft, sends 0 PUT requests
    formInputs[0].props.onChange({ target: { value: 'Tên Nháp Sẽ Hủy' } });
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    const cancelBtn = findNodes(
      dialog,
      (n) => n.type === 'button' && n.props.children === 'Hủy'
    )[0];
    cancelBtn.props.onClick();
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(renderNodeHtml(dialog).includes('Tên Nháp Sẽ Hủy'), false);
    assert.equal(renderNodeHtml(dialog).includes('Alpha One Retail'), true);
    assert.equal(
      upstream.receivedRequests.filter((r) => r.method === 'PUT').length,
      0
    );

    // 5) Re-enter Edit, clear phone number, rename to "Zeta Renamed Corp" (note: no longer matches search="alpha" except workspaceKey 'alpha-one-key'; let's also change workspaceKey in store? No, workspaceKey is immutable 'alpha-one-key'! Let's search for "Retail" first or check sorting!).
    // Wait: let's check! With search="alpha", 'alpha-one-key' still matches 'alpha', AND renaming "Alpha One Retail" -> "Zeta Renamed Corp" moves it AFTER "Alpha Two Services" in BE's enterpriseName sort order!
    editBtn = findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Chỉnh sửa')
    )[0];
    editBtn.props.onClick();
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];

    formInputs = findNodes(dialog, (n) => n.type === 'input');
    formInputs[0].props.onChange({ target: { value: '  Zeta Renamed Corp  ' } });
    formInputs[1].props.onChange({ target: { value: '  Phạm Quốc Bảo  ' } });
    formInputs[2].props.onChange({ target: { value: '  bao.pham@zeta.vn  ' } });
    formInputs[3].props.onChange({ target: { value: '' } }); // Clear saved phone number!

    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    const editForm = findNodes(dialog, (n) => n.type === 'form')[0];

    // Trigger submit TWICE rapidly to verify double-submit guard
    const firstSubmitPromise = editForm.props.onSubmit({ preventDefault() {} });
    const duplicateSubmitPromise = editForm.props.onSubmit({ preventDefault() {} });
    await Promise.all([firstSubmitPromise, duplicateSubmitPromise]);
    await flushBff();
    // Re-render triggers the reloadNonce effect to refresh the background list, then flush that GET
    tree = renderView();
    await flushBff();
    tree = renderView();

    const putRequestsAfterFirstSave = upstream.receivedRequests.filter((r) => r.method === 'PUT');
    assert.equal(putRequestsAfterFirstSave.length, 1, 'Double submit must be blocked');
    assert.equal(putRequestsAfterFirstSave[0].pathname, `/api/v1/workspaces/${uuidAlpha}`);
    assert.deepEqual(putRequestsAfterFirstSave[0].body, {
      version: 5, // Taken from GET detail (5), NOT stale table row (1)!
      enterpriseName: 'Zeta Renamed Corp',
      contactName: 'Phạm Quốc Bảo',
      contactEmail: 'bao.pham@zeta.vn',
      contactPhone: null, // Cleared phone sent as null!
    });

    // Modal is back in view mode with updated data (version is now 6 on server) and "-" for cleared phone
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    let modalHtml = renderNodeHtml(dialog);
    assert.equal(modalHtml.includes('Zeta Renamed Corp'), true);
    assert.equal(modalHtml.includes('Phạm Quốc Bảo'), true);
    assert.equal(modalHtml.includes('>-<'), true);

    // Table list refreshed with active search="alpha" & size=10:
    // Because "Alpha One Retail" was renamed to "Zeta Renamed Corp" (key "ws-first"), it LEFT the "alpha" search results!
    const lastListGet = upstream.receivedRequests
      .filter((r) => r.method === 'GET' && r.pathname === '/api/v1/workspaces')
      .at(-1);
    assert.equal(lastListGet.search, '?search=alpha&page=0&size=10');

    const rowButtonsAfterRenameInFilter = findNodes(
      tree,
      (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger'
    );
    assert.deepEqual(
      rowButtonsAfterRenameInFilter.map((b) => b.props.children),
      ['Alpha Two Services']
    );

    // 6) Second consecutive edit in the SAME open modal uses the newly returned version (6)!
    editBtn = findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Chỉnh sửa')
    )[0];
    editBtn.props.onClick();
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    formInputs = findNodes(dialog, (n) => n.type === 'input');
    formInputs[3].props.onChange({ target: { value: '+84 988 000 999' } });
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    await findNodes(dialog, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
    await flushBff();
    tree = renderView();
    await flushBff();
    tree = renderView();

    const putRequestsAfterSecondSave = upstream.receivedRequests.filter((r) => r.method === 'PUT');
    assert.equal(putRequestsAfterSecondSave.length, 2);
    assert.equal(putRequestsAfterSecondSave[1].body.version, 6);
    assert.equal(putRequestsAfterSecondSave[1].body.contactPhone, '+84 988 000 999');

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(renderNodeHtml(dialog).includes('+84 988 000 999'), true);

    // Close modal and clear search -> full list shows BE sort order: ['Alpha Two Services', 'Zeta Renamed Corp']
    findNodes(dialog, (n) => n.type === 'button' && n.props.children === 'Đóng')[0].props.onClick();
    tree = renderView();
    const clearBtn = findNodes(
      tree,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Xóa tìm kiếm')
    )[0];
    clearBtn.props.onClick();
    tree = renderView();
    await flushBff();
    tree = renderView();

    assert.deepEqual(
      findNodes(tree, (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger').map(
        (b) => b.props.children
      ),
      ['Alpha Two Services', 'Zeta Renamed Corp']
    );
  } finally {
    harness.unmount();
    await upstream.close();
  }
});

test('Edit mode handles 400 validation, 409 stale/duplicate/generic conflicts without auto-overwrite, disconnect status check without auto-PUT, 403/404/401, and late save isolation (A -> B)', async () => {
  const { translations } = load('src/config/translations.ts');
  const { WorkspaceServiceError } = load('src/services/workspaces.ts');

  const itemA = {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    workspaceKey: 'alpha-key',
    enterpriseName: 'Doanh nghiệp A',
    contactName: 'Liên hệ A',
    contactEmail: 'a@example.vn',
    contactPhone: '0900000001',
    version: 2,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };
  const itemB = {
    id: 'bbbbbbbb-0000-4000-8000-000000000002',
    workspaceKey: 'beta-key',
    enterpriseName: 'Doanh nghiệp B',
    contactName: 'Liên hệ B',
    contactEmail: 'b@example.vn',
    contactPhone: null,
    version: 0,
    createdAt: '2026-10-02T00:00:00Z',
    updatedAt: '2026-11-02T00:00:00Z',
  };

  let serverRecordA = { ...itemA };
  const saveCalls = [];
  let detailCallsForA = 0;
  let nextSaveBehavior = null;

  const harness = makeStatefulHarness();
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

    const loadPage = async () => ({
      items: [serverRecordA, itemB],
      page: 0,
      size: 20,
      totalElements: 2,
      totalPages: 1,
    });
    const loadDetail = async (id) => {
      if (id === itemA.id) {
        detailCallsForA += 1;
        return { ...serverRecordA };
      }
      return { ...itemB };
    };
    const saveMetadata = (id, payload, opts) => {
      saveCalls.push({ id, payload, signal: opts?.signal });
      return nextSaveBehavior(id, payload, opts);
    };

    const renderView = () =>
      harness.render(() =>
        PlatformWorkspaceListView({
          loadPage,
          loadDetail,
          saveMetadata,
          searchDebounceMs: 0,
        })
      );

    let tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    // Open A and enter Edit mode
    findNodes(tree, (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger')[0].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    let dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    findNodes(dialog, (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Chỉnh sửa'))[0].props.onClick();
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];

    // 1) Client-side validation error (invalid email) blocks PUT and keeps user input
    let inputs = findNodes(dialog, (n) => n.type === 'input');
    inputs[0].props.onChange({ target: { value: 'Doanh nghiệp A Bản Nháp' } });
    inputs[2].props.onChange({ target: { value: 'email-sai-dinh-dang' } });
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    await findNodes(dialog, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(saveCalls.length, 0);
    assert.match(renderNodeHtml(dialog), /không đúng định dạng/);
    assert.equal(
      findNodes(dialog, (n) => n.type === 'input')[0].props.value,
      'Doanh nghiệp A Bản Nháp'
    );

    // Fix email -> test 400 from BE keeps user input
    findNodes(dialog, (n) => n.type === 'input')[2].props.onChange({
      target: { value: 'draft@example.vn' },
    });
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    nextSaveBehavior = async () => {
      throw new WorkspaceServiceError('VALIDATION_ERROR', 400, 'Server rejected');
    };
    await findNodes(dialog, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(saveCalls.length, 1);
    assert.match(renderNodeHtml(dialog), /chưa hợp lệ/);
    assert.equal(
      findNodes(dialog, (n) => n.type === 'input')[0].props.value,
      'Doanh nghiệp A Bản Nháp'
    );

    // 2) 409 Stale version: keeps draft, does NOT auto-reload or auto-PUT; clicking "Tải lại dữ liệu hiện tại" loads latest server record (version 9) without sending PUT!
    serverRecordA = {
      ...serverRecordA,
      enterpriseName: 'Doanh nghiệp A Đổi Bởi Admin Khác',
      version: 9,
    };
    const detailCallsBeforeStale = detailCallsForA;
    nextSaveBehavior = async () => {
      throw new WorkspaceServiceError('CONFLICT', 409, 'Record changed; reload before saving');
    };
    await findNodes(dialog, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];

    assert.equal(detailCallsForA, detailCallsBeforeStale, 'Must not auto-fetch new version behind the scenes');
    assert.equal(saveCalls.length, 2);
    assert.match(renderNodeHtml(dialog), /phiên bản không còn khớp/);
    assert.equal(
      findNodes(dialog, (n) => n.type === 'input')[0].props.value,
      'Doanh nghiệp A Bản Nháp'
    );

    const reloadCurrentBtn = findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Tải lại dữ liệu hiện tại')
    )[0];
    assert.ok(reloadCurrentBtn);
    await reloadCurrentBtn.props.onClick();
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];

    assert.equal(detailCallsForA, detailCallsBeforeStale + 1);
    assert.equal(saveCalls.length, 2, 'Reloading current data must NEVER auto-submit PUT');
    assert.equal(
      findNodes(dialog, (n) => n.type === 'input')[0].props.value,
      'Doanh nghiệp A Đổi Bởi Admin Khác'
    );

    // 3) 409 Generic conflict (when BE returns 409 with no detail) -> honest conflict message + reload button, keeps draft
    findNodes(dialog, (n) => n.type === 'input')[0].props.onChange({
      target: { value: 'Tên Xung Đột Chung' },
    });
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    nextSaveBehavior = async () => {
      throw new WorkspaceServiceError('CONFLICT', 409);
    };
    await findNodes(dialog, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.match(renderNodeHtml(dialog), /xung đột dữ liệu/);
    assert.equal(
      findNodes(dialog, (n) => n.type === 'input')[0].props.value,
      'Tên Xung Đột Chung'
    );

    // 4) Network disconnect during save -> keeps draft, no auto-PUT, "Kiểm tra lại trạng thái hồ sơ" checks GET without wiping draft when server version is still 9
    nextSaveBehavior = async () => {
      throw new WorkspaceServiceError('BACKEND_UNAVAILABLE', 503);
    };
    await findNodes(dialog, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.match(renderNodeHtml(dialog), /Mất kết nối/);
    assert.equal(saveCalls.length, 4);

    const checkStatusBtn = findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Kiểm tra lại trạng thái hồ sơ')
    )[0];
    assert.ok(checkStatusBtn);
    await checkStatusBtn.props.onClick();
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];

    assert.equal(saveCalls.length, 4, 'Checking record status must NEVER auto-retry PUT');
    assert.equal(
      findNodes(dialog, (n) => n.type === 'input')[0].props.value,
      'Tên Xung Đột Chung'
    );
    assert.match(renderNodeHtml(dialog), /chưa thay đổi/);

    // 5) Late PUT response from Enterprise A MUST NOT update modal of Enterprise B!
    let resolveSlowSaveA;
    nextSaveBehavior = () =>
      new Promise((resolve) => {
        resolveSlowSaveA = resolve;
      });
    const slowSavePromise = findNodes(dialog, (n) => n.type === 'form')[0].props.onSubmit({
      preventDefault() {},
    });
    tree = renderView();

    // User closes A while A's save is still pending, then opens Enterprise B
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    const headerCloseBtn = findNodes(
      dialog,
      (n) => n.type === 'button' && n.props['aria-label'] === 'Đóng hộp thoại chi tiết doanh nghiệp'
    )[0];
    headerCloseBtn.props.onClick();
    tree = renderView();

    findNodes(tree, (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger')[1].props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    // Now Enterprise A's slow PUT resolves late!
    resolveSlowSaveA({
      ...serverRecordA,
      enterpriseName: 'Kết Quả Muộn Của A Không Được Ghi Đè B',
      version: 10,
    });
    await slowSavePromise;
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    const htmlB = renderNodeHtml(dialog);
    assert.equal(htmlB.includes('Doanh nghiệp B'), true);
    assert.equal(htmlB.includes('beta-key'), true);
    assert.equal(htmlB.includes('Kết Quả Muộn Của A Không Được Ghi Đè B'), false);
  } finally {
    harness.unmount();
  }

  // Static audit: zero em dashes (\u2014) and zero demo imports across all workspace files
  for (const rel of [
    'src/types/workspace.ts',
    'src/services/workspaces.ts',
    'src/app/api/workspaces/route.ts',
    'src/app/api/workspaces/[id]/route.ts',
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
