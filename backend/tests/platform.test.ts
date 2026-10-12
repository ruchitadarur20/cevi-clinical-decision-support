import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { login, makeApp, makePatient, makePng, makeUser, resetDb } from './helpers';

let ctx: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => { ctx = await makeApp(); });
beforeEach(async () => { await resetDb(); });

describe('platform behaviour', () => {
  it('reports health including dependency status', async () => {
    const res = await request(ctx.app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.services).toMatchObject({ api: 'ok', database: 'ok', mlService: 'ok' });
  });

  it('returns structured 404 and malformed-JSON errors without leaking internals', async () => {
    const nf = await request(ctx.app).get('/api/nope');
    expect(nf.status).toBe(404);
    expect(nf.body.error.code).toBe('NOT_FOUND');
    const bad = await request(ctx.app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad json');
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).not.toMatch(/at .*\.ts|node_modules/);
  });

  it('sets security headers', async () => {
    const res = await request(ctx.app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('dashboard and analytics aggregate real database rows', async () => {
    const admin = await makeUser('ADMINISTRATOR');
    const c = await makeUser('CLINICIAN');
    const token = await login(ctx.app, c.email);
    const p = await makePatient(c.id);
    const up = await request(ctx.app).post('/api/images').set('Authorization', `Bearer ${token}`).field('patientId', p.id).attach('file', makePng(), 'a.png');
    await request(ctx.app).post('/api/analyses').set('Authorization', `Bearer ${token}`).send({ imageId: up.body.data.id });

    const dash = await request(ctx.app).get('/api/dashboard').set('Authorization', `Bearer ${token}`);
    expect(dash.status).toBe(200);
    expect(dash.body.data.totals).toMatchObject({ patients: 1, images: 1, analysesCompleted: 1 });
    expect(dash.body.data.activitySeries).toHaveLength(14);

    const at = await login(ctx.app, admin.email);
    const an = await request(ctx.app).get('/api/analytics/summary').set('Authorization', `Bearer ${at}`);
    expect(an.status).toBe(200);
    expect(an.body.data.totals.analyses).toBe(1);
    expect(an.body.data.latency.avgMs).toBe(12);
    expect(an.body.data.trends).toHaveLength(30);
    expect(an.body.data.dataNotice).toMatch(/No clinical performance/);
  });

  it('admin can create, update and deactivate users', async () => {
    const admin = await makeUser('ADMINISTRATOR');
    const token = await login(ctx.app, admin.email);
    const h = { Authorization: `Bearer ${token}` };
    const created = await request(ctx.app).post('/api/users').set(h).send({ email: 'New.User@test.dev', name: 'New User', role: 'RESEARCHER', password: 'LongEnough123' });
    expect(created.status).toBe(201);
    expect(created.body.data.email).toBe('new.user@test.dev');
    expect(created.body.data).not.toHaveProperty('passwordHash');
    const dup = await request(ctx.app).post('/api/users').set(h).send({ email: 'new.user@test.dev', name: 'Dup', role: 'RESEARCHER', password: 'LongEnough123' });
    expect(dup.status).toBe(409);
    const patch = await request(ctx.app).patch(`/api/users/${created.body.data.id}`).set(h).send({ role: 'CLINICIAN', isActive: false });
    expect(patch.body.data).toMatchObject({ role: 'CLINICIAN', isActive: false });
  });
});
