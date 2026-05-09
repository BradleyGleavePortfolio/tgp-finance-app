# EAS Build — `tgp-finance-app/mobile`

Production build commands, TestFlight and Play Internal Testing flow, and the failure modes that have actually bitten us. For backend deploy guidance see `RUNBOOK.md`. For the new-engineer codebase tour see `ONBOARDING.md`.

Last verified: 2026-05-09.

---

## App identity

| Field | Value |
|---|---|
| Display name | TGP Finance (`expo.name` in `mobile/app.json`) |
| iOS bundle id | `com.tgp.finance` |
| Android package | `com.tgp.finance` |
| Slug | `tgp-finance` |
| EAS project id | `8a6095dc-77b8-4b43-8258-47e1e76283e6` |
| Build profiles (`mobile/eas.json`) | `production`, `preview`, `development` |
| `appVersionSource` | `local` — bump `expo.version` plus `expo.ios.buildNumber` and `expo.android.versionCode` manually in `mobile/app.json` per release |
| Current iOS build number | 8 (last bumped in commit `50667c5`) |
| Current Android version code | 7 |

---

## One-time setup

```bash
npm install -g eas-cli
eas login
cd mobile
eas project:info   # confirm project id matches the table above
```

You also need:

- An Apple developer account in good standing, the app listed in App Store Connect, and a Distribution provisioning profile (EAS provisions automatically on first build).
- A Google Play developer account, an internal-testing track set up for `com.tgp.finance`, and an EAS Play service-account credential uploaded.

All EAS commands below run from the `mobile/` subdirectory unless otherwise noted.

---

## Production build

### iOS — TestFlight (with auto-submit)

```bash
cd mobile
eas build --platform ios --profile production --auto-submit
```

Builds on EAS managed credentials with the macOS Sequoia 15.6 + Xcode 26.2 image (`mobile/eas.json`), signs with the App Store distribution profile, and uploads to App Store Connect. The build appears in TestFlight under "iOS Builds" once Apple's Processing step completes (5 to 30 minutes after upload).

### iOS — TestFlight (manual upload)

```bash
cd mobile
eas build --platform ios --profile production
eas submit --platform ios --latest
```

### Android — Play Internal Testing (with auto-submit)

```bash
cd mobile
eas build --platform android --profile production --auto-submit
```

Builds a signed `.aab` (`buildType: app-bundle`) and submits to the internal-testing track configured in `mobile/eas.json → submit.production.android.track`.

### Android — manual upload

```bash
cd mobile
eas build --platform android --profile production
eas submit --platform android --latest
```

### Preview / sideload (Android APK)

```bash
cd mobile
eas build --platform android --profile preview
```

`preview` produces an APK suitable for sideloaded QA testers. Production never ships APK to end users — production is AAB only.

---

## Bumping versions

Production releases bump `expo.version` plus the per-platform monotonic counters in `mobile/app.json`:

```jsonc
{
  "expo": {
    "version": "1.0.4",
    "ios":     { "buildNumber":  "9" },
    "android": { "versionCode":  8 }
  }
}
```

Bump `version` with semver. Bump `buildNumber` and `versionCode` by 1 every time you upload to a store track, even if `version` did not change. `mobile/eas.json` has `requireCommit: true`, so the bump must be committed before the build will run.

---

## Common errors and fixes

### `ITMS-90186: Invalid build number — must be greater than the previous build`

Apple has indexed a higher build number from a previous TestFlight upload. Bump `expo.ios.buildNumber` past the value Apple is complaining about, commit, rebuild. The recent history (commits `50667c5`, `9a7894d`) shows the typical bump cadence.

### `Version code <N> has already been used`

Same on the Play side. Bump `expo.android.versionCode`.

### `requireCommit: true` rejects uncommitted changes

`mobile/eas.json` enforces a clean working tree before EAS will build. Commit your changes (or stash them) first. This is intentional — production builds must be reproducible from a commit hash.

### EAS build green but TestFlight build never appears

Apple's Processing step took longer than 30 minutes, or the IPA failed Apple's notarisation silently. Check App Store Connect → My Apps → TestFlight → "Build" tab for an "Invalid Binary" message. The rejection email lists the reason — most often a missing Info.plist key.

### Native dependency drift

`mobile/eas.json` pins the iOS image at `macos-sequoia-15.6-xcode-26.2`. When upgrading Expo SDK, re-read the SDK upgrade notes and bump the image in lockstep. Native deps that are out of step with the iOS image typically fail at link time with cryptic Xcode errors.

### Sentry source maps not appearing on a release

`SENTRY_DSN` is optional on this app; if it is set, the release-upload step also needs `SENTRY_AUTH_TOKEN` as an EAS Secret:

```bash
eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value <token>
```

The build still succeeds without the secret — the Sentry config plugin's upload step no-ops with a warning.

### Mobile env vars missing at runtime

The mobile app requires `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. There is no hardcoded fallback — the app throws on startup if missing. Set them in `mobile/.env` for local dev or in the Expo config for production builds. The backend's `SUPABASE_URL` must be the same project as the mobile's `EXPO_PUBLIC_SUPABASE_URL`.

### Expo SDK 53 / Apple collision bumps

`com.tgp.finance` has had a buildNumber collision history (commits `50667c5`, `9a7894d`). When in doubt, bump `buildNumber` past the highest value Apple has ever seen for this bundle id, even if the local file lags. Apple's index is authoritative.

---

## After a successful build

1. Confirm the build appeared in TestFlight or Play Internal Testing.
2. Run the smoke flow on a real device, paying attention to the read-only nature of the app (no money movement) and the Trust Center capability flags.
3. Promote to public TestFlight (external testers) or to the Play Closed Testing track only after smoke passes.
4. Update Sentry release filters to include the new build identifier when DSN is configured.
