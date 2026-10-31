# Chase setup

## Local development

1. Use Node 22 (`nvm use`), enable Corepack and run `pnpm install`.
2. Keep `.env` unchanged. Add local Supabase Auth and Postgres settings in
   ignored `.env.local`; `.env.example` lists the canonical names. Never commit
   a populated environment file.
3. Set `DATABASE_URL` to the Supabase transaction pooler and `DIRECT_URL` to its
   session pooler. Run `pnpm db:migrate` only against the intended Chase project.
4. Run `pnpm smoke`, then `pnpm dev`. Visit `/signup` to create an account and
   workspace. `/api/health` is public, while workspace routes require Supabase
   authentication and membership.

Use `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` before deployment.
Tests do not place calls. `pnpm smoke` checks configured providers and prints
missing key names only.

## Production cutover

`pnpm vercel:env:sync` is a dry run. `pnpm vercel:env:sync --apply` copies only
the Supabase pooler URL and two public Auth settings from `.env.local` to
Vercel production. It excludes the Supabase server key, which current account
flows do not use. Production uses Vercel `bom1`; migrations run separately
against the session pooler. See [multi-tenancy.md](multi-tenancy.md) for Supabase
Auth redirect, SMTP, isolation and remaining launch requirements.

Keep `DEMO_MODE=true` while rehearsing. An empty `CALL_ALLOWLIST` denies every
demo call. Set explicit consent records and verify the real calling flow before
enabling production calling. A public HTTPS origin is required for Bolna tools
and webhooks; `pnpm tunnel` prints local tunnel instructions.

`pnpm verify:e2e` performs dry checks without calling anyone. Set
`E2E_BUSINESS_ID` to opt in to a specific workspace's dry campaign and brief
preview; the verifier otherwise skips those tenant data checks.
