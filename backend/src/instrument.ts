// Sentry initialisation \u2014 must be imported BEFORE any other application
// module so its instrumentation hooks can attach to Node's builtin modules.
// Mirrors the fitness backend pattern.
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'production',
    release: process.env.RELEASE_VERSION || undefined,
    tracesSampleRate: 0.1,
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
