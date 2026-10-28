# FraudGuard Frontend

Two independent Next.js applications. Run commands inside each application directory.

| Application | Directory | Local URL |
| --- | --- | --- |
| Dashboard | LCS | http://localhost:3000 |
| Landing page | LCS_landingpage | http://localhost:3001 |

## Requirements

Node.js 22.13 or newer within the 22 LTS series, and npm. Install dependencies from the committed lockfiles with `npm ci`.

## Development

Terminal 1 (from the repository root):

```powershell
cd frontend/LCS
npm ci
npm run dev
```

Terminal 2 (from the repository root):

```powershell
cd frontend/LCS_landingpage
npm ci
npm run dev
```

The landing page opens the dashboard at http://localhost:3000/fraud-monitoring by default.
For a deployed dashboard, set `NEXT_PUBLIC_FRAUDGUARD_DASHBOARD_URL` in the landing application's `.env.local` before building. Do not commit local environment files.

## Validation

Dashboard:

```powershell
cd frontend/LCS
node --test tests/rule-sandbox.test.cjs
npm run build
```

Landing page:

```powershell
cd frontend/LCS_landingpage
npm run build
```

Run `npm start` in each application after a successful build for production-mode serving. The dashboard build downloads the Inter font from Google Fonts and requires network access.

## Import scope

This initial import contains the current source snapshot, including local changes from the original projects. Previous personal-repository commit history is not imported. Dependency directories, build caches, local agent tooling and secrets are excluded. Each application retains its own package.json and package-lock.json.

