import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { login, makeApp, makePatient, makeUser, resetDb } from './helpers';

let ctx: Awaited<ReturnType<typeof makeApp>>;
let token: string;
let other: string;
let clinicianId: string;

beforeAll(async () => { ctx = await makeApp(); });
beforeEach(async () => {
  await resetDb();
  const c = await makeUser('CLINICIAN');
  await makeUser('CLINICIAN', 'second@test.dev');
  clinicianId = c.id;
  token = await login(ctx.app, c.email);
  other = await login(ctx.app, 'second@test.dev');
});
const auth = (t = token) => ({ Authorization: `Bearer ${t}` });

describe('patients', () => {
  const body = { firstName: 'Grace', lastName: 'Hopper', dateOfBirth: '1975-12-09', sex: 'FEMALE', researchCohort: 'Test Cohort' };

  it('creates a patient with a generated synthetic id', async () => {
    const res = await request(ctx.app).post('/api/patients').set(auth()).send(body);
    expect(res.status).toBe(201);
    expect(res.body.data.syntheticId).toMatch(/^SYN-\d{6}$/);
    expect(res.body.data.isSynthetic).toBe(true);
  });

  it('assigns sequential synthetic ids', async () => {
    const a = await request(ctx.app).post('/api/patients').set(auth()).send(body);
    const b = await request(ctx.app).post('/api/patients').set(auth()).send(body);
    expect(Number(b.body.data.syntheticId.slice(4))).toBe(Number(a.body.data.syntheticId.slice(4)) + 1);
  });

  it('validates input', async () => {
    const res = await request(ctx.app).post('/api/patients').set(auth()).send({ ...body, dateOfBirth: '2999-01-01', firstName: '' });
    expect(res.status).toBe(422);
    const fields = res.body.error.details.map((d: any) => d.field);
    expect(fields).toContain('dateOfBirth');
    expect(fields).toContain('firstName');
  });

  it('searches, filters and paginates', async () => {
    for (let i = 0; i < 5; i++) await makePatient(clinicianId, { syntheticId: `SYN-10000${i}`, lastName: i < 2 ? 'Zebra' : 'Other', caseStatus: i === 0 ? 'CLOSED' : 'ACTIVE' });
    const search = await request(ctx.app).get('/api/patients?q=zebra').set(auth());
    expect(search.body.meta.total).toBe(2);
    const filter = await request(ctx.app).get('/api/patients?status=CLOSED').set(auth());
    expect(filter.body.meta.total).toBe(1);
    const page = await request(ctx.app).get('/api/patients?pageSize=2&page=3').set(auth());
    expect(page.body.data).toHaveLength(1);
    expect(page.body.meta).toMatchObject({ page: 3, pageSize: 2, total: 5, totalPages: 3 });
  });

  it('returns detail with related records and updates fields', async () => {
    const p = await makePatient(clinicianId);
    await request(ctx.app).post('/api/records').set(auth()).send({ patientId: p.id, title: 'First note', content: 'Hello world' });
    const detail = await request(ctx.app).get(`/api/patients/${p.id}`).set(auth());
    expect(detail.status).toBe(200);
    expect(detail.body.data.records).toHaveLength(1);
    const upd = await request(ctx.app).patch(`/api/patients/${p.id}`).set(auth()).send({ caseStatus: 'MONITORING' });
    expect(upd.body.data.caseStatus).toBe('MONITORING');
  });

  it('returns 404 for unknown patients', async () => {
    const res = await request(ctx.app).get('/api/patients/00000000-0000-4000-8000-000000000000').set(auth());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('clinical records', () => {
  it('creates, lists and filters records for a patient', async () => {
    const p = await makePatient(clinicianId);
    const mk = (type: string, title: string) => request(ctx.app).post('/api/records').set(auth()).send({ patientId: p.id, type, title, content: 'Synthetic content' });
    expect((await mk('LAB_RESULT', 'Lab panel')).status).toBe(201);
    expect((await mk('OBSERVATION', 'Observation')).status).toBe(201);
    const list = await request(ctx.app).get(`/api/records?patientId=${p.id}&type=LAB_RESULT`).set(auth());
    expect(list.body.meta.total).toBe(1);
    const q = await request(ctx.app).get('/api/records?q=observation').set(auth());
    expect(q.body.meta.total).toBe(1);
  });

  it('rejects records for unknown patients and short content', async () => {
    const res = await request(ctx.app).post('/api/records').set(auth()).send({ patientId: '00000000-0000-4000-8000-000000000000', title: 'Valid title', content: 'Valid content' });
    expect(res.status).toBe(422);
    const bad = await request(ctx.app).post('/api/records').set(auth()).send({ patientId: 'nope', title: 'x', content: '' });
    expect(bad.status).toBe(422);
  });

  it('keeps an immutable revision history on edit and restricts editing to the author', async () => {
    const p = await makePatient(clinicianId);
    const created = await request(ctx.app).post('/api/records').set(auth()).send({ patientId: p.id, title: 'Original title', content: 'Original content' });
    const id = created.body.data.id;
    const forbidden = await request(ctx.app).patch(`/api/records/${id}`).set(auth(other)).send({ title: 'Hijacked' });
    expect(forbidden.status).toBe(403);
    const edit = await request(ctx.app).patch(`/api/records/${id}`).set(auth()).send({ content: 'Updated content' });
    expect(edit.status).toBe(200);
    expect(edit.body.data.version).toBe(2);
    const detail = await request(ctx.app).get(`/api/records/${id}`).set(auth());
    expect(detail.body.data.revisions).toHaveLength(1);
    expect(detail.body.data.revisions[0]).toMatchObject({ version: 1, content: 'Original content' });
  });
});
