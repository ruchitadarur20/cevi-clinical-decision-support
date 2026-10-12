import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { login, makeApp, makePatient, makePng, makeUser, resetDb } from './helpers';
import { validateImage } from '../src/lib/imageValidation';
import { prisma } from '../src/lib/prisma';

let ctx: Awaited<ReturnType<typeof makeApp>>;
let clin: string;
let res_: string;
let patientId: string;

beforeAll(async () => { ctx = await makeApp(); });
beforeEach(async () => {
  await resetDb();
  ctx.ml.mode = 'ok';
  const c = await makeUser('CLINICIAN');
  const r = await makeUser('RESEARCHER');
  clin = await login(ctx.app, c.email);
  res_ = await login(ctx.app, r.email);
  patientId = (await makePatient(c.id)).id;
});
const auth = (t = clin) => ({ Authorization: `Bearer ${t}` });

const upload = (file: Buffer, name = 'scan.png', fields: Record<string, string> = {}, token = clin) => {
  const r = request(ctx.app).post('/api/images').set(auth(token)).field('patientId', fields.patientId ?? patientId).field('modality', fields.modality ?? 'XRAY');
  return r.attach('file', file, name);
};

describe('image upload', () => {
  it('accepts a valid PNG, stores metadata and serves the file back only to authenticated users', async () => {
    const res = await upload(makePng(80, 60));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ width: 80, height: 60, mimeType: 'image/png', processingStatus: 'UPLOADED' });
    const id = res.body.data.id;
    expect((await request(ctx.app).get(`/api/images/${id}/file`)).status).toBe(401);
    const file = await request(ctx.app).get(`/api/images/${id}/file`).set(auth());
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects files whose signature is not JPEG/PNG even with an image extension', async () => {
    const res = await upload(Buffer.from('<?php echo 1; ?> this is not an image file'), 'evil.png');
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects corrupt images, tiny images and oversized files', async () => {
    const png = makePng();
    expect((await upload(png.subarray(0, 40))).status).toBe(422);
    expect((await upload(makePng(8, 8))).body.error.code).toBe('IMAGE_TOO_SMALL');
    const big = Buffer.concat([makePng(), Buffer.alloc(2 * 1024 * 1024)]);
    expect((await upload(big)).status).toBe(413);
  });

  it('validates the patient and the presence of a file', async () => {
    expect((await upload(makePng(), 'a.png', { patientId: '00000000-0000-4000-8000-000000000000' })).status).toBe(422);
    const none = await request(ctx.app).post('/api/images').set(auth()).field('patientId', patientId);
    expect(none.status).toBe(422);
  });

  it('forbids researchers from uploading', async () => {
    expect((await upload(makePng(), 'a.png', {}, res_)).status).toBe(403);
  });

  it('sanitises client filenames', () => {
    const v = validateImage(makePng());
    expect(v.storageKey).toMatch(/^[0-9a-f-]{36}\.png$/);
  });
});

describe('analyses', () => {
  async function newImage() {
    const r = await upload(makePng());
    return r.body.data.id as string;
  }

  it('runs an experimental analysis and persists the result', async () => {
    const imageId = await newImage();
    const res = await request(ctx.app).post('/api/analyses').set(auth()).send({ imageId });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'COMPLETED', mode: 'EXPERIMENTAL_INFERENCE', modelName: 'EfficientNet-B0', inferenceMs: 12 });
    expect(res.body.data.predictions[0].label).toBe('test label');
    expect(res.body.data.disclaimer).toMatch(/must not be used/);
    const img = await prisma.medicalImage.findUniqueOrThrow({ where: { id: imageId } });
    expect(img.processingStatus).toBe('ANALYZED');
    const list = await request(ctx.app).get(`/api/analyses?imageId=${imageId}`).set(auth());
    expect(list.body.meta.total).toBe(1);
  });

  it('attaches clinical-record context for reviewers', async () => {
    const imageId = await newImage();
    const rec = await request(ctx.app).post('/api/records').set(auth()).send({ patientId, title: 'Context record', content: 'Some content' });
    const res = await request(ctx.app).post('/api/analyses').set(auth()).send({ imageId, recordIds: [rec.body.data.id] });
    expect(res.body.data.contextSnapshot.records).toHaveLength(1);
    expect(res.body.data.contextSnapshot.note).toMatch(/image model does not consume/);
  });

  it("rejects records that don't belong to the image's patient", async () => {
    const imageId = await newImage();
    const c = await prisma.user.findFirstOrThrow({ where: { role: 'CLINICIAN' } });
    const other = await makePatient(c.id, { syntheticId: 'SYN-777777' });
    const rec = await prisma.clinicalRecord.create({ data: { patientId: other.id, authorId: c.id, title: 'Other', content: 'Other content' } });
    const res = await request(ctx.app).post('/api/analyses').set(auth()).send({ imageId, recordIds: [rec.id] });
    expect(res.status).toBe(422);
  });

  it('records UNAVAILABLE (and no predictions) when model weights are missing', async () => {
    ctx.ml.mode = 'unavailable';
    const imageId = await newImage();
    const res = await request(ctx.app).post('/api/analyses').set(auth()).send({ imageId });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('UNAVAILABLE');
    expect(res.body.data.predictions).toBeNull();
    expect((await prisma.medicalImage.findUniqueOrThrow({ where: { id: imageId } })).processingStatus).toBe('UPLOADED');
  });

  it('records FAILED when the ML service is down, without a 500', async () => {
    ctx.ml.mode = 'down';
    const imageId = await newImage();
    const res = await request(ctx.app).post('/api/analyses').set(auth()).send({ imageId });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('FAILED');
    expect(res.body.data.errorMessage).toMatch(/not reachable/);
  });

  it('allows researchers to run analyses but they only see anonymized patients', async () => {
    const imageId = await newImage();
    const res = await request(ctx.app).post('/api/analyses').set(auth(res_)).send({ imageId });
    expect(res.status).toBe(201);
    expect(res.body.data.patient.displayName).toMatch(/^Anonymized/);
  });

  it('exposes ML status and preprocessing preview', async () => {
    const imageId = await newImage();
    const status = await request(ctx.app).get('/api/analyses/ml-status').set(auth());
    expect(status.body.data.reachable).toBe(true);
    const prev = await request(ctx.app).post('/api/analyses/preprocess-preview').set(auth()).send({ imageId });
    expect(prev.body.data.tensor.shape).toEqual([1, 3, 224, 224]);
  });
});
