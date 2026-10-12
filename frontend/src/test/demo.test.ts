import { beforeEach, describe, expect, it } from 'vitest';
import { handle } from '@/demo/server';
import { resetDemo } from '@/demo/store';
import { ApiError } from '@/lib/api';

const login = (email: string) => handle('POST', '/auth/login', { body: { email } });
const get = (path: string, params?: Record<string, string | number>) => handle('GET', path, { params });
const rejects = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e as ApiError; }
  throw new Error('expected rejection');
};

beforeEach(() => resetDemo());

describe('demo data provider', () => {
  it('serves the bundled, internally consistent synthetic dataset', async () => {
    await login('clinician@cevi.demo');
    const patients = await get('/patients', { pageSize: 100 });
    expect(patients.meta.total).toBe(30);
    const p = patients.data[0];
    const detail = await get(`/patients/${p.id}`);
    // the profile, records list and images list agree about the same patient
    const records = await get('/records', { patientId: p.id, pageSize: 100 });
    const images = await get('/images', { patientId: p.id, pageSize: 100 });
    expect(detail.data.records).toHaveLength(Math.min(50, records.meta.total));
    expect(detail.data.imageCount).toBe(images.meta.total);
    for (const a of detail.data.analyses) expect(images.data.map((i: any) => i.id)).toContain(a.image.id);
  });

  it('enforces the same role matrix as the API', async () => {
    await login('researcher@cevi.demo');
    const err = await rejects(handle('POST', '/records', { body: { patientId: 'x', title: 'abc', content: 'abcde' } }));
    expect(err.status).toBe(403);
    expect((await rejects(get('/users'))).status).toBe(403);
    const list = await get('/patients', { pageSize: 5 });
    expect(list.data[0].displayName).toMatch(/^Anonymized/);
    expect(list.data[0].firstName).toBeNull();
    expect(list.data[0].dateOfBirth).toBeNull();
    // name search must not work for roles that cannot identify patients
    const byName = await get('/patients', { q: 'Okafor' });
    expect(byName.meta.total).toBe(0);

    await login('clinician@cevi.demo');
    expect((await rejects(get('/analytics/summary'))).status).toBe(403);
  });

  it('creates and edits records with browser-only revision history', async () => {
    await login('clinician@cevi.demo');
    const [p] = (await get('/patients')).data;
    const bad = await rejects(handle('POST', '/records', { body: { patientId: p.id, title: 'x', content: 'y' } }));
    expect(bad.status).toBe(422);
    expect(bad.fieldErrors.title).toBeTruthy();

    const created = await handle('POST', '/records', { body: { patientId: p.id, title: 'Demo observation', content: 'Synthetic content here' } });
    expect(created.data.version).toBe(1);
    expect(created.data.browserOnly).toBe(true);
    const edited = await handle('PATCH', `/records/${created.data.id}`, { body: { title: 'Demo observation v2' } });
    expect(edited.data.version).toBe(2);
    const full = await get(`/records/${created.data.id}`);
    expect(full.data.revisions).toHaveLength(1);
    expect(full.data.revisions[0]).toMatchObject({ version: 1, title: 'Demo observation' });
  });

  it('only lets the original author edit a record', async () => {
    await login('clinician@cevi.demo');
    const me = (await get('/auth/me')).data.user;
    const all = (await get('/records', { pageSize: 100 })).data as any[];
    const foreign = all.find((r) => r.author.id !== me.id);
    expect(foreign).toBeTruthy();
    const err = await rejects(handle('PATCH', `/records/${foreign.id}`, { body: { title: 'Hijack attempt' } }));
    expect(err.status).toBe(403);
  });

  it('never runs inference: new analyses are refused, recorded ones replay unchanged', async () => {
    await login('clinician@cevi.demo');
    const err = await rejects(handle('POST', '/analyses', { body: { imageId: 'x', recordIds: [] } }));
    expect(err.code).toBe('DEMO_MODE');
    const { data } = await get('/analyses', { pageSize: 50 });
    expect(data.length).toBeGreaterThan(0);
    for (const a of data) {
      expect(a.recorded).toBe(true);
      expect(a.modelName).toBe('EfficientNet-B0');
    }
    const ml = (await get('/analyses/ml-status')).data;
    expect(ml.recorded).toBe(true);
    expect(ml.model.clinically_validated).toBe(false);
  });

  it('aggregates dashboard windows from the stored rows', async () => {
    await login('clinician@cevi.demo');
    const d7 = (await get('/dashboard', { days: 7 })).data;
    const d30 = (await get('/dashboard', { days: 30 })).data;
    expect(d7.activitySeries).toHaveLength(7);
    expect(d30.activitySeries).toHaveLength(30);
    expect(d30.totals.recordsLast14Days).toBeGreaterThanOrEqual(d7.totals.recordsLast14Days);
    expect(d7.totals.patients).toBe(30);
    const before = d7.totals.records;
    const [p] = (await get('/patients')).data;
    await handle('POST', '/records', { body: { patientId: p.id, title: 'One more', content: 'Synthetic content' } });
    expect((await get('/dashboard', { days: 7 })).data.totals.records).toBe(before + 1);
  });

  it('rejects files whose content is not PNG/JPEG regardless of the name', async () => {
    await login('clinician@cevi.demo');
    const [p] = (await get('/patients')).data;
    const before = (await get('/images', { patientId: p.id })).meta.total;
    const form = new FormData();
    form.append('patientId', p.id);
    form.append('modality', 'XRAY');
    form.append('file', new File(['this is plain text, not an image'], 'scan.png', { type: 'image/png' }));
    const err = await rejects(handle('POST', '/images', { form }));
    expect(err.status).toBe(415);
    expect((await get('/images', { patientId: p.id })).meta.total).toBe(before);
  });

  it('reset restores the bundled dataset and default role', async () => {
    await login('admin@cevi.demo');
    await handle('POST', '/auth/switch-role', { body: { role: 'RESEARCHER' } });
    await handle('POST', '/demo/reset', {});
    const me = (await get('/auth/me')).data.user;
    expect(me.role).toBe('CLINICIAN');
  });
});
