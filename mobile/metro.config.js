// Metro config for the finance mobile app.
//
// Wraps Expo's default Metro config with the Sentry React Native helper so
// every JS bundle produced by EAS ships with source-maps to Sentry. The
// release identifier on the running app is set in `src/services/sentry.ts`
// and must match the release tagged at upload time — both derive from
// `app.json` `expo.version` plus the platform-specific build number.
//
// Sentry React Native 5.30 exposes `getSentryExpoConfig` from the
// `@sentry/react-native/metro` entry point. The wrapped config keeps every
// existing default (including expo-router) and only adds the bundle
// post-processing Sentry needs to keep stack traces unminified.
//
// Auth token, org, and project come from EAS-injected env vars
// (SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT). When the token is unset,
// the upload step is a no-op rather than a build failure.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

// SDK 53+ enabled package.json `exports` resolution by default. Until
// @supabase/supabase-js publishes an exports map that resolves correctly
// under React Native, fall back to the legacy resolver. See:
// https://expo.dev/changelog/sdk-53#package-exports-disabled-by-default
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
