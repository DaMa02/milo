export type ApiFailure = 'network' | 'invalid' | 'expired' | 'unavailable' | 'aborted';

export class ApiError extends Error {
  constructor(readonly kind: ApiFailure, readonly status?: number) {
    super(kind);
    this.name = 'ApiError';
  }
}

/** The browser talks only to the app's proxy; API keys remain on the server. */
export async function requestJson<T>(
  path: string,
  parse: (value: unknown) => T,
  options: { body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.body === undefined ? 'GET' : 'POST',
      headers: { Accept: 'application/json', ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new ApiError('aborted');
    throw new ApiError('network');
  }
  if (!response.ok) {
    if (response.status === 404 || response.status === 410) throw new ApiError('expired', response.status);
    if (response.status === 503) throw new ApiError('unavailable', response.status);
    throw new ApiError('network', response.status);
  }
  try {
    return parse(await response.json());
  } catch {
    throw new ApiError('invalid');
  }
}
