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
const { createUiImports } = require('./helpers/wf04.cjs');

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

  const module = { exports: {} };
  if (!hasOverrides) {
    moduleCache.set(filename, module.exports);
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
  fn(module.exports, localRequire, module, filename, path.dirname(filename));
  if (!hasOverrides) {
    moduleCache.set(filename, module.exports);
  }
  return module.exports;
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
 * Starts a local HTTP test server implementing the exact Spring Boot /api/v1/auth/* contract
 * (statuses, ProblemDetail error bodies, WWW-Authenticate on filter-rejected tokens, 12..72 char
 * & <=72 UTF-8 byte password rules, setup vs ready flow gates, and idempotent 204 logout).
 * Note: This is a contract-accurate local test double, NOT live Spring Boot end-to-end execution.
 */
async function startContractAuthUpstream(seedAccounts) {
  const accountsById = new Map();
  const accountsByLogin = new Map();
  const sessions = new Map();
  const receivedRequests = [];

  for (const acc of seedAccounts) {
    const copy = { ...acc };
    accountsById.set(copy.accountId, copy);
    accountsByLogin.set(copy.loginName, copy);
  }

  function sendJson(res, status, body, extraHeaders = {}) {
    const raw = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    });
    res.end(raw);
  }

  function parseBearer(req) {
    const auth = req.headers['authorization'];
    if (!auth) return { present: false };
    if (!/^Bearer\s+\S+$/.test(auth)) return { present: true, invalidFormat: true };
    const token = auth.slice(7);
    const parts = token.split('.');
    if (parts.length !== 3) return { present: true, invalidJwt: true };
    try {
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      const nowSec = Math.floor(Date.now() / 1000);
      if (typeof claims.exp !== 'number' || claims.exp <= nowSec) {
        return { present: true, expiredJwt: true };
      }
      return {
        present: true,
        token,
        accountId: claims.sub,
        sessionId: claims.jti,
      };
    } catch {
      return { present: true, invalidJwt: true };
    }
  }

  function authenticateResourceRequest(req, res) {
    const bearer = parseBearer(req);
    if (!bearer.present || bearer.invalidFormat || bearer.invalidJwt || bearer.expiredJwt) {
      res.writeHead(401, {
        'WWW-Authenticate': 'Bearer error="invalid_token"',
      });
      res.end();
      return null;
    }
    const account = accountsById.get(bearer.accountId);
    const session = sessions.get(bearer.sessionId);
    if (
      !account ||
      !account.enabled ||
      !session ||
      session.revoked ||
      session.accountId !== account.accountId ||
      session.workspaceId !== account.workspaceId ||
      session.workspaceKey !== account.workspaceKey ||
      session.expiresAtMs <= Date.now()
    ) {
      res.writeHead(401, {
        'WWW-Authenticate': 'Bearer error="invalid_token"',
      });
      res.end();
      return null;
    }
    return { account, session };
  }

  function withinBcryptBytes(val) {
    return typeof val === 'string' && Buffer.byteLength(val, 'utf8') <= 72;
  }

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      let body = null;
      if (rawBody) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          sendJson(res, 400, { status: 400, detail: 'Malformed JSON' });
          return;
        }
      }

      receivedRequests.push({
        method: req.method,
        url: req.url,
        hasAuthHeader: Boolean(req.headers['authorization']),
        body: body
          ? {
              ...body,
              ...(body.password !== undefined ? { password: '[REDACTED]' } : {}),
              ...(body.currentPassword !== undefined ? { currentPassword: '[REDACTED]' } : {}),
              ...(body.newPassword !== undefined ? { newPassword: '[REDACTED]' } : {}),
              ...(body.confirmation !== undefined ? { confirmation: '[REDACTED]' } : {}),
            }
          : null,
        rawPortal: body?.portal,
        rawWorkspaceKey: body?.workspaceKey,
      });

      if (req.method === 'POST' && req.url === '/api/v1/auth/login') {
        if (
          !body ||
          typeof body.loginName !== 'string' ||
          !body.loginName.trim() ||
          body.loginName.length > 128 ||
          typeof body.password !== 'string' ||
          !body.password.trim() ||
          body.password.length > 72 ||
          (body.portal !== 'PLATFORM' && body.portal !== 'ENTERPRISE') ||
          'workspaceId' in body ||
          (body.workspaceKey != null &&
            (typeof body.workspaceKey !== 'string' || body.workspaceKey.length > 64))
        ) {
          sendJson(res, 400, {
            status: 400,
            detail: 'Check required fields and permitted lengths',
          });
          return;
        }

        const acc = accountsByLogin.get(body.loginName);
        const isPlatform =
          acc && (acc.role === 'PLATFORM_ADMIN' || acc.role === 'IMPLEMENTATION_STAFF');
        const scopeOk = acc
          ? isPlatform
            ? body.portal === 'PLATFORM' && (body.workspaceKey === null || body.workspaceKey === undefined)
            : body.portal === 'ENTERPRISE' && body.workspaceKey === acc.workspaceKey
          : false;

        if (
          !acc ||
          !acc.enabled ||
          !withinBcryptBytes(body.password) ||
          acc.password !== body.password ||
          !scopeOk
        ) {
          sendJson(res, 401, { status: 401, detail: 'Authentication failed' });
          return;
        }

        const sessionId = crypto.randomUUID();
        const expSec = Math.floor(Date.now() / 1000) + 900;
        const expiresAtIso = new Date(expSec * 1000).toISOString();
        sessions.set(sessionId, {
          sessionId,
          accountId: acc.accountId,
          workspaceId: acc.workspaceId,
          workspaceKey: acc.workspaceKey,
          expiresAtMs: expSec * 1000,
          revoked: false,
        });
        const token = makeUnsignedTestJwt(acc.accountId, sessionId, expSec);
        sendJson(res, 200, {
          accessToken: token,
          tokenType: 'Bearer',
          expiresAt: expiresAtIso,
          account: {
            accountId: acc.accountId,
            loginName: acc.loginName,
            role: acc.role,
            workspaceId: acc.workspaceId,
            workspaceKey: acc.workspaceKey,
            mustChangePassword: acc.mustChangePassword,
          },
        });
        return;
      }

      if (req.method === 'GET' && req.url === '/api/v1/auth/session') {
        const ctx = authenticateResourceRequest(req, res);
        if (!ctx) return;
        sendJson(res, 200, {
          accountId: ctx.account.accountId,
          loginName: ctx.account.loginName,
          role: ctx.account.role,
          workspaceId: ctx.account.workspaceId,
          workspaceKey: ctx.account.workspaceKey,
          mustChangePassword: ctx.account.mustChangePassword,
        });
        return;
      }

      if (
        req.method === 'POST' &&
        (req.url === '/api/v1/auth/initial-password' || req.url === '/api/v1/auth/password')
      ) {
        const ctx = authenticateResourceRequest(req, res);
        if (!ctx) return;
        const isInitial = req.url.endsWith('/initial-password');
        if (ctx.account.mustChangePassword !== isInitial) {
          sendJson(res, 403, {
            status: 403,
            detail: 'Password change flow is not permitted',
          });
          return;
        }
        if (
          !body ||
          typeof body.currentPassword !== 'string' ||
          !body.currentPassword.trim() ||
          body.currentPassword.length > 72 ||
          typeof body.newPassword !== 'string' ||
          !body.newPassword.trim() ||
          body.newPassword.length < 12 ||
          body.newPassword.length > 72 ||
          typeof body.confirmation !== 'string' ||
          !body.confirmation.trim() ||
          body.confirmation.length > 72
        ) {
          sendJson(res, 400, {
            status: 400,
            detail: 'Check required fields and permitted lengths',
          });
          return;
        }
        if (
          !withinBcryptBytes(body.currentPassword) ||
          body.currentPassword !== ctx.account.password
        ) {
          sendJson(res, 401, { status: 401, detail: 'Authentication failed' });
          return;
        }
        if (
          !withinBcryptBytes(body.newPassword) ||
          body.newPassword !== body.confirmation ||
          body.newPassword === ctx.account.password
        ) {
          sendJson(res, 400, {
            status: 400,
            detail: 'Confirm a different new password',
          });
          return;
        }
        ctx.account.password = body.newPassword;
        ctx.account.mustChangePassword = false;
        sendJson(res, 200, {
          accountId: ctx.account.accountId,
          loginName: ctx.account.loginName,
          role: ctx.account.role,
          workspaceId: ctx.account.workspaceId,
          workspaceKey: ctx.account.workspaceKey,
          mustChangePassword: false,
        });
        return;
      }

      if (req.method === 'POST' && req.url === '/api/v1/auth/logout') {
        const auth = req.headers['authorization'];
        if (!auth) {
          res.writeHead(204);
          res.end();
          return;
        }
        const bearer = parseBearer(req);
        if (bearer.invalidFormat || bearer.invalidJwt || bearer.expiredJwt) {
          sendJson(res, 401, { status: 401, detail: 'Authentication failed' });
          return;
        }
        const session = sessions.get(bearer.sessionId);
        if (session && session.accountId === bearer.accountId) {
          session.revoked = true;
        }
        res.writeHead(204);
        res.end();
        return;
      }

      sendJson(res, 404, { status: 404, detail: 'Not found' });
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    accountsById,
    sessions,
    receivedRequests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function makeBridgeHeaders({ cookie, csrf = true, origin = 'http://localhost:3000', json = true, extra = {} } = {}) {
  const h = new Headers({
    host: 'localhost:3000',
    origin,
    'sec-fetch-site': 'same-origin',
    ...extra,
  });
  if (csrf) h.set('x-fraudguard-csrf', '1');
  if (json) h.set('content-type', 'application/json');
  if (cookie) h.set('cookie', cookie);
  return h;
}

function extractCookiePair(setCookieHeader) {
  assert.ok(setCookieHeader, 'Expected Set-Cookie header');
  return setCookieHeader.split(';')[0];
}

test('Login and password validation enforce portal/workspace contract, 12-char min, 72 UTF-8 byte limit, and distinct password rule', () => {
  const {
    buildLoginRequestPayload,
    validatePasswordChangeInput,
    mapBackendRoleToUserRole,
    parseSanitizedSessionAccount,
  } = load('src/utils/auth.ts');

  // Browser login sends credentials and the route-specific portal
  const platformLogin = buildLoginRequestPayload({
    loginName: '  platform-admin  ',
    password: 'Initial-password-123',
    portal: 'PLATFORM',
  });
  assert.equal(platformLogin.ok, true);
  assert.deepEqual(platformLogin.payload, {
    loginName: 'platform-admin',
    password: 'Initial-password-123',
    portal: 'PLATFORM',
  });

  // BCrypt 72 UTF-8 byte overflow on multi-byte characters (37 * 2 bytes = 74 bytes > 72)
  assert.equal(
    buildLoginRequestPayload({
      loginName: 'admin',
      password: 'é'.repeat(37),
      portal: 'PLATFORM',
    }).code,
    'PASSWORD_TOO_LONG'
  );

  // Password change rules
  assert.equal(
    validatePasswordChangeInput({
      currentPassword: 'Initial-password-123',
      newPassword: 'short-12345',
      confirmation: 'short-12345',
    }).code,
    'NEW_PASSWORD_TOO_SHORT'
  );
  assert.equal(
    validatePasswordChangeInput({
      currentPassword: 'Initial-password-123',
      newPassword: 'ệ'.repeat(25), // 25 * 3 UTF-8 bytes = 75 bytes (> 72) despite length 25
      confirmation: 'ệ'.repeat(25),
    }).code,
    'NEW_PASSWORD_TOO_LONG'
  );
  assert.equal(
    validatePasswordChangeInput({
      currentPassword: 'Initial-password-123',
      newPassword: 'Initial-password-123',
      confirmation: 'Initial-password-123',
    }).code,
    'NEW_PASSWORD_UNCHANGED'
  );
  assert.equal(
    validatePasswordChangeInput({
      currentPassword: 'Initial-password-123',
      newPassword: 'Changed-password-456',
      confirmation: 'Changed-password-999',
    }).code,
    'CONFIRMATION_MISMATCH'
  );
  assert.equal(
    validatePasswordChangeInput({
      currentPassword: 'Initial-password-123',
      newPassword: 'Changed-password-456',
      confirmation: 'Changed-password-456',
    }).ok,
    true
  );

  // Role mapping covers all 5 backend roles and rejects Viewer / unknown roles
  assert.equal(mapBackendRoleToUserRole('PLATFORM_ADMIN'), 'Platform Admin');
  assert.equal(mapBackendRoleToUserRole('IMPLEMENTATION_STAFF'), 'Implementation Staff');
  assert.equal(mapBackendRoleToUserRole('SME_ADMIN'), 'SME Admin');
  assert.equal(mapBackendRoleToUserRole('OPERATOR'), 'Operator');
  assert.equal(mapBackendRoleToUserRole('INVESTIGATOR'), 'Investigator');
  assert.equal(mapBackendRoleToUserRole('Viewer'), null);
  assert.equal(mapBackendRoleToUserRole('VIEWER'), null);

  // Rejects mismatched platform/workspace payloads
  const id = crypto.randomUUID();
  const enterpriseAccount = {
    accountId: id,
    loginName: 'op',
    role: 'OPERATOR',
    workspaceId: crypto.randomUUID(),
    workspaceKey: 'school-a',
    mustChangePassword: false,
  };
  assert.equal(parseSanitizedSessionAccount({ ...enterpriseAccount, workspaceId: 'school-a' }), null);
  assert.equal(parseSanitizedSessionAccount({ ...enterpriseAccount, workspaceKey: null }), null);
  assert.equal(
    parseSanitizedSessionAccount({
      accountId: id,
      loginName: 'pa',
      role: 'PLATFORM_ADMIN',
      workspaceId: null,
      workspaceKey: 'acme',
      mustChangePassword: false,
    }),
    null
  );
  assert.equal(
    parseSanitizedSessionAccount({
      accountId: id,
      loginName: 'op',
      role: 'OPERATOR',
      workspaceId: null,
      workspaceKey: null,
      mustChangePassword: false,
    }),
    null
  );
});

test('Server auth bridge enforces CSRF/SSRF protections, strips tokens from browser JSON, and handles full login -> initial-password -> session -> password -> logout lifecycle', async () => {
  const paId = crypto.randomUUID();
  const smeId = crypto.randomUUID();
  const upstream = await startContractAuthUpstream([
    {
      accountId: paId,
      loginName: 'platform-admin',
      password: 'Initial-password-123',
      role: 'PLATFORM_ADMIN',
      workspaceId: null,
      workspaceKey: null,
      enabled: true,
      mustChangePassword: true,
    },
    {
      accountId: smeId,
      loginName: 'admin.acme',
      password: 'Enterprise-password-123',
      role: 'SME_ADMIN',
      workspaceId: '550e8400-e29b-41d4-a716-446655440000',
      workspaceKey: 'acme-retail',
      enabled: true,
      mustChangePassword: false,
    },
  ]);

  try {
    const { handleAuthBridgeRequest, resolveBackendBaseUrl } = load('src/services/auth.ts');
    const env = { NODE_ENV: 'development', FRAUDGUARD_BACKEND_URL: upstream.baseUrl };

    // 1) SSRF protection: rejects credentialed or non-HTTP env URLs and ignores client headers/query
    assert.throws(
      () => resolveBackendBaseUrl({ FRAUDGUARD_BACKEND_URL: 'ftp://evil.example' }),
      /AuthServiceError|unsupported/i
    );
    assert.throws(
      () => resolveBackendBaseUrl({ FRAUDGUARD_BACKEND_URL: 'http://user:pass@localhost:8080' }),
      /AuthServiceError|unsupported/i
    );

    // 2) CSRF protection: rejects cross-site POST or missing CSRF header without hitting upstream
    const csrfBlocked = await handleAuthBridgeRequest({
      method: 'POST',
      action: 'login',
      requestUrl: 'http://localhost:3000/api/auth/login?backendUrl=http://evil.example',
      headers: makeBridgeHeaders({ csrf: false }),
      readBodyText: async () =>
        JSON.stringify({
          loginName: 'platform-admin',
          password: 'Initial-password-123',
          portal: 'PLATFORM',
        }),
      env,
    });
    assert.equal(csrfBlocked.status, 403);
    assert.equal(csrfBlocked.body.errorCode, 'CSRF_REJECTED');
    assert.equal(upstream.receivedRequests.length, 0);

    const originBlocked = await handleAuthBridgeRequest({
      method: 'POST',
      action: 'login',
      requestUrl: 'http://localhost:3000/api/auth/login',
      headers: makeBridgeHeaders({ origin: 'https://attacker.example' }),
      readBodyText: async () =>
        JSON.stringify({
          loginName: 'platform-admin',
          password: 'Initial-password-123',
          portal: 'PLATFORM',
        }),
      env,
    });
    assert.equal(originBlocked.status, 403);
    assert.equal(originBlocked.body.errorCode, 'CSRF_REJECTED');
    assert.equal(upstream.receivedRequests.length, 0);

    for (const portal of ['PLATFORM', 'ENTERPRISE']) {
      const legacyRequest = await handleAuthBridgeRequest({
        method: 'POST',
        action: 'login',
        requestUrl: 'http://localhost:3000/api/auth/login',
        headers: makeBridgeHeaders(),
        readBodyText: async () => JSON.stringify({
          loginName: 'legacy', password: 'test-password', portal,
          workspaceId: portal === 'PLATFORM' ? null : 'acme-retail',
        }),
        env,
      });
      assert.equal(legacyRequest.status, 400);
    }
    assert.equal(upstream.receivedRequests.length, 0);

    // 3) Invalid login returns 401 INVALID_CREDENTIALS with no Set-Cookie and no password echo
    const badLogin = await handleAuthBridgeRequest({
      method: 'POST',
      action: 'login',
      requestUrl: 'http://localhost:3000/api/auth/login',
      headers: makeBridgeHeaders(),
      readBodyText: async () =>
        JSON.stringify({
          loginName: 'platform-admin',
          password: 'Wrong-password-999',
          portal: 'PLATFORM',
        }),
      env,
    });
    assert.equal(badLogin.status, 401);
    assert.equal(badLogin.body.errorCode, 'INVALID_CREDENTIALS');
    assert.equal(badLogin.setCookie, undefined);
    assert.equal(JSON.stringify(badLogin.body).includes('Wrong-password-999'), false);

    // 4) Valid Platform Admin login sets HttpOnly SameSite=Strict cookie and strips accessToken from JSON
    const okLogin = await handleAuthBridgeRequest({
      method: 'POST',
      action: 'login',
      requestUrl: 'http://localhost:3000/api/auth/login?upstream=http://evil.example',
      headers: makeBridgeHeaders({
        extra: { 'x-forwarded-backend': 'http://evil.example' },
      }),
      readBodyText: async () =>
        JSON.stringify({
          loginName: 'platform-admin',
          password: 'Initial-password-123',
          portal: 'PLATFORM',
        }),
      env,
    });
    assert.equal(okLogin.status, 200);
    assert.equal('accessToken' in okLogin.body, false);
    assert.equal(JSON.stringify(okLogin.body).includes('test-signature'), false);
    assert.equal(JSON.stringify(okLogin.body).includes('Initial-password-123'), false);
    assert.equal(okLogin.body.account.role, 'PLATFORM_ADMIN');
    assert.equal(okLogin.body.account.mustChangePassword, true);
    assert.match(okLogin.setCookie, /fg_access_token=/);
    assert.match(okLogin.setCookie, /HttpOnly/);
    assert.match(okLogin.setCookie, /SameSite=Strict/);
    assert.equal(upstream.receivedRequests.at(-1).rawWorkspaceKey, null);

    const cookiePair = extractCookiePair(okLogin.setCookie);

    // 5) Ordinary /password is forbidden (403 FORBIDDEN_FLOW) while mustChangePassword=true
    const forbiddenOrdinaryPw = await handleAuthBridgeRequest({
      method: 'POST',
      action: 'password',
      requestUrl: 'http://localhost:3000/api/auth/password',
      headers: makeBridgeHeaders({ cookie: cookiePair }),
      readBodyText: async () =>
        JSON.stringify({
          currentPassword: 'Initial-password-123',
          newPassword: 'Changed-password-456',
          confirmation: 'Changed-password-456',
        }),
      env,
    });
    assert.equal(forbiddenOrdinaryPw.status, 403);
    assert.equal(forbiddenOrdinaryPw.body.errorCode, 'FORBIDDEN_FLOW');

    // 6) Wrong currentPassword on initial-password returns 401 INVALID_CURRENT_PASSWORD without clearing session cookie
    const wrongCurrentPw = await handleAuthBridgeRequest({
      method: 'POST',
      action: 'initial-password',
      requestUrl: 'http://localhost:3000/api/auth/initial-password',
      headers: makeBridgeHeaders({ cookie: cookiePair }),
      readBodyText: async () =>
        JSON.stringify({
          currentPassword: 'Wrong-current-password',
          newPassword: 'Changed-password-456',
          confirmation: 'Changed-password-456',
        }),
      env,
    });
    assert.equal(wrongCurrentPw.status, 401);
    assert.equal(wrongCurrentPw.body.errorCode, 'INVALID_CURRENT_PASSWORD');
    assert.equal(wrongCurrentPw.setCookie, undefined);

    // 7) Valid initial-password clears mustChangePassword while keeping current session active
    const completedSetup = await handleAuthBridgeRequest({
      method: 'POST',
      action: 'initial-password',
      requestUrl: 'http://localhost:3000/api/auth/initial-password',
      headers: makeBridgeHeaders({ cookie: cookiePair }),
      readBodyText: async () =>
        JSON.stringify({
          currentPassword: 'Initial-password-123',
          newPassword: 'Changed-password-456',
          confirmation: 'Changed-password-456',
        }),
      env,
    });
    assert.equal(completedSetup.status, 200);
    assert.equal(completedSetup.body.account.mustChangePassword, false);

    // 8) Session endpoint reflects live DB role & setup completion
    upstream.accountsById.get(paId).role = 'IMPLEMENTATION_STAFF';
    const sessionCheck = await handleAuthBridgeRequest({
      method: 'GET',
      action: 'session',
      requestUrl: 'http://localhost:3000/api/auth/session',
      headers: makeBridgeHeaders({ cookie: cookiePair, csrf: false, json: false }),
      readBodyText: async () => '',
      env,
    });
    assert.equal(sessionCheck.status, 200);
    assert.equal(sessionCheck.body.account.role, 'IMPLEMENTATION_STAFF');
    upstream.accountsById.get(paId).role = 'PLATFORM_ADMIN';

    // 9) Ordinary current-password change succeeds and retains session
    const rotatedPw = await handleAuthBridgeRequest({
      method: 'POST',
      action: 'password',
      requestUrl: 'http://localhost:3000/api/auth/password',
      headers: makeBridgeHeaders({ cookie: cookiePair }),
      readBodyText: async () =>
        JSON.stringify({
          currentPassword: 'Changed-password-456',
          newPassword: 'Updated-password-789',
          confirmation: 'Updated-password-789',
        }),
      env,
    });
    assert.equal(rotatedPw.status, 200);
    assert.equal(rotatedPw.body.account.mustChangePassword, false);

    // 10) Logout revokes server session and clears local cookie
    const loggedOut = await handleAuthBridgeRequest({
      method: 'POST',
      action: 'logout',
      requestUrl: 'http://localhost:3000/api/auth/logout',
      headers: makeBridgeHeaders({ cookie: cookiePair, json: false }),
      readBodyText: async () => '',
      env,
    });
    assert.equal(loggedOut.status, 200);
    assert.equal(loggedOut.body.localCleared, true);
    assert.equal(loggedOut.body.serverRevoked, true);
    assert.equal(loggedOut.body.reason, 'REVOKED');
    assert.match(loggedOut.setCookie, /Max-Age=0/);

    // Subsequent session or password request with the revoked token returns 401 SESSION_EXPIRED and clears cookie
    const afterRevokeSession = await handleAuthBridgeRequest({
      method: 'GET',
      action: 'session',
      requestUrl: 'http://localhost:3000/api/auth/session',
      headers: makeBridgeHeaders({ cookie: cookiePair, csrf: false, json: false }),
      readBodyText: async () => '',
      env,
    });
    assert.equal(afterRevokeSession.status, 401);
    assert.equal(afterRevokeSession.body.errorCode, 'SESSION_EXPIRED');
    assert.match(afterRevokeSession.setCookie, /Max-Age=0/);

    const afterRevokePw = await handleAuthBridgeRequest({
      method: 'POST',
      action: 'password',
      requestUrl: 'http://localhost:3000/api/auth/password',
      headers: makeBridgeHeaders({ cookie: cookiePair }),
      readBodyText: async () =>
        JSON.stringify({
          currentPassword: 'Updated-password-789',
          newPassword: 'Another-password-000',
          confirmation: 'Another-password-000',
        }),
      env,
    });
    assert.equal(afterRevokePw.status, 401);
    assert.equal(afterRevokePw.body.errorCode, 'SESSION_EXPIRED');
    assert.match(afterRevokePw.setCookie, /Max-Age=0/);

    // 11) Enterprise login sends exact workspaceKey and rejects wrong workspaceKey
    const wrongWs = await handleAuthBridgeRequest({
      method: 'POST',
      action: 'login',
      requestUrl: 'http://localhost:3000/api/auth/login',
      headers: makeBridgeHeaders({ origin: "http://wrong-tenant.localhost:3000", extra: { host: "wrong-tenant.localhost:3000" } }),
      readBodyText: async () =>
        JSON.stringify({
          loginName: 'admin.acme',
          password: 'Enterprise-password-123',
          portal: 'ENTERPRISE',
        }),
      env,
    });
    assert.equal(wrongWs.status, 401);

    const okEnt = await handleAuthBridgeRequest({
      method: 'POST',
      action: 'login',
      requestUrl: 'http://localhost:3000/api/auth/login',
      headers: makeBridgeHeaders({ origin: "http://acme-retail.localhost:3000", extra: { host: "acme-retail.localhost:3000" } }),
      readBodyText: async () =>
        JSON.stringify({
          loginName: 'admin.acme',
          password: 'Enterprise-password-123',
          portal: 'ENTERPRISE',
        }),
      env,
    });
    assert.equal(okEnt.status, 200);
    assert.equal(okEnt.body.account.role, 'SME_ADMIN');
    assert.equal(okEnt.body.account.workspaceId, '550e8400-e29b-41d4-a716-446655440000');
    assert.equal(okEnt.body.account.workspaceKey, 'acme-retail');
  } finally {
    await upstream.close();
  }
});

test('Failed logout and backend unavailability never fabricate success or fall back to demo data', async () => {
  const { handleAuthBridgeRequest, resolveServerSessionFromToken } = load('src/services/auth.ts');
  const unreachableEnv = {
    NODE_ENV: 'development',
    FRAUDGUARD_BACKEND_URL: 'http://127.0.0.1:1',
  };
  const expiredToken = makeUnsignedTestJwt(
    crypto.randomUUID(),
    crypto.randomUUID(),
    Math.floor(Date.now() / 1000) - 60
  );

  // Unauthenticated direct protected-page resolution -> unauthenticated
  const noCookieRes = await resolveServerSessionFromToken(null, { env: unreachableEnv });
  assert.equal(noCookieRes.status, 'unauthenticated');

  // Unreachable backend on protected page -> backend_unavailable (never demo fallback)
  const downRes = await resolveServerSessionFromToken(expiredToken, { env: unreachableEnv });
  assert.equal(downRes.status, 'backend_unavailable');

  // Unreachable backend on logout still clears local cookie while reporting serverRevoked: false
  const unreachableLogout = await handleAuthBridgeRequest({
    method: 'POST',
    action: 'logout',
    requestUrl: 'http://localhost:3000/api/auth/logout',
    headers: makeBridgeHeaders({ cookie: `fg_access_token=${expiredToken}`, json: false }),
    readBodyText: async () => '',
    env: unreachableEnv,
  });
  assert.equal(unreachableLogout.status, 200);
  assert.equal(unreachableLogout.body.localCleared, true);
  assert.equal(unreachableLogout.body.serverRevoked, false);
  assert.equal(unreachableLogout.body.reason, 'BACKEND_UNAVAILABLE');
  assert.match(unreachableLogout.setCookie, /Max-Age=0/);

  // Expired token against reachable upstream returns 401 upstream -> serverRevoked: false, reason: TOKEN_EXPIRED_OR_INVALID
  const upstream = await startContractAuthUpstream([]);
  try {
    const expiredLogout = await handleAuthBridgeRequest({
      method: 'POST',
      action: 'logout',
      requestUrl: 'http://localhost:3000/api/auth/logout',
      headers: makeBridgeHeaders({ cookie: `fg_access_token=${expiredToken}`, json: false }),
      readBodyText: async () => '',
      env: { NODE_ENV: 'development', FRAUDGUARD_BACKEND_URL: upstream.baseUrl },
    });
    assert.equal(expiredLogout.body.localCleared, true);
    assert.equal(expiredLogout.body.serverRevoked, false);
    assert.equal(expiredLogout.body.reason, 'TOKEN_EXPIRED_OR_INVALID');
    assert.match(expiredLogout.setCookie, /Max-Age=0/);
  } finally {
    await upstream.close();
  }
});

test('Authenticated entry points are disconnected from demo fixtures/role switching and render truthful VI/EN states', async () => {
  // 1) Static boundary verification: entry points and auth modules must not import demo data or FraudGuardDashboard
  const authFiles = [
    'src/app/page.tsx',
    'src/app/login/page.tsx',
    'src/app/platform/login/page.tsx',
    'src/app/fraud-monitoring/page.tsx',
    'src/app/api/auth/[action]/route.ts',
    'src/components/auth/LoginPage.tsx',
    'src/components/auth/AuthenticatedWorkspace.tsx',
    'src/services/auth.ts',
    'src/utils/auth.ts',
    'src/types/auth.ts',
  ];
  for (const rel of authFiles) {
    const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.doesNotMatch(source, /src\/data|@\/data|\.\.\/data|FraudGuardDashboard|workspace-storage|RoleSwitcher/);
    assert.equal(source.includes('\u2014'), false, `Em dash found in ${rel}`);
  }
  assert.equal(
    fs.existsSync(path.join(ROOT, 'src/components/fraudguard-dashboard/RoleSwitcher.tsx')),
    false
  );
  assert.equal(fs.existsSync(path.join(ROOT, 'src/services/.gitkeep')), false);

  // Verify route entry points fix portal strictly from route regardless of query params
  const enterpriseRouteMod = load('src/app/login/page.tsx');
  const platformRouteMod = load('src/app/platform/login/page.tsx');
  const entElement = await enterpriseRouteMod.default({
    searchParams: Promise.resolve({
      reason: 'signed_out',
      portal: 'PLATFORM',
      workspaceKey: 'ignored',
    }),
  });
  assert.equal(entElement.props.portal, 'ENTERPRISE');
  assert.equal(entElement.props.initialReason, 'signed_out');

  const platElement = await platformRouteMod.default({
    searchParams: Promise.resolve({
      reason: 'session_expired',
      portal: 'ENTERPRISE',
      workspaceKey: 'acme-retail',
    }),
  });
  assert.equal(platElement.props.portal, 'PLATFORM');
  assert.equal(platElement.props.initialReason, 'session_expired');

  // 2) Render Enterprise (/login) and Platform (/platform/login) in VI and EN: no portal selector, exact field sets and order
  for (const lang of ['vi', 'en']) {
    const uiImports = {
      ...createUiImports(lang),
      'next/navigation': {
        useRouter: () => ({ push() {}, replace() {} }),
      },
    };
    const { LoginPageContent } = load('src/components/auth/LoginPage.tsx', uiImports);
    const { translations } = load('src/config/translations.ts');
    const copy = translations[lang];

    const enterpriseHtml = renderToStaticMarkup(
      React.createElement(LoginPageContent, {
        portal: 'ENTERPRISE',
        initialReason: 'auth_required',
        skipInitialSessionCheck: true,
      })
    );
    assert.ok(enterpriseHtml.includes(copy.auth.login.enterpriseHeading));
    assert.ok(enterpriseHtml.includes('href="/login"'));
    const idIdx = enterpriseHtml.indexOf('id="login-identifier"');
    const wsIdx = enterpriseHtml.indexOf('id="login-workspace"');
    const pwIdx = enterpriseHtml.indexOf('id="login-password"');
    assert.ok(idIdx > 0 && pwIdx > idIdx);
    assert.equal(wsIdx, -1);
    assert.doesNotMatch(
      enterpriseHtml,
      /login-portal-label|Cổng truy cập|Access portal|Google|admin@fraudguard\.io|SecurityEnterprise|Save email|Dùng tài khoản mẫu|Fill demo/
    );

    const platformHtml = renderToStaticMarkup(
      React.createElement(LoginPageContent, {
        portal: 'PLATFORM',
        initialReason: 'session_expired',
        skipInitialSessionCheck: true,
      })
    );
    assert.ok(platformHtml.includes(copy.auth.login.platformHeading));
    assert.ok(platformHtml.includes('href="/platform/login"'));
    assert.match(platformHtml, /id="login-identifier"[^>]*type="text"/);
    assert.match(platformHtml, /id="login-password"/);
    assert.equal(platformHtml.includes('id="login-workspace"'), false);
    assert.doesNotMatch(
      platformHtml,
      /login-portal-label|Cổng truy cập|Access portal|Google|admin@fraudguard\.io|SecurityEnterprise|Save email/
    );

    // 3) Render AuthenticatedWorkspaceContent across mandatory setup, backend unavailable, Platform Admin, and Enterprise SME Admin
    const { AuthenticatedWorkspaceContent } = load(
      'src/components/auth/AuthenticatedWorkspace.tsx',
      uiImports
    );

    const setupHtml = renderToStaticMarkup(
      React.createElement(AuthenticatedWorkspaceContent, {
        initialState: {
          status: 'authenticated',
          session: {
            account: {
              accountId: '11111111-1111-4111-8111-111111111111',
              loginName: 'bootstrap.admin',
              role: 'PLATFORM_ADMIN',
              workspaceId: null,
              workspaceKey: null,
              mustChangePassword: true,
            },
            displayRole: 'Platform Admin',
            expiresAt: '2026-11-24T10:00:00.000Z',
          },
        },
      })
    );
    assert.ok(setupHtml.includes(copy.auth.password.initialTitle));
    assert.ok(setupHtml.includes('bootstrap.admin'));
    // Business sidebar navigation must NOT appear while mustChangePassword is true
    assert.equal(setupHtml.includes(copy.nav.items.platformHealth), false);

    const unavailableHtml = renderToStaticMarkup(
      React.createElement(AuthenticatedWorkspaceContent, {
        initialState: { status: 'backend_unavailable' },
      })
    );
    assert.ok(unavailableHtml.includes(copy.auth.workspace.unavailableTitle));
    assert.doesNotMatch(unavailableHtml, /TechPay|ABC Fashion|Campus PowerGrid/);

    const smeReadyHtml = renderToStaticMarkup(
      React.createElement(AuthenticatedWorkspaceContent, {
        initialState: {
          status: 'authenticated',
          session: {
            account: {
              accountId: '22222222-2222-4222-8222-222222222222',
              loginName: 'sme.owner',
              role: 'SME_ADMIN',
              workspaceId: '550e8400-e29b-41d4-a716-446655440000',
              workspaceKey: 'acme-vn',
              mustChangePassword: false,
            },
            displayRole: 'SME Admin',
            expiresAt: '2026-11-24T10:15:00.000Z',
          },
        },
      })
    );
    assert.ok(smeReadyHtml.includes('sme.owner'));
    assert.ok(smeReadyHtml.includes('acme-vn'));
    assert.ok(smeReadyHtml.includes(copy.userMenu.changePassword));
    assert.match(
      smeReadyHtml,
      /^<div class="root"[^>]*><aside class="sidebar\b[\s\S]*<\/aside><div class="workspace">/
    );
    assert.equal(smeReadyHtml.includes('Switch demo account'), false);
    assert.equal(smeReadyHtml.includes('Chuyển tài khoản demo'), false);
    assert.doesNotMatch(smeReadyHtml, /user@fraudguard\.io|TechPay|ABC Fashion/);
  }
});

test('Late responses from a previous session are discarded after logout and never restore previous account state', async () => {
  let stateSlots = [];
  let refSlots = [];
  let stateCursor = 0;
  let refCursor = 0;
  const replacedUrls = [];

  let resolveDelayedSession;
  const delayedSessionPromise = new Promise((resolve) => {
    resolveDelayedSession = resolve;
  });

  const customReact = {
    ...React,
    useState(init) {
      const idx = stateCursor++;
      if (!(idx in stateSlots)) {
        stateSlots[idx] = typeof init === 'function' ? init() : init;
      }
      return [
        stateSlots[idx],
        (next) => {
          stateSlots[idx] = typeof next === 'function' ? next(stateSlots[idx]) : next;
        },
      ];
    },
    useRef(init) {
      const idx = refCursor++;
      if (!(idx in refSlots)) {
        refSlots[idx] = { current: init };
      }
      return refSlots[idx];
    },
    useEffect() {},
    useMemo(fn) {
      return fn();
    },
    useCallback(fn) {
      return fn;
    },
  };

  const { translations } = load('src/config/translations.ts');
  const { AuthenticatedWorkspaceContent } = load(
    'src/components/auth/AuthenticatedWorkspace.tsx',
    {
      react: customReact,
      'next/navigation': {
        useRouter: () => ({
          push(url) {
            replacedUrls.push(url);
          },
          replace(url) {
            replacedUrls.push(url);
          },
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
      '@/services/auth': {
        AuthServiceError: class AuthServiceError extends Error {},
        fetchCurrentSession: () => delayedSessionPromise,
        logoutCurrentSession: async () => ({
          localCleared: true,
          serverRevoked: true,
          reason: 'REVOKED',
        }),
        submitInitialPassword: async () => {
          throw new Error('not called');
        },
        changeCurrentPassword: async () => {
          throw new Error('not called');
        },
      },
    }
  );

  function renderTree() {
    stateCursor = 0;
    refCursor = 0;
    return AuthenticatedWorkspaceContent({
      initialState: {
        status: 'authenticated',
        session: {
          account: {
            accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            loginName: 'previous.operator',
            role: 'OPERATOR',
            workspaceId: '550e8400-e29b-41d4-a716-446655440000',
            workspaceKey: 'tenant-one',
            mustChangePassword: false,
          },
          displayRole: 'Operator',
          expiresAt: '2026-12-01T00:00:00.000Z',
        },
      },
    });
  }

  function collectButtons(node, out = []) {
    if (!node) return out;
    if (Array.isArray(node)) {
      for (const child of node) collectButtons(child, out);
      return out;
    }
    if (typeof node === 'object') {
      if (node.type === 'button') out.push(node);
      if (node.props?.children) collectButtons(node.props.children, out);
    }
    return out;
  }

  let tree = renderTree();
  const initialButtons = collectButtons(tree);
  const verifyBtn = initialButtons.find((b) =>
    JSON.stringify(b.props.children).includes('Verify active session')
  );
  const logoutBtn = initialButtons.find((b) =>
    JSON.stringify(b.props.children).includes('Sign out of session')
  );
  assert.ok(verifyBtn && logoutBtn);

  // Start slow session refresh for previous.operator, then log out before it resolves
  verifyBtn.props.onClick();
  await logoutBtn.props.onClick();
  assert.deepEqual(replacedUrls, ['/login?reason=signed_out']);

  // Now resolve the stale previous-account response after logout completed
  resolveDelayedSession({
    account: {
      accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      loginName: 'previous.operator',
      role: 'OPERATOR',
      workspaceId: '550e8400-e29b-41d4-a716-446655440000',
      workspaceKey: 'tenant-one',
      mustChangePassword: false,
    },
    displayRole: 'Operator',
    expiresAt: '2026-12-01T00:00:00.000Z',
  });
  await delayedSessionPromise;
  await new Promise((resolve) => setImmediate(resolve));

  const afterHtml = renderToStaticMarkup(renderTree());
  assert.equal(afterHtml.includes('previous.operator'), false);
  assert.equal(afterHtml.includes('tenant-one'), false);
});

test('Split login forms send independent payloads and portal-aware logout/expiry redirects return to /platform/login vs /login', async () => {
  const { resolvePortalForRole, buildLoginRedirectPath } = load('src/utils/auth.ts');
  assert.equal(resolvePortalForRole('PLATFORM_ADMIN'), 'PLATFORM');
  assert.equal(resolvePortalForRole('IMPLEMENTATION_STAFF'), 'PLATFORM');
  assert.equal(resolvePortalForRole('Platform Admin'), 'PLATFORM');
  assert.equal(resolvePortalForRole('Implementation Staff'), 'PLATFORM');
  assert.equal(resolvePortalForRole('SME_ADMIN'), 'ENTERPRISE');
  assert.equal(resolvePortalForRole('OPERATOR'), 'ENTERPRISE');
  assert.equal(resolvePortalForRole('INVESTIGATOR'), 'ENTERPRISE');
  assert.equal(resolvePortalForRole(null), null);
  assert.equal(buildLoginRedirectPath('PLATFORM', 'signed_out'), '/platform/login?reason=signed_out');
  assert.equal(buildLoginRedirectPath('ENTERPRISE', 'session_expired'), '/login?reason=session_expired');
  assert.equal(buildLoginRedirectPath(null, 'auth_required'), '/login?reason=auth_required');

  // 1) Independent form submission payloads on /login (ENTERPRISE) vs /platform/login (PLATFORM)
  const sentPayloads = [];
  const { translations } = load('src/config/translations.ts');

  function makeStatefulHarness() {
    const states = [];
    const refs = [];
    let sIdx = 0;
    let rIdx = 0;
    const mockReact = {
      ...React,
      useState(init) {
        const i = sIdx++;
        if (!(i in states)) states[i] = typeof init === 'function' ? init() : init;
        return [
          states[i],
          (next) => {
            states[i] = typeof next === 'function' ? next(states[i]) : next;
          },
        ];
      },
      useRef(init) {
        const i = rIdx++;
        if (!(i in refs)) refs[i] = { current: init };
        return refs[i];
      },
      useEffect() {},
      useMemo(fn) {
        return fn();
      },
      useCallback(fn) {
        return fn;
      },
    };
    return {
      mockReact,
      resetCursors() {
        sIdx = 0;
        rIdx = 0;
      },
    };
  }

  function findNodes(node, pred, out = []) {
    if (!node) return out;
    if (Array.isArray(node)) {
      for (const c of node) findNodes(c, pred, out);
      return out;
    }
    if (typeof node === 'object') {
      if (pred(node)) out.push(node);
      if (node.props?.children) findNodes(node.props.children, pred, out);
    }
    return out;
  }

  // Tab A: Enterprise /login
  const entHarness = makeStatefulHarness();
  const entNav = [];
  const { LoginPageContent: EntLogin } = load('src/components/auth/LoginPage.tsx', {
    react: entHarness.mockReact,
    'next/navigation': { useRouter: () => ({ replace: (u) => entNav.push(u), push: (u) => entNav.push(u) }) },
    '@/context/LanguageContext': {
      LanguageProvider: ({ children }) => children,
      useLanguage: () => ({ language: 'vi', t: translations.vi, toggleLanguage() {} }),
    },
    '@/context/ToastProvider': { ToastProvider: ({ children }) => children },
    '@/services/auth': {
      AuthServiceError: class extends Error {},
      fetchCurrentSession: async () => {
        throw new Error('none');
      },
      logoutCurrentSession: async () => ({ localCleared: true, serverRevoked: false, reason: 'NO_ACTIVE_TOKEN' }),
      loginWithCredentials: async (payload) => {
        sentPayloads.push(payload);
        return { account: {}, displayRole: 'SME Admin' };
      },
    },
  });

  // Tab B: Platform /platform/login open concurrently
  const platHarness = makeStatefulHarness();
  const platNav = [];
  const { LoginPageContent: PlatLogin } = load('src/components/auth/LoginPage.tsx', {
    react: platHarness.mockReact,
    'next/navigation': { useRouter: () => ({ replace: (u) => platNav.push(u), push: (u) => platNav.push(u) }) },
    '@/context/LanguageContext': {
      LanguageProvider: ({ children }) => children,
      useLanguage: () => ({ language: 'vi', t: translations.vi, toggleLanguage() {} }),
    },
    '@/context/ToastProvider': { ToastProvider: ({ children }) => children },
    '@/services/auth': {
      AuthServiceError: class extends Error {},
      fetchCurrentSession: async () => {
        throw new Error('none');
      },
      logoutCurrentSession: async () => ({ localCleared: true, serverRevoked: false, reason: 'NO_ACTIVE_TOKEN' }),
      loginWithCredentials: async (payload) => {
        sentPayloads.push(payload);
        return { account: {}, displayRole: 'Platform Admin' };
      },
    },
  });

  // Fill Enterprise form in Tab A
  entHarness.resetCursors();
  let entTree = EntLogin({ portal: 'ENTERPRISE', skipInitialSessionCheck: true });
  const entInputs = findNodes(entTree, (n) => n.type === 'input');
  assert.equal(entInputs.length, 2);
  entInputs.find((n) => n.props.name === 'loginName').props.onChange({ target: { value: ' sme.operator ' } });
  entInputs.find((n) => n.props.name === 'password').props.onChange({ target: { value: 'EnterprisePass123' } });

  // Fill Platform form in Tab B (confirm only 2 inputs, no workspaceKey)
  platHarness.resetCursors();
  let platTree = PlatLogin({ portal: 'PLATFORM', skipInitialSessionCheck: true });
  const platInputs = findNodes(platTree, (n) => n.type === 'input');
  assert.equal(platInputs.length, 2);
  platInputs.find((n) => n.props.name === 'loginName').props.onChange({ target: { value: ' platform.admin ' } });
  platInputs.find((n) => n.props.name === 'password').props.onChange({ target: { value: 'PlatformPass123' } });

  // Re-render and submit Enterprise first, then Platform
  entHarness.resetCursors();
  entTree = EntLogin({ portal: 'ENTERPRISE', skipInitialSessionCheck: true });
  await findNodes(entTree, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });

  platHarness.resetCursors();
  platTree = PlatLogin({ portal: 'PLATFORM', skipInitialSessionCheck: true });
  await findNodes(platTree, (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });

  assert.deepEqual(sentPayloads, [
    {
      loginName: 'sme.operator',
      password: 'EnterprisePass123',
      portal: 'ENTERPRISE',
    },
    {
      loginName: 'platform.admin',
      password: 'PlatformPass123',
      portal: 'PLATFORM',
    },
  ]);
  assert.deepEqual(entNav, ['/fraud-monitoring']);
  assert.deepEqual(platNav, ['/fraud-monitoring']);

  // 2) Platform logout (including during mandatory initial password setup) and Platform expiry redirect to /platform/login
  const AuthErr = class AuthServiceError extends Error {
    constructor(code) {
      super(code);
      this.code = code;
    }
  };

  async function runWorkspaceScenario(initialState, action) {
    const h = makeStatefulHarness();
    const redirects = [];
    const { AuthenticatedWorkspaceContent } = load(
      'src/components/auth/AuthenticatedWorkspace.tsx',
      {
        react: h.mockReact,
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
        '@/services/auth': {
          AuthServiceError: AuthErr,
          fetchCurrentSession: async () => {
            throw new AuthErr('SESSION_EXPIRED');
          },
          logoutCurrentSession: async () => ({
            localCleared: true,
            serverRevoked: true,
            reason: 'REVOKED',
          }),
          submitInitialPassword: async () => {
            throw new AuthErr('SESSION_EXPIRED');
          },
          changeCurrentPassword: async () => {
            throw new AuthErr('SESSION_EXPIRED');
          },
        },
      }
    );
    h.resetCursors();
    const tree = AuthenticatedWorkspaceContent({ initialState });
    await action(tree, findNodes);
    await new Promise((r) => setImmediate(r));
    return redirects;
  }

  // Platform Admin on mandatory initial password setup -> Sign out -> /platform/login?reason=signed_out
  const platSetupLogout = await runWorkspaceScenario(
    {
      status: 'authenticated',
      session: {
        account: {
          accountId: '11111111-1111-4111-8111-111111111111',
          loginName: 'platform.setup',
          role: 'PLATFORM_ADMIN',
          workspaceId: null,
          workspaceKey: null,
          mustChangePassword: true,
        },
        displayRole: 'Platform Admin',
        expiresAt: '2026-12-01T00:00:00.000Z',
      },
    },
    async (tree, find) => {
      const signOutBtn = find(tree, (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Sign out'))[0];
      assert.ok(signOutBtn);
      await signOutBtn.props.onClick();
    }
  );
  assert.deepEqual(platSetupLogout, ['/platform/login?reason=signed_out']);

  // Implementation Staff ready session -> session expires on Verify -> /platform/login?reason=session_expired
  const staffExpired = await runWorkspaceScenario(
    {
      status: 'authenticated',
      session: {
        account: {
          accountId: '33333333-3333-4333-8333-333333333333',
          loginName: 'impl.staff',
          role: 'IMPLEMENTATION_STAFF',
          workspaceId: null,
          workspaceKey: null,
          mustChangePassword: false,
        },
        displayRole: 'Implementation Staff',
        expiresAt: '2026-12-01T00:00:00.000Z',
      },
    },
    async (tree, find) => {
      const verifyBtn = find(tree, (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Verify active session'))[0];
      assert.ok(verifyBtn);
      verifyBtn.props.onClick();
    }
  );
  assert.deepEqual(staffExpired, ['/platform/login?reason=session_expired']);

  // Generic backend_unavailable with unknown portal -> Clear local session -> /login?reason=signed_out
  const unknownUnavailableLogout = await runWorkspaceScenario(
    { status: 'backend_unavailable' },
    async (tree, find) => {
      const clearBtn = find(tree, (n) => n.type === 'button' && JSON.stringify(n.props.children).includes('Clear browser session'))[0];
      assert.ok(clearBtn);
      await clearBtn.props.onClick();
    }
  );
  assert.deepEqual(unknownUnavailableLogout, ['/login?reason=signed_out']);
});
