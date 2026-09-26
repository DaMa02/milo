export type ApiFailure = 'network' | 'invalid' | 'expired' | 'unavailable' | 'aborted';

export class ApiError extends Error {
  constructor(readonly kind: ApiFailure, readonly status?: number, readonly detail?: string) {
    super(kind);
    this.name = 'ApiError';
  }
}

/** The browser talks only to the app's proxy; API keys remain on the server. */
export async function requestJson<T>(
  path: string,
  parse: (value: unknown) => T,
  options: { body?: unknown; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.body === undefined ? 'GET' : 'POST',
      headers: { Accept: 'application/json', ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? 20_000)])
        : AbortSignal.timeout(options.timeoutMs ?? 20_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new ApiError('aborted');
    throw new ApiError('network');
  }
  if (!response.ok) {
    let detail: string | undefined;
    try {
      const body: unknown = await response.json();
      if (body !== null && typeof body === 'object' && !Array.isArray(body)
        && 'detail' in body && typeof body.detail === 'string') detail = body.detail;
    } catch {
      // HTML, empty and malformed error bodies keep their HTTP classification.
    }
    if (response.status === 404 || response.status === 410) throw new ApiError('expired', response.status, detail);
    if (response.status === 503) throw new ApiError('unavailable', response.status, detail);
    throw new ApiError('network', response.status, detail);
  }
  try {
    return parse(await response.json());
  } catch {
    throw new ApiError('invalid');
  }
}
