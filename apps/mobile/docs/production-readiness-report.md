# Sacred Heart App Production Readiness Report

**Author:** Manus AI  
**Date:** June 4, 2026  
**Repository inspected:** `maxwellt7/sacred-heart-app`  
**Mobile app path:** `apps/mobile`  
**App name:** Sacred Heart App  
**Bundle identifier / Android package:** `app.sovereignty.sacredheart`

## Executive Summary

I completed the production-readiness work that could be done safely from the sandbox without logging into account-owner dashboards or committing secrets. The repository was inspected, public production URLs were checked, placeholder mobile assets were replaced with a production-ready dark/gold Sacred Heart asset set, EAS build profiles were updated to explicitly target the correct EAS environment variable sets, and a store-listing draft was prepared for Apple App Store and Google Play submission.

The remaining blockers are account-access tasks in Clerk, Expo, App Store Connect, Google Play Console, Railway, and Vercel. Each of those dashboards required login during verification, so I did not enter credentials, alter live services, create paid resources, or submit anything on your behalf. This protects account security and avoids accidentally exposing secrets in the repository.

## Completed Work

| Area | Completed Result | Files / Evidence |
|---|---|---|
| Repository verification | Confirmed the mobile app is under `apps/mobile`; verified app name, slug, scheme, package IDs, EAS configuration, and environment variable needs. | `/home/ubuntu/sacred-heart-app-production-findings.md` |
| Live URL checks | Confirmed the Railway backend host responds and the privacy policy page loads at `https://heart.sovereignty.app/privacy`. | `/home/ubuntu/sacred-heart-app-production-findings.md` |
| EAS configuration | Updated `apps/mobile/eas.json` so `development`, `preview`, and `production` build profiles explicitly use matching EAS environments. | Modified repo file: `apps/mobile/eas.json` |
| Store metadata | Prepared Apple and Google listing copy, keywords, app review notes, screenshot plan, and privacy/data-safety guidance. | `docs/store-listing-draft.md` |
| Production assets | Replaced placeholder icon and splash assets with a flat dark-navy/gold Sacred Heart asset system. | `assets/*.png` and repo `apps/mobile/assets/*.png` |
| Secret safety | No secrets were written to docs, `.env`, app config, or committed files. | Git diff reviewed locally. |

## Repository Configuration Found

The app currently uses the following production identifiers and public configuration points.

| Field | Current Value | Production Readiness Note |
|---|---|---|
| Expo app name | `Sacred Heart App` | Ready for store metadata consistency. |
| Expo slug | `sacred-heart-app` | Ready unless Expo project naming changes. |
| URL scheme | `sacredheart` | Needs matching Clerk native redirect allowlist. |
| iOS bundle ID | `app.sovereignty.sacredheart` | Must match Apple app record and Clerk native iOS app registration. |
| Android package | `app.sovereignty.sacredheart` | Must match Google Play package and Clerk native Android app registration. |
| Privacy URL | `https://heart.sovereignty.app/privacy` | Verified reachable. |
| Backend URL candidate | `https://nlp-training-backend-production.up.railway.app` | Host responds, but a health endpoint still needs confirmation. |
| EAS project ID | Not present in `expo.extra.eas.projectId` at inspection time | Run `eas build:configure` or confirm project linking after Expo login. |

## Code and Asset Changes Made

The repository changes are intentionally limited to release configuration and assets. The EAS configuration change follows Expo’s documented environment-variable model: Expo supports `development`, `preview`, and `production` EAS environments, and the build profile can select the environment with an `environment` field.[1]

```diff
"development": {
  "developmentClient": true,
  "distribution": "internal",
- "channel": "development"
+ "channel": "development",
+ "environment": "development"
},
"preview": {
  "distribution": "internal",
- "channel": "preview"
+ "channel": "preview",
+ "environment": "preview"
},
"production": {
  "channel": "production",
- "autoIncrement": true
+ "autoIncrement": true,
+ "environment": "production"
}
```

The following asset files were generated and installed into the mobile app:

| Asset | Dimensions | Purpose |
|---|---:|---|
| `icon.png` | 1024 x 1024 | iOS and general app icon source. |
| `splash-icon.png` | 1024 x 1024 | Expo splash image. |
| `android-icon-background.png` | 1024 x 1024 | Android adaptive icon background. |
| `android-icon-foreground.png` | 1024 x 1024 | Android adaptive icon foreground. |
| `android-icon-monochrome.png` | 1024 x 1024 | Android themed monochrome icon. |
| `favicon.png` | 48 x 48 | Web/favicon asset. |

## Required Production Environment Variables

The mobile source and `.env.example` show that production builds need these public Expo variables. Expo notes that client-side values embedded into the app should be considered public and readable by anyone who can run the app, so these must not contain server secrets.[1]

| Variable | Recommended Production Value | Visibility Guidance |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `https://nlp-training-backend-production.up.railway.app` or a confirmed API base URL | Plain text or sensitive; public in bundled client. |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk production publishable key beginning with `pk_live_` | Plain text or sensitive; publishable key only. |
| `EXPO_PUBLIC_WEB_URL` | `https://heart.sovereignty.app` | Plain text. |
| `EXPO_PUBLIC_PURCHASE_URL` | Confirm final production purchase/upgrade URL | Plain text. |

Clerk explicitly warns that a common production deployment mistake is forgetting to change API keys to production-instance keys, with publishable keys using `pk_live_` in production and secret keys using `sk_live_` for backend use only.[2] The mobile app should only receive the publishable key; the Clerk secret key belongs in backend hosting variables, not in Expo public variables.

## Dashboard Blockers

All external dashboards needed for full production setup required account-owner login. I verified the access state and stopped before any sensitive operation.

| Dashboard | Access State | Work Still Required |
|---|---|---|
| Clerk | Login required | Create or verify production instance; register native iOS and Android apps; configure mobile SSO redirect allowlist; obtain `pk_live_`; confirm OAuth credentials and DNS/certificates. |
| Expo / EAS | Login required | Link project if needed; confirm/create EAS project ID; set EAS environment variables; run production builds. |
| App Store Connect | Login required | Create app record with bundle ID; add metadata/screenshots/privacy details; create review demo account; configure TestFlight and app review submission. |
| Google Play Console | Login required | Create app record/package; configure Play App Signing; complete store listing and Data safety; upload first Android App Bundle manually if required. |
| Railway | Login required | Confirm backend health endpoint, environment variables, logs, HTTPS, and production deployment health. |
| Vercel | Login required | Confirm web app deployment, privacy page, purchase route, support/contact route, and domain/environment values. |

## Clerk Production Setup Checklist

Clerk’s production deployment guide requires a production instance, production OAuth credentials for social providers, production API keys, DNS-related setup, native app registration, and mobile redirect allowlisting.[2] For this mobile app, the critical production items are below.

| Step | Required Action | Value for This App |
|---|---|---|
| Create production instance | In Clerk Dashboard, create or verify the production instance. | Use the current production domain and app name. |
| Set production publishable key | Copy the `pk_live_...` key into EAS production environment variables. | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...` |
| Protect secret key | Put `sk_live_...` only in backend hosting variables if the backend uses Clerk server APIs. | Never add to mobile repo or Expo public config. |
| Register iOS native app | Clerk says iOS native apps must exist in production under Native Applications. | Bundle ID: `app.sovereignty.sacredheart`. |
| Register Android native app | Clerk says Android native apps must exist in production with package name and SHA-256 certificate fingerprint. | Package: `app.sovereignty.sacredheart`; SHA-256 from release signing cert. |
| Allowlist redirects | Clerk says production instances should allowlist custom mobile SSO redirect URLs. | Include `app.sovereignty.sacredheart://callback` and confirm whether `sacredheart://callback` is also required by the Expo flow. |
| Test release build | Clerk recommends testing on physical devices with production keys. | TestFlight and Play internal testing. |

## Expo / EAS Build and Submit Checklist

Expo documents that EAS Build creates ready-to-submit binaries for app stores, but store developer accounts and signing credentials are required for store builds.[3] EAS Submit can upload Android and iOS binaries, but it does not manage store listing metadata or screenshots, and Apple production release still requires App Store Connect metadata and App Review submission.[4]

| Step | Command or Dashboard Action | Notes |
|---|---|---|
| Log into Expo | `eas login` | Required before project linking or builds. |
| Confirm account | `eas whoami` | Verifies session. |
| Link/configure project | `eas build:configure` | Adds/validates EAS project setup. |
| Add production vars | Expo dashboard or `eas env:create` | Use `production` environment for production profile. |
| Build Android | `eas build --platform android --profile production` | Requires signing credentials. |
| Build iOS | `eas build --platform ios --profile production` | Requires Apple Developer access/signing. |
| Submit after store setup | `eas submit --platform android --latest` and `eas submit --platform ios --latest` | Google first upload may need manual console upload before API submissions work.[4] |

## Apple and Google Store Submission Guidance

Apple’s App Review guidance says the app should be tested for crashes and bugs, metadata should be complete and accurate, backend services should be live, and account-based apps should provide App Review with a demo account or fully featured demo mode.[5] Google Play requires a developer contact email during app creation and has an App content flow that includes privacy and Data safety forms.[6] [7]

| Store | Required Before Submission | Sacred Heart-Specific Note |
|---|---|---|
| Apple App Store | App record, bundle ID, screenshots, privacy details, review notes, demo account, live backend, TestFlight build. | Use app name `Sacred Heart App`; verify whether iPad support is release-ready because `supportsTablet` is currently true. |
| Google Play | App record, package name, contact email, store listing, Data safety, app content declarations, Play App Signing, AAB upload. | Google package must remain `app.sovereignty.sacredheart`; package names are unique and permanent after publication.[6] |

## Screenshot and Metadata Plan

Apple allows one to ten screenshots in `.jpeg`, `.jpg`, or `.png` format, with device-specific size requirements.[8] The prepared store-listing draft includes five screenshot concepts: dashboard, guided session, personalized script/audio generation, audios, and identity/values progress.

| Listing Asset | Recommended Draft |
|---|---|
| Apple app name | Sacred Heart App |
| Apple subtitle | Guided inner work |
| Apple promotional text | Begin daily guided inner-work sessions, track your progress, and turn reflections into personalized audio practices. |
| Apple keywords | `self growth,hypnosis,reflection,journal,values,habits,wellness,coaching,mindset,personal growth` |
| Google short description | Guided daily inner work, reflection, and personalized audio practice. |
| Privacy URL | `https://heart.sovereignty.app/privacy` |
| Support URL | `https://heart.sovereignty.app` pending support/contact verification |

The full copy is available in `docs/store-listing-draft.md`.

## Privacy and Data Safety Notes

Google requires all developers with published apps to complete the Data safety form, including apps on testing tracks, and states that developers are responsible for complete and accurate declarations about collection, sharing, and security practices.[7] Because the app uses account authentication, user reflections/session content, generated scripts/audio, and possibly payment/access status, the final privacy forms must be completed by someone who can inspect production Clerk, backend, analytics, AI-processing, storage, and payment configurations.

| Likely Data Area | Likely Disclosure Direction | Needs Account Verification |
|---|---|---|
| Account information | Collected for account creation and authentication. | Clerk production settings. |
| User reflections/session content | Collected because users submit guided-session responses. | Backend storage and retention policy. |
| Generated scripts/audio | Created from user sessions and may be stored. | Backend and storage provider behavior. |
| Purchase/access state | May be collected for subscription or access control. | Stripe/payment integration and backend records. |
| Device/log data | Likely collected by backend or SDK logs. | Railway/Vercel/logging/analytics setup. |
| Data deletion | Must be accurately described. | Confirm operational deletion request workflow. |

## Immediate Next Steps for the Account Owner

The fastest path to a production build is to complete the dashboard tasks in this order. This order avoids building binaries before authentication, bundle/package registration, and environment variables are production-ready.

| Priority | Action | Why It Comes Next |
|---:|---|---|
| 1 | Log into Clerk and create/verify the production instance. | The production `pk_live_` key and native app registration are required for release builds. |
| 2 | Log into Expo and set EAS production environment variables. | The EAS production profile now expects the `production` environment. |
| 3 | Confirm backend health and public API base URL in Railway. | App Review requires live backend services for review.[5] |
| 4 | Create App Store Connect and Google Play app records. | Bundle/package IDs must be reserved before final submission. |
| 5 | Generate internal/TestFlight builds with EAS. | Validates signing, app startup, auth, and production variables. |
| 6 | Capture final screenshots from release builds. | Store screenshots should reflect the real production UI. |
| 7 | Complete privacy/data-safety questionnaires and submit. | Forms require accurate account-owner knowledge of all production services. |

## Files Delivered

| File | Purpose |
|---|---|
| `docs/production-readiness-report.md` | This full production report and account-owner checklist. |
| `docs/store-listing-draft.md` | Ready-to-paste Apple and Google listing copy plus privacy and screenshot guidance. |
| `assets/asset-preview.png` | Visual preview of generated production app assets. |
| `assets/icon.png` | Production app icon. |
| `assets/splash-icon.png` | Production splash icon. |
| `assets/android-icon-background.png` | Android adaptive icon background. |
| `assets/android-icon-foreground.png` | Android adaptive icon foreground. |
| `assets/android-icon-monochrome.png` | Android monochrome/themed icon. |
| `assets/favicon.png` | Web favicon. |
| `create_assets.py` | Deterministic asset-generation script. |
| `/home/ubuntu/sacred-heart-app-production-findings.md` | Raw findings log from verification work. |

## References

[1]: https://docs.expo.dev/eas/environment-variables/ "Expo Docs — Environment variables in EAS"  
[2]: https://clerk.com/docs/deployments/overview "Clerk Docs — Deploy your Clerk app to production"  
[3]: https://docs.expo.dev/build/setup/ "Expo Docs — Create your first build"  
[4]: https://docs.expo.dev/submit/introduction/ "Expo Docs — EAS Submit"  
[5]: https://developer.apple.com/app-store/review/guidelines/ "Apple Developer — App Review Guidelines"  
[6]: https://support.google.com/googleplay/android-developer/answer/9859152?hl=en "Google Play Console Help — Create and set up your app"  
[7]: https://support.google.com/googleplay/android-developer/answer/10787469?hl=en "Google Play Console Help — Provide information for Google Play's Data safety section"  
[8]: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/ "App Store Connect Help — Screenshot specifications"
