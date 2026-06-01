# Sacred Heart Mobile (Expo)

This app now has EAS build + submit configuration for iOS and Android.

## Prerequisites

- Expo account (`npx eas login`)
- Apple Developer account (for iOS builds/submission)
- Google Play Console account (for Android submission)
- Environment variables configured from `.env.example`

## First-time setup

1. Install dependencies:
   - `npm install`
2. Validate project health:
   - `npm run doctor`
3. Authenticate and confirm account:
   - `npx eas whoami`

## Build commands

- iOS preview build:
  - `npm run eas:build:ios:preview`
- Android preview build:
  - `npm run eas:build:android:preview`
- iOS production build:
  - `npm run eas:build:ios:production`
- Android production build:
  - `npm run eas:build:android:production`

## Submit commands

- Submit iOS production build:
  - `npm run eas:submit:ios:production`
- Submit Android production build:
  - `npm run eas:submit:android:production`

## Submission readiness checklist

- App icons, splash, and app naming finalized.
- Final privacy policy URL prepared for store listings.
- In-app auth and purchase access flow tested on physical iOS/Android devices.
- Production API/Clerk env vars set in EAS project environment.
- TestFlight/Internal testing passes critical flows:
  - Sign in
  - Access gate check
  - Session chat + script generation
- Version and release notes prepared for store submission.

## Notes

- `eas.json` is configured with `development`, `preview`, and `production` profiles.
- Production profile auto-increments app version/build numbers remotely.
