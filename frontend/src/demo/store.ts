import seedJson from './data/seed.json';
import type { ActivityItem, Analysis, MlStatus, PreprocessPreview, Role, Sex, CaseStatus, RecordType, Severity, Modality, ProcessingStatus } from '@/lib/types';
import { clearLocalImages, registerLocalImage } from './localImages';

export interface DUser { id: string; email: string; name: string; role: Role; isActive: boolean; lastLoginAt: string | null; createdAt: string }
export interface DPatient {
  id: string; syntheticId: string; firstName: string; lastName: string; dateOfBirth: string; sex: Sex; researchCohort: string;
  caseStatus: CaseStatus; summary: string | null; createdAt: string; updatedAt: string; createdBy: { id: string; name: string }; browserOnly?: boolean;
}
export interface DRevision { version: number; type: RecordType; severity: Severity; title: string; content: string; editedBy: { id: string; name: string }; createdAt: string }
export interface DRecord {
  id: string; patientId: string; type: RecordType; severity: Severity; title: string; content: string; recordedAt: string; version: number;
  createdAt: string; updatedAt: string; author: { id: string; name: string; role: Role }; revisions: DRevision[]; browserOnly?: boolean;
}
export interface DImage {
  id: string; patientId: string; originalName: string; mimeType: string; sizeBytes: number; width: number; height: number; sha256: string;
  modality: Modality; description: string | null; processingStatus: ProcessingStatus; isSynthetic: boolean; createdAt: string;
  uploadedBy: { id: string; name: string }; browserOnly?: boolean; thumb?: string;
}
export type DAnalysis = Analysis & { imageId: string; patientId: string };

export interface DemoState {
  v: number;
  snapshotAt: string;
  referenceDate: string;
  users: DUser[];
  patients: DPatient[];
  records: DRecord[];
  images: DImage[];
  analyses: DAnalysis[];
  activity: Array<ActivityItem & { entityType?: string; entityId?: string | null; browserOnly?: boolean }>;
  preprocess: Record<string, PreprocessPreview>;
  ml: MlStatus;
}

const STORAGE_KEY = 'cevi-demo-state';
const VERSION = 1;

const fresh = (): DemoState => ({ ...(JSON.parse(JSON.stringify(seedJson)) as Omit<DemoState, 'v'>), v: VERSION });

let state: DemoState | null = null;

function hydrateImages(s: DemoState) {
  for (const i of s.images) if (i.thumb) registerLocalImage(i.id, null, i.thumb);
}

export function getState(): DemoState {
  if (state) return state;
  let loaded: DemoState | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      // Guard against stale/corrupt saves: only accept the current schema with the expected collections.
      if (parsed.v === VERSION && Array.isArray(parsed.patients) && Array.isArray(parsed.records) && Array.isArray(parsed.images) && Array.isArray(parsed.analyses)) loaded = parsed;
    }
  } catch { /* corrupt or unavailable storage: fall back to the bundled dataset */ }
  state = loaded ?? fresh();
  hydrateImages(state);
  return state;
}

/** Persist after a mutation. Failures (quota, private mode) only cost persistence, never correctness. */
export function save() {
  if (!state) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export function resetDemo() {
  clearLocalImages();
  state = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('cevi-demo-session');
    localStorage.removeItem('cevi-seen-activity');
  } catch { /* ignore */ }
}

export const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
