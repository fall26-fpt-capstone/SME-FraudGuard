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
 * Contract-accurate local HTTP test double for GET /api/v1/workspaces and GET /api/v1/workspaces/{id}
 * matching WorkspaceController, WorkspaceServiceImpl, and WorkspaceIT.
 */
async function startContractWorkspaceDetailUpstream({
  listWorkspaces = [],
  detailWorkspacesById = new Map(),
  accounts = [],
} = {}) {
  const accountMap = new Map(accounts.map((a) => [a.token, a]));
  const receivedRequests = [];
  let nextForcedStatus = null;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, 'http://127.0.0.1');
    receivedRequests.push({
      method: req.method,
      pathname: parsedUrl.pathname,
      search: parsedUrl.search,
      authHeader: req.headers['authorization'] ?? null,
    });

    if (nextForcedStatus !== null) {
      const forced = nextForcedStatus;
      nextForcedStatus = null;
      res.writeHead(forced.status, {
        'Content-Type': 'application/problem+json',
        ...forced.headers,
      });
      res.end(JSON.stringify(forced.body ?? { status: forced.status, detail: forced.detail }));
      return;
    }

    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/problem+json' });
      res.end(JSON.stringify({ status: 405, detail: 'Method not allowed' }));
      return;
    }

    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const actor = accountMap.get(token);
    if (!actor || actor.expired) {
      res.writeHead(401, { 'WWW-Authenticate': 'Bearer error="invalid_token"' });
      res.end();
      return;
    }

    if (
      actor.mustChangePassword ||
      (actor.role !== 'PLATFORM_ADMIN' && actor.role !== 'IMPLEMENTATION_STAFF') ||
      actor.workspaceId !== null
    ) {
      res.writeHead(403, { 'Content-Type': 'application/problem+json' });
      res.end(JSON.stringify({ status: 403, detail: 'Access denied' }));
      return;
    }

    if (parsedUrl.pathname === '/api/v1/workspaces') {
      const page = Number(parsedUrl.searchParams.get('page') ?? '0');
      const size = Number(parsedUrl.searchParams.get('size') ?? '20');
      const needle = (parsedUrl.searchParams.get('search') ?? '').trim().toLowerCase();
      const filtered = listWorkspaces.filter(
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
      const record = detailWorkspacesById.get(rawId);
      if (!record) {
        res.writeHead(404, { 'Content-Type': 'application/problem+json' });
        res.end(JSON.stringify({ status: 404, detail: 'Workspace not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(record));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/problem+json' });
    res.end(JSON.stringify({ status: 404, detail: 'Not found' }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    receivedRequests,
    forceNextResponse(spec) {
      nextForcedStatus = spec;
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

test('Server detail bridge GET /api/workspaces/[id] validates UUID before upstream, forwards Bearer cookie, strips secrets, and maps 401/403/404/502', async () => {
  const expSec = Math.floor(Date.now() / 1000) + 900;
  const adminToken = makeUnsignedTestJwt(crypto.randomUUID(), crypto.randomUUID(), expSec);
  const smeToken = makeUnsignedTestJwt(crypto.randomUUID(), crypto.randomUUID(), expSec);
  const expiredToken = makeUnsignedTestJwt(crypto.randomUUID(), crypto.randomUUID(), expSec);

  const targetUuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const missingUuid = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

  const detailMap = new Map([
    [
      targetUuid,
      {
        id: targetUuid,
        workspaceKey: 'minh-tam-commerce',
        enterpriseName: 'Công ty TNHH Thương mại Minh Tâm',
        contactName: 'Trần Thị Minh Tâm',
        contactEmail: 'minh.tam@minhtam-commerce.vn',
        contactPhone: '+84 988 777 666',
        version: 4,
        createdAt: '2026-08-15T02:30:00Z',
        updatedAt: '2026-11-27T01:20:00Z',
        internalAuditSecret: 'NEVER_EXPOSE',
      },
    ],
  ]);

  const upstream = await startContractWorkspaceDetailUpstream({
    detailWorkspacesById: detailMap,
    accounts: [
      { token: adminToken, role: 'PLATFORM_ADMIN', workspaceId: null, mustChangePassword: false },
      { token: smeToken, role: 'SME_ADMIN', workspaceId: targetUuid, mustChangePassword: false },
      { token: expiredToken, role: 'PLATFORM_ADMIN', workspaceId: null, expired: true },
    ],
  });

  try {
    const {
      handleWorkspaceDetailBridgeRequest,
      validateWorkspaceId,
      fetchWorkspaceDetail,
    } = load('src/services/workspaces.ts');
    const env = { NODE_ENV: 'development', FRAUDGUARD_BACKEND_URL: upstream.baseUrl };
    const adminCookie = `fg_access_token=${encodeURIComponent(adminToken)}`;

    // 1) UUID validation rejects workspaceKey, path traversal, and malformed IDs BEFORE touching upstream
    assert.equal(validateWorkspaceId('minh-tam-commerce'), null);
    assert.equal(validateWorkspaceId('../workspaces'), null);
    assert.equal(validateWorkspaceId(`  ${targetUuid}  `), targetUuid);

    for (const invalidId of ['minh-tam-commerce', '../other', '12345', '']) {
      const badIdRes = await handleWorkspaceDetailBridgeRequest({
        method: 'GET',
        workspaceId: invalidId,
        requestUrl: `http://localhost:3000/api/workspaces/${encodeURIComponent(invalidId)}`,
        headers: new Headers({ host: 'localhost:3000', cookie: adminCookie }),
        env,
      });
      assert.equal(badIdRes.status, 400);
      assert.equal(badIdRes.body.errorCode, 'VALIDATION_ERROR');
      assert.equal(badIdRes.body.detail, 'INVALID_WORKSPACE_ID');
    }
    assert.equal(upstream.receivedRequests.length, 0);

    // Client helper also rejects workspaceKey before making any fetch call
    let clientFetchCalled = false;
    await assert.rejects(
      () =>
        fetchWorkspaceDetail('minh-tam-commerce', {
          fetchImpl: async () => {
            clientFetchCalled = true;
            throw new Error('Should not fetch');
          },
        }),
      (err) => err.code === 'VALIDATION_ERROR' && err.detail === 'INVALID_WORKSPACE_ID'
    );
    assert.equal(clientFetchCalled, false);

    // 2) Cross-site & method guards
    const postBlocked = await handleWorkspaceDetailBridgeRequest({
      method: 'POST',
      workspaceId: targetUuid,
      requestUrl: `http://localhost:3000/api/workspaces/${targetUuid}`,
      headers: new Headers({ host: 'localhost:3000', cookie: adminCookie }),
      env,
    });
    assert.equal(postBlocked.status, 405);

    const crossSiteBlocked = await handleWorkspaceDetailBridgeRequest({
      method: 'GET',
      workspaceId: targetUuid,
      requestUrl: `http://localhost:3000/api/workspaces/${targetUuid}`,
      headers: new Headers({
        host: 'localhost:3000',
        cookie: adminCookie,
        'sec-fetch-site': 'cross-site',
      }),
      env,
    });
    assert.equal(crossSiteBlocked.status, 403);
    assert.equal(upstream.receivedRequests.length, 0);

    // 3) Valid UUID fetches fixed /api/v1/workspaces/{id}, ignores query/header SSRF attempts, and strips unknown fields
    const okRes = await handleWorkspaceDetailBridgeRequest({
      method: 'GET',
      workspaceId: targetUuid,
      requestUrl: `http://localhost:3000/api/workspaces/${targetUuid}?backendUrl=http://evil.example`,
      headers: new Headers({
        host: 'localhost:3000',
        cookie: adminCookie,
        'sec-fetch-site': 'same-origin',
      }),
      env,
    });
    assert.equal(okRes.status, 200);
    assert.equal(okRes.body.id, targetUuid);
    assert.equal(okRes.body.workspaceKey, 'minh-tam-commerce');
    assert.equal(okRes.body.contactPhone, '+84 988 777 666');
    assert.equal('internalAuditSecret' in okRes.body, false);
    assert.equal(JSON.stringify(okRes.body).includes(adminToken), false);

    const lastUpstreamReq = upstream.receivedRequests.at(-1);
    assert.equal(lastUpstreamReq.pathname, `/api/v1/workspaces/${targetUuid}`);
    assert.equal(lastUpstreamReq.search, '');
    assert.equal(lastUpstreamReq.authHeader, `Bearer ${adminToken}`);

    // 4) Missing workspace UUID -> 404 NOT_FOUND
    const notFoundRes = await handleWorkspaceDetailBridgeRequest({
      method: 'GET',
      workspaceId: missingUuid,
      requestUrl: `http://localhost:3000/api/workspaces/${missingUuid}`,
      headers: new Headers({ host: 'localhost:3000', cookie: adminCookie }),
      env,
    });
    assert.equal(notFoundRes.status, 404);
    assert.equal(notFoundRes.body.errorCode, 'NOT_FOUND');

    // 5) Forbidden role -> 403 FORBIDDEN (without clearing cookie)
    const forbiddenRes = await handleWorkspaceDetailBridgeRequest({
      method: 'GET',
      workspaceId: targetUuid,
      requestUrl: `http://localhost:3000/api/workspaces/${targetUuid}`,
      headers: new Headers({
        host: 'localhost:3000',
        cookie: `fg_access_token=${encodeURIComponent(smeToken)}`,
      }),
      env,
    });
    assert.equal(forbiddenRes.status, 403);
    assert.equal(forbiddenRes.body.errorCode, 'FORBIDDEN');
    assert.equal(forbiddenRes.setCookie, undefined);

    // 6) Expired token -> 401 SESSION_EXPIRED + clears cookie
    const expiredRes = await handleWorkspaceDetailBridgeRequest({
      method: 'GET',
      workspaceId: targetUuid,
      requestUrl: `http://localhost:3000/api/workspaces/${targetUuid}`,
      headers: new Headers({
        host: 'localhost:3000',
        cookie: `fg_access_token=${encodeURIComponent(expiredToken)}`,
      }),
      env,
    });
    assert.equal(expiredRes.status, 401);
    assert.equal(expiredRes.body.errorCode, 'SESSION_EXPIRED');
    assert.match(expiredRes.setCookie, /Max-Age=0/);

    // 7) Upstream 500 -> 502 BACKEND_UNAVAILABLE
    upstream.forceNextResponse({ status: 500, detail: 'DB unavailable' });
    const serverErrRes = await handleWorkspaceDetailBridgeRequest({
      method: 'GET',
      workspaceId: targetUuid,
      requestUrl: `http://localhost:3000/api/workspaces/${targetUuid}`,
      headers: new Headers({ host: 'localhost:3000', cookie: adminCookie }),
      env,
    });
    assert.equal(serverErrRes.status, 502);
    assert.equal(serverErrRes.body.errorCode, 'BACKEND_UNAVAILABLE');
  } finally {
    await upstream.close();
  }
});

test('Clicking enterprise name in real table calls /api/workspaces/{uuid} (never workspaceKey), renders fresh BE detail over row data, preserves search/page/size, and restores focus on Close and Escape', async () => {
  const expSec = Math.floor(Date.now() / 1000) + 900;
  const adminToken = makeUnsignedTestJwt(crypto.randomUUID(), crypto.randomUUID(), expSec);
  const adminCookie = `fg_access_token=${encodeURIComponent(adminToken)}`;

  const uuidPageZero = '11111111-aaaa-4111-8111-111111111111';
  const uuidTargetPageOne = '22222222-bbbb-4222-8222-222222222222';

  // List rows contain older contact details; detail endpoint returns updated contactName/email/phone
  // to prove the modal renders the detail API response rather than table row fields.
  const listItems = [
    {
      id: uuidPageZero,
      workspaceKey: 'minh-an-key',
      enterpriseName: 'Minh An Logistics',
      contactName: 'Người liên hệ bảng trang 1',
      contactEmail: 'page1@minhan.vn',
      contactPhone: null,
      version: 0,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-11-20T00:00:00Z',
    },
    {
      id: uuidTargetPageOne,
      workspaceKey: 'minh-tam-distinct-key',
      enterpriseName: 'Minh Tâm Thương Mại (Bản danh sách)',
      contactName: 'Liên hệ cũ trên bảng',
      contactEmail: 'stale-row@minhtam.vn',
      contactPhone: null,
      version: 1,
      createdAt: '2026-09-10T03:15:00Z',
      updatedAt: '2026-11-21T04:00:00Z',
    },
  ];

  const freshDetailRecord = {
    id: uuidTargetPageOne,
    workspaceKey: 'minh-tam-distinct-key',
    enterpriseName: 'Công ty TNHH Minh Tâm Thương Mại (Hồ sơ mới nhất)',
    contactName: 'Đặng Hoàng Minh Tâm (Từ API chi tiết)',
    contactEmail: 'fresh.detail.contact@minhtam-enterprise.vn',
    contactPhone: null, // Verify null phone uses "-" convention
    version: 5,
    createdAt: '2026-09-10T03:15:00Z',
    updatedAt: '2026-11-27T02:45:00Z',
  };

  const upstream = await startContractWorkspaceDetailUpstream({
    listWorkspaces: listItems,
    detailWorkspacesById: new Map([[uuidTargetPageOne, freshDetailRecord]]),
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
    } = load('src/services/workspaces.ts');

    const env = { NODE_ENV: 'development', FRAUDGUARD_BACKEND_URL: upstream.baseUrl };
    const bffRequests = [];
    let pendingBffPromises = [];

    const flushBff = async () => {
      while (pendingBffPromises.length > 0) {
        const batch = pendingBffPromises;
        pendingBffPromises = [];
        await Promise.allSettled(batch);
        await new Promise((r) => setImmediate(r));
      }
    };

    // Wire real fetchWorkspacePage & fetchWorkspaceDetail through the real Next.js bridge handlers
    const bridgeFetch = (url) => {
      const p = (async () => {
        bffRequests.push(url);
        const fullUrl = new URL(url, 'http://localhost:3000').toString();
        const parsed = new URL(fullUrl);
        const headers = new Headers({
          host: 'localhost:3000',
          cookie: adminCookie,
          'sec-fetch-site': 'same-origin',
        });
        let result;
        if (parsed.pathname === '/api/workspaces') {
          result = await handleWorkspaceListBridgeRequest({
            method: 'GET',
            requestUrl: fullUrl,
            headers,
            env,
          });
        } else if (parsed.pathname.startsWith('/api/workspaces/')) {
          const id = decodeURIComponent(parsed.pathname.slice('/api/workspaces/'.length));
          result = await handleWorkspaceDetailBridgeRequest({
            method: 'GET',
            workspaceId: id,
            requestUrl: fullUrl,
            headers,
            env,
          });
        } else {
          throw new Error(`Unexpected URL ${url}`);
        }
        return new Response(JSON.stringify(result.body), {
          status: result.status,
          headers: { 'Content-Type': 'application/json' },
        });
      })();
      pendingBffPromises.push(p);
      return p;
    };

    const { fetchWorkspacePage, fetchWorkspaceDetail } = load('src/services/workspaces.ts');
    let capturedEscapeClose = null;

    const { PlatformWorkspaceListView } = load(
      'src/components/fraudguard-dashboard/PlatformWorkspaceListView.tsx',
      {
        react: harness.mockReact,
        '@/context/LanguageContext': {
          useLanguage: () => ({ language: 'vi', t: translations.vi, toggleLanguage() {} }),
        },
        '@/hooks/useDialogFocus': {
          useDialogFocus: (open, onClose) => {
            capturedEscapeClose = open ? onClose : null;
            return { current: null };
          },
        },
      }
    );

    const renderView = () =>
      harness.render(() =>
        PlatformWorkspaceListView({
          loadPage: (q, opts) => fetchWorkspacePage(q, { ...opts, fetchImpl: bridgeFetch }),
          loadDetail: (id, opts) => fetchWorkspaceDetail(id, { ...opts, fetchImpl: bridgeFetch }),
          searchDebounceMs: 0,
        })
      );

    // Initial load
    let tree = renderView();
    await flushBff();
    tree = renderView();

    const searchInput = findNodes(
      tree,
      (n) => n.type === 'input' && n.props.name === 'workspaceSearch'
    )[0];
    searchInput.props.onChange({ target: { value: 'minh' } });
    tree = renderView();
    await flushBff();
    tree = renderView();

    const sizeSelect = findNodes(tree, (n) => n.type === 'select')[0];
    sizeSelect.props.onChange({ target: { value: '10' } });
    tree = renderView();
    await flushBff();
    tree = renderView();

    const listFetchCountBeforeDetail = bffRequests.filter((u) =>
      u.startsWith('/api/workspaces?')
    ).length;

    // Locate the enterprise name button for row 2 (uuidTargetPageOne != workspaceKey 'minh-tam-distinct-key')
    const triggerButtons = findNodes(
      tree,
      (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger'
    );
    assert.equal(triggerButtons.length, 2);
    const targetTrigger = triggerButtons[1];
    assert.equal(targetTrigger.props.children, 'Minh Tâm Thương Mại (Bản danh sách)');
    assert.equal(targetTrigger.props['aria-haspopup'], 'dialog');

    // Attach mock DOM button to its ref callback to verify focus restoration on close
    let triggerFocusCount = 0;
    targetTrigger.ref({
      focus() {
        triggerFocusCount += 1;
      },
    });

    // Click enterprise name button -> opens modal and fetches /api/workspaces/<UUID>
    targetTrigger.props.onClick();
    tree = renderView();

    // Wait for detail response
    await flushBff();
    tree = renderView();

    // Assert exact BFF & upstream route called with UUID (NEVER workspaceKey)
    assert.equal(bffRequests.at(-1), `/api/workspaces/${uuidTargetPageOne}`);
    assert.equal(
      upstream.receivedRequests.at(-1).pathname,
      `/api/v1/workspaces/${uuidTargetPageOne}`
    );
    assert.equal(
      bffRequests.some((u) => u.includes('minh-tam-distinct-key')),
      false
    );

    const dialogNode = findNodes(
      tree,
      (n) => n.props?.role === 'dialog' && n.props?.['aria-modal'] === 'true'
    )[0];
    assert.ok(dialogNode, 'Expected detail modal dialog');
    const modalHtml = renderNodeHtml(dialogNode);

    // Modal renders fresh detail API fields (NOT stale list row contact fields), 3 groups, "-" for null phone, and hides UUID/version/demo fields
    assert.equal(
      modalHtml.includes('Công ty TNHH Minh Tâm Thương Mại (Hồ sơ mới nhất)'),
      true
    );
    assert.equal(modalHtml.includes('Đặng Hoàng Minh Tâm (Từ API chi tiết)'), true);
    assert.equal(modalHtml.includes('fresh.detail.contact@minhtam-enterprise.vn'), true);
    assert.equal(modalHtml.includes('Liên hệ cũ trên bảng'), false);
    assert.equal(modalHtml.includes('stale-row@minhtam.vn'), false);
    assert.equal(modalHtml.includes('minh-tam-distinct-key'), true);
    assert.equal(modalHtml.includes('Doanh nghiệp'), true);
    assert.equal(modalHtml.includes('Liên hệ'), true);
    assert.equal(modalHtml.includes('Thời gian'), true);
    assert.equal(modalHtml.includes('Ngày tạo'), true);
    assert.equal(modalHtml.includes('Cập nhật lần cuối'), true);
    assert.equal(modalHtml.includes('>-<'), true); // Null phone displays "-"
    assert.equal(modalHtml.includes(uuidTargetPageOne), false); // UUID hidden from business UI
    assert.equal(modalHtml.includes('Free'), false);
    assert.equal(modalHtml.includes('Chưa phân công'), false);

    // Close via footer "Đóng" button -> modal closes, focus returns to clicked enterprise button, list state untouched
    const closeBtn = findNodes(
      dialogNode,
      (n) => n.type === 'button' && n.props.children === 'Đóng'
    )[0];
    assert.ok(closeBtn);
    closeBtn.props.onClick();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    assert.equal(
      findNodes(tree, (n) => n.props?.role === 'dialog').length,
      0
    );
    assert.equal(triggerFocusCount, 1);

    // Re-open and close via Escape handler wired to useDialogFocus -> focus returns again
    const reopenedTrigger = findNodes(
      tree,
      (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger'
    )[1];
    reopenedTrigger.ref({
      focus() {
        triggerFocusCount += 1;
      },
    });
    reopenedTrigger.props.onClick();
    tree = renderView();
    assert.equal(typeof capturedEscapeClose, 'function');
    capturedEscapeClose();
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    assert.equal(triggerFocusCount, 2);

    // Confirm search keyword and page size remained intact and list was NOT re-fetched
    const afterSearchInput = findNodes(
      tree,
      (n) => n.type === 'input' && n.props.name === 'workspaceSearch'
    )[0];
    const afterSizeSelect = findNodes(tree, (n) => n.type === 'select')[0];
    assert.equal(afterSearchInput.props.value, 'minh');
    assert.equal(afterSizeSelect.props.value, 10);
    assert.equal(
      bffRequests.filter((u) => u.startsWith('/api/workspaces?')).length,
      listFetchCountBeforeDetail
    );
  } finally {
    harness.unmount();
    await upstream.close();
  }
});

test('Detail modal handles loading isolation (A -> B without flashing A), close-while-loading, out-of-order late responses, 403, 404, Retry on error, page preservation, and 401 redirect', async () => {
  const { translations } = load('src/config/translations.ts');
  const { WorkspaceServiceError } = load('src/services/workspaces.ts');

  const itemA = {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    workspaceKey: 'alpha-ws',
    enterpriseName: 'Doanh nghiệp Alpha',
    contactName: 'Liên hệ Bảng Alpha',
    contactEmail: 'alpha-row@example.vn',
    contactPhone: '0900000001',
    version: 0,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };
  const itemB = {
    id: 'bbbbbbbb-0000-4000-8000-000000000002',
    workspaceKey: 'beta-ws',
    enterpriseName: 'Doanh nghiệp Beta (Trang 2)',
    contactName: 'Liên hệ Bảng Beta',
    contactEmail: 'beta-row@example.vn',
    contactPhone: '0900000002',
    version: 0,
    createdAt: '2026-10-02T00:00:00Z',
    updatedAt: '2026-11-02T00:00:00Z',
  };
  const itemC = {
    id: 'cccccccc-0000-4000-8000-000000000003',
    workspaceKey: 'gamma-ws',
    enterpriseName: 'Doanh nghiệp Gamma (Trang 2)',
    contactName: 'Liên hệ Bảng Gamma',
    contactEmail: 'gamma-row@example.vn',
    contactPhone: null,
    version: 0,
    createdAt: '2026-10-03T00:00:00Z',
    updatedAt: '2026-11-03T00:00:00Z',
  };

  const detailInFlight = [];
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

    const loadPage = async (q) => {
      if (q.page === 0) {
        return { items: [itemA], page: 0, size: 1, totalElements: 3, totalPages: 3 };
      }
      return { items: [itemB, itemC], page: 1, size: 2, totalElements: 3, totalPages: 2 };
    };
    const loadDetail = (workspaceId, options) =>
      new Promise((resolve, reject) => {
        detailInFlight.push({ workspaceId, signal: options?.signal, resolve, reject });
      });

    const renderView = () =>
      harness.render(() =>
        PlatformWorkspaceListView({ loadPage, loadDetail, searchDebounceMs: 0 })
      );

    let tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();

    // Navigate to Page 2 (zero-based page=1)
    const nextBtn = findNodes(
      tree,
      (n) => n.type === 'button' && n.props.children === 'Trang sau'
    )[0];
    nextBtn.props.onClick();
    tree = renderView();
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    assert.match(renderNodeHtml(tree), /Trang 2\/2/);

    // 1) Open B, resolve B -> shows B's detail. Then close B and open C -> while C is loading, B's content must NOT appear!
    let triggers = findNodes(
      tree,
      (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger'
    );
    triggers[0].props.onClick(); // Open B
    tree = renderView();
    assert.equal(detailInFlight.at(-1).workspaceId, itemB.id);

    // While B is loading, row contact "Liên hệ Bảng Beta" is NOT shown inside the modal
    let dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    let modalHtml = renderNodeHtml(dialog);
    assert.match(modalHtml, /Đang tải hồ sơ doanh nghiệp/);
    assert.equal(modalHtml.includes('Liên hệ Bảng Beta'), false);

    detailInFlight.at(-1).resolve({
      ...itemB,
      contactName: 'Chi tiết Đã Tải Của Beta',
      contactEmail: 'loaded-beta@example.vn',
    });
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(renderNodeHtml(dialog).includes('Chi tiết Đã Tải Của Beta'), true);

    // Now click C (or close B then open C): while C is loading, Beta's detail MUST NOT appear in C's modal!
    triggers = findNodes(
      tree,
      (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger'
    );
    triggers[1].props.onClick(); // Open C
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    modalHtml = renderNodeHtml(dialog);
    assert.equal(modalHtml.includes('Doanh nghiệp Gamma (Trang 2)'), true);
    assert.match(modalHtml, /Đang tải hồ sơ doanh nghiệp/);
    assert.equal(modalHtml.includes('Chi tiết Đã Tải Của Beta'), false);
    assert.equal(modalHtml.includes('beta-ws'), false);

    // 2) Close while C is still loading -> C's request is aborted, and resolving C late NEVER reopens the modal!
    const pendingC = detailInFlight.at(-1);
    const closeBtn = findNodes(
      dialog,
      (n) => n.type === 'button' && n.props.children === 'Đóng'
    )[0];
    closeBtn.props.onClick();
    tree = renderView();
    assert.equal(pendingC.signal.aborted, true);
    assert.equal(findNodes(tree, (n) => n.props?.role === 'dialog').length, 0);

    pendingC.resolve({ ...itemC, contactName: 'Phản hồi muộn sau khi đóng' });
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    assert.equal(findNodes(tree, (n) => n.props?.role === 'dialog').length, 0);
    // Page 2 is still preserved!
    assert.match(renderNodeHtml(tree), /Trang 2\/2/);

    // 3) Out-of-order race: Open B (slow request #1), then switch to Open C (fast request #2). Resolve C, then resolve stale B late -> C stays!
    triggers = findNodes(
      tree,
      (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger'
    );
    triggers[0].props.onClick(); // Start slow B
    tree = renderView();
    const slowB = detailInFlight.at(-1);

    triggers = findNodes(
      tree,
      (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger'
    );
    triggers[1].props.onClick(); // Immediately open C
    tree = renderView();
    const fastC = detailInFlight.at(-1);
    assert.equal(slowB.signal.aborted, true);

    fastC.resolve({ ...itemC, contactName: 'Chi tiết Chuẩn Của Gamma' });
    await new Promise((r) => setImmediate(r));
    slowB.resolve({ ...itemB, contactName: 'Dữ liệu Muộn Của Beta Không Được Ghi Đè' });
    await new Promise((r) => setImmediate(r));

    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    modalHtml = renderNodeHtml(dialog);
    assert.equal(modalHtml.includes('Chi tiết Chuẩn Của Gamma'), true);
    assert.equal(modalHtml.includes('Dữ liệu Muộn Của Beta Không Được Ghi Đè'), false);

    // 4) Server/network error -> shows error in modal + Retry reloads exact same UUID (C)
    triggers = findNodes(
      tree,
      (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger'
    );
    triggers[1].props.onClick();
    tree = renderView();
    detailInFlight.at(-1).reject(new WorkspaceServiceError('BACKEND_UNAVAILABLE', 503));
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    modalHtml = renderNodeHtml(dialog);
    assert.match(modalHtml, /Không thể tải hồ sơ doanh nghiệp/);

    const retryBtn = findNodes(
      dialog,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Thử lại')
    )[0];
    assert.ok(retryBtn);
    retryBtn.props.onClick();
    tree = renderView();
    assert.equal(detailInFlight.at(-1).workspaceId, itemC.id);
    detailInFlight.at(-1).resolve({ ...itemC, contactName: 'Gamma Khôi Phục Sau Thử Lại' });
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.equal(renderNodeHtml(dialog).includes('Gamma Khôi Phục Sau Thử Lại'), true);

    // 5) 404 NOT_FOUND state -> clear message, user closes to return to Page 2
    triggers = findNodes(
      tree,
      (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger'
    );
    triggers[0].props.onClick();
    tree = renderView();
    detailInFlight.at(-1).reject(new WorkspaceServiceError('NOT_FOUND', 404));
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.match(renderNodeHtml(dialog), /Không tìm thấy doanh nghiệp/);

    // 6) 403 FORBIDDEN state -> clear localized message
    triggers = findNodes(
      tree,
      (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger'
    );
    triggers[0].props.onClick();
    tree = renderView();
    detailInFlight.at(-1).reject(new WorkspaceServiceError('FORBIDDEN', 403));
    await new Promise((r) => setImmediate(r));
    tree = renderView();
    dialog = findNodes(tree, (n) => n.props?.role === 'dialog')[0];
    assert.match(renderNodeHtml(dialog), /Không có quyền xem hồ sơ doanh nghiệp này/);
  } finally {
    harness.unmount();
  }

  // 7) 401 SESSION_EXPIRED on detail fetch inside AuthenticatedWorkspace redirects Platform Admin to /platform/login?reason=session_expired
  const wsHarness = makeStatefulHarness();
  const redirects = [];
  try {
    const { AuthenticatedWorkspaceContent } = load(
      'src/components/auth/AuthenticatedWorkspace.tsx',
      {
        react: wsHarness.mockReact,
        'next/navigation': {
          useRouter: () => ({
            push: (u) => redirects.push(u),
            replace: (u) => redirects.push(u),
          }),
        },
        '@/context/LanguageContext': {
          LanguageProvider: ({ children }) => children,
          useLanguage: () => ({
            language: 'en',
            t: translations.en,
            toggleLanguage() {},
            setLanguage() {},
          }),
        },
        '@/context/ToastProvider': {
          ToastProvider: ({ children }) => children,
          useToast: () => ({ toast() {} }),
        },
        '@/hooks/useDialogFocus': {
          useDialogFocus: () => ({ current: null }),
        },
        '@/components/fraudguard-dashboard/UserProfileMenu': {
          UserProfileMenu: () => null,
        },
        '@/services/auth': {
          AuthServiceError: class extends Error {},
          fetchCurrentSession: async () => ({}),
          logoutCurrentSession: async () => ({
            localCleared: true,
            serverRevoked: true,
            reason: 'REVOKED',
          }),
          submitInitialPassword: async () => ({}),
          changeCurrentPassword: async () => ({}),
        },
        '@/services/workspaces': {
          DEFAULT_WORKSPACE_PAGE_SIZE: 20,
          MAX_WORKSPACE_SEARCH_LENGTH: 100,
          WorkspaceServiceError,
          fetchWorkspacePage: async () => ({
            items: [itemA],
            page: 0,
            size: 20,
            totalElements: 1,
            totalPages: 1,
          }),
          fetchWorkspaceDetail: async () => {
            throw new WorkspaceServiceError('SESSION_EXPIRED', 401);
          },
        },
      }
    );

    const adminState = {
      status: 'authenticated',
      session: {
        account: {
          accountId: 'aaaaaaaa-1111-4111-8111-111111111111',
          loginName: 'platform-admin',
          role: 'PLATFORM_ADMIN',
          workspaceId: null,
          workspaceKey: null,
          mustChangePassword: false,
        },
        displayRole: 'Platform Admin',
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
      },
    };

    let wsTree = wsHarness.render(() =>
      AuthenticatedWorkspaceContent({ initialState: adminState })
    );
    const onboardingBtn = findNodes(
      wsTree,
      (n) => n.type === 'button' && n.props?.['aria-label'] === 'Onboarding & Handover'
    )[0];
    onboardingBtn.props.onClick();
    wsTree = wsHarness.render(() =>
      AuthenticatedWorkspaceContent({ initialState: adminState })
    );
    await new Promise((r) => setImmediate(r));
    wsTree = wsHarness.render(() =>
      AuthenticatedWorkspaceContent({ initialState: adminState })
    );

    const nameBtn = findNodes(
      wsTree,
      (n) => n.type === 'button' && n.props.className === 'workspaceNameTrigger'
    )[0];
    assert.ok(nameBtn);
    nameBtn.props.onClick();
    wsHarness.render(() =>
      AuthenticatedWorkspaceContent({ initialState: adminState })
    );
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(redirects, ['/platform/login?reason=session_expired']);
  } finally {
    wsHarness.unmount();
  }

  // Static audit: zero em dashes (\u2014) and zero demo imports across all workspace detail files
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
