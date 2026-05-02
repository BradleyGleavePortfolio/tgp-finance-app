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

// SDK 53+ enabled package.json `exports` resolution by default. We keep it
// enabled globally so libraries that REQUIRE the exports map (e.g.
// posthog-react-native importing `@posthog/core/surveys`) resolve correctly.
//
// `@supabase/supabase-js` is the one known holdout whose exports map breaks
// under React Native. We surgically fall back to the legacy CommonJS
// resolver for that package only via `resolveRequest`. Once Supabase ships
// an RN-aware exports map this hook can be deleted.
config.resolver.unstable_enablePackageExports = true;

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === '@supabase/supabase-js' ||
    moduleName.startsWith('@supabase/supabase-js/')
  ) {
    // Disable package.json exports resolution just for this request so we
    // hit the legacy CommonJS entry point instead of the broken RN exports.
    return context.resolveRequest(
      { ...context, unstable_enablePackageExports: false },
      moduleName,
      platform
    );
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;