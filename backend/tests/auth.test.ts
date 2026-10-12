import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { login, makeApp, makeUser, PASSWORD, resetDb } from './helpers';

let ctx: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => { ctx = await makeApp(); });
beforeEach(async () => { await resetDb(); });

describe('authentication', () => {
  it('logs in with valid credentials and sets an httpOnly cookie', async () => {
    await makeUser('CLINICIAN');
    const res = await request(ctx.app).post('/api/auth/login').send({ email: 'clinician@test.dev', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('CLINICIAN');
    expect(res.body.data.user.permissions).toContain('patients:write');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/cevi_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('rejects wrong password and unknown email with the same generic message', async () => {
    await makeUser('CLINICIAN');
    const bad = await request(ctx.app).post('/api/auth/login').send({ email: 'clinician@test.dev', password: 'nope' });
    const unknown = await request(ctx.app).post('/api/auth/login').send({ email: 'ghost@test.dev', password: 'nope' });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.error.message).toBe(unknown.body.error.message);
  });

  it('rejects inactive accounts', async () => {
    await makeUser('CLINICIAN', 'off@test.dev', false);
    const res = await request(ctx.app).post('/api/auth/login').send({ email: 'off@test.dev', password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it('validates the login payload', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('protects /me and returns the current user when authenticated', async () => {
    expect((await request(ctx.app).get('/api/auth/me')).status).toBe(401);
    await makeUser('RESEARCHER');
    const token = await login(ctx.app, 'researcher@test.dev');
    const res = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('researcher@test.dev');
  });

  it('rejects a tampered token', async () => {
    await makeUser('RESEARCHER');
    const token = await login(ctx.app, 'researcher@test.dev');
    const res = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${token}x`);
    expect(res.status).toBe(401);
  });

  it('revokes access immediately when a user is deactivated', async () => {
    const u = await makeUser('CLINICIAN');
    const token = await login(ctx.app, u.email);
    const { prisma } = await import('../src/lib/prisma');
    await prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
    const res = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('clears the cookie on logout', async () => {
    const res = await request(ctx.app).post('/api/auth/logout');
    expect(res.status).toBe(204);
    expect(String(res.headers['set-cookie'])).toMatch(/cevi_token=;/);
  });

  it('changes password only with the correct current password', async () => {
    await makeUser('CLINICIAN');
    const token = await login(ctx.app, 'clinician@test.dev');
    const wrong = await request(ctx.app).post('/api/auth/change-password').set('Authorization', `Bearer ${token}`).send({ currentPassword: 'bad', newPassword: 'BrandNewPass123' });
    expect(wrong.status).toBe(400);
    const weak = await request(ctx.app).post('/api/auth/change-password').set('Authorization', `Bearer ${token}`).send({ currentPassword: PASSWORD, newPassword: 'short' });
    expect(weak.status).toBe(422);
    const ok = await request(ctx.app).post('/api/auth/change-password').set('Authorization', `Bearer ${token}`).send({ currentPassword: PASSWORD, newPassword: 'BrandNewPass123' });
    expect(ok.status).toBe(204);
    const relog = await request(ctx.app).post('/api/auth/login').send({ email: 'clinician@test.dev', password: 'BrandNewPass123' });
    expect(relog.status).toBe(200);
  });
});
