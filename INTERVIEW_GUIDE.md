# CEVI — Interview Guide

## 1. Design decisions (and honest trade-offs)

**Why React + TypeScript?** The UI is dense with forms, tables and role-dependent views. TypeScript lets the
API's response shapes (`lib/types.ts`) flow into components, so a renamed field is a compile error rather than a
blank cell. React + TanStack Query gives caching, invalidation and loading/error states without bespoke plumbing.

**Why Node.js for the API?** One language across API and UI, strong async I/O for a service whose job is
*coordination* (DB, disk, an HTTP call to ML). CPU-heavy work deliberately lives elsewhere (Python).

**Why Prisma?** Typed queries generated from one schema, reviewable SQL migrations, and relation includes that map
cleanly to the API's nested responses. Trade-off: raw SQL is still needed for exotic reporting; I aggregate in JS
on bounded windows instead.

**Why a separate Python service?** PyTorch lives in Python; isolating it means the API stays light, the model can
scale/restart independently, and the contract is a small HTTP interface (`/health`, `/model`, `/preprocess`,
`/infer`).

## 2. How the five entities relate

`User` registers `Patient`s and authors `ClinicalRecord`s; a `Patient` has many `ClinicalRecord`s and
`MedicalImage`s; a `MedicalImage` has many `AnalysisResult`s, each pointing at the requesting `User`. Edits to a
record create `ClinicalRecordRevision` rows in the same transaction, so history is immutable. Foreign keys are
`Restrict`: clinical data is never cascaded away. Images store **metadata** in MySQL and bytes behind a
`StorageProvider` (local disk now, S3 later).

## 3. How authorization works

1. `authenticate` verifies the JWT and **re-reads the user from MySQL** — deactivation is instant and the token's
   role claim is not trusted.
2. `requirePermission('patients:write')` checks a central permission table (`lib/permissions.ts`).
3. Serializers apply data-level rules: researchers get anonymized patients and cannot search by name.
4. The frontend hides what a role can't do, but that is UX only — tests assert the API returns 403 regardless.

## 4. How frontend and backend communicate

Same-origin `/api` (Vite proxy in dev), httpOnly cookie auth, a typed `fetch` wrapper that normalises errors into
`ApiError` (with per-field messages from Zod 422s), and TanStack Query hooks. Mutations invalidate exactly the
query families they affect (e.g. creating a record invalidates records, patient detail, dashboard, analytics).

## 5. How the ML service is integrated

`MlClient` interface → `HttpMlClient` (fetch + `AbortController` timeout). The API reads the stored bytes, posts
multipart to `/infer`, and persists the response. Failure modes map to explicit states: unreachable/timeout →
`FAILED`; weights missing → `UNAVAILABLE` (no predictions); invalid image → 422 at the API before ML is called.
Tests inject a fake `MlClient`, so the API is tested without PyTorch.

## 6. EfficientNet-B0 preprocessing

Decode → RGB (alpha onto white; 16-bit scaled) → resize shorter side to 256 (bicubic) → centre-crop 224 → /255 →
normalise with ImageNet mean `(0.485, 0.456, 0.406)` and std `(0.229, 0.224, 0.225)` → `(1,3,224,224)` float32.
These match the torchvision weights' training transforms; using different statistics would silently degrade
outputs. Unit tests assert shapes, aspect handling and exact normalised values.

## 7. How failures are handled

| Failure | Behaviour |
|---|---|
| Spoofed/truncated/oversize upload | 415 / 422 / 413 with a specific code; nothing stored |
| ML down or slow | analysis recorded `FAILED`, image remains reusable, UI shows reason |
| Weights unavailable | `UNAVAILABLE`, no predictions fabricated |
| DB down | `/api/health` → 503 `down` |
| Unexpected exception | generic 500, details only in server logs (no bodies/PII logged) |
| Abuse | rate limits on login and analysis; request timeouts |

## 8. How this could scale

Stateless API behind a load balancer; move uploads to object storage; replace the synchronous analysis call with a
queue + worker pool and push status to the UI; run ML replicas (CPU/GPU) behind the same HTTP contract; add read
replicas and pre-aggregated analytics tables; cache dashboard queries.

## 9. What this prototype does **not** validate

* No clinical validity: ImageNet weights recognise everyday objects, not pathology.
* No performance claims: no sensitivity/specificity/AUC — none were measured.
* No regulatory, HIPAA, or security-audit assessment; data is synthetic.
* Clinical text is attached for review; **no text reasoning** is performed by EfficientNet-B0.
* Not load-tested; Docker Compose not executed on the dev machine.

## 10. 3–5 minute demonstration script

1. **(0:00) Frame it.** "CEVI links clinical records and imaging to a model, with RBAC. Everything is synthetic and
   labelled as research-only." Show the login page and its demo accounts.
2. **(0:30) Overview** as *Clinician*: database-backed KPIs, 14-day activity charts, recent inference and audit feed.
3. **(1:00) Patients → open a profile**: timeline of records, images and analyses. Add a record; show validation.
4. **(1:45) Upload an image** (try a `.txt` renamed to `.png`): rejected by *signature* server-side. Upload a real PNG.
5. **(2:15) AI Analysis**: pick patient + image, show the model card ("clinically validated: No"), the
   preprocessing preview (tensor `[1,3,224,224]`), link a record as *context*, run inference.
6. **(3:00) Read the result honestly**: top-5 ImageNet labels, timing, and the disclaimer — "this proves the
   pipeline, not diagnostic ability."
7. **(3:20) History → detail**, then switch to *Researcher*: names are anonymized, no register/upload buttons;
   open **Research Analytics** (latency p50/p95, outcomes, usage).
8. **(4:10) Admin → Users & Roles**: change a role / deactivate a user; mention that the API enforces it
   (tests: 45 backend, 24 frontend, 23 ML).
9. **(4:40) Close** with limitations and next steps (queue, object storage, domain-validated model).

## 11. Public portfolio demo

The static build (`npm run build:demo`) swaps the HTTP transport for an in-browser provider that implements the
same routes, envelopes and RBAC rules over an exported snapshot. Talking points: the single seam in `lib/api.ts`
(pages and TanStack Query hooks are shared), why recorded results are labelled instead of simulated inference,
`StorageProvider`-style separation between real and demo providers, CSP + build-time verification, and what is
deliberately *not* available without the backend (live inference, MySQL persistence, JWT). See
`docs/PORTFOLIO_DEMO.md`.

