CREATE TYPE "public"."consent_basis" AS ENUM('ledger_customer', 'written_contract', 'prior_relationship', 'explicit_consent');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'operator', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('active', 'invited', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."org_plan" AS ENUM('trial', 'starter', 'growth', 'scale');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('onboarding', 'active', 'suspended', 'closed');--> statement-breakpoint
CREATE TYPE "public"."verification_purpose" AS ENUM('owner_phone', 'test_number');--> statement-breakpoint
CREATE TABLE "app_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"avatar_url" text,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "org_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"business_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "member_role" DEFAULT 'operator' NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_user_id" uuid,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "org_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'operator' NOT NULL,
	"status" "member_status" DEFAULT 'active' NOT NULL,
	"invited_by_user_id" uuid,
	"last_active_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "phone_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"business_id" uuid NOT NULL,
	"phone_e164" text NOT NULL,
	"purpose" "verification_purpose" DEFAULT 'owner_phone' NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"verified_at" timestamp with time zone,
	"requested_by_user_id" uuid,
	CONSTRAINT "phone_verification_e164" CHECK ("phone_verifications"."phone_e164" ~ '^[+][1-9][0-9]{6,14}$'),
	CONSTRAINT "phone_verification_attempts" CHECK ("phone_verifications"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "plan" "org_plan" DEFAULT 'trial' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "status" "org_status" DEFAULT 'onboarding' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "owner_phone_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "merchant_name" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "contact_policy_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "contact_policy_accepted_by" uuid;--> statement-breakpoint
ALTER TABLE "call_turns" ADD COLUMN "business_id" uuid;--> statement-breakpoint
UPDATE "call_turns" t SET "business_id" = c."business_id" FROM "calls" c WHERE c."id" = t."call_id" AND t."business_id" IS NULL;--> statement-breakpoint
UPDATE "call_turns" SET "business_id" = (SELECT "id" FROM "businesses" ORDER BY "created_at" LIMIT 1) WHERE "business_id" IS NULL;--> statement-breakpoint
ALTER TABLE "call_turns" ALTER COLUMN "business_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "callbacks" ADD COLUMN "business_id" uuid;--> statement-breakpoint
UPDATE "callbacks" t SET "business_id" = d."business_id" FROM "debtors" d WHERE d."id" = t."debtor_id" AND t."business_id" IS NULL;--> statement-breakpoint
UPDATE "callbacks" t SET "business_id" = c."business_id" FROM "calls" c WHERE c."id" = t."call_id" AND t."business_id" IS NULL;--> statement-breakpoint
UPDATE "callbacks" SET "business_id" = (SELECT "id" FROM "businesses" ORDER BY "created_at" LIMIT 1) WHERE "business_id" IS NULL;--> statement-breakpoint
ALTER TABLE "callbacks" ALTER COLUMN "business_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "chase_ratings" ADD COLUMN "business_id" uuid;--> statement-breakpoint
UPDATE "chase_ratings" t SET "business_id" = d."business_id" FROM "debtors" d WHERE d."id" = t."debtor_id" AND t."business_id" IS NULL;--> statement-breakpoint
UPDATE "chase_ratings" SET "business_id" = (SELECT "id" FROM "businesses" ORDER BY "created_at" LIMIT 1) WHERE "business_id" IS NULL;--> statement-breakpoint
ALTER TABLE "chase_ratings" ALTER COLUMN "business_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "compliance_events" ADD COLUMN "business_id" uuid;--> statement-breakpoint
UPDATE "compliance_events" t SET "business_id" = d."business_id" FROM "debtors" d WHERE d."id" = t."debtor_id" AND t."business_id" IS NULL;--> statement-breakpoint
UPDATE "compliance_events" t SET "business_id" = c."business_id" FROM "calls" c WHERE c."id" = t."call_id" AND t."business_id" IS NULL;--> statement-breakpoint
UPDATE "compliance_events" SET "business_id" = (SELECT "id" FROM "businesses" ORDER BY "created_at" LIMIT 1) WHERE "business_id" IS NULL;--> statement-breakpoint
ALTER TABLE "compliance_events" ALTER COLUMN "business_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_dossiers" ADD COLUMN "business_id" uuid;--> statement-breakpoint
UPDATE "contact_dossiers" t SET "business_id" = d."business_id" FROM "debtors" d WHERE d."id" = t."debtor_id" AND t."business_id" IS NULL;--> statement-breakpoint
UPDATE "contact_dossiers" SET "business_id" = (SELECT "id" FROM "businesses" ORDER BY "created_at" LIMIT 1) WHERE "business_id" IS NULL;--> statement-breakpoint
ALTER TABLE "contact_dossiers" ALTER COLUMN "business_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "debtors" ADD COLUMN "consent_basis" "consent_basis";--> statement-breakpoint
ALTER TABLE "debtors" ADD COLUMN "consent_attested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "debtors" ADD COLUMN "consent_attested_by" uuid;--> statement-breakpoint
ALTER TABLE "debtors" ADD COLUMN "consent_source" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "business_id" uuid;--> statement-breakpoint
UPDATE "events" t SET "business_id" = d."business_id" FROM "debtors" d WHERE d."id" = t."debtor_id" AND t."business_id" IS NULL;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD COLUMN "business_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "business_id" uuid;--> statement-breakpoint
UPDATE "messages" t SET "business_id" = d."business_id" FROM "debtors" d WHERE d."id" = t."debtor_id" AND t."business_id" IS NULL;--> statement-breakpoint
UPDATE "messages" t SET "business_id" = c."business_id" FROM "calls" c WHERE c."id" = t."call_id" AND t."business_id" IS NULL;--> statement-breakpoint
UPDATE "messages" SET "business_id" = (SELECT "id" FROM "businesses" ORDER BY "created_at" LIMIT 1) WHERE "business_id" IS NULL;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "business_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "opt_outs" ADD COLUMN "business_id" uuid;--> statement-breakpoint
UPDATE "opt_outs" t SET "business_id" = d."business_id" FROM "debtors" d WHERE d."id" = t."debtor_id" AND t."business_id" IS NULL;--> statement-breakpoint
UPDATE "opt_outs" SET "business_id" = (SELECT "id" FROM "businesses" ORDER BY "created_at" LIMIT 1) WHERE "business_id" IS NULL;--> statement-breakpoint
ALTER TABLE "opt_outs" ALTER COLUMN "business_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "business_id" uuid;--> statement-breakpoint
UPDATE "payment_links" t SET "business_id" = d."business_id" FROM "debtors" d WHERE d."id" = t."debtor_id" AND t."business_id" IS NULL;--> statement-breakpoint
UPDATE "payment_links" t SET "business_id" = c."business_id" FROM "calls" c WHERE c."id" = t."call_id" AND t."business_id" IS NULL;--> statement-breakpoint
UPDATE "payment_links" SET "business_id" = (SELECT "id" FROM "businesses" ORDER BY "created_at" LIMIT 1) WHERE "business_id" IS NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ALTER COLUMN "business_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "business_id" uuid;--> statement-breakpoint
UPDATE "payments" t SET "business_id" = d."business_id" FROM "debtors" d WHERE d."id" = t."debtor_id" AND t."business_id" IS NULL;--> statement-breakpoint
UPDATE "payments" SET "business_id" = (SELECT "id" FROM "businesses" ORDER BY "created_at" LIMIT 1) WHERE "business_id" IS NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "business_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "promises" ADD COLUMN "business_id" uuid;--> statement-breakpoint
UPDATE "promises" t SET "business_id" = d."business_id" FROM "debtors" d WHERE d."id" = t."debtor_id" AND t."business_id" IS NULL;--> statement-breakpoint
UPDATE "promises" t SET "business_id" = c."business_id" FROM "calls" c WHERE c."id" = t."call_id" AND t."business_id" IS NULL;--> statement-breakpoint
UPDATE "promises" SET "business_id" = (SELECT "id" FROM "businesses" ORDER BY "created_at" LIMIT 1) WHERE "business_id" IS NULL;--> statement-breakpoint
ALTER TABLE "promises" ALTER COLUMN "business_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_prs" ADD COLUMN "business_id" uuid;--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD COLUMN "business_id" uuid;--> statement-breakpoint
ALTER TABLE "sim_runs" ADD COLUMN "business_id" uuid;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN "business_id" uuid;--> statement-breakpoint
UPDATE "tool_invocations" t SET "business_id" = d."business_id" FROM "debtors" d WHERE d."id" = t."debtor_id" AND t."business_id" IS NULL;--> statement-breakpoint
UPDATE "tool_invocations" t SET "business_id" = c."business_id" FROM "calls" c WHERE c."id" = t."call_id" AND t."business_id" IS NULL;--> statement-breakpoint
UPDATE "tool_invocations" SET "business_id" = (SELECT "id" FROM "businesses" ORDER BY "created_at" LIMIT 1) WHERE "business_id" IS NULL;--> statement-breakpoint
ALTER TABLE "tool_invocations" ALTER COLUMN "business_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "org_invites" ADD CONSTRAINT "org_invites_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_invites" ADD CONSTRAINT "org_invites_invited_by_user_id_app_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_invites" ADD CONSTRAINT "org_invites_accepted_by_user_id_app_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_invited_by_user_id_app_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_verifications" ADD CONSTRAINT "phone_verifications_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_verifications" ADD CONSTRAINT "phone_verifications_requested_by_user_id_app_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_email_uq" ON "app_users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "org_invites_token_uq" ON "org_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "org_invites_business_idx" ON "org_invites" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_invites_pending_uq" ON "org_invites" USING btree ("business_id","email") WHERE accepted_at IS NULL AND revoked_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_business_user_uq" ON "org_members" USING btree ("business_id","user_id");--> statement-breakpoint
CREATE INDEX "org_members_user_idx" ON "org_members" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "org_members_business_role_idx" ON "org_members" USING btree ("business_id","role");--> statement-breakpoint
CREATE INDEX "phone_verifications_business_idx" ON "phone_verifications" USING btree ("business_id","phone_e164");--> statement-breakpoint
CREATE INDEX "phone_verifications_expiry_idx" ON "phone_verifications" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "call_turns" ADD CONSTRAINT "call_turns_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "callbacks" ADD CONSTRAINT "callbacks_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chase_ratings" ADD CONSTRAINT "chase_ratings_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_events" ADD CONSTRAINT "compliance_events_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_dossiers" ADD CONSTRAINT "contact_dossiers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opt_outs" ADD CONSTRAINT "opt_outs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promises" ADD CONSTRAINT "promises_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_prs" ADD CONSTRAINT "prompt_prs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_runs" ADD CONSTRAINT "sim_runs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD CONSTRAINT "tool_invocations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_turns_business_idx" ON "call_turns" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "callbacks_business_idx" ON "callbacks" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "chase_ratings_business_idx" ON "chase_ratings" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "compliance_events_business_idx" ON "compliance_events" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "contact_dossiers_business_idx" ON "contact_dossiers" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "debtors_consent_idx" ON "debtors" USING btree ("business_id","consent_basis");--> statement-breakpoint
CREATE INDEX "events_business_idx" ON "events" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "llm_calls_business_idx" ON "llm_calls" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "messages_business_idx" ON "messages" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "opt_outs_business_idx" ON "opt_outs" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "payment_links_business_idx" ON "payment_links" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "payments_business_idx" ON "payments" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "promises_business_idx" ON "promises" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "prompt_prs_business_idx" ON "prompt_prs" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "prompt_versions_business_idx" ON "prompt_versions" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "sim_runs_business_idx" ON "sim_runs" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "tool_invocations_business_idx" ON "tool_invocations" USING btree ("business_id");