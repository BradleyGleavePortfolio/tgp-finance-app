// Tiny helper to pull a user-facing message string from an unknown thrown
// value. Walks the common shapes (axios error.response.data.{message,error},
// plain Error.message, raw string) and returns a fallback otherwise.

export function errorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object') {
    const e = err as {
      response?: { data?: { message?: unknown; error?: unknown } };
      message?: unknown;
    };
    const fromResp = e.response?.data;
    if (typeof fromResp?.message === 'string') return fromResp.message;
    if (typeof fromResp?.error === 'string') return fromResp.error;
    if (typeof e.message === 'string') return e.message;
  }
  return fallback;
}

// Same as errorMessage but also returns the underlying axios response status
// when available — convenient for callers that want to special-case 404s.
export function errorStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object') {
    const status = (err as { response?: { status?: unknown } }).response?.status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}
