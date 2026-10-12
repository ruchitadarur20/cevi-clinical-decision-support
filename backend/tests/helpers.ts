import bcrypt from 'bcryptjs';
import request from 'supertest';
import { deflateSync } from 'node:zlib';
import type { Role } from '@prisma/client';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { MemoryStorage } from '../src/lib/storage';
import { MlClientError, type MlClient, type MlInferResult } from '../src/lib/mlClient';

export const PASSWORD = 'TestPassw0rd!';

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
};
/** Minimal valid grayscale PNG of the given size. */
export function makePng(w = 64, h = 64): Buffer {
  const raw = Buffer.alloc((w + 1) * h, 90);
  for (let y = 0; y < h; y++) raw[y * (w + 1)] = 0;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export const fakeInference: MlInferResult = {
  model: {
    name: 'EfficientNet-B0', version: 'torchvision-IMAGENET1K_V1', architecture: 'efficientnet_b0',
    weights_source: 'test', weights_loaded: true, trained_task: 'ImageNet-1k', clinically_validated: false,
    num_parameters: 5288548, input_size: [224, 224], notes: [],
  },
  preprocessing: { color_mode: 'RGB' },
  predictions: [{ rank: 1, class_index: 1, label: 'test label', probability: 0.5 }],
  timing: { preprocess_ms: 1, inference_ms: 12.4, total_ms: 14 },
  disclaimer: 'test',
};

export class FakeMl implements MlClient {
  mode: 'ok' | 'unavailable' | 'down' = 'ok';
  async health() { return { status: 'ok', model_ready: true }; }
  async model() { return fakeInference.model; }
  async preprocess() {
    return { preprocessing: {}, tensor: { shape: [1, 3, 224, 224], dtype: 'float32', min: 0, max: 1, mean: 0.5, std: 0.2 }, timing: { preprocess_ms: 2 } };
  }
  async infer() {
    if (this.mode === 'unavailable') throw new MlClientError('MODEL_WEIGHTS_UNAVAILABLE', 'weights not available', 503);
    if (this.mode === 'down') throw new MlClientError('ML_UNREACHABLE', 'ML service is not reachable');
    return fakeInference;
  }
}

export async function resetDb() {
  await prisma.activityLog.deleteMany();
  await prisma.analysisResult.deleteMany();
  await prisma.medicalImage.deleteMany();
  await prisma.clinicalRecordRevision.deleteMany();
  await prisma.clinicalRecord.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.user.deleteMany();
}

export async function makeUser(role: Role, email = `${role.toLowerCase()}@test.dev`, isActive = true) {
  return prisma.user.create({ data: { email, name: `Test ${role}`, role, isActive, passwordHash: await bcrypt.hash(PASSWORD, 4) } });
}

export async function makeApp() {
  const ml = new FakeMl();
  const storage = new MemoryStorage();
  const app = createApp({ ml, storage });
  return { app, ml, storage };
}

export async function login(app: ReturnType<typeof createApp>, email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return res.body.data.token as string;
}

export async function makePatient(createdById: string, over: Record<string, unknown> = {}) {
  return prisma.patient.create({
    data: {
      syntheticId: `SYN-${Math.floor(Math.random() * 900000 + 100000)}`,
      firstName: 'Test', lastName: 'Patient', dateOfBirth: new Date('1980-05-05'), sex: 'FEMALE',
      researchCohort: 'Test Cohort', createdById, ...over,
    },
  });
}
