# Sacred Heart App Store Listing Draft

**Author:** Manus AI  
**Prepared for:** Sacred Heart App production release  
**App name:** Sacred Heart App  
**Bundle ID / Package:** `app.sovereignty.sacredheart`

## Listing Positioning

Sacred Heart App is positioned as a private, guided inner-work companion for users who want structured daily reflection, personalized session work, values insight, progress tracking, and generated audio sessions. The listing should be careful not to make medical, therapeutic, diagnostic, or guaranteed outcome claims. The product page should instead emphasize **self-reflection, personal growth, guided practice, and progress tracking**.

Apple states that every element of the App Store product page can influence discovery and engagement, and recommends a concise, informative description that highlights features and functionality.[1] Google Play similarly frames the store listing as the public page that helps users learn about the app, including product details, preview assets, categorization, and contact details.[2]

## Recommended Apple App Store Metadata

| Field | Draft Value | Notes |
|---|---|---|
| App Name | Sacred Heart App | Apple allows app names up to 30 characters.[1] |
| Subtitle | Guided inner work | This is concise and descriptive, and remains within Apple’s 30-character subtitle limit.[1] |
| Primary Category | Lifestyle | Best fit if the app is marketed as personal development rather than clinical care. |
| Secondary Category | Health & Fitness | Use only if the listing avoids medical claims and the app is clearly framed as wellness/self-development. |
| Promotional Text | Begin daily guided inner-work sessions, track your progress, and turn reflections into personalized audio practices. | Apple promotional text can be updated without submitting a new app version and is capped at 170 characters.[1] |
| Keywords | self growth,hypnosis,reflection,journal,values,habits,wellness,coaching,mindset,personal growth | Apple keywords are limited to 100 total characters and should be comma-separated without spaces between terms.[1] |
| Support URL | https://heart.sovereignty.app | Confirm this page has a working support/contact path before submission. |
| Privacy Policy URL | https://heart.sovereignty.app/privacy | Verified reachable during this setup work. |
| Marketing URL | https://heart.sovereignty.app | Optional. |

## Apple Description Draft

Sacred Heart App helps you step into consistent inner work through guided daily sessions, personalized reflection, and progress tracking.

Use the app to begin a session, reflect through structured prompts, review patterns over time, and generate personalized audio practices from your completed work. The experience is designed for users who want a focused private space for self-observation, values alignment, and daily practice.

Key features include daily guided sessions, personalized session history, generated scripts and audio, streak and XP tracking, identity and values insights, learning content, and a private dashboard that keeps your progress visible.

Sacred Heart App is intended for self-reflection and personal growth. It is not a medical device, therapy service, crisis-support tool, or substitute for professional advice.

## Google Play Metadata Draft

| Field | Draft Value | Notes |
|---|---|---|
| App Name | Sacred Heart App | Must match the desired public Play Store name. |
| Short Description | Guided daily inner work, reflection, and personalized audio practice. | Google Play short descriptions are typically concise discovery text; confirm exact character fit in console. |
| Full Description | See draft below. | Avoid therapeutic or guaranteed result claims. |
| App Type | App | Google Play asks whether the listing is an app or game during app creation.[2] |
| Pricing | Free | Confirm whether paid access is handled via the web purchase flow before review. |
| Category | Lifestyle | Alternative: Health & Fitness, if positioned as wellness. |
| Contact Email | Needed from account owner | Google requires an email users can use to contact the developer when creating the app.[2] |
| Privacy Policy | https://heart.sovereignty.app/privacy | Google notes that even apps that do not collect user data must complete the Data safety form and provide a privacy policy link.[3] |

## Google Full Description Draft

Sacred Heart App is a guided personal-growth companion built for daily inner work, reflective practice, and private progress tracking.

Start a guided session, respond to structured prompts, review your recent work, and turn completed sessions into personalized scripts and audio practices. Your dashboard helps you track streaks, session history, XP, and values-oriented insights so your practice stays visible and consistent.

Features include guided daily sessions, personalized reflection history, generated audio practices, values and identity insights, learning content, streak tracking, achievements, and a focused dark-mode interface for private work.

Sacred Heart App is designed for self-reflection and personal development. It is not a therapy service, medical device, emergency resource, or substitute for professional care.

## Screenshot Plan

Apple requires one to ten screenshots in `.jpeg`, `.jpg`, or `.png` format, and provides separate accepted sizes by device class.[4] Since the Expo configuration currently enables iPad support through `ios.supportsTablet: true`, App Store Connect may require iPad screenshots unless tablet support is intentionally removed before release.

| Store | Required / Recommended Assets | Suggested Sacred Heart Screens |
|---|---|---|
| Apple iPhone | Prepare at least 5 portrait screenshots; one to ten are accepted.[4] | Dashboard, Begin Session, Personalized Script, Audios, Identity & Values. |
| Apple iPad | Required if the app runs on iPad.[4] | Generate separately or set `supportsTablet` to false if iPad is not release-ready. |
| Google Play | Phone screenshots and feature graphic should be prepared in Play Console. | Use the same five narrative screens adapted for Android framing. |

Recommended screenshot captions should stay benefit-oriented and non-medical: **Begin your daily session**, **Reflect with guided prompts**, **Generate a personal audio practice**, **Track streaks and progress**, and **Review values and identity insights**.

## Privacy and Data Safety Preparation

Google requires developers to declare how an app collects, shares, and protects user data in the Data safety form, including data handled through third-party libraries or SDKs.[3] The mobile app uses Clerk authentication and a production backend, so the final forms should be completed by someone with access to the Clerk, backend, analytics, payment, and storage configuration.

| Data Area | Likely Answer Direction | Verification Needed |
|---|---|---|
| Account data | Collected for authentication and account management. | Confirm Clerk production fields and whether email/name/profile image are stored. |
| User-generated content | Collected because users submit session/reflection content. | Confirm backend retention, deletion, and export practices. |
| Audio/scripts | Collected or generated from user sessions. | Confirm whether generated scripts/audio are stored, for how long, and where. |
| Purchase/access status | Likely collected for account access control. | Confirm whether Stripe/customer data is stored in backend or only referenced. |
| Encryption in transit | Likely yes if all production endpoints use HTTPS. | Confirm backend, Clerk, and purchase URLs are HTTPS-only. |
| Data deletion | Must be described. | Confirm support/contact method and deletion workflow before submission. |

## App Review Notes Draft

The app requires account sign-in to access personalized sessions and generated audio. Please use the provided review account credentials to complete sign-in and test the main guided-session flow. The backend and authentication services are live for review. The app is intended for self-reflection and personal growth only and does not provide medical, clinical, emergency, or therapeutic services.

Review credentials still need to be created by the account owner in the production Clerk environment. Apple’s review guidance says that apps with account-based features should provide App Review with an active demo account or fully featured demo mode, and that backend services should be live and accessible during review.[5]

## References

[1]: https://developer.apple.com/app-store/product-page/ "Apple Developer — Creating your product page"  
[2]: https://support.google.com/googleplay/android-developer/answer/9859152?hl=en "Google Play Console Help — Create and set up your app"  
[3]: https://support.google.com/googleplay/android-developer/answer/10787469?hl=en "Google Play Console Help — Provide information for Google Play's Data safety section"  
[4]: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/ "App Store Connect Help — Screenshot specifications"  
[5]: https://developer.apple.com/app-store/review/guidelines/ "Apple Developer — App Review Guidelines"
