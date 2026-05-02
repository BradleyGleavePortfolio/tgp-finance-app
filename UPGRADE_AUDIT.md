# SDK 51 → 55 Upgrade Audit

Date: 2026-05-02
Branch: `upgrade/sdk-55`
Last commit before upgrade: `a271a22` (note: plan referenced `200c89c`; repo has advanced)

## Continuous Native Generation
**CNG confirmed.** No `mobile/android/` or `mobile/ios/` directories exist. EAS Build will regenerate native projects. No prebuild action required during upgrade.

## Current package versions (pre-upgrade)
- expo: ~51.0.28
- react: 18.2.0
- react-native: 0.74.5
- expo-router: ~3.5.23
- react-native-reanimated: ~3.19.5
- react-native-screens: 3.37.0
- react-native-gesture-handler: ~2.31.1
- react-native-safe-area-context: 4.14.1
- @sentry/react-native: ~5.36.0
- @supabase/supabase-js: ^2.104.1

## Grep audit results (Reanimated 3 → 4 surface)

| Pattern | Hits | Action |
|---|---|---|
| `runOnJS\|runOnUI\|runOnRuntime\|executeOnUIRuntimeSync` | 0 | N/A |
| `useWorkletCallback\|useAnimatedGestureHandler\|combineTransition\|addWhitelistedNativeProps\|addWhitelistedUIProps\|useScrollViewOffset` | 0 | N/A |
| `restDisplacementThreshold\|restSpeedThreshold` | 0 | N/A |
| `withSpring\|worklet` | 0 | N/A |
| `from 'react-native-reanimated'` (source imports) | 0 | Reanimated is currently a transitive dep only — no first-party usage |

**Implication:** No Reanimated source-level migration is required. The babel plugin swap is the only Reanimated change needed.

## Other migration audits

| Pattern | Hits | Action |
|---|---|---|
| `expo-av` | 0 | N/A — package not used |
| `expo-background-fetch` | 0 | N/A — package not used |
| `expo-file-system` source imports | 0 | Listed in package.json as transitive — not directly imported. Will let `expo install --fix` upgrade it. |
| `router.navigate(` | 0 | N/A — codebase uses `router.push/replace/back` (69 calls across 33 files) |
| `newArchEnabled\|edgeToEdgeEnabled\|use_frameworks` | 0 | N/A |
| `androidNavigationBar\|androidStatusBar` config | 0 | N/A |
| `notification:` field in app.json | 0 (uses plugin form already) | N/A — already on `expo-notifications` plugin |
| `@supabase/supabase-js` source imports | 2 (`src/services/supabase.ts`, `src/services/api.ts`) | **Apply metro `unstable_enablePackageExports = false`** |
| `firebase` | 0 | N/A |
| Custom AppDelegate/Podfile | 0 | N/A — CNG |

## Required code changes (by category)

### Reanimated 3 → 4
- `babel.config.js`: `babel-preset-expo` ≥ SDK 54 handles the worklets plugin automatically. Remove the explicit `'react-native-reanimated/plugin'` entry.

### app.json
- No `newArchEnabled` / `edgeToEdgeEnabled` / `notification` fields present — already clean.
- `expo-notifications` is already configured as a plugin entry.

### Metro / Supabase
- Add `config.resolver.unstable_enablePackageExports = false;` to `metro.config.js`.

### expo-router v4
- No `router.navigate(...)` calls — no semantic-change refactors needed.

### Engines
- Update `mobile/package.json` engines to `"node": ">=20.19.4"`.
- Root `package.json` engines: bump from `>=20.0.0` to `>=20.19.4`.

## Risk assessment
- **Low source-code risk:** Reanimated worklet APIs are not used directly. Router APIs already use v4-compatible methods.
- **Medium dependency risk:** Cascade install for SDK 55 / RN 0.83 / React 19 / Reanimated 4 — large surface, but no code changes wired into deprecated APIs.
- **Medium native risk:** New Architecture becomes mandatory; Sentry RN 5.x predates RN 0.83 — `expo install --fix` will bump to a compatible Sentry version.
- **Build risk:** EAS will regenerate android/ios under the New Architecture; first build will be cold and may surface compat issues from third-party libs (gifted-charts, posthog-react-native, view-shot).

## Decisions diverging from plan
1. Plan referenced commit `200c89c`; current `main` head is `a271a22`. Proceeding from `main` HEAD as instructed.
2. No Reanimated worklet API migration is needed because the codebase doesn't import Reanimated directly. The babel plugin entry is still removed (preset handles it on SDK 54+).
