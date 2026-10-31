# Running Chase as a business

Chase is a multi-workspace voice collections product. The public homepage is a **fictional walkthrough**. It never dials, messages, or collects money. Google or email sign-in gives a person an account; a workspace membership gives them access to business data.

## Business owner / vendor

1. Visit the public Chase URL, choose **Sign up** and sign in with Google (or email/password). Google redirects via Supabase Auth and back to Chase. An existing member goes straight to the dashboard; a new user completes onboarding.
2. Create a workspace: business and owner names, mobile number, city and language, and acknowledge the contact policy. Configure the **merchant UPI VPA and payee name** in onboarding or Settings. Links use this business's UPI destination; Chase does not receive the money.
3. Verify the owner phone in Settings before enabling an owner brief. Real OTP delivery requires Meta WhatsApp or Twilio; the default console provider writes **simulated** messages in the dashboard and never sends a real OTP.
4. Import a CSV of unpaid invoices from **Debtors**. Start with `samples/receivables-sample.csv` to learn the format; it contains fictional numbers. Record a lawful consent basis for each debtor when preparing real imports. Review the imported balances, contact numbers, due dates, and the ranked queue.
5. Check Settings for calling window, attempt caps, payment and delivery providers. Operators can inspect a debtor's dossier and rating, run a **dry run**, then deliberately start eligible calls or a campaign. Chase blocks opted-out, disputed, too-frequently-contacted, out-of-hours or otherwise ineligible contacts, and logs the decision.
6. During a connected Bolna call, the agent discloses it is AI and confirms identity before mentioning a debt. Its authenticated tools can send a payment link, record a promise/callback, check payment, or register a dispute or opt-out. Console messaging and hosted payment simulation are clearly marked **simulated**; a UPI intent is not proof of settlement.
7. On the dashboard, inspect completed calls, transcripts, recordings (if supplied by Bolna), events and updated ratings. At 19:15 IST the consenting, verified owner can receive a separate management brief. Review Prompt PR evidence; shared-agent activation is restricted to an isolated single-workspace demo.
8. Compare Free, Pro monthly/yearly and Enterprise at `/pricing`. The workspace owner uses `/settings/billing` for Dodo-hosted checkout, invoices and cancellation. Access changes only after Dodo's signed subscription webhook; returning from checkout alone does not activate Pro. Enterprise enquiries go to `/contact-sales` and are reviewed manually. See [Dodo setup](billing-dodo.md).
9. Invite teammates from **Settings → Team**. Chase creates an email-bound, single-use invite URL; **no invitation email is sent**. Share that link yourself with the intended email account. Workspace roles govern access.

## Operator checklist for a real-money pilot

- Use a production Bolna agent/model that completes an actual test conversation. The previously configured Claude Sonnet 5 model was rejected by Bolna's LiteLLM route or temperature handling; agent creation alone is not proof of successful calls. Resolve this with Bolna or explicitly select a supported model before live dialing.
- Supply a real delivery provider (Meta WhatsApp or Twilio) for OTP and payment messages, and use a real UPI VPA or configured Razorpay. Confirm money from the bank/payment webhook, not from a page view or spoken claim.
- Keep `DEMO_MODE=true` and `CALL_ALLOWLIST` restricted to consenting test numbers for rehearsal. The empty allowlist deliberately denies all calls, including the owner brief. Only switch off demo mode after confirming the consent basis, real-phone delivery and call safeguards.
- Enable production SMTP and confirm the Supabase Auth Site URL/redirect allowlist for sign-up and password recovery. Rotate any credentials previously shared in plaintext before public production cutover.
- Live Dodo checkout acceptance, automatic invitation email, a shared rate-limit store, per-tenant Bolna agents and a durable multi-tenant brief queue remain launch gaps. Do not market the app as fully self-service production infrastructure until those are addressed.

## Hosting

The UI, API endpoints, webhook, hosted payment page and daily cron live in **one Next.js deployment on Vercel**, in the Mumbai region; Supabase provides Postgres and Auth. A Render backend is not needed for the current architecture. Bolna and the configured LLM/TTS, messaging and payment providers are external services. Vercel Functions and cron have plan-specific runtime/duration limits. At scale, move the sequential nightly tenant job and post-call analysis to a durable queue/worker, and replace process-local throttling with shared storage. Those changes may use a managed worker service, but they do not require rebuilding the API on Render.

## Google console and Supabase

- Google Console **Authorized JavaScript origins**: `https://chase-liard.vercel.app` and, for local testing, `http://localhost:3000`.
- Google Console **Authorized redirect URI**: `https://cgrkeopyzddpewmfkaxj.supabase.co/auth/v1/callback`. This is Supabase's callback, not the Chase `/auth/callback` route.
- Put Google OAuth Client ID and Client Secret only in **Supabase Dashboard → Authentication → Providers → Google**. They do not go in Chase's `.env` or Vercel. Enable the provider.
- Supabase Auth **Site URL**: `https://chase-liard.vercel.app`; allowed redirect URL: `https://chase-liard.vercel.app/auth/callback**` (and `http://localhost:3000/auth/callback**` for local). Include any custom domain before switching the canonical origin.
- The Chase login screen checks Supabase public auth settings and displays Google only when the provider is enabled. Chase's `/auth/callback` exchanges the one-time code for secure session cookies. Complete one interactive sign-in and verify onboarding/dashboard to test your Google account and consent screen end-to-end.

## Landing-page voice preview

The player can speak the fictional Hinglish script using a browser/device Hindi voice without making a Bolna call or LLM request. It is labelled **device voice** until the authentic Bolna/Sarvam voice has been recorded. To publish the exact configured voice, supply a Sarvam TTS subscription key privately (not in git) and run `SARVAM_API_KEY=… pnpm exec tsx scripts/generate-walkthrough-audio.ts` locally. This makes four static MP3 clips in `public/audio/` with the configured `BOLNA_TTS_VOICE_ID` and sets the recording manifest after all clips succeed. Review and commit the generated files, then deploy. It incurs a one-time TTS cost, with **no per-play LLM, Bolna or TTS requests**. Never label the device-voice fallback as a Bolna recording.
