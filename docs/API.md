# CEVI REST API

Base URL: `http://localhost:4000/api` (the web app proxies `/api` so the browser sees one origin).
All responses are JSON. Authentication is an **httpOnly cookie** (`cevi_token`) set by `POST /auth/login`;
`Authorization: Bearer <token>` is also accepted for scripts and tests.

## Conventions

| Concern | Convention |
|---|---|
| Success | `{ "data": … }` and for lists `{ "data": [...], "meta": { page, pageSize, total, totalPages } }` |
| Errors | `{ "error": { "code", "message", "details?" } }` |
| Pagination | `?page=1&pageSize=20` (max 100) |
| Validation | Zod; failures return **422** `VALIDATION_ERROR` with `details: [{ field, message }]` |
| Status codes | 200/201/204 success · 400 bad request · 401 unauthenticated · 403 forbidden · 404 · 409 conflict · 413 file too large · 415 unsupported type · 422 validation · 429 rate limited · 503 dependency unavailable |

## Roles & permissions

| Permission | Administrator | Clinician | Researcher |
|---|:-:|:-:|:-:|
| users:manage | ✔ | | |
| patients:read | ✔ | ✔ | ✔ (anonymized) |
| patients:write | | ✔ | |
| records:read / images:read / analyses:read | ✔ | ✔ | ✔ |
| records:write / images:write | | ✔ | |
| analyses:create | | ✔ | ✔ |
| analytics:read | ✔ | | ✔ |

## Endpoints

### Health
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | public | `{ status, services: { api, database, mlService } }`; 503 only if DB down |

### Authentication
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | `{ email, password }` → sets cookie; rate limited (20 / 15 min / IP) |
| POST | `/auth/logout` | clears cookie |
| GET | `/auth/me` | current user + permission list |
| POST | `/auth/change-password` | `{ currentPassword, newPassword }` |

### Users (administrator)
| Method | Path | Notes |
|---|---|---|
| GET | `/users` | `q`, `role`, pagination |
| POST | `/users` | `{ email, name, role, password }` → 409 on duplicate email |
| PATCH | `/users/:id` | `name`, `role`, `isActive`, `password`; cannot demote/deactivate yourself |

### Patients
| Method | Path | Notes |
|---|---|---|
| GET | `/patients` | `q` (name/ID/cohort; researchers: ID/cohort only), `status`, `cohort`, `sex`, `sort`, `order` |
| GET | `/patients/cohorts` | distinct cohorts with counts |
| POST | `/patients` | clinician; server generates `SYN-000123` ids |
| GET | `/patients/:id` | profile + records, images, analyses, activity |
| PATCH | `/patients/:id` | clinician |

### Clinical records
| Method | Path | Notes |
|---|---|---|
| GET | `/records` | `q`, `patientId`, `type`, `severity`, `from`, `to` |
| POST | `/records` | clinician |
| GET | `/records/:id` | includes `revisions[]` |
| PATCH | `/records/:id` | author only; previous version stored as a revision in the same transaction |

### Medical images
| Method | Path | Notes |
|---|---|---|
| GET | `/images` | `q`, `patientId`, `modality`, `status` |
| POST | `/images` | `multipart/form-data`: `file`, `patientId`, `modality`, `description?`; JPEG/PNG only, signature + structure + dimension validation |
| GET | `/images/:id` | metadata + analyses |
| GET | `/images/:id/file` | authenticated image bytes (`nosniff`, private cache) |

### AI analyses
| Method | Path | Notes |
|---|---|---|
| GET | `/analyses` | `q`, `status`, `mode`, `patientId`, `imageId` |
| GET | `/analyses/ml-status` | ML reachability + model metadata (never errors) |
| POST | `/analyses/preprocess-preview` | `{ imageId }` → tensor stats and pipeline config |
| POST | `/analyses` | `{ imageId, recordIds? }` → 201 with final status `COMPLETED \| FAILED \| UNAVAILABLE` |
| GET | `/analyses/:id` | full result |

An analysis request is always persisted. If the ML service is down the row is `FAILED`; if weights are not
loaded it is `UNAVAILABLE` with **no predictions**.

### Dashboard, analytics, search, activity
| Method | Path | Notes |
|---|---|---|
| GET | `/dashboard` | all roles; totals, 14-day series, distributions, recent items |
| GET | `/analytics/summary` | administrator/researcher; outcomes, latency avg/p50/p95, 30-day trends |
| GET | `/search?q=` | patients / records / images (role-aware) |
| GET | `/activity?limit=` | audit feed |

## ML service contract (internal, `http://127.0.0.1:8001`)

| Method | Path | Response |
|---|---|---|
| GET | `/health` | `{ status, model_ready, weights_source, load_error }` |
| GET | `/model` | name, version, weights source, trained task, `clinically_validated: false`, notes |
| POST | `/preprocess` | multipart `file` → pipeline config + tensor `{shape, dtype, min, max, mean, std}` |
| POST | `/infer` | multipart `file` → `{ model, preprocessing, predictions[top-5], timing, disclaimer }` |

Errors: `{ "error": { "code", "message" } }` — `UNSUPPORTED_MEDIA_TYPE` 415, `INVALID_IMAGE` /
`IMAGE_TOO_SMALL` / `IMAGE_TOO_LARGE` 422, `FILE_TOO_LARGE` 413, `MODEL_WEIGHTS_UNAVAILABLE` 503.
