# Local setup

1. Install Node >=20.19, enable Corepack (`corepack enable`), then run `pnpm install`.
2. Keep the existing `.env`. On a fresh checkout only, copy `.env.example` to `.env`, fill your own provider credentials privately, and explicitly run `pnpm exec tsx scripts/ensure-secrets.ts` to append the five security values. Never commit `.env`.
3. Run `pnpm smoke`. Missing integrations are listed by key name; no secrets are printed. Provider failures produce a nonzero exit code. Missing optional integrations are skipped.
4. Run `pnpm dev`. Visit http://localhost:3000/login and use ADMIN_PASSCODE from your local `.env`. The app never prints the passcode. `/api/health` is public JSON. `/` and `/api/events` require the signed admin session.
5. For Part 2, provide DATABASE_URL for Postgres and run `pnpm db:migrate`. Do not apply migrations to a database you do not intend to use for Chase. Initial migration creates the append-only events table and enforcement triggers.

## What is ready vs reserved

Part 1 provides app structure, shadcn components, environment validation, auth, utilities, health, read-only Bolna APIs, provider interfaces, optional LLM ping, event schema and feed. Full provider actions, ledger schema, collection engine, attempt caps, persistent opt-outs, call scheduling, payment processing and analysis belong to later parts.

The hosted payment page is intentionally inactive until payment tokens and invoices can be validated. `seed` and `bolna:sync` print their assigned part and perform no side effects. Empty CALL_ALLOWLIST blocks all demo calls. The default console messaging adapter records simulated messages when a migrated database exists.

## Config currently needed

Use `pnpm smoke` for the authoritative integration-specific list. For the next development stage, provide DATABASE_URL and ANTHROPIC_API_KEY (or explicit alternate provider credentials). Before calling, configure CALL_ALLOWLIST, DEMO_DEBTOR_PHONE and OWNER_PHONE. Merchant details are needed before hosted payment links; agent IDs and voices are resolved in Part 4. Names such as META_WA_TOKEN and RAZORPAY_KEY_SECRET are optional unless selecting those providers.

All canonical keys are documented in `.env.example`; defaults are in `src/lib/env.ts`. Nonempty canonical values take priority over aliases. Configure actual available model IDs for the chosen provider rather than relying on defaults to exist on every account.

## Public HTTPS

Run `pnpm tunnel` for Cloudflare Tunnel/ngrok commands. Set APP_BASE_URL locally to the public HTTPS origin and restart Next.js; the same-origin login check and Secure cookie rely on this setting. Deployment is configured for Vercel bom1. Every exempt service route still needs its own authentication in its implementation.

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm smoke
```

Health `ok` is liveness, not full demo readiness. It returns DB status and integration configuration without account details. It does not make paid LLM calls or repeated Bolna requests. `pnpm smoke` is the explicit connectivity check.

The initial login limiter is per-process; replace it with shared durable throttling before a multi-instance production deployment. Database trigger protections should use a separate non-owner production application role. Do not present Part 1 as a completed compliance or lending-recovery product.
