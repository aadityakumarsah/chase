# Chase — project brain

Read this file before making changes. Read PROGRESS.md and DECISIONS.md next. Never read or print .env values into tool output. Inspect key names only; application code may consume credentials privately.

## Product and positioning

Chase is being built in ten parts for the Bolna × YC Symphony Buildathon, with submission targeted for 31 October 2026 and finalists pitching to a YC partner. The supplied event notes describe a virtual buildathon, top-ten Symphony tickets, and a top-three Bengaluru finale on 20 November, with travel covered. See docs/original-product-notes.md for preserved initial context.

**“Bolna makes the call. Chase gets you paid.”** Chase is the receivables and collections operating layer for Indian SMB distributors, wholesalers, schools and clinics, with a future small NBFC/fintech partner path. Lead with B2B invoice dues/udhaar. Bolna (YC F25) is the voice AI orchestration platform purpose-built for Indian enterprises: control over intelligence/tone/workflows, efficient provider routing, and multilingual performance at scale. Sources: https://www.bolna.ai, https://www.bolna.ai/docs, https://www.bolna.ai/symphony/buildathon.

Chase is the brain around the call:

1. **Chase Rating:** deterministic, explainable 0–100 ranking based on probability of paying × amount × urgency / effort. Claude supplies features and a one-line rationale; never the score itself.
2. **Mid-call actions:** HTTPS tool endpoints send a UPI payment link on WhatsApp, record a dated promise to pay, check payment status, schedule a callback, flag a dispute, register an opt-out, or transfer to the owner.
3. **Conduct by construction:** hard call limits 08:00–19:00 IST, default 09:00–18:30; attempt caps, opt-out ledger, no threats, no third-party disclosure, AI disclosure and logged decisions. These are RBI-style engineering safeguards, not a legal certification. Do not claim unimplemented controls or lender readiness.
4. **Post-call intelligence:** after completed execution, Claude emits typed outcome, promise, reason, sentiment and compliance flags, updates each debtor's Contact Dossier and re-ranks the queue.
5. **Daily Management Brief:** at 19:15 IST Bolna calls the consenting business owner with promised/collected cash, broken promises, disputes, compliance and insights; supports follow-up questions and a WhatsApp PDF. This owner brief is a separate purpose from debtor recovery calls; it must not bypass collection-hour guards on debtor calls.
6. **Prompt PRs:** nightly evidence-backed small prompt diffs from losing calls, simulator validation, one-click owner approval. Protected compliance prompt sections are immutable. “Dependabot for getting paid.”

## Three-minute demo target

A teammate's phone rings. The agent speaks Hinglish, identifies itself as AI, confirms identity before disclosing debt and recalls “पिछली बार आपने 5 तारीख बोला था”. The debtor offers ₹2,000 now. A UPI link arrives on WhatsApp mid-call; Razorpay test mode or a clearly labelled simulator confirms payment and the agent thanks the debtor live. A 9 pm callback request is blocked, explained politely and moved to the next allowed slot, with the blocked slot on the dashboard. Chase Rating changes with Claude's rationale. A Prompt PR awaits approval. Finally the presenter's phone rings with the owner brief. Never imply a simulated payment or message is real.

## Architecture

One Next.js App Router app (TypeScript strict, src layout) hosts UI and route handlers, deployed as one unit in Vercel bom1. Current installed Next.js is 16.4.3: use src/proxy.ts, not middleware.ts. Consult version-matched guides in node_modules/next/dist/docs/ before changing Next.js behavior. The newer single-app instruction replaces the historical FastAPI sketch preserved in docs/original-product-notes.md.

Ledger CSV / Tally export / Google Sheet enters Postgres through Drizzle. The Chase Rating engine, Claude-backed dossier and compliance scheduler decide the next call. Bolna /call receives user_data (dossier, amount, language), with agent_data.language such as hi/mr/ta. Bolna runs STT (Sarvam/Deepgram), LLM, TTS (Sarvam/Cartesia) over Plivo/Exotel. Use native Anthropic by default or later an OpenAI-compatible Chase proxy; a future parallel supervisor can veto/rewrite unsafe turns. No subagents are authorized by this architecture alone.

Mid-call functions will include get_dossier, create_upi_link(amount), record_promise(date, amount, reason), payment status, flag_dispute, request_callback(time), transfer_to_owner and opt_out. Tools authenticate independently. Bolna's completed webhook triggers typed post-call analysis and dossier updates. Nightly management brief and Prompt PR generation follow.

Provider interfaces:

- Bolna REST: https://api.bolna.ai, Bearer auth; agents, calls, executions, graph events and web-call sessions. Part 1 implements read-only getMe/listAgents/getAgent.
- LLM: native Anthropic plus OpenAI-compatible OpenAI, OpenRouter, Gemini, Groq, DeepSeek, Together and custom base URL. Use explicit env provider/model selection, no silent switches.
- Messaging: console by default (persisted simulated messages visible on the dashboard), then Meta WhatsApp, Twilio WhatsApp and SMS adapters.
- Payments: hosted UPI page by default, then Razorpay test mode. Part 5 implements durable links, open tracking, confirmation and clearly labelled demo simulation.

Public authenticated service surfaces (independent of dashboard login): /api/bolna/webhook, /api/tools/*, /api/llm/v1/chat/completions; future webhooks, cron and web-call routes. They need HTTPS through Cloudflare Tunnel/ngrok locally or Vercel. Exemption from admin auth never means exemption from endpoint-specific secrets/signature validation.

Postgres + Drizzle ORM and drizzle-kit migrations; postgres-js driver. Zod at env/API/provider/LLM boundaries. Vitest tests; pnpm via Corepack; ESLint and Prettier. Tailwind/shadcn/ui neutral theme and lucide-react. SWR polling only; no websockets. The append-only events table is both audit log and dashboard activity feed.

## Folder map

- src/app/(dashboard)/ — protected dashboard pages.
- src/app/login/ — passcode login and signed-session POST.
- src/app/pay/[token]/ — public payment page; inert until payment implementation.
- src/app/api/ — health, event feed and later authenticated tools/webhooks.
- src/proxy.ts — request authentication interceptor.
- src/lib/env.ts — canonical configuration, legacy aliases, safe status report.
- src/lib/db/ — Drizzle schema and lazy Postgres connection.
- src/lib/money.ts, time.ts, phone.ts, log.ts, events.ts — domain helpers and append-only feed.
- src/lib/bolna/, llm/, messaging/, payments/ — replaceable integration interfaces/adapters.
- src/lib/chase/, compliance/, calls/, dossier/, analysis/, brief/, promptprs/, sim/, supervisor/ — domain modules, some reserved for later parts.
- src/components/ui/ — installed shadcn components (button, card, badge, table, tabs, dialog, input, select, sonner, tooltip, separator, skeleton, sheet, progress, dropdown-menu).
- prompts/ — versioned agent prompts and protected sections (later parts).
- scripts/ — safe smoke, migration, placeholder, tunnel and explicit security-key bootstrap scripts.
- tests/ — focused unit and provider/auth boundary tests.
- drizzle/ — committed SQL migrations and metadata; apply using db:migrate.
- docs/ — Bolna notes, original notes and setup/reference documentation.
- .claude/skills/ — 20 installed Bolna skills; read applicable instructions before use.

## Non-negotiable conventions

- Money in domain/storage/API is **integer paise**, never floating-point rupees. Convert only for display. Spoken helpers explicitly accept display rupees to match spokenAmountHi(12500) = “12,500 रुपये”; use paiseToRupees first for domain money.
- Store UTC instants, show Asia/Kolkata. Wall-clock Date values from toIST/nowIST are display-only. Windows are start-inclusive/end-exclusive. Validate the actual Bolna-rounded slot before scheduling.
- Phones are E.164. Normalize Indian mobile input and mask display numbers. Never dial outside CALL_ALLOWLIST in demo mode, including owner and transfer destinations; an empty allowlist denies all.
- Validate every external boundary with Zod. Fail clearly without echoing sensitive input. LLM output must be typed and validated before state changes.
- Never print, log, commit or hard-code keys, tokens, passcodes or connection credentials. Never overwrite .env. Only append when explicitly requested. .env and .env.* except .env.example are ignored. Do not log raw SDK errors or headers.
- Canonical env names and one-line documentation live in .env.example; all example values are empty. src/lib/env.ts owns defaults/aliases. Original .env names stay untouched.
- Small focused modules; explain why in comments. Events append only, with database triggers rejecting mutations; production roles must not own or disable the triggers. Validate/idempotently handle external effects in later parts.
- Signed, expiring HttpOnly admin cookie; same-origin login POST; secure cookie when APP_BASE_URL is HTTPS. Process-local login throttling is for the demo, not a distributed production limiter.
- Only caller-confirmed identity permits debt disclosure; AI disclosure and respectful language are mandatory. Enforce opt-outs, attempt caps, hours, consent and immutable compliance prompt sections before implementing real calls. Part 1 implements only the allowlist and time guards, not the complete calling policy.
- Trust current official docs and live API over a stale prompt; document adaptations in DECISIONS.md. Work autonomously; ask only for a true user-only blocker. Do not place real calls as a “smoke check”.

## Part 1 contract

Scaffold all named dependencies and folders; env loader with aliases/defaults/configReport; append missing security values only; blank canonical .env.example; tested money/time/phone/log helpers; typed Bolna GET client with 10-second timeout, 429/5xx jittered retries and redacted errors; public health JSON; protected dashboard; fetch and condense Bolna assistant/index docs; install vendor skills; print MCP setup command only; safe config/database/Bolna/5-token LLM smoke; project brain files; all package scripts and requested commit. Later part briefs are authoritative; do not silently implement external side effects early.

## Bolna gotchas

- GET /v2/agent/all is a bare array; GET /v2/agent/{id} retrieves details. /user/me concurrency can be an object.
- Agent and batch creation return 201 with state, not status.
- scheduled_at must end in +00:00, at least two minutes ahead; Bolna rounds up to ten minutes.
- Wait for completed, not call-disconnected, for post-call facts.
- toolchain.pipelines is an array of arrays. from_phone_number is normally optional; trunk agents require a trunk caller ID.
- Sarvam language uses hi, not hi-IN. Resolve voice IDs against the current catalog.
- Legacy extraction fields are retired in current docs; check the Extractions migration before Part 6.
- See docs/bolna-notes.md for sources, lifecycle states, webhook IPs, SIP rules, installed skills and the optional MCP command.

## Commands

Use Node >=20.19 and `corepack enable`. `pnpm install` installs pinned lockfile dependencies (use `corepack pnpm` if the shell shim differs).

- pnpm dev / build / start — Next.js development / production build / server.
- pnpm typecheck / lint / test — required checks; tests use fixtures and make no live calls.
- pnpm smoke — status/missing names, optional DB ping, Bolna name/wallet/concurrency and agent names/IDs, optional 5-token LLM ping; never secrets.
- pnpm db:generate / db:migrate / db:studio — schema migrations and local database UI.
- pnpm seed / pnpm seed --reset — fictional portfolio seed / explicit local demo reset; pnpm bolna:sync — explicitly sync and GET-verify both Bolna agents; requires a public HTTPS origin.
- pnpm tunnel — prints macOS Cloudflare/ngrok instructions, never starts a tunnel.
- pnpm format / format:check — formatting.
- pnpm exec tsx scripts/verify-part5.ts — local HTTP payment/message acceptance; records one explicitly simulated payment in the fictional portfolio.
- pnpm llm:ping / pnpm dossier:demo — explicit live LLM tier checks / demo dossier compilation; require configured credentials.
- RUN_LLM_EVALS=1 pnpm eval:analysis — explicit live six-transcript evaluation; skipped without opt-in.
- See docs/llm-layer.md for Part 3 routing, fallback, telemetry and verification limits.
- pnpm exec tsx scripts/ensure-secrets.ts — explicit authorized bootstrap only; appends absent security keys, never rewrites existing lines.
- pnpm calls:poll — reconcile calls left non-terminal for more than three minutes; pnpm promises:sweep — resolve overdue promises and refresh ratings.
- pnpm verify:part6 — replay an offline terminal execution three times and verify one call/analysis plus a dry campaign plan; it never dials.

## How to resume

Read AGENTS.md, PROGRESS.md, DECISIONS.md and docs/bolna-notes.md. Run git status and inspect env key names only. Run pnpm smoke to see safe missing-key diagnostics. Read the user's next Part brief before expanding scope. Run typecheck/lint/test after relevant changes. Do not replace .env, generate fake data that looks real, create duplicate migrations, regenerate credentials, or call recipients implicitly. Part 2 seed is implemented; use --reset only for an explicit disposable local demo reset. Part 6's gate, dialer, campaign planner, webhook analysis and sweepers are implemented; check PROGRESS.md for live acceptance and tool-resync notes. Keep PROGRESS.md accurate about implemented vs planned functionality and verification limits.
