# Align Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Each task lists exact files + intent; expand TDD steps (write failing test → run → minimal impl → run → commit) at execution time. Code-level detail lives in the spec at `docs/superpowers/specs/2026-05-21-align-funnel-design.md` — read the relevant spec section before starting a task.

**Goal:** Ship `align.sovereignty.app/start` — a hand-coded 9-question quiz funnel with email gate, programmatic results (12 variants), $7 + $27 bump Stripe checkout, and a 6-email Resend drip — meeting the 11-row acceptance table in spec §10.

**Architecture:** Net-new Next.js 16 App Router repo (`align-funnel`) for the funnel UI + minimal server API routes. Backend extensions in this repo (`nlp-trainer`) own all lead persistence, the drip cron, the Resend pipeline, and the React Email templates. Funnel is thin; nlp-trainer is system of record. See spec §3 for the architecture diagram.

**Tech Stack:** Funnel — Next.js 16, TypeScript strict, Tailwind 4, Zustand, Stripe Node SDK, Vitest, Playwright. Backend extensions — Node 22, SQLite via sql.js, Resend Node SDK, `@react-email/components`, `svix`, `node-cron` (existing). Hosting — Vercel (funnel), Railway (backend).

---

## Phase A — Backend extensions (nlp-trainer)

Goal: extend `nlp-trainer` to be the system of record for the new funnel. Each task is self-contained; phase ships as one PR.

**Pre-phase:** From `~/Desktop/nlp-trainer` on `main`, create branch `feature/align-funnel-backend`. Read spec §5 end-to-end before starting.

- [ ] **A.1** Add Resend + dependencies. `~/Desktop/nlp-trainer/server/package.json` — add `resend`, `@react-email/components`, `@react-email/render`, `svix`, `react`. Run `cd server && npm install`. Commit.

- [ ] **A.2** Add HMAC token helpers. Create `server/middleware/tokens.js` exporting `signLeadToken(leadId)`, `verifyLeadToken(token)`, `signUnsubToken(email, leadId)`, `verifyUnsubToken(token)`. Uses `LEAD_TOKEN_HMAC_SECRET` and `UNSUBSCRIBE_HMAC_SECRET`. Include `tests/middleware/tokens.test.js` covering sign/verify roundtrip + expired + tampered cases (spec §5.2 — tokens are HMAC over `{lead_id, exp}` and `{email, lead_id, intent: 'unsub'}`).

- [ ] **A.3** Schema migrations. Modify `server/routes/quiz.js` — wrap each new `quiz_leads` column ADD in a try/catch (SQLite throws on existing column). Add `CREATE TABLE IF NOT EXISTS quiz_email_sends` block. Full column list + table SQL in spec §5.1. Commit.

- [ ] **A.4** Extend POST `/api/quiz/lead`. Modify `server/routes/quiz.js:49` handler to accept new fields (full request body in spec §5.2). Persist to `quiz_leads`, set `gate_at = datetime('now')`. INSERT 6 `quiz_email_sends` rows with offsets `[1, 24, 48, 72, 96, 144]` hours. Existing CAPI + GHL calls preserved. Backwards-compat: old callers with no new fields still work (NULLs are fine).

- [ ] **A.5** Extend GHL `handleQuizLead`. Modify `server/services/ghl.js` — accept `result_program`, `depth_band`, `q9_fear`, `pattern_scores` from caller; add as tags (`funnel:align`, `program:{program}`, `depth:{band}`) and custom fields (`q9_fear`, `pattern_scores`). Preserve existing tag behavior.

- [ ] **A.6** Add GET `/api/quiz/lead/:token`. New route in `server/routes/quiz.js`. Verify token via `verifyLeadToken`; on success return `{ first_name, result_program, depth_band }` only. Tests: valid token, expired, tampered, non-existent lead_id.

- [ ] **A.7** Re-create `server/routes/email.js` with two endpoints only: GET `/unsubscribe?token=...` and POST `/resend-webhook`. Unsubscribe verifies token, sets `unsubscribed=1`, renders confirmation HTML. Webhook verifies `svix` signature against `RESEND_WEBHOOK_SECRET`, dispatches per spec §5.2's event table. Mount in `server/index.js` after Clerk middleware (no auth required on these — both are publicly callable via signed tokens / Resend's signature).

- [ ] **A.8** Mark purchased on Stripe webhook. Modify `server/routes/stripe-webhook.js:283` (the `checkout.session.completed` branch) — add `UPDATE quiz_leads SET purchased=1 WHERE email=?` + `UPDATE quiz_leads SET bump_purchased=1` if bump price ID present in line items. Existing Clerk/CAPI/GHL flow preserved.

- [ ] **A.9** Resend service wrapper. Create `server/services/resend.js` exporting `sendEmail({ to, subject, html, headers, idempotencyKey })`. Reads `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`. Throws typed errors for retryable vs permanent failures.

- [ ] **A.10** Email templates. Create `server/emails/_shared/{EmailLayout.tsx, tokens.ts, render.ts}` + `server/emails/data/{program-merges.ts, subject-lines.ts}`. `program-merges.ts` content verbatim from spec §5.4. `render.ts` wraps `@react-email/render` to HTML string. Confirm with a single throwaway test that `render(<EmailLayout />, {})` produces valid HTML.

- [ ] **A.11** The six templates. Create `server/emails/{01-result-recap, 02-mechanism, 03-proof, 04-fear, 05-objections, 06-last-call}.tsx` — copy verbatim from build plan §6 (`~/Documents/Claude/Projects/❤️ Sacred Heart/Alignment Engine — Quiz Funnel Build Plan.md`). Each exports default component + `subject(props)`. Snapshot tests for each at `tests/emails/*.test.tsx`.

- [ ] **A.12** Drip scheduler. Create `server/services/funnel-drip-scheduler.js` modeled on `knowledge-base-scheduler.js`. Cron every 15 min in `America/Los_Angeles`. Algorithm per spec §5.3 — SELECT due (≤50 at a time), skip unsubscribed/purchased, render template, send via Resend, update status. Retry: +1h, max 3 attempts. Wire `initFunnelDripScheduler()` into `server/index.js` boot block.

- [ ] **A.13** Integration tests. Create `tests/integration/funnel-drip.test.js` — seed leads with various states (gate_at past due, purchased, unsubscribed), tick scheduler with mocked Resend, assert correct status transitions per spec §5.3. Create `tests/integration/quiz-lead-extended.test.js` — POST extended payload, assert all 14 columns populated + 6 send rows queued.

- [ ] **A.14** Local end-to-end check. Start `cd server && node index.js` on port 3001. Curl `POST /api/quiz/lead` with a full payload. Verify quiz_leads row in SQLite has new columns. Curl `GET /api/quiz/lead/:token` with the lead's token — verify scoped response. Trigger scheduler tick (add temporary `/api/_debug/tick-funnel-drip` endpoint behind admin auth for this, or just wait 15 min).

- [ ] **A.15** Phase A acceptance. Open PR `feature/align-funnel-backend` against `main` with full diff. Self-review per the spec §5 checklist. Merge to main → Railway auto-deploys. Verify `/api/health` returns 200 and the new schema is reflected (a manual SQL probe or `/api/_debug/schema` endpoint). Set 6 Railway env vars per spec §5.5 (`RESEND_API_KEY`, `RESEND_FROM_ADDRESS`, `RESEND_WEBHOOK_SECRET`, `UNSUBSCRIBE_HMAC_SECRET`, `LEAD_TOKEN_HMAC_SECRET`, `ALIGN_FUNNEL_URL=https://align.sovereignty.app`).

**Phase A handoff to user:** Verify Resend domain (sovereignty.app) and add 3 DNS records before proceeding. Provide Resend API key + webhook secret to set as Railway env vars.

---

## Phase B — Funnel repo scaffold + quiz data + scoring engine

Goal: stand up the `align-funnel` repo with the pure, deterministic core (data + scoring + routing) fully test-covered.

- [ ] **B.1** Create repo. `gh repo create maxwellt7/align-funnel --private --clone`. Move into `~/Desktop/align-funnel/`. `npx create-next-app@latest . --typescript --tailwind --app --src-dir=false --import-alias=@/* --use-npm --skip-install`. Initial commit.

- [ ] **B.2** Add core deps. `npm install zustand stripe resend zod framer-motion` + `npm install -D vitest @vitest/ui @playwright/test @types/node @testing-library/react @testing-library/jest-dom jsdom`. Set up `vitest.config.ts` (jsdom env, path alias resolution). Set up `playwright.config.ts` (base URL configurable via env). Commit.

- [ ] **B.3** Tailwind theme. Edit `tailwind.config.ts` to add Alignment Engine palette (`#0a0a0f`, `#b8860b`, `#d4a017`, `#e8e0d0`, `#a0a0b0`) + Cinzel/Inter font families. Update `app/layout.tsx` to load fonts. Commit.

- [ ] **B.4** Typed env. Create `lib/env.ts` exporting a `zod`-parsed `env` object with all variables from spec §6.7. Throws at boot if any required var is missing. Commit.

- [ ] **B.5** Quiz config (data). Create `lib/quiz/questions.ts` exporting `QUESTIONS: Question[]` with all 9 questions verbatim from build plan §3. Type definitions per spec §6.3. Add `lib/quiz/types.ts` with `Question`, `QuestionId`, `AnswerValue` types.

- [ ] **B.6** Quiz config invariant tests. Create `tests/unit/questions.test.ts` — assert: 9 entries, exactly 1 of each `QuestionId q1..q9`, every option has a valid tag, every pattern A/B/C/D is reachable in Q4, Q3 is multi, every Act-3 question has a skip option, no duplicate option ids. Run, expect green.

- [ ] **B.7** Scoring engine + tests. Create `lib/quiz/scoring.ts` exporting `scoreQuiz(answers)` per spec §6.4. TDD: write `tests/unit/scoring.test.ts` first with ~10 deterministic cases covering each program + each band + Q4 tie-break + skip option behavior. Run (fails). Implement scoring. Run (passes). Commit.

- [ ] **B.8** Result routing + tests. Create `lib/quiz/routing.ts` exporting `getResultVariant({ program, band })` returning `{ programLabel, programSlug, intensityTone, bandLabel }`. TDD: `tests/unit/routing.test.ts` covering all 12 combinations. Commit.

- [ ] **B.9** Program merge data + tests. Create `lib/quiz/program-merges.ts` mirroring server-side spec §5.4. Test: `tests/unit/merges.test.ts` — assert every program has non-empty `program`, `program_line`, `fear_line`; cross-check strings byte-identical to build plan §6 table (regression guard).

- [ ] **B.10** nlp-trainer client wrapper. Create `lib/api/nlp-trainer.ts` with typed functions: `submitLead(payload)`, `getLeadByToken(token)`, `fireEvent(eventName, props)`. All hit `env.NEXT_PUBLIC_BACKEND_URL`. Includes 8s timeout + typed errors.

**Phase B acceptance:** All unit tests pass (`npm run test`). Repo pushed to `main`. No UI yet.

---

## Phase C — Funnel UI

Goal: build the quiz state machine, email gate, result page (all 12 variants), checkout, and supporting pages. End of phase: end-to-end clickable flow with mocked backend.

- [ ] **C.1** App shell. Edit `app/layout.tsx` — fonts, metadata, Meta Pixel script (with `env.NEXT_PUBLIC_META_PIXEL_ID`), dark theme. Create `app/page.tsx` as minimal landing → router.push(`/start`).

- [ ] **C.2** Zustand store. Create `components/quiz/store.ts` exporting `useQuizStore` per spec §6.2. Tracks `step`, `answers`, `multiSelect`, `startedAt`, `setAnswer`, `goNext`, `goBack`.

- [ ] **C.3** Question presenter. Create `components/quiz/QuestionScreen.tsx` accepting `{ question, currentValue, onAnswer }`. Renders prompt + sub-line + reason-for-asking + options as tap-targets (≥44 px). Handles single vs multi. Per spec §6.2 — tap an option → onAnswer immediately.

- [ ] **C.4** Progress bar. Create `components/quiz/ProgressBar.tsx` — "Question N of 9" + filled bar. Memoized.

- [ ] **C.5** Transitions. Create `components/quiz/transitions.ts` with framer-motion presets (250ms slide-fade, pre-render next behind current to guarantee no blank frame).

- [ ] **C.6** Quiz flow root. Create `components/quiz/QuizFlow.tsx` — client component, reads store, renders current step. Uses transitions. Includes back button. Manages multi-select "Done" affordance for Q3.

- [ ] **C.7** Email gate. Create `components/quiz/EmailGate.tsx` — copy verbatim from build plan §3 ("Your Alignment Diagnostic is ready..."). Fields: first_name (required), email (required, validated). Submit calls onSubmit prop.

- [ ] **C.8** Quiz host page. Create `app/start/page.tsx` rendering `<QuizFlow />`. Reads UTM params on mount, stashes in store. After gate submit → POST `/api/quiz/submit` → on success router.push(`/start/result?token=...`).

- [ ] **C.9** Submit API route. Create `app/api/quiz/submit/route.ts` — POST handler. Re-scores from raw answers server-side (spec §6.4 — authoritative). Calls `nlp-trainer.submitLead` with full payload. Returns `{ lead_token }` (the funnel signs its own token, since we don't want to leak the backend HMAC secret — wait, spec says backend signs and returns; revise: backend returns token; funnel forwards to client).

- [ ] **C.10** Event API route. Create `app/api/quiz/event/route.ts` — POST handler. Proxies body to nlp-trainer's `/api/quiz/event`. No re-shaping.

- [ ] **C.11** Result page (server). Create `app/start/result/page.tsx` — server component, reads `?token=`, calls `getLeadByToken(token)`, derives variant via `getResultVariant`, renders `<ResultPage program={} band={} firstName={} />`.

- [ ] **C.12** ResultPage composition. Create `components/result/ResultPage.tsx` rendering comfort → bad news → good news → offer in that exact order. Copy from build plan §5a–§5d.

- [ ] **C.13** ProgramBadNews. Create `components/result/ProgramBadNews.tsx` with all 4 program variants from build plan §5b, intensity-tuned by band per spec §6.5. Snapshot tests for all 12 combinations.

- [ ] **C.14** GoodNews + OfferBlock. Create `components/result/GoodNews.tsx` (shared copy from build plan §5c) and `components/result/OfferBlock.tsx` (price card + bump checkbox + guarantee + CTA from build plan §5d). OfferBlock CTA POSTs to `/api/checkout`.

- [ ] **C.15** Checkout route. Create `app/api/checkout/route.ts` per spec §6.6 — verify lead_token, look up lead email, create Stripe Session with metadata (`lead_id`, `result_program`, `depth_band`, `funnel: 'align'`), success_url + cancel_url. Fire CAPI `InitiateCheckout`. Return `{ url }`.

- [ ] **C.16** Success/cancel pages. Create `app/checkout/success/page.tsx` — reads `?cs=`, looks up Stripe session for email, shows "you're in" + 3-second JS redirect to `https://heart.sovereignty.app/sign-up?email=...`. Create `app/checkout/cancel/page.tsx` — soft cancel + back-to-result link.

- [ ] **C.17** Privacy + Terms. Create `app/privacy/page.tsx` and `app/terms/page.tsx` — copy from existing heart app's privacy/terms (already at `~/Desktop/nlp-trainer/src/pages/{Privacy,Terms}.tsx`).

- [ ] **C.18** End-of-Phase-C smoke. `npm run dev`. Click through whole quiz with one program-targeted answer set; verify on /start/result the right program+band variant renders; click CTA → redirected to a Stripe Checkout test page. Commit. Push.

---

## Phase D — Tracking + E2E debugging loop

Goal: wire up Meta Pixel + CAPI events at every canonical funnel point, then run the debugging loop until E2E suite is green.

- [ ] **D.1** Tracking helper. Create `lib/api/tracking.ts` exporting `trackPageView`, `trackViewContent`, `trackLead`, `trackInitiateCheckout`. Each fires Meta Pixel client + POSTs to `/api/quiz/event` for CAPI dedup. Per spec §7.

- [ ] **D.2** Wire pixel events. In `app/layout.tsx` — `PageView` on every route change. In `QuestionScreen` mount — `ViewContent` with `content_name=question:q1` etc. In `EmailGate` submit — `Lead`. In `OfferBlock` CTA click — `InitiateCheckout`. (Purchase is fired server-side by existing stripe-webhook.)

- [ ] **D.3** Playwright E2E suite. Create `tests/e2e/quiz-happy-path.spec.ts` (full tap-through asserting program/band match), `tests/e2e/stripe-checkout.spec.ts` (using `4242 4242 4242 4242` test card → assert redirect to /checkout/success → assert further redirect to heart.sovereignty.app), `tests/e2e/quiz-back-button.spec.ts`, `tests/e2e/quiz-skip-options.spec.ts`, `tests/e2e/mobile-tap-targets.spec.ts` (390×844 viewport, assert all interactive elements ≥44 px²), `tests/e2e/no-blank-screen.spec.ts` (DOM sample during transitions).

- [ ] **D.4** Email gate live test. Start local nlp-trainer (in another terminal) + funnel. Submit a real test gate. Verify in Railway/local DB: row exists in `quiz_leads` with all 14 new columns, 6 rows in `quiz_email_sends` queued with correct `scheduled_for` offsets, GHL contact created with new tags. Capture screenshots/SQL output as evidence.

- [ ] **D.5** Drip live test. Manually update one queued row's `scheduled_for` to past timestamp. Trigger scheduler tick (debug endpoint or wait). Assert Email 1 lands at `delivered@resend.dev` (Resend's test address) or your real inbox. Verify Resend webhook fires back to `/api/email/resend-webhook` and updates `quiz_email_sends.status`.

- [ ] **D.6** Debugging loop. Run unit + integration + E2E suites. For each failure: capture output, isolate, fix, re-run. Repeat until all green. Re-run mobile-tap-targets and no-blank-screen on real iPhone via BrowserStack or Vercel preview on your phone.

- [ ] **D.7** Lighthouse Mobile. Run `npx lighthouse https://<preview-url>/start --emulated-form-factor=mobile --only-categories=performance --output=html`. Assert score ≥85. Fix any blocking perf issues (image sizes, lazy loading, font preload).

- [ ] **D.8** Verify Meta Events Manager. Submit gate + complete test checkout. Within Events Manager → Events tab, verify `Lead`, `InitiateCheckout`, `Purchase` all show "Received" within 5 min of action.

- [ ] **D.9** Unsubscribe live test. Click the unsubscribe link in Email 1. Verify `quiz_leads.unsubscribed = 1`. Manually update `quiz_email_sends.scheduled_for` for Email 2 to past time → run tick → assert Email 2 is `skipped_unsubscribed`, no Resend call.

---

## Phase E — Deploy + DNS + acceptance criteria sign-off

Goal: production deploy at `align.sovereignty.app`, all 11 acceptance criteria green, evidence bundle delivered.

- [ ] **E.1** Vercel project. From `~/Desktop/align-funnel`, `vercel link` → choose `align-funnel` (creates new project). `vercel env pull` for local. Set Vercel env vars per spec §6.7 (8 vars including `STRIPE_PRICE_27USD_BUMP` — Stripe Dashboard task).

- [ ] **E.2** Stripe $27 bump price (manual). User-side: log into Stripe Dashboard, create a $27 one-time price under the existing "Alignment Engine" product (or new product "Personalized Belief Audit"). Capture the `price_...` ID. Set as `STRIPE_PRICE_27USD_BUMP` on Vercel.

- [ ] **E.3** Initial production deploy. `vercel --prod`. Confirm deployment URL serves over HTTPS. Smoke test from incognito.

- [ ] **E.4** Custom domain. `vercel domains add align.sovereignty.app`. Vercel will show 1 CNAME record. User-side: add CNAME `align` → `cname.vercel-dns.com` at the DNS host. Wait ~10 min. `vercel domains inspect align.sovereignty.app` until status is `Valid Configuration`.

- [ ] **E.5** Final smoke. From real iPhone incognito Safari, complete full flow: arrive at `align.sovereignty.app/start`, take quiz, submit gate, view result, click CTA, complete Stripe test checkout, land on heart.sovereignty.app/sign-up. Capture screen recording.

- [ ] **E.6** Acceptance criteria check (spec §10). For each of the 11 rows, capture the evidence artifact (test output, DB query, screenshot, Lighthouse report). Compile into `~/Desktop/align-funnel/docs/acceptance-evidence-2026-05-22.md`. Each row must be marked ✅.

- [ ] **E.7** Delivery message. Hand back: production URL, repo URL, evidence doc path, list of env vars set + where, list of manual handoffs completed by user, list of optional follow-ups (Section 8.4 defects, quiz-length test, Privacy.tsx Llama mention).

---

## Self-review notes

- **Spec coverage:** Phase A covers spec §5 entirely (schema, endpoints, cron, templates, env vars). Phase B–C cover §4 + §6. Phase D covers §7 + §8. Phase E covers §9 + §10 + §11. No spec section is unowned.
- **Placeholder scan:** none — all tasks reference concrete file paths or spec sections.
- **Type consistency:** function names referenced match (`signLeadToken`/`verifyLeadToken`, `scoreQuiz`, `getResultVariant`, `submitLead`, `getLeadByToken`, `trackLead`, etc.).
- **Scope check:** plan stops at acceptance evidence. Section 8.4 (existing-funnel defects), length test, Privacy.tsx update — explicitly out of scope per spec §12.

## Open execution-time questions

- **C.9 token model:** spec §5.2 says backend signs token + returns. Funnel just forwards. Resolved — no funnel-side HMAC secret needed.
- **A.7 mounting order:** unsubscribe + webhook are publicly callable via signed tokens / Resend sig — no Clerk required. Mount before or after the global `extractUserId` is fine because that middleware sets `req.userId=null` if no JWT (it only throws when configured to require auth, which it isn't on these routes).
- **A.12 cron interval:** 15 min default. Tuneable later via env var if needed.
