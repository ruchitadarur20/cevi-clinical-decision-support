/**
 * Seeds the database with CLEARLY SYNTHETIC data.
 *  - Names, dates and clinical text are fictional and randomly composed.
 *  - Images are procedurally generated "phantoms" (no real scans).
 *  - Analyses are produced by the real ML service when reachable. If it is not,
 *    DEMONSTRATION entries are recorded that carry NO model output.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { Prisma, PrismaClient, type Role } from '@prisma/client';
import { LocalDiskStorage } from '../src/lib/storage';
import { HttpMlClient } from '../src/lib/mlClient';

const prisma = new PrismaClient();
const storage = new LocalDiskStorage(process.env.STORAGE_DIR ?? './storage');
export const DEMO_PASSWORD = 'CeviDemo2026!';

// ---- deterministic RNG so the seed is reproducible ---------------------------
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260101);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const daysAgo = (d: number, jitterHours = 8) => new Date(Date.now() - d * 86_400_000 - Math.floor(rnd() * jitterHours * 3_600_000));

// ---- tiny PNG encoder (8-bit grayscale) --------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf: Buffer) => { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(gray: Uint8Array, w: number, h: number): Buffer {
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; Buffer.from(gray.buffer, gray.byteOffset + y * w, w).copy(raw, y * (w + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
/** Procedural phantom: soft elliptical "body", a few dense blobs and noise. Not a medical image. */
function phantom(w = 320, h = 320): Buffer {
  const px = new Uint8Array(w * h);
  const blobs = Array.from({ length: int(2, 4) }, () => ({ x: int(w * 0.3, w * 0.7), y: int(h * 0.3, h * 0.7), r: int(14, 40), a: int(40, 110) }));
  const cx = w / 2, cy = h / 2, rx = w * (0.34 + rnd() * 0.08), ry = h * (0.40 + rnd() * 0.06);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    let v = e < 1 ? 70 + 80 * (1 - e) : 12;
    for (const b of blobs) { const d = Math.hypot(x - b.x, y - b.y); if (d < b.r * 2) v += b.a * Math.exp(-(d * d) / (2 * (b.r / 1.6) ** 2)); }
    v += (rnd() - 0.5) * 22;
    px[y * w + x] = Math.max(0, Math.min(255, v));
  }
  return encodePng(px, w, h);
}

// ---- fictional content --------------------------------------------------------
const FIRST = ['Amara', 'Liam', 'Sofia', 'Noah', 'Mei', 'Omar', 'Elena', 'Kenji', 'Priya', 'Lucas', 'Aisha', 'Mateo', 'Hana', 'Jonas', 'Nia', 'Rafael', 'Ingrid', 'Tariq', 'Camila', 'Dmitri', 'Leila', 'Owen', 'Yara', 'Felix', 'Zoe', 'Arjun', 'Mina', 'Hugo', 'Thandi', 'Ravi'];
const LAST = ['Okafor', 'Lindqvist', 'Moreau', 'Tanaka', 'Haddad', 'Castillo', 'Novak', 'Banerjee', 'Fischer', 'Mbeki', 'Rossi', 'Kowalski', 'Nguyen', 'Alvarez', 'Petrov', 'Sato', 'Dubois', 'Khan', 'Larsen', 'Oyelaran', 'Silva', 'Brandt', 'Ito', 'Vargas', 'Hoang', 'Eriksen', 'Mensah', 'Ortega', 'Varga', 'Kapoor'];
const COHORTS = ['Thoracic Imaging Study', 'Dermatology Screening Pilot', 'Orthopedic Follow-up', 'Neuro Imaging Pilot', 'General Observation'];
const MODALITY_BY_COHORT: Record<string, Array<'XRAY' | 'CT' | 'MRI' | 'ULTRASOUND' | 'DERMATOSCOPY' | 'OTHER'>> = {
  'Thoracic Imaging Study': ['XRAY', 'CT'], 'Dermatology Screening Pilot': ['DERMATOSCOPY'], 'Orthopedic Follow-up': ['XRAY', 'MRI'],
  'Neuro Imaging Pilot': ['MRI', 'CT'], 'General Observation': ['ULTRASOUND', 'OTHER'],
};
const RECORD_TEMPLATES = [
  { type: 'OBSERVATION', severity: 'ROUTINE', title: 'Routine follow-up observation', content: 'Synthetic observation: patient reports stable symptoms since last visit. Vital signs recorded within expected range. No new concerns raised.' },
  { type: 'OBSERVATION', severity: 'ELEVATED', title: 'Symptom change noted', content: 'Synthetic observation: patient reports intermittent discomfort over the past week. Plan: continue monitoring and repeat assessment at next visit.' },
  { type: 'DIAGNOSTIC_NOTE', severity: 'ROUTINE', title: 'Imaging review note', content: 'Synthetic note: research image reviewed alongside history. Findings are fictional placeholders for demonstration and carry no clinical meaning.' },
  { type: 'LAB_RESULT', severity: 'ROUTINE', title: 'Laboratory panel (synthetic)', content: 'Synthetic panel: all values generated for demonstration. Hemoglobin 13.4 g/dL, WBC 6.8 x10^9/L, CRP 2.1 mg/L.' },
  { type: 'LAB_RESULT', severity: 'ELEVATED', title: 'Inflammatory marker follow-up', content: 'Synthetic panel: CRP 18.0 mg/L (fictional). Repeat in two weeks suggested within the study protocol.' },
  { type: 'PROCEDURE', severity: 'ROUTINE', title: 'Study procedure completed', content: 'Synthetic procedure log: protocol imaging session completed without incident. Image uploaded to the research workspace.' },
  { type: 'FOLLOW_UP', severity: 'ROUTINE', title: 'Follow-up scheduled', content: 'Synthetic follow-up: next research visit scheduled in six weeks. Patient informed of protocol requirements.' },
  { type: 'DIAGNOSTIC_NOTE', severity: 'URGENT', title: 'Escalated review requested', content: 'Synthetic note: flagged for expedited clinician review within the demonstration workflow. Fictional scenario only.' },
] as const;

async function main() {
  console.log('Seeding synthetic data...');
  await prisma.$transaction([
    prisma.activityLog.deleteMany(), prisma.analysisResult.deleteMany(), prisma.medicalImage.deleteMany(),
    prisma.clinicalRecordRevision.deleteMany(), prisma.clinicalRecord.deleteMany(), prisma.patient.deleteMany(), prisma.user.deleteMany(),
  ]);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const mkUser = (email: string, name: string, role: Role) => prisma.user.create({ data: { email, name, role, passwordHash, createdAt: daysAgo(60) } });
  const admin = await mkUser('admin@cevi.demo', 'Dr. Imani Reyes (Demo Admin)', 'ADMINISTRATOR');
  const clinician = await mkUser('clinician@cevi.demo', 'Dr. Marcus Ellery (Demo Clinician)', 'CLINICIAN');
  const clinician2 = await mkUser('clinician2@cevi.demo', 'Dr. Sana Whitfield (Demo Clinician)', 'CLINICIAN');
  const researcher = await mkUser('researcher@cevi.demo', 'Dr. Tomas Aldridge (Demo Researcher)', 'RESEARCHER');
  const authors = [clinician, clinician2];

  // Patients + records
  const patients = [];
  for (let i = 0; i < 30; i++) {
    const cohort = COHORTS[i % COHORTS.length];
    const created = daysAgo(int(5, 55));
    const p = await prisma.patient.create({
      data: {
        syntheticId: `SYN-${String(i + 1).padStart(6, '0')}`,
        firstName: FIRST[i], lastName: LAST[(i * 7) % LAST.length],
        dateOfBirth: new Date(Date.UTC(int(1948, 2004), int(0, 11), int(1, 28))),
        sex: pick(['FEMALE', 'MALE', 'FEMALE', 'MALE', 'OTHER'] as const),
        researchCohort: cohort,
        caseStatus: pick(['ACTIVE', 'ACTIVE', 'ACTIVE', 'MONITORING', 'CLOSED'] as const),
        summary: `Synthetic research participant enrolled in the "${cohort}" cohort. Record generated for demonstration purposes only.`,
        createdById: pick(authors).id, createdAt: created,
      },
    });
    patients.push(p);
    const n = int(2, 5);
    for (let r = 0; r < n; r++) {
      const t = pick(RECORD_TEMPLATES);
      const when = new Date(Math.min(created.getTime() + r * int(1, 6) * 86_400_000, Date.now() - 3_600_000));
      await prisma.clinicalRecord.create({
        data: { patientId: p.id, authorId: pick(authors).id, type: t.type, severity: t.severity, title: t.title, content: t.content, recordedAt: when, createdAt: when },
      });
    }
  }
  // One edited record so the revision history UI has real data.
  const edited = await prisma.clinicalRecord.findFirstOrThrow({ where: { patientId: patients[0].id }, orderBy: { recordedAt: 'asc' } });
  await prisma.clinicalRecordRevision.create({ data: { recordId: edited.id, version: 1, type: edited.type, severity: edited.severity, title: edited.title, content: edited.content, editedById: edited.authorId } });
  await prisma.clinicalRecord.update({ where: { id: edited.id }, data: { version: 2, content: `${edited.content} Addendum (synthetic): wording clarified during review.` } });

  // Images + analyses
  const ml = new HttpMlClient();
  let mlReachable = true;
  try { const h = await ml.health(); mlReachable = h.model_ready === true; } catch { mlReachable = false; }
  console.log(mlReachable ? 'ML service ready: seeded analyses will use real model output.' : 'ML service unavailable: seeding DEMONSTRATION entries without model output.');

  let imgCount = 0, analysisCount = 0;
  for (let i = 0; i < 20; i++) {
    const p = patients[(i * 3) % patients.length];
    const png = phantom();
    const key = `${randomUUID()}.png`;
    await storage.put(key, png);
    const created = daysAgo(int(1, 28));
    const modality = pick(MODALITY_BY_COHORT[p.researchCohort]);
    const image = await prisma.medicalImage.create({
      data: {
        patientId: p.id, uploadedById: pick(authors).id, originalName: `synthetic-phantom-${String(i + 1).padStart(3, '0')}.png`,
        storageKey: key, mimeType: 'image/png', sizeBytes: png.length, width: 320, height: 320,
        sha256: createHash('sha256').update(png).digest('hex'), modality,
        description: 'Procedurally generated synthetic phantom - not a real scan.', isSynthetic: true, createdAt: created,
      },
    });
    imgCount++;
    if (i % 5 === 4) continue; // leave a few images un-analysed for the demo upload/analyse flow
    const requestedBy = pick([clinician, clinician2, researcher]);
    const recs = await prisma.clinicalRecord.findMany({ where: { patientId: p.id }, take: 2 });
    const contextSnapshot = {
      patientSyntheticId: p.syntheticId, researchCohort: p.researchCohort,
      records: recs.map((r) => ({ id: r.id, type: r.type, severity: r.severity, title: r.title, recordedAt: r.recordedAt })),
      note: 'Clinical context is stored with the result for reviewer reference only; the image model does not consume it.',
    };
    const at = new Date(created.getTime() + int(10, 600) * 60_000);
    if (mlReachable) {
      try {
        const t0 = Date.now();
        const out = await ml.infer(png, 'seed.png');
        await prisma.analysisResult.create({
          data: {
            imageId: image.id, requestedById: requestedBy.id, status: 'COMPLETED', mode: 'EXPERIMENTAL_INFERENCE',
            modelName: out.model.name, modelVersion: out.model.version, weightsSource: out.model.weights_source,
            predictions: out.predictions as unknown as Prisma.InputJsonValue, preprocessing: out.preprocessing as Prisma.InputJsonValue,
            contextSnapshot, inferenceMs: Math.round(out.timing.inference_ms), totalMs: Date.now() - t0, isSynthetic: true, createdAt: at, completedAt: at,
          },
        });
        await prisma.medicalImage.update({ where: { id: image.id }, data: { processingStatus: 'ANALYZED' } });
        analysisCount++;
        continue;
      } catch (e) { console.warn('  inference failed during seed:', (e as Error).message); }
    }
    await prisma.analysisResult.create({
      data: {
        imageId: image.id, requestedById: requestedBy.id, status: 'COMPLETED', mode: 'DEMONSTRATION',
        modelName: 'EfficientNet-B0', modelVersion: 'demonstration-record', weightsSource: 'none (recorded demonstration entry - no model output)',
        contextSnapshot, isSynthetic: true, createdAt: at, completedAt: at,
      },
    });
    await prisma.medicalImage.update({ where: { id: image.id }, data: { processingStatus: 'ANALYZED' } });
    analysisCount++;
  }

  // Activity feed
  const actions: Array<[string, string, string]> = [
    ['auth.login', 'User', 'signed in'], ['patient.create', 'Patient', 'registered a synthetic patient'], ['record.create', 'Patient', 'added a clinical record'],
    ['image.upload', 'Patient', 'uploaded a research image'], ['analysis.request', 'Patient', 'requested an experimental analysis'],
  ];
  for (let i = 0; i < 70; i++) {
    const [action, entityType, verb] = pick(actions);
    const actor = pick([admin, clinician, clinician2, researcher]);
    const p = pick(patients);
    await prisma.activityLog.create({
      data: { actorId: actor.id, action, entityType, entityId: entityType === 'Patient' ? p.id : actor.id, summary: entityType === 'Patient' ? `${actor.name.split(' (')[0]} ${verb} (${p.syntheticId})` : `${actor.name.split(' (')[0]} ${verb}`, createdAt: daysAgo(int(0, 29)) },
    });
  }

  console.log(`Seeded: 4 users, ${patients.length} patients, records, ${imgCount} images, ${analysisCount} analyses.`);
  console.log(`Demo accounts (password: ${DEMO_PASSWORD}): admin@cevi.demo, clinician@cevi.demo, researcher@cevi.demo`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
