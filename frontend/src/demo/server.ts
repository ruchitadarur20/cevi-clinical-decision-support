/**
 * In-browser stand-in for the CEVI REST API (portfolio demo only).
 *
 * It exposes the same routes, query parameters, response envelopes, role checks and validation messages as the
 * Express API, over a dataset exported from the real application plus the visitor's browser-only edits
 * (localStorage). Nothing here talks to a network, and no model inference is performed: analyses are the
 * results that the real EfficientNet-B0 service recorded when the dataset was exported.
 */
import { ApiError } from '@/lib/api';
import type {
  AnalyticsData, DashboardData, Patient, PatientRef, Permission, Role, SearchResults,
} from '@/lib/types';
import { can, permissionsFor } from './permissions';
import { currentUser, writeSession } from './session';
import { getState, resetDemo, save, uid, type DAnalysis, type DImage, type DPatient, type DRecord, type DemoState } from './store';
import { ImageRejected, inspectImage } from './browserImage';
import { registerLocalImage } from './localImages';

type Params = Record<string, string | number | boolean | undefined | null>;
interface Req { params: Params; body: any; form?: FormData; match: string[]; role: Role; userId: string; userName: string }
type Handler = (r: Req, s: DemoState) => unknown | Promise<unknown>;

const RESEARCH_DISCLAIMER =
  'Research prototype using synthetic data. Model output is experimental, has not been clinically validated, and must not be used for diagnosis, treatment or any clinical decision-making.';
const DATA_NOTICE = 'All patient data in this environment is synthetic and generated for demonstration purposes.';

// ---- helpers -------------------------------------------------------------------------------------------
const validation = (details: Array<{ field: string; message: string }>) => new ApiError(422, 'VALIDATION_ERROR', 'Request validation failed', details);
const notFound = (what: string) => new ApiError(404, 'NOT_FOUND', `${what} not found`);
const forbidden = (msg = 'You do not have permission to perform this action') => new ApiError(403, 'FORBIDDEN', msg);

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const has = (hay: string | null | undefined, q: string) => (hay ?? '').toLowerCase().includes(q.toLowerCase());
const dayKey = (iso: string) => iso.slice(0, 10);
const byDesc = <T,>(f: (x: T) => string) => (a: T, b: T) => (f(a) < f(b) ? 1 : f(a) > f(b) ? -1 : 0);

function paginate<T>(rows: T[], p: Params) {
  const page = Math.max(1, Math.floor(Number(p.page) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(p.pageSize) || 20)));
  return {
    data: rows.slice((page - 1) * pageSize, page * pageSize),
    meta: { page, pageSize, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / pageSize)) },
  };
}

function ageOf(dob: string, now = new Date()) {
  const d = new Date(dob);
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}
const ageBand = (a: number) => `${Math.floor(a / 10) * 10}-${Math.floor(a / 10) * 10 + 9}`;

function patientRef(p: DPatient | undefined, role: Role): PatientRef {
  if (!p) return { id: '', syntheticId: 'unknown', displayName: 'Unknown patient' };
  return { id: p.id, syntheticId: p.syntheticId, displayName: can(role, 'patients:identify') ? `${p.lastName}, ${p.firstName}` : `Anonymized (${p.syntheticId})` };
}

function serializePatient(p: DPatient, role: Role, s: DemoState): Patient & { browserOnly?: boolean } {
  const identified = can(role, 'patients:identify');
  const age = ageOf(p.dateOfBirth);
  return {
    id: p.id, syntheticId: p.syntheticId,
    firstName: identified ? p.firstName : null, lastName: identified ? p.lastName : null,
    displayName: identified ? `${p.lastName}, ${p.firstName}` : `Anonymized (${p.syntheticId})`,
    dateOfBirth: identified ? p.dateOfBirth : null, age: identified ? age : null, ageBand: ageBand(age),
    sex: p.sex, researchCohort: p.researchCohort, caseStatus: p.caseStatus, summary: p.summary, isSynthetic: true,
    anonymized: !identified, createdAt: p.createdAt, updatedAt: p.updatedAt,
    recordCount: s.records.filter((r) => r.patientId === p.id).length,
    imageCount: s.images.filter((i) => i.patientId === p.id).length,
    ...(p.browserOnly ? { browserOnly: true } : {}),
  };
}

const serializeRecord = (r: DRecord, role: Role, s: DemoState) => ({
  id: r.id, type: r.type, severity: r.severity, title: r.title, content: r.content, recordedAt: r.recordedAt, version: r.version,
  createdAt: r.createdAt, updatedAt: r.updatedAt, patient: patientRef(s.patients.find((p) => p.id === r.patientId), role), author: r.author,
  ...(r.browserOnly ? { browserOnly: true } : {}),
});

const serializeImage = (i: DImage, role: Role, s: DemoState) => ({
  id: i.id, originalName: i.originalName, mimeType: i.mimeType, sizeBytes: i.sizeBytes, width: i.width, height: i.height, sha256: i.sha256,
  modality: i.modality, description: i.description, processingStatus: i.processingStatus, isSynthetic: i.isSynthetic, createdAt: i.createdAt,
  patient: patientRef(s.patients.find((p) => p.id === i.patientId), role), uploadedBy: i.uploadedBy,
  analysisCount: s.analyses.filter((a) => a.imageId === i.id).length,
  ...(i.browserOnly ? { browserOnly: true } : {}),
});

const serializeAnalysis = (a: DAnalysis, role: Role, s: DemoState) => {
  const { imageId: _i, patientId: _p, ...rest } = a;
  return { ...rest, patient: patientRef(s.patients.find((p) => p.id === a.patientId), role), recorded: true };
};

function log(s: DemoState, r: Req, action: string, entityType: string, entityId: string | null, summary: string) {
  s.activity.unshift({ id: uid(), action, summary, actor: r.userName, createdAt: new Date().toISOString(), entityType, entityId, browserOnly: true });
  s.activity.length = Math.min(s.activity.length, 200);
}

function require_(role: Role, p: Permission) {
  if (!can(role, p)) throw forbidden();
}

// ---- time windows (anchored to the dataset's last recorded day, so charts never go blank as time passes) --
function windowDays(s: DemoState, days: number) {
  const end = new Date(s.referenceDate);
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - i)).toISOString().slice(0, 10));
  return out;
}
/** Items after the snapshot (created by the visitor) are folded into the final bucket. */
function bucketIndex(days: string[], iso: string) {
  const k = dayKey(iso);
  if (k > days[days.length - 1]) return days.length - 1;
  return days.indexOf(k);
}
const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] : null);
const count = <T,>(rows: T[], key: (x: T) => string) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return [...m.entries()].map(([name, value]) => ({ name, value }));
};

// ---- route handlers -------------------------------------------------------------------------------------
const routes: Array<[string, RegExp, Handler]> = [];
const route = (method: string, pattern: string, h: Handler) =>
  routes.push([method, new RegExp(`^${pattern.replace(/:[a-zA-Z]+/g, '([^/]+)')}$`), h]);

// auth
route('GET', '/auth/me', () => {
  const u = currentUser();
  if (!u) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required');
  return { data: { user: u } };
});
route('POST', '/auth/login', (r, s) => {
  const email = str(r.body?.email).toLowerCase();
  const u = s.users.find((x) => x.email.toLowerCase() === email && x.isActive);
  if (!u) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Unknown or inactive demonstration account');
  writeSession(u.role);
  return { data: { user: { id: u.id, email: u.email, name: u.name, role: u.role, permissions: permissionsFor(u.role) } } };
});
route('POST', '/auth/switch-role', (r, s) => {
  const role = r.body?.role as Role;
  const u = s.users.find((x) => x.role === role && x.isActive);
  if (!u) throw validation([{ field: 'role', message: 'Unknown role' }]);
  writeSession(u.role);
  return { data: { user: { id: u.id, email: u.email, name: u.name, role: u.role, permissions: permissionsFor(u.role) } } };
});
route('POST', '/auth/logout', () => { writeSession('none'); return undefined; });
route('POST', '/auth/change-password', () => {
  throw new ApiError(403, 'DEMO_MODE', 'Password changes are disabled in the portfolio demo.');
});
route('POST', '/demo/reset', () => { resetDemo(); return undefined; });

// patients
route('GET', '/patients', (r, s) => {
  require_(r.role, 'patients:read');
  const { q, status, cohort, sex, sort = 'createdAt', order = 'desc' } = r.params as Record<string, string>;
  const identified = can(r.role, 'patients:identify');
  let rows = s.patients.filter((p) => {
    if (q && !(has(p.syntheticId, q) || has(p.researchCohort, q) || (identified && (has(p.firstName, q) || has(p.lastName, q))))) return false;
    if (status && p.caseStatus !== status) return false;
    if (cohort && p.researchCohort !== cohort) return false;
    if (sex && p.sex !== sex) return false;
    return true;
  });
  const dir = order === 'asc' ? 1 : -1;
  const key = (p: DPatient) => (sort === 'name' && identified ? `${p.lastName} ${p.firstName}`.toLowerCase() : sort === 'name' || sort === 'syntheticId' ? p.syntheticId : p.createdAt);
  rows = [...rows].sort((a, b) => (key(a) < key(b) ? -dir : key(a) > key(b) ? dir : 0));
  const page = paginate(rows, r.params);
  return { data: page.data.map((p) => serializePatient(p, r.role, s)), meta: page.meta };
});
route('GET', '/patients/cohorts', (r, s) => {
  require_(r.role, 'patients:read');
  return { data: count(s.patients, (p) => p.researchCohort).sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ name: c.name, count: c.value })) };
});
route('GET', '/patients/:id', (r, s) => {
  require_(r.role, 'patients:read');
  const p = s.patients.find((x) => x.id === r.match[0]);
  if (!p) throw notFound('Patient');
  const records = s.records.filter((x) => x.patientId === p.id).sort(byDesc((x) => x.recordedAt)).slice(0, 50);
  const images = s.images.filter((x) => x.patientId === p.id).sort(byDesc((x) => x.createdAt)).slice(0, 50);
  const analyses = s.analyses.filter((a) => a.patientId === p.id).sort(byDesc((a) => a.createdAt)).slice(0, 25);
  const activity = s.activity.filter((a) => a.entityType === 'Patient' && a.entityId === p.id).sort(byDesc((a) => a.createdAt)).slice(0, 10);
  return {
    data: {
      ...serializePatient(p, r.role, s),
      createdBy: p.createdBy,
      records: records.map((x) => ({ id: x.id, type: x.type, severity: x.severity, title: x.title, content: x.content, recordedAt: x.recordedAt, version: x.version, author: { id: x.author.id, name: x.author.name }, ...(x.browserOnly ? { browserOnly: true } : {}) })),
      images: images.map((i) => ({ id: i.id, originalName: i.originalName, modality: i.modality, width: i.width, height: i.height, processingStatus: i.processingStatus, isSynthetic: i.isSynthetic, createdAt: i.createdAt, ...(i.browserOnly ? { browserOnly: true } : {}) })),
      analyses: analyses.map((a) => ({ id: a.id, status: a.status, mode: a.mode, modelName: a.modelName, modelVersion: a.modelVersion, inferenceMs: a.inferenceMs, createdAt: a.createdAt, image: { id: a.image.id, originalName: a.image.originalName } })),
      activity: activity.map((a) => ({ id: a.id, action: a.action, summary: a.summary, actor: a.actor ?? null, createdAt: a.createdAt })),
    },
  };
});

function validatePatient(b: any, partial: boolean) {
  const errs: Array<{ field: string; message: string }> = [];
  const need = (f: string, ok: boolean, msg: string) => { if ((!partial || b[f] !== undefined) && !ok) errs.push({ field: f, message: msg }); };
  need('firstName', str(b.firstName).length >= 1 && str(b.firstName).length <= 80, 'First name is required (max 80 characters)');
  need('lastName', str(b.lastName).length >= 1 && str(b.lastName).length <= 80, 'Last name is required (max 80 characters)');
  need('researchCohort', str(b.researchCohort).length >= 2 && str(b.researchCohort).length <= 80, 'Research cohort must be 2–80 characters');
  const dob = str(b.dateOfBirth);
  if (!partial || b.dateOfBirth !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(Date.parse(dob))) errs.push({ field: 'dateOfBirth', message: 'Use YYYY-MM-DD' });
    else if (new Date(dob) > new Date()) errs.push({ field: 'dateOfBirth', message: 'Date of birth cannot be in the future' });
    else if (new Date(dob).getFullYear() < 1900) errs.push({ field: 'dateOfBirth', message: 'Date of birth is out of range' });
  }
  if (b.sex !== undefined && !['FEMALE', 'MALE', 'OTHER', 'UNKNOWN'].includes(b.sex)) errs.push({ field: 'sex', message: 'Invalid value' });
  if (b.caseStatus !== undefined && !['ACTIVE', 'MONITORING', 'CLOSED'].includes(b.caseStatus)) errs.push({ field: 'caseStatus', message: 'Invalid value' });
  if (errs.length) throw validation(errs);
}
route('POST', '/patients', (r, s) => {
  require_(r.role, 'patients:write');
  validatePatient(r.body ?? {}, false);
  const b = r.body;
  const last = s.patients.map((p) => parseInt(p.syntheticId.replace(/\D/g, ''), 10)).reduce((a, c) => Math.max(a, c), 0);
  const now = new Date().toISOString();
  const p: DPatient = {
    id: uid(), syntheticId: `SYN-${String(last + 1).padStart(6, '0')}`, firstName: str(b.firstName), lastName: str(b.lastName),
    dateOfBirth: str(b.dateOfBirth), sex: b.sex ?? 'UNKNOWN', researchCohort: str(b.researchCohort), caseStatus: b.caseStatus ?? 'ACTIVE',
    summary: str(b.summary) || null, createdAt: now, updatedAt: now, createdBy: { id: r.userId, name: r.userName }, browserOnly: true,
  };
  s.patients.unshift(p);
  log(s, r, 'patient.create', 'Patient', p.id, `Registered synthetic patient ${p.syntheticId}`);
  save();
  return { data: serializePatient(p, r.role, s) };
});
route('PATCH', '/patients/:id', (r, s) => {
  require_(r.role, 'patients:write');
  const p = s.patients.find((x) => x.id === r.match[0]);
  if (!p) throw notFound('Patient');
  const b = r.body ?? {};
  if (!Object.keys(b).length) throw validation([{ field: '_', message: 'At least one field is required' }]);
  validatePatient(b, true);
  for (const k of ['firstName', 'lastName', 'researchCohort', 'dateOfBirth'] as const) if (b[k] !== undefined) p[k] = str(b[k]);
  if (b.sex !== undefined) p.sex = b.sex;
  if (b.caseStatus !== undefined) p.caseStatus = b.caseStatus;
  if (b.summary !== undefined) p.summary = str(b.summary) || null;
  p.updatedAt = new Date().toISOString();
  log(s, r, 'patient.update', 'Patient', p.id, `Updated patient ${p.syntheticId}`);
  save();
  return { data: serializePatient(p, r.role, s) };
});

// records
const RECORD_TYPES = ['OBSERVATION', 'DIAGNOSTIC_NOTE', 'LAB_RESULT', 'PROCEDURE', 'FOLLOW_UP'];
const SEVERITIES = ['ROUTINE', 'ELEVATED', 'URGENT'];
route('GET', '/records', (r, s) => {
  require_(r.role, 'records:read');
  const { q, patientId, type, severity, from, to } = r.params as Record<string, string>;
  const rows = s.records
    .filter((x) => {
      if (q && !(has(x.title, q) || has(x.content, q))) return false;
      if (patientId && x.patientId !== patientId) return false;
      if (type && x.type !== type) return false;
      if (severity && x.severity !== severity) return false;
      if (from && x.recordedAt < from) return false;
      if (to && x.recordedAt > `${to}T23:59:59.999Z`) return false;
      return true;
    })
    .sort(byDesc((x) => x.recordedAt));
  const page = paginate(rows, r.params);
  return { data: page.data.map((x) => serializeRecord(x, r.role, s)), meta: page.meta };
});
route('GET', '/records/:id', (r, s) => {
  require_(r.role, 'records:read');
  const x = s.records.find((y) => y.id === r.match[0]);
  if (!x) throw notFound('Clinical record');
  return { data: { ...serializeRecord(x, r.role, s), revisions: [...x.revisions].sort((a, b) => b.version - a.version) } };
});
function validateRecord(b: any, partial: boolean) {
  const errs: Array<{ field: string; message: string }> = [];
  if (!partial || b.title !== undefined) { const t = str(b.title); if (t.length < 3) errs.push({ field: 'title', message: 'Title must be at least 3 characters' }); else if (t.length > 160) errs.push({ field: 'title', message: 'Title must be at most 160 characters' }); }
  if (!partial || b.content !== undefined) { const c = str(b.content); if (c.length < 5) errs.push({ field: 'content', message: 'Content must be at least 5 characters' }); else if (c.length > 10000) errs.push({ field: 'content', message: 'Content is too long' }); }
  if (b.type !== undefined && !RECORD_TYPES.includes(b.type)) errs.push({ field: 'type', message: 'Invalid value' });
  if (b.severity !== undefined && !SEVERITIES.includes(b.severity)) errs.push({ field: 'severity', message: 'Invalid value' });
  if (b.recordedAt !== undefined && Number.isNaN(Date.parse(b.recordedAt))) errs.push({ field: 'recordedAt', message: 'Invalid date' });
  if (errs.length) throw validation(errs);
}
route('POST', '/records', (r, s) => {
  require_(r.role, 'records:write');
  const b = r.body ?? {};
  validateRecord(b, false);
  const patient = s.patients.find((p) => p.id === b.patientId);
  if (!patient) throw validation([{ field: 'patientId', message: 'Patient does not exist' }]);
  const now = new Date().toISOString();
  const rec: DRecord = {
    id: uid(), patientId: patient.id, type: b.type ?? 'OBSERVATION', severity: b.severity ?? 'ROUTINE', title: str(b.title), content: str(b.content),
    recordedAt: b.recordedAt ? new Date(b.recordedAt).toISOString() : now, version: 1, createdAt: now, updatedAt: now,
    author: { id: r.userId, name: r.userName, role: r.role }, revisions: [], browserOnly: true,
  };
  s.records.unshift(rec);
  log(s, r, 'record.create', 'Patient', patient.id, `New ${rec.type.toLowerCase().replace('_', ' ')} for ${patient.syntheticId}: ${rec.title}`);
  save();
  return { data: serializeRecord(rec, r.role, s) };
});
route('PATCH', '/records/:id', (r, s) => {
  require_(r.role, 'records:write');
  const x = s.records.find((y) => y.id === r.match[0]);
  if (!x) throw notFound('Clinical record');
  const b = r.body ?? {};
  if (!Object.keys(b).length) throw validation([{ field: '_', message: 'At least one field is required' }]);
  validateRecord(b, true);
  if (x.author.id !== r.userId) throw new ApiError(403, 'FORBIDDEN', 'Only the original author can edit this record');
  const now = new Date().toISOString();
  x.revisions.push({ version: x.version, type: x.type, severity: x.severity, title: x.title, content: x.content, editedBy: { id: r.userId, name: r.userName }, createdAt: now });
  if (b.type !== undefined) x.type = b.type;
  if (b.severity !== undefined) x.severity = b.severity;
  if (b.title !== undefined) x.title = str(b.title);
  if (b.content !== undefined) x.content = str(b.content);
  if (b.recordedAt !== undefined) x.recordedAt = new Date(b.recordedAt).toISOString();
  x.version += 1;
  x.updatedAt = now;
  x.browserOnly = true;
  log(s, r, 'record.update', 'Patient', x.patientId, `Edited record "${x.title}" (v${x.version})`);
  save();
  return { data: serializeRecord(x, r.role, s) };
});

// images
const MODALITIES = ['XRAY', 'CT', 'MRI', 'ULTRASOUND', 'DERMATOSCOPY', 'OTHER'];
route('GET', '/images', (r, s) => {
  require_(r.role, 'images:read');
  const { q, patientId, modality, status } = r.params as Record<string, string>;
  const rows = s.images
    .filter((i) => {
      if (q) {
        const p = s.patients.find((x) => x.id === i.patientId);
        if (!(has(i.originalName, q) || has(i.description, q) || has(p?.syntheticId, q))) return false;
      }
      if (patientId && i.patientId !== patientId) return false;
      if (modality && i.modality !== modality) return false;
      if (status && i.processingStatus !== status) return false;
      return true;
    })
    .sort(byDesc((i) => i.createdAt));
  const page = paginate(rows, r.params);
  return { data: page.data.map((i) => serializeImage(i, r.role, s)), meta: page.meta };
});
route('GET', '/images/:id', (r, s) => {
  require_(r.role, 'images:read');
  const i = s.images.find((x) => x.id === r.match[0]);
  if (!i) throw notFound('Image');
  const analyses = s.analyses.filter((a) => a.imageId === i.id).sort(byDesc((a) => a.createdAt))
    .map((a) => ({ id: a.id, status: a.status, mode: a.mode, modelName: a.modelName, modelVersion: a.modelVersion, inferenceMs: a.inferenceMs, createdAt: a.createdAt }));
  return { data: { ...serializeImage(i, r.role, s), analyses } };
});
route('POST', '/images', async (r, s) => {
  require_(r.role, 'images:write');
  const f = r.form;
  const file = f?.get('file');
  if (!(file instanceof File)) throw validation([{ field: 'file', message: 'An image file is required' }]);
  const patientId = String(f?.get('patientId') ?? '');
  const patient = s.patients.find((p) => p.id === patientId);
  if (!patient) throw validation([{ field: 'patientId', message: 'Patient does not exist' }]);
  const modality = String(f?.get('modality') ?? 'OTHER');
  if (!MODALITIES.includes(modality)) throw validation([{ field: 'modality', message: 'Invalid value' }]);
  if (file.size > 8 * 1024 * 1024) throw new ApiError(413, 'FILE_TOO_LARGE', 'File is larger than the 8 MB limit');
  let info;
  try { info = await inspectImage(file); } catch (e) {
    if (e instanceof ImageRejected) throw new ApiError(e.message.includes('signature') ? 415 : 422, e.message.includes('signature') ? 'UNSUPPORTED_MEDIA_TYPE' : 'INVALID_IMAGE', e.message);
    throw e;
  }
  const id = uid();
  const img: DImage = {
    id, patientId, originalName: file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'image', mimeType: info.mimeType, sizeBytes: file.size,
    width: info.width, height: info.height, sha256: info.sha256, modality: modality as DImage['modality'],
    description: str(f?.get('description')) || null, processingStatus: 'UPLOADED', isSynthetic: false, createdAt: new Date().toISOString(),
    uploadedBy: { id: r.userId, name: r.userName }, browserOnly: true, thumb: info.thumb,
  };
  s.images.unshift(img);
  s.preprocess[id] = info.preprocess;
  registerLocalImage(id, URL.createObjectURL(file), info.thumb);
  log(s, r, 'image.upload', 'Patient', patient.id, `Selected image ${img.originalName} for ${patient.syntheticId} (browser-only)`);
  save();
  return { data: serializeImage(img, r.role, s) };
});

// analyses (recorded results only — no inference runs in the browser)
route('GET', '/analyses', (r, s) => {
  require_(r.role, 'analyses:read');
  const { q, status, mode, patientId, imageId } = r.params as Record<string, string>;
  const rows = s.analyses
    .filter((a) => {
      if (status && a.status !== status) return false;
      if (mode && a.mode !== mode) return false;
      if (imageId && a.imageId !== imageId) return false;
      if (patientId && a.patientId !== patientId) return false;
      if (q) {
        const p = s.patients.find((x) => x.id === a.patientId);
        if (!(has(a.image.originalName, q) || has(p?.syntheticId, q) || has(a.modelName, q))) return false;
      }
      return true;
    })
    .sort(byDesc((a) => a.createdAt));
  const page = paginate(rows, r.params);
  return { data: page.data.map((a) => serializeAnalysis(a, r.role, s)), meta: page.meta };
});
route('GET', '/analyses/ml-status', (r, s) => {
  require_(r.role, 'analyses:read');
  return { data: { ...s.ml, recorded: true, snapshotAt: s.snapshotAt, disclaimer: RESEARCH_DISCLAIMER } };
});
route('POST', '/analyses/preprocess-preview', (r, s) => {
  require_(r.role, 'analyses:read');
  const pre = s.preprocess[String(r.body?.imageId)];
  if (!pre) throw notFound('Preprocessing record');
  return { data: pre };
});
route('POST', '/analyses', () => {
  throw new ApiError(409, 'DEMO_MODE', 'Live inference is not available in the portfolio demo. Recorded results are shown instead.');
});
route('GET', '/analyses/:id', (r, s) => {
  require_(r.role, 'analyses:read');
  const a = s.analyses.find((x) => x.id === r.match[0]);
  if (!a) throw notFound('Analysis');
  return { data: serializeAnalysis(a, r.role, s) };
});

// users
route('GET', '/users', (r, s) => {
  require_(r.role, 'users:manage');
  const { q, role } = r.params as Record<string, string>;
  const rows = s.users.filter((u) => (!role || u.role === role) && (!q || has(u.name, q) || has(u.email, q))).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return paginate(rows, r.params);
});
route('POST', '/users', (r, s) => {
  require_(r.role, 'users:manage');
  const b = r.body ?? {};
  const errs: Array<{ field: string; message: string }> = [];
  const email = str(b.email).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.push({ field: 'email', message: 'Enter a valid email address' });
  if (str(b.name).length < 2) errs.push({ field: 'name', message: 'Name must be at least 2 characters' });
  if (!['ADMINISTRATOR', 'CLINICIAN', 'RESEARCHER'].includes(b.role)) errs.push({ field: 'role', message: 'Choose a role' });
  const pw = String(b.password ?? '');
  if (pw.length < 10) errs.push({ field: 'password', message: 'Password must be at least 10 characters' });
  else if (!/[A-Za-z]/.test(pw)) errs.push({ field: 'password', message: 'Password must contain a letter' });
  else if (!/[0-9]/.test(pw)) errs.push({ field: 'password', message: 'Password must contain a number' });
  if (errs.length) throw validation(errs);
  if (s.users.some((u) => u.email.toLowerCase() === email)) throw new ApiError(409, 'CONFLICT', 'Email is already registered');
  // The password is validated like the real API but intentionally discarded: the demo stores no credentials.
  const u = { id: uid(), email, name: str(b.name), role: b.role as Role, isActive: true, lastLoginAt: null, createdAt: new Date().toISOString() };
  s.users.push(u);
  log(s, r, 'user.create', 'User', u.id, `Created user ${u.name} (${u.role})`);
  save();
  return { data: u };
});
route('PATCH', '/users/:id', (r, s) => {
  require_(r.role, 'users:manage');
  const u = s.users.find((x) => x.id === r.match[0]);
  if (!u) throw notFound('User');
  const b = r.body ?? {};
  if (u.id === r.userId && ((b.role && b.role !== u.role) || b.isActive === false))
    throw new ApiError(400, 'SELF_MODIFICATION', 'You cannot change your own role or deactivate your own account');
  if (b.name !== undefined) u.name = str(b.name);
  if (b.role !== undefined) u.role = b.role;
  if (b.isActive !== undefined) u.isActive = !!b.isActive;
  log(s, r, 'user.update', 'User', u.id, `Updated user ${u.name}`);
  save();
  return { data: u };
});

// activity, search, dashboard, analytics
route('GET', '/activity', (r, s) => {
  require_(r.role, 'activity:read');
  const limit = Math.min(50, Math.max(1, Number(r.params.limit) || 15));
  return { data: [...s.activity].sort(byDesc((a) => a.createdAt)).slice(0, limit).map((a) => ({ id: a.id, action: a.action, summary: a.summary, entityType: a.entityType, entityId: a.entityId, actor: a.actor ?? 'System', createdAt: a.createdAt })) };
});
route('GET', '/search', (r, s) => {
  const q = str(r.params.q);
  if (q.length < 2) throw validation([{ field: 'q', message: 'Enter at least 2 characters' }]);
  const identified = can(r.role, 'patients:identify');
  const out: SearchResults = {
    patients: can(r.role, 'patients:read')
      ? s.patients.filter((p) => has(p.syntheticId, q) || has(p.researchCohort, q) || (identified && (has(p.firstName, q) || has(p.lastName, q)))).sort(byDesc((p) => p.createdAt)).slice(0, 5).map((p) => ({ ...patientRef(p, r.role), researchCohort: p.researchCohort }))
      : [],
    records: can(r.role, 'records:read')
      ? s.records.filter((x) => has(x.title, q)).sort(byDesc((x) => x.recordedAt)).slice(0, 5).map((x) => ({ id: x.id, title: x.title, type: x.type, patient: patientRef(s.patients.find((p) => p.id === x.patientId), r.role) }))
      : [],
    images: can(r.role, 'images:read')
      ? s.images.filter((i) => has(i.originalName, q)).sort(byDesc((i) => i.createdAt)).slice(0, 5).map((i) => ({ id: i.id, originalName: i.originalName, patient: patientRef(s.patients.find((p) => p.id === i.patientId), r.role) }))
      : [],
  };
  return { data: out };
});

route('GET', '/dashboard', (r, s) => {
  const days = [7, 14, 30, 90].includes(Number(r.params.days)) ? Number(r.params.days) : 14;
  const win = windowDays(s, days);
  const series = win.map((date) => ({ date, completed: 0, failed: 0, records: 0, images: 0 }));
  for (const a of s.analyses) { const i = bucketIndex(win, a.createdAt); if (i < 0) continue; if (a.status === 'COMPLETED') series[i].completed++; else if (a.status === 'FAILED' || a.status === 'UNAVAILABLE') series[i].failed++; }
  for (const x of s.records) { const i = bucketIndex(win, x.createdAt); if (i >= 0) series[i].records++; }
  for (const x of s.images) { const i = bucketIndex(win, x.createdAt); if (i >= 0) series[i].images++; }
  const st = (k: DAnalysis['status']) => s.analyses.filter((a) => a.status === k).length;
  const data: DashboardData & { windowDays: number; windowEnd: string } = {
    dataNotice: DATA_NOTICE,
    windowDays: days,
    windowEnd: win[win.length - 1],
    totals: {
      patients: s.patients.length, activeCases: s.patients.filter((p) => p.caseStatus === 'ACTIVE').length, records: s.records.length, images: s.images.length,
      analysesCompleted: st('COMPLETED'), analysesPending: st('PENDING') + st('PROCESSING'), analysesFailed: st('FAILED'), analysesUnavailable: st('UNAVAILABLE'),
      recordsLast14Days: series.reduce((n, d) => n + d.records, 0),
    },
    activitySeries: series,
    caseDistribution: count(s.patients, (p) => p.caseStatus),
    cohortDistribution: count(s.patients, (p) => p.researchCohort).sort((a, b) => b.value - a.value),
    imageProcessing: count(s.images, (i) => i.processingStatus),
    recentAnalyses: [...s.analyses].sort(byDesc((a) => a.createdAt)).slice(0, 5).map((a) => ({
      id: a.id, status: a.status, mode: a.mode, modelName: a.modelName, inferenceMs: a.inferenceMs, createdAt: a.createdAt,
      imageName: a.image.originalName, patient: patientRef(s.patients.find((p) => p.id === a.patientId), r.role),
    })),
    recentActivity: [...s.activity].sort(byDesc((a) => a.createdAt)).slice(0, 8).map((a) => ({ id: a.id, action: a.action, summary: a.summary, actor: a.actor ?? 'System', createdAt: a.createdAt })),
  };
  return { data };
});

route('GET', '/analytics/summary', (r, s) => {
  require_(r.role, 'analytics:read');
  const win = windowDays(s, 30);
  const trends = win.map((date) => ({ date, analyses: 0, completed: 0, failed: 0, avgLatencyMs: null as number | null, images: 0, records: 0, logins: 0, _lat: [] as number[] }));
  for (const a of s.analyses) {
    const i = bucketIndex(win, a.createdAt);
    if (i < 0) continue;
    trends[i].analyses++;
    if (a.status === 'COMPLETED') { trends[i].completed++; if (a.inferenceMs != null) trends[i]._lat.push(a.inferenceMs); }
    if (a.status === 'FAILED' || a.status === 'UNAVAILABLE') trends[i].failed++;
  }
  for (const x of s.images) { const i = bucketIndex(win, x.createdAt); if (i >= 0) trends[i].images++; }
  for (const x of s.records) { const i = bucketIndex(win, x.createdAt); if (i >= 0) trends[i].records++; }
  for (const x of s.activity) if (x.action === 'auth.login') { const i = bucketIndex(win, x.createdAt); if (i >= 0) trends[i].logins++; }

  const completed = s.analyses.filter((a) => a.status === 'COMPLETED');
  const lat = completed.map((a) => a.inferenceMs).filter((n): n is number => typeof n === 'number').sort((a, b) => a - b);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const labels = new Map<string, number>();
  for (const a of completed) { const top = a.predictions?.[0]?.label; if (top) labels.set(top, (labels.get(top) ?? 0) + 1); }
  const models = new Map<string, { name: string; version: string; count: number }>();
  for (const a of completed) { const k = `${a.modelName}|${a.modelVersion}`; const m = models.get(k) ?? { name: a.modelName ?? 'unknown', version: a.modelVersion ?? 'unknown', count: 0 }; m.count++; models.set(k, m); }

  const data: AnalyticsData = {
    dataNotice: 'Metrics are computed from recorded application data. All patient data is synthetic. No clinical performance or diagnostic accuracy is measured or implied.',
    totals: { analyses: s.analyses.length, patients: s.patients.length, records: s.records.length, images: s.images.length, users: s.users.length, syntheticAnalyses: s.analyses.filter((a) => a.isSynthetic).length },
    outcomes: count(s.analyses, (a) => a.status),
    modes: count(s.analyses, (a) => a.mode),
    latency: { sampleSize: lat.length, avgMs: avg(lat) === null ? null : Math.round(avg(lat)!), p50Ms: pct(lat, 50), p95Ms: pct(lat, 95), minMs: lat[0] ?? null, maxMs: lat[lat.length - 1] ?? null },
    models: [...models.values()],
    trends: trends.map(({ _lat, ...t }) => ({ ...t, avgLatencyMs: _lat.length ? Math.round(avg(_lat)!) : null })),
    modalityDistribution: count(s.images, (i) => i.modality),
    cohortDistribution: count(s.patients, (p) => p.researchCohort).sort((a, b) => b.value - a.value),
    topLabels: [...labels.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value })),
  };
  return { data };
});

// ---- dispatcher -------------------------------------------------------------------------------------------
export async function handle(method: string, path: string, opts: { params?: Params; body?: unknown; form?: FormData }) {
  const s = getState();
  const cu = currentUser();
  const publicRoute = path.startsWith('/auth/') || path.startsWith('/demo/');
  if (!cu && !publicRoute) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required');
  for (const [m, re, h] of routes) {
    if (m !== method) continue;
    const match = re.exec(path);
    if (!match) continue;
    const req: Req = {
      params: opts.params ?? {}, body: opts.body, form: opts.form, match: match.slice(1),
      role: cu?.role ?? 'RESEARCHER', userId: cu?.id ?? '', userName: cu?.name ?? '',
    };
    // Small, realistic delay so loading states are exercised without making the demo feel slow.
    await new Promise((res) => setTimeout(res, 40));
    return JSON.parse(JSON.stringify((await h(req, s)) ?? null)); // structured copy: callers never mutate the store
  }
  throw new ApiError(404, 'NOT_FOUND', `No demo handler for ${method} ${path}`);
}
