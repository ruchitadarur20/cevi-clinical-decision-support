import { env } from '../config/env';

export class MlClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus?: number,
  ) {
    super(message);
  }
}

export interface MlModelInfo {
  name: string;
  version: string;
  architecture: string;
  weights_source: string;
  weights_loaded: boolean;
  trained_task: string;
  clinically_validated: boolean;
  num_parameters: number;
  input_size: [number, number];
  notes: string[];
}

export interface MlPrediction {
  rank: number;
  class_index: number;
  label: string;
  probability: number;
}

export interface MlInferResult {
  model: MlModelInfo;
  preprocessing: Record<string, unknown>;
  predictions: MlPrediction[];
  timing: { preprocess_ms: number; inference_ms: number; total_ms: number };
  disclaimer: string;
}

export interface MlPreprocessResult {
  preprocessing: Record<string, unknown>;
  tensor: { shape: number[]; dtype: string; min: number; max: number; mean: number; std: number };
  timing: { preprocess_ms: number };
}

/** Narrow interface so the API (and its tests) depend on a contract, not on HTTP. */
export interface MlClient {
  health(): Promise<Record<string, unknown>>;
  model(): Promise<MlModelInfo>;
  preprocess(data: Buffer, filename: string): Promise<MlPreprocessResult>;
  infer(data: Buffer, filename: string): Promise<MlInferResult>;
}

export class HttpMlClient implements MlClient {
  constructor(
    private baseUrl = env.ML_SERVICE_URL,
    private timeoutMs = env.ML_TIMEOUT_MS,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, { ...init, signal: controller.signal });
    } catch (err) {
      const aborted = (err as Error).name === 'AbortError';
      throw new MlClientError(
        aborted ? 'ML_TIMEOUT' : 'ML_UNREACHABLE',
        aborted ? 'ML service timed out' : 'ML service is not reachable',
      );
    } finally {
      clearTimeout(timer);
    }
    const body: any = await res.json().catch(() => null);
    if (!res.ok) {
      const e = body?.error ?? body?.detail?.error ?? {};
      throw new MlClientError(e.code ?? 'ML_ERROR', e.message ?? `ML service returned ${res.status}`, res.status);
    }
    return body as T;
  }

  private form(data: Buffer, filename: string) {
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(data)]), filename);
    return fd;
  }

  health() {
    return this.request<Record<string, unknown>>('/health');
  }
  model() {
    return this.request<MlModelInfo>('/model');
  }
  preprocess(data: Buffer, filename: string) {
    return this.request<MlPreprocessResult>('/preprocess', { method: 'POST', body: this.form(data, filename) });
  }
  infer(data: Buffer, filename: string) {
    return this.request<MlInferResult>('/infer', { method: 'POST', body: this.form(data, filename) });
  }
}

export const RESEARCH_DISCLAIMER =
  'Research prototype using synthetic data. Model output is experimental, has not been clinically validated, ' +
  'and must not be used for diagnosis, treatment or any clinical decision-making.';
