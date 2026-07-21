/**
 * Typed error thrown by {@link fetchJson} when a response is not OK or its body
 * is not valid JSON. Carries the HTTP status (0 when the request never completed,
 * e.g. a network failure) so callers can branch on it if needed.
 */
export class FetchJsonError extends Error {
  readonly status: number;

  constructor(message: string, status: number, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "FetchJsonError";
    this.status = status;
  }
}

/**
 * Fetch a URL and parse its body as JSON, throwing a {@link FetchJsonError} on
 * any failure: a network error, a non-OK HTTP status, or a body that is not
 * valid JSON. This forces call sites to handle failures explicitly instead of
 * silently rendering empty state when an API call fails.
 *
 * @throws {FetchJsonError} on network failure, non-OK status, or non-JSON body.
 */
export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err) {
    throw new FetchJsonError(
      `Network request failed: ${err instanceof Error ? err.message : String(err)}`,
      0,
      { cause: err },
    );
  }

  if (!res.ok) {
    throw new FetchJsonError(
      `Request failed with status ${res.status}`,
      res.status,
    );
  }

  try {
    return (await res.json()) as T;
  } catch (err) {
    throw new FetchJsonError(
      `Response body was not valid JSON (status ${res.status})`,
      res.status,
      { cause: err },
    );
  }
}
