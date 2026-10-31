# Chase subscriptions with Dodo Payments

Chase billing is separate from debtor payments. Businesses pay Chase for a workspace subscription through Dodo Payments; debtors pay the business's own UPI VPA or its configured Razorpay flow. A Dodo checkout return is **not** payment proof. Only a signed subscription webhook can change a workspace's paid tier.

## Plans configured in Chase

| Plan        | Dodo product          | Display price | Product setup                                           | Workspace limits                                                                                                                                                       |
| ----------- | --------------------- | ------------: | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free        | none                  |            ₹0 | No card, no Dodo product                                | 25 debtor accounts, 30 collection calls per IST calendar month, 2 active seats; no campaigns, daily brief or Prompt PR generation.                                     |
| Pro monthly | one recurring product |  ₹2,499/month | INR, price **249900** minor units, charge every 1 Month | 2,000 accounts, 1,500 calls/month, 10 seats, campaigns, brief and Prompt PR review.                                                                                    |
| Pro yearly  | one recurring product |  ₹24,990/year | INR, price **2499000** minor units, charge every 1 Year | Same Pro limits; ₹4,998 below twelve monthly payments.                                                                                                                 |
| Enterprise  | no self-serve product |  By agreement | Sales-assisted via `/contact-sales`                     | Custom commercial terms; internal agreement activation is a manual operation. Do not promise dedicated agents, SSO, audit export or an SLA until built and contracted. |

The published price is pre-tax and must exactly match the Dodo recurring product. Dodo checkout shows tax and the final charge/renewal terms. `pnpm billing:verify` reads both products and refuses mismatches. The existing 14-day workspace trial grants Pro features without a card; paying during it starts the selected Dodo subscription immediately. External Bolna and delivery providers still need their own configured credentials and may have separate costs.

## Exact Dodo dashboard setup

1. Complete live merchant onboarding in Dodo, including your business/payout and required tax/support details. Verify that the account can create **live recurring INR products** and accept the desired payment methods. Chase never handles card details.
2. In **Products → Create product**, make `Chase Pro Monthly`: recurring/subscription, currency `INR`, amount `₹2,499`, billing frequency **1 Month**, quantity 1, no product-level trial. Copy its `pdt_…` product ID to `DODO_PRODUCT_PRO_MONTHLY`.
3. Make `Chase Pro Yearly` the same way, amount `₹24,990`, frequency **1 Year**. Copy its `pdt_…` ID to `DODO_PRODUCT_PRO_YEARLY`. Use separate products; an annual product is not twelve monthly payments.
4. In **Developer → API Keys**, create a **live-mode** server API key with product read, checkout, customer and customer-portal permissions. Put it in `DODO_PAYMENTS_API_KEY`. Never put it in a `NEXT_PUBLIC_` variable or in Google/Supabase.
5. In **Developer → Webhooks**, add endpoint `https://chase-liard.vercel.app/api/webhooks/dodo`. Subscribe to `subscription.active`, `subscription.updated`, `subscription.renewed`, `subscription.plan_changed`, `subscription.past_due`, `subscription.on_hold`, `subscription.paused`, `subscription.unpaused`, `subscription.update_payment_method`, `subscription.cancelled`, `subscription.failed`, and `subscription.expired`. Copy the signing secret to `DODO_WEBHOOK_SECRET`. The endpoint verifies Dodo's `webhook-id`, `webhook-timestamp` and `webhook-signature` against the raw body. Do not configure a generic bearer header as a substitute.
6. Set these five names in the **Vercel Production environment** and in ignored `.env.local` for local verification. Redeploy after adding them. Use `DODO_PAYMENTS_ENVIRONMENT=live_mode` only with the live API key and live product IDs; test keys/products belong with `test_mode`. `APP_BASE_URL` must be the public Chase origin. Do not put Dodo keys in the browser or GitHub.

```dotenv
DODO_PAYMENTS_ENVIRONMENT=live_mode
DODO_PAYMENTS_API_KEY=<LIVE_SERVER_API_KEY>
DODO_WEBHOOK_SECRET=<WEBHOOK_SIGNING_SECRET>
DODO_PRODUCT_PRO_MONTHLY=<MONTHLY_PRODUCT_ID>
DODO_PRODUCT_PRO_YEARLY=<YEARLY_PRODUCT_ID>
```

The angle-bracket strings are placeholders. Replace them with values copied **privately** from Dodo; do not post values in chat. The example does not create credentials. `pnpm billing:verify` is read-only: it checks the two product prices, currency and intervals without creating a checkout or charge.

## Customer flow and entitlement enforcement

A business owner signs up, creates a workspace and can use the trial/Free tier. `/pricing` shows Free, monthly/yearly Pro and Enterprise. **Only a workspace owner** can start a hosted Dodo checkout or open its customer portal in `/settings/billing`. Chase creates a Dodo customer for that workspace, persists its ID, starts checkout with one product and a workspace metadata marker, then records the pending session. The browser goes directly to Dodo. On return, Chase says confirmation is pending and polls its own billing API; it never upgrades because of URL parameters or a client claim.

Dodo sends a signed event to `/api/webhooks/dodo`. Chase verifies the raw body and timestamp, resolves the known workspace by linked subscription/customer ID or metadata, checks the product against the two configured IDs, and applies status and event ID atomically. Duplicate and delayed events cannot reapply or roll back a newer state. `active` and `past_due` retain Pro access; `on_hold`, `paused`, `failed`, `cancelled` and `expired` revert to Free (unless a separate Enterprise agreement applies). The customer portal handles payment method, invoices and cancellation. Free/expired workspaces retain existing data but new CSV accounts, calls, teammates, campaigns, briefs and Prompt PR actions are checked against the plan. Existing over-limit accounts are not deleted.

Enterprise enquiries are saved in `enterprise_leads`; no sales email is sent yet. An operator with database access must review that table and contact the prospect. A signed contract and a deliberate internal admin action are required before granting Enterprise; the public contact form never upgrades a workspace.

## Acceptance sequence before live charging

1. Apply migration `0012` to the intended Supabase database using `DIRECT_URL`; confirm RLS is enabled and forced on all new tables.
2. Test with **Dodo test mode and test products first**. Configure test secrets, run `pnpm billing:verify`, complete a checkout using Dodo's test payment method, and confirm one `billing_events` row and one active `subscriptions` row for the correct workspace. Replay that webhook in Dodo and confirm no second entitlement change.
3. Cancel from the Dodo portal, inspect its signed event and confirm the paid tier stops only at the intended period boundary. Verify another workspace stays Free, and over-limit actions return 402 with an upgrade hint.
4. Rotate previously shared database/server credentials and confirm Google Auth redirects/SMTP before public cutover. Then configure **live** Dodo secrets/products on Vercel, verify the live product catalogue, make a small real subscription purchase with a consenting test workspace, and confirm Dodo's billing dashboard, webhook logs, Chase plan and bank settlement. Refund/cancel that test subscription per your Dodo policy. Never use a customer card as a smoke test.

The current repository has **no Dodo key, webhook secret or product IDs**. No live Dodo request or charge has been made. Checkout remains unavailable until these values are supplied. A public Dodo webhook cannot be tested while the Supabase-backed deployment remains unpromoted behind Vercel protection. Any production change must preserve the calling allowlist and consent guards.
