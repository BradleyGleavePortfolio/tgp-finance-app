import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

let initialized = false;

/**
 * Initialise Sentry once at app boot. Reads the DSN from
 * EXPO_PUBLIC_SENTRY_DSN (or `extra.sentryDsn` in app.json). When the DSN is
 * absent the SDK stays uninitialised and every helper below becomes a no-op,
 * so this file is safe to import in dev / local builds without secrets.
 */
export function initSentry(): void {
  if (initialized) return;

  const dsn =
    process.env.EXPO_PUBLIC_SENTRY_DSN ||
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined)
      ?.sentryDsn;

  if (!dsn || typeof dsn !== 'string') return;

  Sentry.init({
    dsn,
    tracesSampleRate: 0.2,
    enableAutoSessionTracking: true,
    enableNative: true,
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.Authorization;
        delete event.request.headers.authorization;
        delete event.request.headers.Cookie;
        delete event.request.headers.cookie;
      }
      return event;
    },
    environment: process.env.EXPO_PUBLIC_ENVIRONMENT || 'production',
    release: Constants.expoConfig?.version || undefined,
  });

  initialized = true;
}

export const wrap: <P extends Record<string, unknown>>(
  component: React.ComponentType<P>,
) => React.ComponentType<P> = Sentry.wrap as never;

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  if (context) {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
      Sentry.captureException(err);
    });
  } else {
    Sentry.captureException(err);
  }
}

export function setSentryUser(user: { id: string; email?: string } | null): void {
  if (!initialized) return;
  if (user) {
    Sentry.setUser({ id: user.id, email: user.email });
  } else {
    Sentry.setUser(null);
  }
}
