// Sentry initialisation \u2014 must be imported BEFORE any other application
// module so its instrumentation hooks can attach to Node's builtin modules.
// Mirrors the fitness backend pattern.
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

// Pull sample rates from env so the operator can tune Sentry volume without
// shipping a new build. Defaults match the previous hardcoded 0.1 traces /
// 0 profiles. Values outside [0, 1] fall back to the defaults rather than
// silently saturating the Sentry quota.
function parseRate(raw: string | undefined, fallback: number): number {
  if (raw == null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return fallback;
  return n;
}
const tracesSampleRate = parseRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1);
const profilesSampleRate = parseRate(process.env.SENTRY_PROFILES_SAMPLE_RATE, 0);

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'production',
    release: process.env.RELEASE_VERSION || undefined,
    tracesSampleRate,
    profilesSampleRate,
    beforeSend(event) {
      if (event.request?.headers) {
        delete (event.request.headers as Record<string, unknown>).authorization;
        delete (event.request.headers as Record<string, unknown>).Authorization;
        delete (event.request.headers as Record<string, unknown>).cookie;
        delete (event.request.headers as Record<string, unknown>).Cookie;
      }
      return event;
    },
  });
}

export { Sentry };
