# Accounts, workspaces and tenant isolation

Chase was built as a single-tenant demo: one business, configured entirely through
environment variables, behind one shared passcode. This document describes the
multi-tenant product it became, and is the reference for anyone extending it.

## The model

| Concept            | Table                 | Notes                                                                    |
| ------------------ | --------------------- | ------------------------------------------------------------------------ |
| Person             | `app_users`           | Mirror of Supabase `auth.users`. Chase stores **no password material**.  |
| Workspace (tenant) | `businesses`          | Holds the business profile, calling policy and merchant UPI ID.          |
| Access             | `org_members`         | `(business_id, user_id)` unique, with a role.                            |
| Pending access     | `org_invites`         | Single-use, email-bound, 72-hour token; only the SHA-256 hash is stored. |
| Number ownership   | `phone_verifications` | OTP proving the workspace controls the number Chase will call.           |

Every tenant-scoped table carries `business_id` directly — including tables that
previously only referenced a debtor (`promises`, `payments`, `messages`,
`opt_outs`, `compliance_events`, `chase_ratings`, …). Denormalising the tenant
onto each row is what makes scoping a single indexed predicate rather than a
multi-table join, and what makes row-level policies expressible later.

## Roles

| Role       | May                                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `owner`    | Everything, including destructive actions. Cannot be demoted or removed; a workspace can never become ownerless. |
| `admin`    | Settings, teammates, agent sync, prompt approvals.                                                               |
| `operator` | Work the queue: call, message, record promises and payments.                                                     |
| `viewer`   | Read only.                                                                                                       |

Guards are expressed as a minimum rank: `requireMember(request, { minRole: "admin" })`.

## How a request is authorised

`src/lib/tenancy/guard.ts` is the single gate for every workspace API route:

1. `getAuthUser()` revalidates the Supabase token — the decoded cookie alone is
   never trusted.
2. The user's memberships are read from the database on every request.
3. The active workspace is the one named by the `chase_ws` cookie **only if the
   user is still a member of it**; otherwise it falls back to their first
   workspace. A forged cookie therefore cannot switch tenants.
4. The role is checked against the route's minimum.
5. Mutations additionally require a same-origin `Origin` header.

The workspace id is never read from a request body or query string. Routes that
used to accept `?businessId=` (CSV import) now ignore it.

## Database exposure

Supabase publishes the `public` schema over PostgREST. Chase never queries
Postgres from the browser, so migration `0011_tenant_isolation_grants` takes the
strictest posture available:

- row level security is **enabled and forced** on every table in `public`;
- there are **no permissive policies**, so PostgREST denies by default;
- `anon` and `authenticated` have every table, sequence and function privilege
  revoked, and the default privileges for future objects are revoked too.

The application connects as the owning role, which holds `BYPASSRLS`, so server
queries are unaffected. Adding a policy later is then a deliberate act rather
than an accident of a default grant.

## Who Chase may call

The single-tenant build gated calls on a `CALL_ALLOWLIST` environment variable.
That cannot work for many tenants, so rule **R1** now means:

- **Demo mode on** — the number must be in `CALL_ALLOWLIST` (unchanged; this is
  the safety rail for rehearsals).
- **Demo mode off** — the debtor must carry a `consent_basis` recorded at import
  (`ledger_customer`, `written_contract`, `prior_relationship`,
  `explicit_consent`), together with who attested it and when. A debtor with no
  recorded basis is never dialled.
- **Owner brief calls** — the workspace's own owner number must have passed OTP
  verification.

Rules R2–R11 (opt-outs, disputes, calling window, attempt caps, minimum gap,
hardship, pending promises, first-contact disclosure) are unchanged and remain
enforced in code, with the window and caps now read per workspace.

## Getting paid

Each workspace stores its own `upi_vpa` and `merchant_name`. Payment links are
generated with that VPA, so money moves directly from the debtor to that
business. Chase is never a payment intermediary and holds no settlement balance.

## What is deliberately not done yet

- **Billing.** `plan`, `status` and `trial_ends_at` exist on every workspace and
  a 14-day trial is set at creation, but nothing enforces or charges for them.
- **Invitation email.** Invitations are created and returned as a single-use
  link for an admin to pass on. No mail is sent, and the UI says so rather than
  implying delivery.
- **Per-tenant LLM telemetry.** `llm_calls.business_id` exists and is scoped on
  read, but the LLM layer does not yet stamp it, so a new workspace's AI Ops page
  is empty until that is plumbed through.
- **Shared Bolna agents.** Both agents belong to the platform account and receive
  per-call tenant variables. Per-tenant agents and prompt overrides are a later
  milestone.
- **Rate limiting** remains process-local and should move to a shared store
  before running more than one instance.

## Verifying it

The two-account acceptance run drove sign-in, onboarding, isolation, CSRF,
invitations, settings policy and sign-out against the Supabase project.
`tests/tenancy.test.ts` covers role ordering, input policy and the consent-based
contact gate offline. `pnpm verify:e2e` uses an explicit `E2E_BUSINESS_ID` for
tenant data checks and otherwise skips those checks. It never chooses a random
workspace.

## Production configuration

Vercel production uses `APP_BASE_URL` for same-origin mutation checks and
Bolna callbacks. `pnpm vercel:env:sync` previews a narrow cutover from
`.env.local`: `DATABASE_URL` (the Supabase transaction pooler) and the two
browser-safe Supabase Auth settings. Add `--apply` to set those three variables.
It does not copy the old `.env`, install a Supabase server key or change
`DEMO_MODE`. Use `DIRECT_URL` locally for migrations; never deploy it to the
web runtime.

In Supabase Auth, set the public Chase origin as the Site URL and allow
`https://chase-liard.vercel.app/auth/callback` as a redirect URL. Configure
production SMTP before opening email sign-up broadly. Google OAuth is currently
disabled in the project, so Chase hides its button until the provider is enabled.
Keep `DEMO_MODE=true` until owner numbers, per-debtor consent and real-phone
acceptance have been verified. Rotate production credentials before launch.
