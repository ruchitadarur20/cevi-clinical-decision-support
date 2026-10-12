# CEVI portfolio demo (browser-only)

A static, backend-free build of the CEVI frontend for sharing with recruiters and interviewers. It runs entirely
in the visitor's browser, needs no database, Docker, Python service or API keys, and deploys to Cloudflare Pages
Free. The full-stack application is unchanged: the demo is a separate build mode of the same React code.

## What the visitor gets

| Area | Demo behaviour | Label |
|---|---|---|
| Overview | KPIs, activity charts with 7/14/30/90-day windows, recent analyses and activity, **About This Demo** | Portfolio Demo |
| Patients / Records / Imaging | Browse, search, filter, open profiles; create and edit records with revision history; select a PNG/JPEG for a local preview | Synthetic Data · Browser-only |
| AI Analysis | Pick patient and image, inspect preprocessing, model card and inference workflow; view results **recorded** by the real service | Recorded result |
| History / Analytics | Recorded analyses with model metadata, latency (p50/p95) and volume trends; no accuracy metrics | Recorded result |
| Users & Roles | Switch simulated role (clinician / researcher / administrator); permission matrix; manage demo users | Browser-only |
| Settings | Theme, simulated role, application info, **Reset demo** | — |

Only the following need the full application: live EfficientNet-B0 inference, MySQL persistence, JWT sign-in,
server-side image storage and validation. The demo says so where it matters ("Run live inference" is disabled).

## How it works

* `VITE_DEMO_MODE=true` (set by `.env.demo` / `--mode demo`) makes `frontend/src/lib/api.ts` route every request to
  `frontend/src/demo/server.ts` instead of `fetch`. That module re-implements the API's routes, envelopes, role
  checks and validation messages, so pages and hooks are shared with the real app. When the flag is off Vite
  removes the branch: the normal build contains no demo code, data or images.
* **Data** is a snapshot exported from the running full application (30 synthetic patients, 107 records, 20
  procedurally generated phantom images, 4 users, 17 analyses) into `src/demo/data/seed.json`; images are in
  `demo-public/demo/images/`. Relationships (patient ↔ records ↔ images ↔ analyses) are those of the original database.
* **Recorded analyses** are the real outputs of the FastAPI/EfficientNet-B0 service (torchvision ImageNet weights)
  from that export. No inference was re-run to build the demo, and none runs in the browser. The weights are
  general-purpose ImageNet weights; labels such as "spotlight" are not medical findings. No accuracy or clinical
  performance figure is shown anywhere because none was measured.
* **Browser-only state** (new/edited records, patients, local images, users, role) lives in `localStorage`
  (`cevi-demo-state`, `cevi-demo-session`). Local images persist only as a ≤256 px thumbnail; the original file is
  never stored or uploaded. A corrupt or missing save falls back to the bundled dataset. *Reset demo* clears it.
* Charts are anchored to the dataset's last recorded day so they never go blank as time passes.

## Build and preview

```bash
cd frontend
npm install
npm run build:demo        # tsc + vite build --mode demo + scripts/verify-demo-build.mjs → dist-demo/
npm run preview:demo      # http://127.0.0.1:4180
npm run dev:demo          # hot-reload development of the demo
npm run build             # unchanged full-stack build → dist/
```

`verify-demo-build.mjs` fails the build if the output contains loopback addresses, backend/credential markers,
the local seed password or backend files, or if the CSP hash no longer matches the inline theme script.

## Configure the two call-to-action buttons

"Request Full Demo" and "View Source Code" render **disabled** until you supply real targets (no contact or
repository URL is invented). Set at build time, either as Cloudflare Pages environment variables or in a
git-ignored `frontend/.env.demo.local`:

```
VITE_DEMO_CONTACT_URL=mailto:you@example.com        # or a LinkedIn / scheduling URL
VITE_DEMO_REPO_URL=https://github.com/<owner>/<repo>
```

These values are public by design (they end up in the JavaScript bundle).

## Cloudflare Pages (Free)

| Setting | Value |
|---|---|
| Framework preset | None (Vite) |
| Root directory | `frontend` |
| Build command | `npm ci && npm run build:demo` |
| Build output directory | `dist-demo` |
| Node version | 20 (`frontend/.node-version`; or env `NODE_VERSION=20`) |
| Environment variables | optional `VITE_DEMO_CONTACT_URL`, `VITE_DEMO_REPO_URL` |

`demo-public/_redirects` provides SPA routing (`/* → /index.html 200`) and `demo-public/_headers` sets a strict
CSP (`default-src 'self'`, no remote origins), `X-Content-Type-Options`, `X-Frame-Options: DENY`,
`Referrer-Policy`, `Permissions-Policy`, HSTS and long-lived caching for hashed assets. The site must be served
from the domain root (the router has no base path).

Direct upload alternative: `npm run build:demo`, then `npx wrangler pages deploy dist-demo` (requires your
Cloudflare login; not run here).

## Publishing checklist

1. Decide the contact and repository links and set them (above).
2. The project folder already has its own empty git repository (no commits). Review `git status` – ignored:
   `node_modules`, `dist*`, `.env`, `.local/`, `storage/`, `.venv/`. Commit when ready.
3. Create a **new, empty** repository on GitHub, add it as `origin`, push.
4. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the repository → use the table above.
5. Open the `*.pages.dev` URL, click through Overview → Patients → AI Analysis → Settings → Reset demo.

## Limitations

* Not clinically validated; no regulatory or HIPAA claim. Synthetic data only.
* Visitors cannot run inference; they see recorded results. Images selected locally get a preprocessing
  preview computed with the browser's canvas resampler (an approximation of the service's bicubic resize).
* Dates reflect when the dataset was exported (October 2026); relative times will age.
* Browser-only changes are per browser profile; clearing site data resets them.
* The simulated role switch is not authentication.
