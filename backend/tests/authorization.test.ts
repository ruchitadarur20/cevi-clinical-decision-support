import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { login, makeApp, makePatient, makeUser, resetDb } from './helpers';
import { can, PERMISSIONS } from '../src/lib/permissions';
import { serializePatient } from '../src/lib/serializers';

let ctx: Awaited<ReturnType<typeof makeApp>>;
let tokens: { admin: string; clinician: string; researcher: string };
let patientId: string;

beforeAll(async () => { ctx = await makeApp(); });
beforeEach(async () => {
  await resetDb();
  const a = await makeUser('ADMINISTRATOR');
  const c = await makeUser('CLINICIAN');
  await makeUser('RESEARCHER');
  tokens = { admin: await login(ctx.app, a.email), clinician: await login(ctx.app, c.email), researcher: await login(ctx.app, 'researcher@test.dev') };
  patientId = (await makePatient(c.id, { syntheticId: 'SYN-900001', firstName: 'Ada', lastName: 'Lovelace' })).id;
});

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('role-based access control (enforced by the API)', () => {
  it('requires authentication on every resource', async () => {
    for (const path of ['/api/patients', '/api/records', '/api/images', '/api/analyses', '/api/users', '/api/analytics/summary', '/api/dashboard']) {
      expect((await request(ctx.app).get(path)).status, path).toBe(401);
    }
  });

  it('only administrators can manage users', async () => {
    expect((await request(ctx.app).get('/api/users').set(auth(tokens.admin))).status).toBe(200);
    expect((await request(ctx.app).get('/api/users').set(auth(tokens.clinician))).status).toBe(403);
    expect((await request(ctx.app).get('/api/users').set(auth(tokens.researcher))).status).toBe(403);
    const create = await request(ctx.app).post('/api/users').set(auth(tokens.clinician)).send({ email: 'x@test.dev', name: 'X Y', role: 'ADMINISTRATOR', password: 'Passw0rdPassw0rd' });
    expect(create.status).toBe(403);
  });

  it('only clinicians can create patients and records', async () => {
    const body = { firstName: 'A', lastName: 'B', dateOfBirth: '1990-01-01', researchCohort: 'Test' };
    expect((await request(ctx.app).post('/api/patients').set(auth(tokens.researcher)).send(body)).status).toBe(403);
    expect((await request(ctx.app).post('/api/patients').set(auth(tokens.admin)).send(body)).status).toBe(403);
    expect((await request(ctx.app).post('/api/patients').set(auth(tokens.clinician)).send(body)).status).toBe(201);
    const rec = { patientId, title: 'Title here', content: 'Some content' };
    expect((await request(ctx.app).post('/api/records').set(auth(tokens.researcher)).send(rec)).status).toBe(403);
    expect((await request(ctx.app).post('/api/records').set(auth(tokens.admin)).send(rec)).status).toBe(403);
  });

  it('restricts analytics to administrators and researchers', async () => {
    expect((await request(ctx.app).get('/api/analytics/summary').set(auth(tokens.clinician))).status).toBe(403);
    expect((await request(ctx.app).get('/api/analytics/summary').set(auth(tokens.researcher))).status).toBe(200);
    expect((await request(ctx.app).get('/api/analytics/summary').set(auth(tokens.admin))).status).toBe(200);
  });

  it('anonymizes patient identity for researchers', async () => {
    const res = await request(ctx.app).get(`/api/patients/${patientId}`).set(auth(tokens.researcher));
    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBeNull();
    expect(res.body.data.lastName).toBeNull();
    expect(res.body.data.dateOfBirth).toBeNull();
    expect(res.body.data.anonymized).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('Lovelace');
    const clin = await request(ctx.app).get(`/api/patients/${patientId}`).set(auth(tokens.clinician));
    expect(clin.body.data.lastName).toBe('Lovelace');
  });

  it('does not let researchers re-identify patients through search', async () => {
    const byName = await request(ctx.app).get('/api/patients?q=Lovelace').set(auth(tokens.researcher));
    expect(byName.body.meta.total).toBe(0);
    const byId = await request(ctx.app).get('/api/patients?q=SYN-900001').set(auth(tokens.researcher));
    expect(byId.body.meta.total).toBe(1);
    const global = await request(ctx.app).get('/api/search?q=Lovelace').set(auth(tokens.researcher));
    expect(global.body.data.patients).toHaveLength(0);
  });

  it('prevents administrators from demoting or deactivating themselves', async () => {
    const { prisma } = await import('../src/lib/prisma');
    const me = await prisma.user.findUniqueOrThrow({ where: { email: 'administrator@test.dev' } });
    const res = await request(ctx.app).patch(`/api/users/${me.id}`).set(auth(tokens.admin)).send({ role: 'CLINICIAN' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SELF_MODIFICATION');
  });

  it('permission matrix unit checks', () => {
    expect(can('RESEARCHER', 'analyses:create')).toBe(true);
    expect(can('RESEARCHER', 'patients:identify')).toBe(false);
    expect(can('ADMINISTRATOR', 'records:write')).toBe(false);
    expect(Object.keys(PERMISSIONS).length).toBeGreaterThan(8);
  });

  it('serializePatient hides names for research roles', () => {
    const p: any = { id: '1', syntheticId: 'SYN-1', firstName: 'A', lastName: 'B', dateOfBirth: new Date('1970-01-01'), sex: 'MALE', researchCohort: 'C', caseStatus: 'ACTIVE', summary: null, isSynthetic: true, createdAt: new Date(), updatedAt: new Date() };
    expect(serializePatient(p, 'RESEARCHER').firstName).toBeNull();
    expect(serializePatient(p, 'CLINICIAN').firstName).toBe('A');
  });
});
