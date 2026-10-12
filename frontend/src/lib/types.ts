export type Role = 'ADMINISTRATOR' | 'CLINICIAN' | 'RESEARCHER';
export type Permission =
  | 'users:manage' | 'activity:read' | 'patients:read' | 'patients:write' | 'patients:identify'
  | 'records:read' | 'records:write' | 'images:read' | 'images:write'
  | 'analyses:read' | 'analyses:create' | 'analytics:read';

export interface SessionUser { id: string; email: string; name: string; role: Role; permissions: Permission[] }
export interface PageMeta { page: number; pageSize: number; total: number; totalPages: number }
export interface Paged<T> { data: T[]; meta: PageMeta }

export type CaseStatus = 'ACTIVE' | 'MONITORING' | 'CLOSED';
export type Sex = 'FEMALE' | 'MALE' | 'OTHER' | 'UNKNOWN';
export type RecordType = 'OBSERVATION' | 'DIAGNOSTIC_NOTE' | 'LAB_RESULT' | 'PROCEDURE' | 'FOLLOW_UP';
export type Severity = 'ROUTINE' | 'ELEVATED' | 'URGENT';
export type Modality = 'XRAY' | 'CT' | 'MRI' | 'ULTRASOUND' | 'DERMATOSCOPY' | 'OTHER';
export type ProcessingStatus = 'UPLOADED' | 'ANALYZING' | 'ANALYZED' | 'FAILED';
export type AnalysisStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'UNAVAILABLE';
export type AnalysisMode = 'EXPERIMENTAL_INFERENCE' | 'DEMONSTRATION';

export interface Patient {
  id: string; syntheticId: string; firstName: string | null; lastName: string | null; displayName: string;
  dateOfBirth: string | null; age: number | null; ageBand: string; sex: Sex; researchCohort: string;
  caseStatus: CaseStatus; summary: string | null; isSynthetic: boolean; anonymized: boolean;
  createdAt: string; updatedAt: string; recordCount?: number; imageCount?: number;
  /** Demo only: created or edited in this browser, never persisted to a server. */
  browserOnly?: boolean;
}
export interface PatientRef { id: string; syntheticId: string; displayName: string }
export interface ClinicalRecord {
  id: string; type: RecordType; severity: Severity; title: string; content: string; recordedAt: string;
  version: number; createdAt: string; updatedAt: string; patient: PatientRef; author: { id: string; name: string; role: Role };
  browserOnly?: boolean;
}
export interface RecordRevision { version: number; type: RecordType; severity: Severity; title: string; content: string; editedBy: { id: string; name: string }; createdAt: string }
export interface MedicalImage {
  id: string; originalName: string; mimeType: string; sizeBytes: number; width: number; height: number; sha256: string;
  modality: Modality; description: string | null; processingStatus: ProcessingStatus; isSynthetic: boolean;
  createdAt: string; patient: PatientRef; uploadedBy: { id: string; name: string }; analysisCount: number;
  browserOnly?: boolean;
}
export interface Prediction { rank: number; class_index: number; label: string; probability: number }
export interface Analysis {
  id: string; status: AnalysisStatus; mode: AnalysisMode; modelName: string | null; modelVersion: string | null;
  weightsSource: string | null; predictions: Prediction[] | null; preprocessing: Record<string, any> | null;
  contextSnapshot: { patientSyntheticId: string; researchCohort: string; records: Array<{ id: string; type: RecordType; severity: Severity; title: string; recordedAt: string }>; note: string } | null;
  inferenceMs: number | null; totalMs: number | null; errorMessage: string | null; isSynthetic: boolean;
  createdAt: string; completedAt: string | null; requestedBy: { id: string; name: string; role: Role };
  image: { id: string; originalName: string; width: number; height: number; modality: Modality; mimeType: string; sizeBytes: number };
  patient: PatientRef; disclaimer: string;
  /** Demo only: a result recorded by the full application, replayed from the bundled dataset. */
  recorded?: boolean;
}
export interface ManagedUser { id: string; email: string; name: string; role: Role; isActive: boolean; lastLoginAt: string | null; createdAt: string }
export interface ActivityItem { id: string; action: string; summary: string; actor: string; createdAt: string; entityType?: string; entityId?: string | null }
export interface NamedValue { name: string; value: number }

export interface MlStatus {
  /** Demo only: model card captured from the real service at export time (no live service is running). */
  recorded?: boolean; snapshotAt?: string;
  reachable: boolean; error?: string; disclaimer: string;
  health?: { status: string; model_ready: boolean; load_error: string | null };
  model?: { name: string; version: string; architecture: string; weights_source: string; weights_loaded: boolean; trained_task: string; clinically_validated: boolean; num_parameters: number; input_size: [number, number]; notes: string[] };
}
export interface PreprocessPreview {
  preprocessing: Record<string, any>;
  tensor: { shape: number[]; dtype: string; min: number; max: number; mean: number; std: number };
  timing: { preprocess_ms: number };
}

export interface DashboardData {
  /** Demo only: selected window (days) and its last day. */
  windowDays?: number; windowEnd?: string;
  dataNotice: string;
  totals: { patients: number; activeCases: number; records: number; images: number; analysesCompleted: number; analysesPending: number; analysesFailed: number; analysesUnavailable: number; recordsLast14Days: number };
  activitySeries: Array<{ date: string; completed: number; failed: number; records: number; images: number }>;
  caseDistribution: NamedValue[]; cohortDistribution: NamedValue[]; imageProcessing: NamedValue[];
  recentAnalyses: Array<{ id: string; status: AnalysisStatus; mode: AnalysisMode; modelName: string | null; inferenceMs: number | null; createdAt: string; imageName: string; patient: PatientRef }>;
  recentActivity: ActivityItem[];
}
export interface AnalyticsData {
  dataNotice: string;
  totals: { analyses: number; patients: number; records: number; images: number; users: number; syntheticAnalyses: number };
  outcomes: NamedValue[]; modes: NamedValue[];
  latency: { sampleSize: number; avgMs: number | null; p50Ms: number | null; p95Ms: number | null; minMs: number | null; maxMs: number | null };
  models: Array<{ name: string; version: string; count: number }>;
  trends: Array<{ date: string; analyses: number; completed: number; failed: number; avgLatencyMs: number | null; images: number; records: number; logins: number }>;
  modalityDistribution: NamedValue[]; cohortDistribution: NamedValue[]; topLabels: NamedValue[];
}
export interface SearchResults {
  patients: Array<PatientRef & { researchCohort: string }>;
  records: Array<{ id: string; title: string; type: RecordType; patient: PatientRef }>;
  images: Array<{ id: string; originalName: string; patient: PatientRef }>;
}
