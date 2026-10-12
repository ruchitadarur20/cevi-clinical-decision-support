export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
  }
  /** Field-level validation messages keyed by field name. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.details ?? []).map((d) => [d.field, d.message]));
  }
}

import { isDemo } from './demoConfig';

type Params = Record<string, string | number | boolean | undefined | null>;

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

function qs(params?: Params) {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

async function request<T>(method: string, path: string, opts: { params?: Params; body?: unknown; form?: FormData } = {}): Promise<T> {
  if (isDemo) {
    // Portfolio demo: answer from the in-browser data provider instead of the network (code-split, demo builds only).
    try {
      const { handle } = await import('@/demo/server');
      return (await handle(method, path, opts)) as T;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && !path.startsWith('/auth/login')) onUnauthorized?.();
      throw e;
    }
  }
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}${qs(opts.params)}`, { method, headers, body, credentials: 'include' });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the CEVI API. Check that the backend is running.');
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error ?? {};
    if (res.status === 401 && !path.startsWith('/auth/login')) onUnauthorized?.();
    throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? `Request failed (${res.status})`, e.details);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string, params?: Params) => request<T>('GET', path, { params }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, { form }),
};
