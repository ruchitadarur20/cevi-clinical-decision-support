import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  ActivityItem, Analysis, AnalyticsData, ClinicalRecord, DashboardData, ManagedUser, MedicalImage, MlStatus,
  Paged, Patient, PreprocessPreview, RecordRevision, SearchResults,
} from '@/lib/types';

type Filters = Record<string, string | number | undefined>;

export const keys = {
  dashboard: ['dashboard'] as const,
  patients: (f: Filters) => ['patients', f] as const,
  patient: (id: string) => ['patient', id] as const,
  cohorts: ['cohorts'] as const,
  records: (f: Filters) => ['records', f] as const,
  record: (id: string) => ['record', id] as const,
  images: (f: Filters) => ['images', f] as const,
  image: (id: string) => ['image', id] as const,
  analyses: (f: Filters) => ['analyses', f] as const,
  analysis: (id: string) => ['analysis', id] as const,
  mlStatus: ['ml-status'] as const,
  analytics: ['analytics'] as const,
  users: (f: Filters) => ['users', f] as const,
  activity: ['activity'] as const,
};

export const useDashboard = (days?: number) =>
  useQuery({
    queryKey: days ? [...keys.dashboard, days] : keys.dashboard,
    queryFn: async () => (await api.get<{ data: DashboardData }>('/dashboard', days ? { days } : undefined)).data,
    placeholderData: keepPreviousData,
  });

export const usePatients = (f: Filters) =>
  useQuery({ queryKey: keys.patients(f), queryFn: () => api.get<Paged<Patient>>('/patients', f), placeholderData: keepPreviousData });
export const useCohorts = () =>
  useQuery({ queryKey: keys.cohorts, queryFn: async () => (await api.get<{ data: Array<{ name: string; count: number }> }>('/patients/cohorts')).data });

export interface PatientDetail extends Patient {
  createdBy: { id: string; name: string };
  records: Array<Omit<ClinicalRecord, 'patient' | 'createdAt' | 'updatedAt'> & { author: { id: string; name: string } }>;
  images: Array<Pick<MedicalImage, 'id' | 'originalName' | 'modality' | 'width' | 'height' | 'processingStatus' | 'isSynthetic' | 'createdAt' | 'browserOnly'>>;
  analyses: Array<{ id: string; status: Analysis['status']; mode: Analysis['mode']; modelName: string | null; modelVersion: string | null; inferenceMs: number | null; createdAt: string; image: { id: string; originalName: string } }>;
  activity: Array<{ id: string; action: string; summary: string; actor: string | null; createdAt: string }>;
}
export const usePatient = (id: string) =>
  useQuery({ queryKey: keys.patient(id), queryFn: async () => (await api.get<{ data: PatientDetail }>(`/patients/${id}`)).data });

export const useRecords = (f: Filters) =>
  useQuery({ queryKey: keys.records(f), queryFn: () => api.get<Paged<ClinicalRecord>>('/records', f), placeholderData: keepPreviousData });
export const useRecord = (id: string | null) =>
  useQuery({
    queryKey: keys.record(id ?? ''),
    enabled: !!id,
    queryFn: async () => (await api.get<{ data: ClinicalRecord & { revisions: RecordRevision[] } }>(`/records/${id}`)).data,
  });

export const useImages = (f: Filters) =>
  useQuery({ queryKey: keys.images(f), queryFn: () => api.get<Paged<MedicalImage>>('/images', f), placeholderData: keepPreviousData });
export const useImage = (id: string | null) =>
  useQuery({
    queryKey: keys.image(id ?? ''),
    enabled: !!id,
    queryFn: async () => (await api.get<{ data: MedicalImage & { analyses: Array<Pick<Analysis, 'id' | 'status' | 'mode' | 'modelName' | 'modelVersion' | 'inferenceMs' | 'createdAt'>> } }>(`/images/${id}`)).data,
  });

export const useAnalyses = (f: Filters) =>
  useQuery({ queryKey: keys.analyses(f), queryFn: () => api.get<Paged<Analysis>>('/analyses', f), placeholderData: keepPreviousData });
export const useAnalysis = (id: string | null) =>
  useQuery({ queryKey: keys.analysis(id ?? ''), enabled: !!id, queryFn: async () => (await api.get<{ data: Analysis }>(`/analyses/${id}`)).data });
export const useMlStatus = () =>
  useQuery({ queryKey: keys.mlStatus, queryFn: async () => (await api.get<{ data: MlStatus }>('/analyses/ml-status')).data, refetchInterval: 30_000 });
export const usePreprocessPreview = (imageId: string | null) =>
  useQuery({
    queryKey: ['preprocess', imageId],
    enabled: !!imageId,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => (await api.post<{ data: PreprocessPreview }>('/analyses/preprocess-preview', { imageId })).data,
  });

export const useAnalytics = () =>
  useQuery({ queryKey: keys.analytics, queryFn: async () => (await api.get<{ data: AnalyticsData }>('/analytics/summary')).data });
export const useUsers = (f: Filters) =>
  useQuery({ queryKey: keys.users(f), queryFn: () => api.get<Paged<ManagedUser>>('/users', f), placeholderData: keepPreviousData });
export const useActivity = (limit = 12) =>
  useQuery({ queryKey: [...keys.activity, limit], queryFn: async () => (await api.get<{ data: ActivityItem[] }>('/activity', { limit })).data, refetchInterval: 60_000 });
export const useGlobalSearch = (q: string) =>
  useQuery({
    queryKey: ['search', q],
    enabled: q.trim().length >= 2,
    queryFn: async () => (await api.get<{ data: SearchResults }>('/search', { q })).data,
  });

// ---- mutations: each invalidates the query families it affects ------------
export function useApiMutation<TVars, TData = unknown>(
  fn: (vars: TVars) => Promise<TData>,
  invalidate: ReadonlyArray<readonly unknown[]>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of invalidate) void qc.invalidateQueries({ queryKey: key as unknown[] });
    },
  });
}

const ALL_DERIVED = [['dashboard'], ['analytics'], ['activity']] as const;
export const useCreatePatient = () =>
  useApiMutation((body: Record<string, unknown>) => api.post<{ data: Patient }>('/patients', body), [['patients'], ['cohorts'], ...ALL_DERIVED]);
export const useUpdatePatient = (id: string) =>
  useApiMutation((body: Record<string, unknown>) => api.patch<{ data: Patient }>(`/patients/${id}`, body), [['patients'], ['patient', id], ['cohorts'], ...ALL_DERIVED]);
export const useCreateRecord = () =>
  useApiMutation((body: Record<string, unknown>) => api.post<{ data: ClinicalRecord }>('/records', body), [['records'], ['patient'], ['patients'], ...ALL_DERIVED]);
export const useUpdateRecord = (id: string) =>
  useApiMutation((body: Record<string, unknown>) => api.patch<{ data: ClinicalRecord }>(`/records/${id}`, body), [['records'], ['record', id], ['patient'], ...ALL_DERIVED]);
export const useUploadImage = () =>
  useApiMutation((form: FormData) => api.upload<{ data: MedicalImage }>('/images', form), [['images'], ['patient'], ['patients'], ...ALL_DERIVED]);
export const useRunAnalysis = () =>
  useApiMutation((body: { imageId: string; recordIds: string[] }) => api.post<{ data: Analysis }>('/analyses', body), [['analyses'], ['images'], ['image'], ['patient'], ...ALL_DERIVED]);
export const useCreateUser = () =>
  useApiMutation((body: Record<string, unknown>) => api.post<{ data: ManagedUser }>('/users', body), [['users'], ['analytics']]);
export const useUpdateUser = () =>
  useApiMutation(({ id, ...body }: { id: string } & Record<string, unknown>) => api.patch<{ data: ManagedUser }>(`/users/${id}`, body), [['users']]);

