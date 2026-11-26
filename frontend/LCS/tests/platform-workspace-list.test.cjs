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
 * Contract-accurate local HTTP test double for GET /api/v1/workspaces
 * matching WorkspaceController, WorkspaceServiceImpl, and WorkspaceRepository.
 */
async function startContractWorkspaceUpstream({ workspaces = [], accounts = [] } = {}) {
  const accountMap = new Map(accounts.map((a) => [a.token, a]));
  const receivedRequests = [];
  let nextForcedStatus = null;

  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, 'http://127.0.0.1');
    receivedRequests.push({
      method: req.method,
      pathname: parsedUrl.pathname,
      rawSearch: parsedUrl.search,
      queryKeys: Array.from(parsedUrl.searchParams.keys()),
      searchParam: parsedUrl.searchParams.get('search'),
      pageParam: parsedUrl.searchParams.get('page'),
      sizeParam: parsedUrl.searchParams.get('size'),
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

    if (parsedUrl.pathname !== '/api/v1/workspaces') {
      res.writeHead(404, { 'Content-Type': 'application/problem+json' });
      res.end(JSON.stringify({ status: 404, detail: 'Not found' }));
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
      res.end(JSON.stringify({ status: 400, detail: 'Invalid workspace query' }));
      return;
    }

    const needle = search.trim().toLowerCase();
    const sorted = [...workspaces].sort((a, b) => {
      if (a.enterpriseName !== b.enterpriseName) {
        return a.enterpriseName < b.enterpriseName ? -1 : 1;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    const filtered = sorted.filter((w) => {
      if (!needle) return true;
      return (
        w.enterpriseName.toLowerCase().includes(needle) ||
        w.workspaceKey.toLowerCase().includes(needle)
      );
    });
    const totalElements = filtered.length;
    const totalPages = totalElements === 0 ? 0 : Math.ceil(totalElements / size);
    const items = filtered.slice(page * size, page * size + size);

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(
      JSON.stringify({
        items,
        page,
        size,
        totalElements,
        totalPages,
      })
    );
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

        // Clean up unmounted child component instances
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
  if (typeof node.type === 'function') {
    return renderNodeHtml(node.type(node.props));
  }
  return renderToStaticMarkup(node);
}

test('Server workspace bridge enforces auth cookie, SSRF/cross-site blocks, query validation, Vietnamese encoding, no-store, and 401/403/503 error mapping', async () => {
  const expSec = Math.floor(Date.now() / 1000) + 900;
  const adminToken = makeUnsignedTestJwt(crypto.randomUUID(), crypto.randomUUID(), expSec);
  const smeToken = makeUnsignedTestJwt(crypto.randomUUID(), crypto.randomUUID(), expSec);
  const expiredToken = makeUnsignedTestJwt(crypto.randomUUID(), crypto.randomUUID(), expSec);

  const sampleWorkspaces = [
    {
      id: '22222222-2222-4222-8222-222222222222',
      workspaceKey: 'binh-minh-edu',
      enterpriseName: 'Công ty Cổ phần Giáo dục Bình Minh & Cộng sự',
      contactName: 'Nguyễn Thị Minh Ánh',
      contactEmail: 'minh.anh@binhminh-edu.vn',
      contactPhone: '+84 909 111 222',
      version: 2,
      createdAt: '2026-10-01T08:00:00Z',
      updatedAt: '2026-11-20T09:30:00Z',
      internalSecretShouldStrip: 'DO_NOT_LEAK',
    },
    {
      id: '11111111-1111-4111-8111-111111111111',
      workspaceKey: 'an-phuc-retail',
      enterpriseName: 'An Phúc Retail',
      contactName: 'Trần Văn An',
      contactEmail: 'an.tran@anphuc.vn',
      contactPhone: null,
      version: 0,
      createdAt: '2026-09-15T03:00:00Z',
      updatedAt: '2026-11-25T14:15:00Z',
    },
  ];

  const upstream = await startContractWorkspaceUpstream({
    workspaces: sampleWorkspaces,
    accounts: [
      { token: adminToken, role: 'PLATFORM_ADMIN', workspaceId: null, mustChangePassword: false },
      { token: smeToken, role: 'SME_ADMIN', workspaceId: sampleWorkspaces[0].id, mustChangePassword: false },
      { token: expiredToken, role: 'PLATFORM_ADMIN', workspaceId: null, expired: true },
    ],
  });

  try {
    const {
      handleWorkspaceListBridgeRequest,
      validateWorkspaceListQuery,
    } = load('src/services/workspaces.ts');
    const env = { NODE_ENV: 'development', FRAUDGUARD_BACKEND_URL: upstream.baseUrl };
    const adminCookie = `fg_access_token=${encodeURIComponent(adminToken)}`;

    // 1) Query validation boundaries matching BE
    assert.equal(validateWorkspaceListQuery({ search: 'x'.repeat(101) }).ok, false);
    assert.equal(validateWorkspaceListQuery({ page: -1 }).ok, false);
    assert.equal(validateWorkspaceListQuery({ size: 0 }).ok, false);
    assert.equal(validateWorkspaceListQuery({ size: 101 }).ok, false);
    assert.equal(validateWorkspaceListQuery({ page: 2147483647, size: 20 }).ok, false);
    assert.deepEqual(validateWorkspaceListQuery({ search: '  An Phúc  ', page: '0', size: '20' }), {
      ok: true,
      query: { search: 'An Phúc', page: 0, size: 20 },
    });

    // 2) Method & cross-site checks reject before touching upstream
    const postBlocked = await handleWorkspaceListBridgeRequest({
      method: 'POST',
      requestUrl: 'http://localhost:3000/api/workspaces',
      headers: new Headers({ cookie: adminCookie }),
      env,
    });
    assert.equal(postBlocked.status, 405);

    const crossSiteBlocked = await handleWorkspaceListBridgeRequest({
      method: 'GET',
      requestUrl: 'http://localhost:3000/api/workspaces',
      headers: new Headers({ cookie: adminCookie, 'sec-fetch-site': 'cross-site' }),
      env,
    });
    assert.equal(crossSiteBlocked.status, 403);
    assert.equal(upstream.receivedRequests.length, 0);

    // 3) Missing cookie -> 401 UNAUTHENTICATED without hitting upstream
    const unauth = await handleWorkspaceListBridgeRequest({
      method: 'GET',
      requestUrl: 'http://localhost:3000/api/workspaces',
      headers: new Headers({ host: 'localhost:3000' }),
      env,
    });
    assert.equal(unauth.status, 401);
    assert.equal(unauth.body.errorCode, 'UNAUTHENTICATED');
    assert.equal(upstream.receivedRequests.length, 0);

    // 4) Valid Platform Admin request encodes Vietnamese & special chars, strips unknown query params & strips extra upstream fields
    const specialSearch = 'Bình Minh & Cộng sự';
    const okRes = await handleWorkspaceListBridgeRequest({
      method: 'GET',
      requestUrl: `http://localhost:3000/api/workspaces?search=${encodeURIComponent(
        '  ' + specialSearch + '  '
      )}&page=0&size=20&stage=intake&backendUrl=http://evil.example`,
      headers: new Headers({
        host: 'localhost:3000',
        cookie: adminCookie,
        'sec-fetch-site': 'same-origin',
        'x-forwarded-backend': 'http://evil.example',
      }),
      env,
    });
    assert.equal(okRes.status, 200);
    assert.equal(okRes.body.totalElements, 1);
    assert.equal(okRes.body.items.length, 1);
    assert.equal(okRes.body.items[0].workspaceKey, 'binh-minh-edu');
    assert.equal('internalSecretShouldStrip' in okRes.body.items[0], false);
    assert.equal(JSON.stringify(okRes.body).includes(adminToken), false);

    const lastReq = upstream.receivedRequests.at(-1);
    assert.equal(lastReq.pathname, '/api/v1/workspaces');
    assert.deepEqual(lastReq.queryKeys, ['search', 'page', 'size']);
    assert.equal(lastReq.searchParam, specialSearch);
    assert.equal(lastReq.pageParam, '0');
    assert.equal(lastReq.sizeParam, '20');
    assert.equal(lastReq.authHeader, `Bearer ${adminToken}`);

    // 5) Disallowed role -> 403 FORBIDDEN without clearing session cookie
    const forbiddenRes = await handleWorkspaceListBridgeRequest({
      method: 'GET',
      requestUrl: 'http://localhost:3000/api/workspaces',
      headers: new Headers({
        host: 'localhost:3000',
        cookie: `fg_access_token=${encodeURIComponent(smeToken)}`,
      }),
      env,
    });
    assert.equal(forbiddenRes.status, 403);
    assert.equal(forbiddenRes.body.errorCode, 'FORBIDDEN');
    assert.equal(forbiddenRes.setCookie, undefined);

    // 6) Expired/revoked upstream token -> 401 SESSION_EXPIRED + Set-Cookie clearing fg_access_token
    const expiredRes = await handleWorkspaceListBridgeRequest({
      method: 'GET',
      requestUrl: 'http://localhost:3000/api/workspaces',
      headers: new Headers({
        host: 'localhost:3000',
        cookie: `fg_access_token=${encodeURIComponent(expiredToken)}`,
      }),
      env,
    });
    assert.equal(expiredRes.status, 401);
    assert.equal(expiredRes.body.errorCode, 'SESSION_EXPIRED');
    assert.match(expiredRes.setCookie, /Max-Age=0/);

    // 7) Upstream 500 and malformed payload -> controlled 502 error (never fake empty list)
    upstream.forceNextResponse({ status: 500, detail: 'Database timeout' });
    const serverErrRes = await handleWorkspaceListBridgeRequest({
      method: 'GET',
      requestUrl: 'http://localhost:3000/api/workspaces',
      headers: new Headers({ host: 'localhost:3000', cookie: adminCookie }),
      env,
    });
    assert.equal(serverErrRes.status, 502);
    assert.equal(serverErrRes.body.errorCode, 'BACKEND_UNAVAILABLE');

    upstream.forceNextResponse({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { items: [{ id: 'not-a-uuid', workspaceKey: 'bad' }], page: 0, size: 20, totalElements: 1, totalPages: 1 },
    });
    const malformedRes = await handleWorkspaceListBridgeRequest({
      method: 'GET',
      requestUrl: 'http://localhost:3000/api/workspaces',
      headers: new Headers({ host: 'localhost:3000', cookie: adminCookie }),
      env,
    });
    assert.equal(malformedRes.status, 502);
    assert.equal(malformedRes.body.errorCode, 'UPSTREAM_ERROR');
  } finally {
    await upstream.close();
  }
});

test('PlatformWorkspaceListView renders real BE fields in order, paginates, searches, clears search, distinguishes all 4+ states, and discards stale out-of-order responses', async () => {
  const { translations } = load('src/config/translations.ts');
  const { WorkspaceServiceError } = load('src/services/workspaces.ts');

  const pageZeroItems = [
    {
      id: '10000000-0000-4000-8000-000000000001',
      workspaceKey: 'alpha-pay',
      enterpriseName: 'Alpha Payment Services Vietnam Co., Ltd.',
      contactName: 'Lê Hoàng Nam',
      contactEmail: 'very.long.administrative.contact@alpha-payment-vietnam.example.vn',
      contactPhone: '+84 912 345 678',
      version: 1,
      createdAt: '2026-10-10T01:00:00Z',
      updatedAt: '2026-11-24T08:30:00Z',
    },
    {
      id: '10000000-0000-4000-8000-000000000002',
      workspaceKey: 'beta-logistics',
      enterpriseName: 'Beta Logistics',
      contactName: 'Phạm Thu Hà',
      contactEmail: 'ha.pham@betalogistics.vn',
      contactPhone: null,
      version: 0,
      createdAt: '2026-10-12T04:00:00Z',
      updatedAt: '2026-11-25T10:05:00Z',
    },
  ];
  const pageOneItems = [
    {
      id: '10000000-0000-4000-8000-000000000003',
      workspaceKey: 'omega-edu',
      enterpriseName: 'Omega Education',
      contactName: '',
      contactEmail: '',
      contactPhone: null,
      version: 0,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-26T06:45:00Z',
    },
  ];

  // Scenario A: Loading -> Multi-page render -> Next page -> Search resets page=0 -> No matches -> Clear search -> Page size change
  const recordedQueries = [];
  let pendingResolver = null;

  const harness = makeStatefulHarness();
  const { PlatformWorkspaceListView } = load(
    'src/components/fraudguard-dashboard/PlatformWorkspaceListView.tsx',
    {
      react: harness.mockReact,
      '@/context/LanguageContext': {
        useLanguage: () => ({ language: 'vi', t: translations.vi, toggleLanguage() {} }),
      },
    }
  );

  const loadPage = (query, options) => {
    recordedQueries.push({ ...query, abortedAtStart: Boolean(options?.signal?.aborted) });
    return new Promise((resolve, reject) => {
      pendingResolver = { query, signal: options?.signal, resolve, reject };
    });
  };

  // 1) Initial mount shows Loading state and requests page=0, size=20
  let tree = harness.render(() =>
    PlatformWorkspaceListView({ loadPage, searchDebounceMs: 0 })
  );
  let html = renderNodeHtml(tree);
  assert.match(html, /Đang tải danh sách doanh nghiệp/);
  assert.deepEqual(recordedQueries, [{ search: '', page: 0, size: 20, abortedAtStart: false }]);

  // Resolve initial page (3 total enterprises across 2 pages of size 2 for multi-page check)
  pendingResolver.resolve({
    items: pageZeroItems,
    page: 0,
    size: 2,
    totalElements: 3,
    totalPages: 2,
  });
  await new Promise((r) => setImmediate(r));

  tree = harness.render(() =>
    PlatformWorkspaceListView({ loadPage, searchDebounceMs: 0 })
  );
  html = renderNodeHtml(tree);

  // Verify exact 4 columns, no Actions column, no mock Free/Unassigned badges, exact BE order, and full untruncated enterprise name
  const headers = findNodes(tree, (n) => n.type === 'th').map((th) => th.props.children);
  assert.deepEqual(headers, [
    'Doanh nghiệp',
    'Mã workspace',
    'Thông tin liên hệ',
    'Cập nhật lần cuối',
  ]);
  assert.equal(html.includes('Alpha Payment Services Vietnam Co., Ltd.'), true);
  assert.ok(html.indexOf('alpha-pay') < html.indexOf('beta-logistics'));
  assert.equal(html.includes('very.long.administrative.contact@alpha-payment-vietnam.example.vn'), true);
  assert.equal(html.includes('+84 912 345 678'), true);
  assert.equal(html.includes('ha.pham@betalogistics.vn'), true);
  assert.equal(html.includes('Free'), false);
  assert.equal(html.includes('Chưa phân công'), false);
  assert.equal(html.includes('Tạo hồ sơ doanh nghiệp'), false);
  assert.match(html, /Hiển thị 1-2 trên tổng số 3 doanh nghiệp · Trang 1\/2/);

  const rows = findNodes(tree, (n) => n.type === 'tr' && n.key);
  assert.deepEqual(
    rows.map((r) => r.key),
    [
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
    ]
  );

  // 2) Click "Trang sau" -> requests page=1 keeping search=""
  const nextBtn = findNodes(
    tree,
    (n) => n.type === 'button' && n.props.children === 'Trang sau'
  )[0];
  assert.ok(nextBtn);
  assert.equal(nextBtn.props.disabled, false);
  nextBtn.props.onClick();

  tree = harness.render(() =>
    PlatformWorkspaceListView({ loadPage, searchDebounceMs: 0 })
  );
  assert.equal(recordedQueries.at(-1).page, 1);
  assert.equal(recordedQueries.at(-1).search, '');

  pendingResolver.resolve({
    items: pageOneItems,
    page: 1,
    size: 2,
    totalElements: 3,
    totalPages: 2,
  });
  await new Promise((r) => setImmediate(r));

  tree = harness.render(() =>
    PlatformWorkspaceListView({ loadPage, searchDebounceMs: 0 })
  );
  html = renderNodeHtml(tree);
  assert.equal(html.includes('Omega Education'), true);
  assert.equal(html.includes('>-<'), true); // Empty contact fields render "-"
  assert.match(html, /Hiển thị 3-3 trên tổng số 3 doanh nghiệp · Trang 2\/2/);

  // 3) Searching while on page=1 resets page to 0
  const searchInput = findNodes(
    tree,
    (n) => n.type === 'input' && n.props.name === 'workspaceSearch'
  )[0];
  searchInput.props.onChange({ target: { value: '  khong-ton-tai  ' } });

  tree = harness.render(() =>
    PlatformWorkspaceListView({ loadPage, searchDebounceMs: 0 })
  );
  assert.equal(recordedQueries.at(-1).search, 'khong-ton-tai');
  assert.equal(recordedQueries.at(-1).page, 0);

  // Resolve with 0 matches -> must show "Không tìm thấy doanh nghiệp phù hợp" (NOT "Chưa có doanh nghiệp")
  pendingResolver.resolve({
    items: [],
    page: 0,
    size: 20,
    totalElements: 0,
    totalPages: 0,
  });
  await new Promise((r) => setImmediate(r));

  tree = harness.render(() =>
    PlatformWorkspaceListView({ loadPage, searchDebounceMs: 0 })
  );
  html = renderNodeHtml(tree);
  assert.match(html, /Không tìm thấy doanh nghiệp phù hợp/);
  assert.match(html, /khong-ton-tai/);
  assert.equal(html.includes('Chưa có doanh nghiệp nào trên hệ thống'), false);

  // 4) Clicking "Xóa tìm kiếm" clears input and reloads full list at page=0
  const clearBtns = findNodes(
    tree,
    (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Xóa tìm kiếm')
  );
  assert.ok(clearBtns.length >= 1);
  clearBtns[clearBtns.length - 1].props.onClick();

  tree = harness.render(() =>
    PlatformWorkspaceListView({ loadPage, searchDebounceMs: 0 })
  );
  assert.equal(recordedQueries.at(-1).search, '');
  assert.equal(recordedQueries.at(-1).page, 0);

  // Resolve with empty DB (0 records when search is "") -> shows "Chưa có doanh nghiệp nào trên hệ thống"
  pendingResolver.resolve({
    items: [],
    page: 0,
    size: 20,
    totalElements: 0,
    totalPages: 0,
  });
  await new Promise((r) => setImmediate(r));

  tree = harness.render(() =>
    PlatformWorkspaceListView({ loadPage, searchDebounceMs: 0 })
  );
  html = renderNodeHtml(tree);
  assert.match(html, /Chưa có doanh nghiệp nào trên hệ thống/);
  assert.equal(html.includes('Không tìm thấy doanh nghiệp phù hợp'), false);

  // 5) Out-of-order / stale response race protection:
  // Trigger query "alpha" (request A), then immediately "beta" (request B). Resolve B first, then resolve stale A late.
  const inFlight = [];
  const raceLoadPage = (query, options) =>
    new Promise((resolve, reject) => {
      inFlight.push({ query, signal: options?.signal, resolve, reject });
    });

  const raceHarness = makeStatefulHarness();
  const { PlatformWorkspaceListView: RaceView } = load(
    'src/components/fraudguard-dashboard/PlatformWorkspaceListView.tsx',
    {
      react: raceHarness.mockReact,
      '@/context/LanguageContext': {
        useLanguage: () => ({ language: 'vi', t: translations.vi, toggleLanguage() {} }),
      },
    }
  );

  let raceTree = raceHarness.render(() =>
    RaceView({ loadPage: raceLoadPage, searchDebounceMs: 0 })
  );
  // Request 0: initial ""
  assert.equal(inFlight.length, 1);

  let raceSearch = findNodes(
    raceTree,
    (n) => n.type === 'input' && n.props.name === 'workspaceSearch'
  )[0];
  raceSearch.props.onChange({ target: { value: 'alpha' } });
  raceTree = raceHarness.render(() =>
    RaceView({ loadPage: raceLoadPage, searchDebounceMs: 0 })
  );
  // Request 0 must be aborted when Request 1 ("alpha") starts
  assert.equal(inFlight[0].signal.aborted, true);
  assert.equal(inFlight[1].query.search, 'alpha');

  raceSearch = findNodes(
    raceTree,
    (n) => n.type === 'input' && n.props.name === 'workspaceSearch'
  )[0];
  raceSearch.props.onChange({ target: { value: 'beta' } });
  raceTree = raceHarness.render(() =>
    RaceView({ loadPage: raceLoadPage, searchDebounceMs: 0 })
  );
  // Request 1 ("alpha") must be aborted when Request 2 ("beta") starts
  assert.equal(inFlight[1].signal.aborted, true);
  assert.equal(inFlight[2].query.search, 'beta');

  // Resolve newer Request 2 ("beta") first
  inFlight[2].resolve({
    items: [pageZeroItems[1]],
    page: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
  });
  await new Promise((r) => setImmediate(r));

  // Now resolve stale Request 1 ("alpha") late -> must be ignored!
  inFlight[1].resolve({
    items: [pageZeroItems[0]],
    page: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
  });
  await new Promise((r) => setImmediate(r));

  raceTree = raceHarness.render(() =>
    RaceView({ loadPage: raceLoadPage, searchDebounceMs: 0 })
  );
  const raceHtml = renderNodeHtml(raceTree);
  assert.equal(raceHtml.includes('Beta Logistics'), true);
  assert.equal(raceHtml.includes('Alpha Payment Services Vietnam Co., Ltd.'), false);

  // 6) Error state + Retry recovery, and 403 Forbidden state
  let shouldFail = 'error';
  const errHarness = makeStatefulHarness();
  const { PlatformWorkspaceListView: ErrView } = load(
    'src/components/fraudguard-dashboard/PlatformWorkspaceListView.tsx',
    {
      react: errHarness.mockReact,
      '@/context/LanguageContext': {
        useLanguage: () => ({ language: 'vi', t: translations.vi, toggleLanguage() {} }),
      },
    }
  );
  const flakyLoad = async () => {
    if (shouldFail === 'error') {
      throw new WorkspaceServiceError('BACKEND_UNAVAILABLE', 503);
    }
    if (shouldFail === 'forbidden') {
      throw new WorkspaceServiceError('FORBIDDEN', 403);
    }
    return { items: [pageZeroItems[0]], page: 0, size: 20, totalElements: 1, totalPages: 1 };
  };

  let errTree = errHarness.render(() =>
    ErrView({ loadPage: flakyLoad, searchDebounceMs: 0 })
  );
  await new Promise((r) => setImmediate(r));
  errTree = errHarness.render(() =>
    ErrView({ loadPage: flakyLoad, searchDebounceMs: 0 })
  );
  let errHtml = renderNodeHtml(errTree);
  assert.match(errHtml, /Không thể tải danh sách doanh nghiệp/);
  assert.equal(errHtml.includes('Chưa có doanh nghiệp nào trên hệ thống'), false);

  // Click Retry -> succeeds
  shouldFail = 'none';
  const retryBtn = findNodes(
    errTree,
    (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Thử lại')
  )[0];
  assert.ok(retryBtn);
  retryBtn.props.onClick();
  errTree = errHarness.render(() =>
    ErrView({ loadPage: flakyLoad, searchDebounceMs: 0 })
  );
  await new Promise((r) => setImmediate(r));
  errTree = errHarness.render(() =>
    ErrView({ loadPage: flakyLoad, searchDebounceMs: 0 })
  );
  assert.equal(renderNodeHtml(errTree).includes('Alpha Payment Services Vietnam Co., Ltd.'), true);

  // Trigger refresh with 403 Forbidden -> renders explicit Forbidden state
  shouldFail = 'forbidden';
  const refreshBtn = findNodes(
    errTree,
    (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Làm mới')
  )[0];
  refreshBtn.props.onClick();
  errTree = errHarness.render(() =>
    ErrView({ loadPage: flakyLoad, searchDebounceMs: 0 })
  );
  await new Promise((r) => setImmediate(r));
  errTree = errHarness.render(() =>
    ErrView({ loadPage: flakyLoad, searchDebounceMs: 0 })
  );
  errHtml = renderNodeHtml(errTree);
  assert.match(errHtml, /Không có quyền xem danh sách doanh nghiệp/);
  assert.equal(errHtml.includes('Alpha Payment Services Vietnam Co., Ltd.'), false);
});

test('AuthenticatedWorkspace opens real workspace list for Platform Admin on onboarding nav, redirects to /platform/login on 401, and keeps /demo isolated', async () => {
  const { translations } = load('src/config/translations.ts');
  const { WorkspaceServiceError } = load('src/services/workspaces.ts');

  const workspaceCalls = [];
  const redirects = [];
  let expireOnWorkspaceFetch = false;

  const wsHarness = makeStatefulHarness();
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
          language: 'vi',
          t: translations.vi,
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
        fetchCurrentSession: async () => {
          throw new Error('unexpected');
        },
        logoutCurrentSession: async () => ({
          localCleared: true,
          serverRevoked: true,
          reason: 'REVOKED',
        }),
        submitInitialPassword: async () => {
          throw new Error('unexpected');
        },
        changeCurrentPassword: async () => {
          throw new Error('unexpected');
        },
      },
      '@/services/workspaces': {
        DEFAULT_WORKSPACE_PAGE_SIZE: 20,
        MAX_WORKSPACE_SEARCH_LENGTH: 100,
        WorkspaceServiceError,
        fetchWorkspacePage: async (q) => {
          workspaceCalls.push(q);
          if (expireOnWorkspaceFetch) {
            throw new WorkspaceServiceError('SESSION_EXPIRED', 401);
          }
          return {
            items: [
              {
                id: '99999999-9999-4999-8999-999999999999',
                workspaceKey: 'viet-fintech',
                enterpriseName: 'Viet FinTech JSC',
                contactName: 'Đỗ Minh Quân',
                contactEmail: 'quan.do@vietfintech.vn',
                contactPhone: '0901234567',
                version: 0,
                createdAt: '2026-11-10T00:00:00Z',
                updatedAt: '2026-11-26T09:00:00Z',
              },
            ],
            page: 0,
            size: 20,
            totalElements: 1,
            totalPages: 1,
          };
        },
      },
    }
  );

  const adminInitialState = {
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

  try {
    // Home view is platform-health; clicking "Thiết lập Doanh nghiệp" (onboarding) in expanded sidebar loads real workspace list
    let tree = wsHarness.render(() =>
      AuthenticatedWorkspaceContent({ initialState: adminInitialState })
    );
    assert.equal(workspaceCalls.length, 0);

    const onboardingNavBtn = findNodes(
      tree,
      (n) => n.type === 'button' && n.props?.['aria-label'] === 'Thiết lập Doanh nghiệp'
    )[0];
    assert.ok(onboardingNavBtn);
    onboardingNavBtn.props.onClick();

    tree = wsHarness.render(() =>
      AuthenticatedWorkspaceContent({ initialState: adminInitialState })
    );
    await new Promise((r) => setImmediate(r));
    tree = wsHarness.render(() =>
      AuthenticatedWorkspaceContent({ initialState: adminInitialState })
    );
    const fullHtml = renderNodeHtml(tree);
    assert.equal(workspaceCalls.length, 1);
    assert.equal(fullHtml.includes('Viet FinTech JSC'), true);
    assert.equal(fullHtml.includes('viet-fintech'), true);

    // When /api/workspaces returns 401 SESSION_EXPIRED, Platform Admin is redirected to /platform/login?reason=session_expired
    expireOnWorkspaceFetch = true;
    const refreshBtn = findNodes(
      tree,
      (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Làm mới')
    )[0];
    assert.ok(refreshBtn);
    refreshBtn.props.onClick();
    wsHarness.render(() =>
      AuthenticatedWorkspaceContent({ initialState: adminInitialState })
    );
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(redirects, ['/platform/login?reason=session_expired']);
  } finally {
    wsHarness.unmount();
  }

  // Implementation Staff opening "onboarding" in this phase stays on the pending-integration view (does not wire Staff list UI)
  const staffHarness = makeStatefulHarness();
  const { AuthenticatedWorkspaceContent: StaffWorkspace } = load(
    'src/components/auth/AuthenticatedWorkspace.tsx',
    {
      react: staffHarness.mockReact,
      'next/navigation': { useRouter: () => ({ push() {}, replace() {} }) },
      '@/context/LanguageContext': {
        LanguageProvider: ({ children }) => children,
        useLanguage: () => ({ language: 'vi', t: translations.vi, toggleLanguage() {}, setLanguage() {} }),
      },
      '@/context/ToastProvider': { ToastProvider: ({ children }) => children, useToast: () => ({ toast() {} }) },
      '@/hooks/useDialogFocus': { useDialogFocus: () => ({ current: null }) },
      '@/components/fraudguard-dashboard/UserProfileMenu': { UserProfileMenu: () => null },
      '@/services/auth': {
        AuthServiceError: class extends Error {},
        fetchCurrentSession: async () => ({}),
        logoutCurrentSession: async () => ({ localCleared: true, serverRevoked: true, reason: 'REVOKED' }),
        submitInitialPassword: async () => ({}),
        changeCurrentPassword: async () => ({}),
      },
      '@/services/workspaces': {
        DEFAULT_WORKSPACE_PAGE_SIZE: 20,
        MAX_WORKSPACE_SEARCH_LENGTH: 100,
        WorkspaceServiceError,
        fetchWorkspacePage: async () => {
          throw new Error('Staff workspace list must not be wired in this phase');
        },
      },
    }
  );
  const staffState = {
    status: 'authenticated',
    session: {
      account: {
        accountId: 'bbbbbbbb-2222-4222-8222-222222222222',
        loginName: 'impl-staff',
        role: 'IMPLEMENTATION_STAFF',
        workspaceId: null,
        workspaceKey: null,
        mustChangePassword: false,
      },
      displayRole: 'Implementation Staff',
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    },
  };
  try {
    let staffTree = staffHarness.render(() => StaffWorkspace({ initialState: staffState }));
    const staffOnboardingBtn = findNodes(
      staffTree,
      (n) => n.type === 'button' && n.props?.['aria-label'] === 'Thiết lập Doanh nghiệp'
    )[0];
    assert.ok(staffOnboardingBtn);
    staffOnboardingBtn.props.onClick();
    staffTree = staffHarness.render(() => StaffWorkspace({ initialState: staffState }));
    assert.match(renderNodeHtml(staffTree), /chưa nối API/);
  } finally {
    staffHarness.unmount();
  }

  // Static audit: real workspace files have zero demo imports and zero em dashes (\u2014)
  const auditedFiles = [
    'src/types/workspace.ts',
    'src/services/workspaces.ts',
    'src/app/api/workspaces/route.ts',
    'src/components/fraudguard-dashboard/PlatformWorkspaceListView.tsx',
    'src/components/auth/AuthenticatedWorkspace.tsx',
  ];
  for (const rel of auditedFiles) {
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.equal(content.includes('\u2014'), false, `Unexpected em dash in ${rel}`);
    assert.equal(/@\/data\/|useOnboardingWorkflow|workspace-storage|OnboardingEnterpriseListScreen/.test(content), false, `Demo import leaked into ${rel}`);
  }
});
