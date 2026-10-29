CREATE TYPE "public"."agent_key" AS ENUM('collections', 'brief');--> statement-breakpoint
CREATE TYPE "public"."call_purpose" AS ENUM('collection', 'owner_brief', 'test');--> statement-breakpoint
CREATE TYPE "public"."call_speaker" AS ENUM('agent', 'debtor', 'system');--> statement-breakpoint
CREATE TYPE "public"."callback_status" AS ENUM('scheduled', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."compliance_kind" AS ENUM('gate_allowed', 'gate_blocked', 'allowlist_block', 'opt_out', 'opt_out_inferred', 'dispute_hold', 'disclosure_sent', 'ai_disclosed', 'supervisor_flag', 'supervisor_rewrite', 'post_call_flag', 'demo_override');--> statement-breakpoint
CREATE TYPE "public"."debtor_status" AS ENUM('active', 'paid', 'dispute', 'do_not_contact', 'hardship', 'wrong_number');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('open', 'partial', 'paid', 'written_off');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('hi', 'en', 'mr');--> statement-breakpoint
CREATE TYPE "public"."payment_link_status" AS ENUM('created', 'opened', 'paid', 'expired', 'failed');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('whatsapp', 'sms', 'console');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('out', 'in');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'sent', 'delivered', 'read', 'failed');--> statement-breakpoint
CREATE TYPE "public"."opt_out_scope" AS ENUM('call', 'all');--> statement-breakpoint
CREATE TYPE "public"."opt_out_source" AS ENUM('call_tool', 'whatsapp_stop', 'manual', 'inferred');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('upi', 'cash', 'bank', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('hosted', 'razorpay');--> statement-breakpoint
CREATE TYPE "public"."payment_source" AS ENUM('razorpay_webhook', 'simulated', 'manual');--> statement-breakpoint
CREATE TYPE "public"."promise_source" AS ENUM('tool', 'analysis', 'manual');--> statement-breakpoint
CREATE TYPE "public"."promise_status" AS ENUM('pending', 'kept', 'broken', 'partially_kept', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."prompt_creator" AS ENUM('seed', 'prompt_pr', 'manual');--> statement-breakpoint
CREATE TYPE "public"."prompt_pr_status" AS ENUM('open', 'approved', 'rejected', 'rolled_back');--> statement-breakpoint
CREATE TYPE "public"."rating_band" AS ENUM('A', 'B', 'C', 'D', 'X');--> statement-breakpoint
CREATE TYPE "public"."segment" AS ENUM('kirana', 'medical', 'restaurant', 'hardware', 'other');--> statement-breakpoint
CREATE TYPE "public"."time_window" AS ENUM('morning', 'afternoon', 'evening');--> statement-breakpoint
CREATE TABLE "briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"business_id" uuid NOT NULL,
	"for_date" date NOT NULL,
	"metrics" jsonb NOT NULL,
	"narrative" jsonb NOT NULL,
	"script_hi" text NOT NULL,
	"script_en" text NOT NULL,
	"delivered" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"call_id" uuid
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seed_key" text,
	"name" text NOT NULL,
	"owner_name" text NOT NULL,
	"owner_phone" text NOT NULL,
	"upi_vpa" text,
	"city" text NOT NULL,
	"default_language" "language" DEFAULT 'hi' NOT NULL,
	"call_window_start" time DEFAULT '09:00' NOT NULL,
	"call_window_end" time DEFAULT '18:30' NOT NULL,
	"max_attempts_per_day" integer DEFAULT 3 NOT NULL,
	"max_attempts_per_week" integer DEFAULT 8 NOT NULL,
	"min_gap_hours" integer DEFAULT 4 NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"demo_window_override" boolean DEFAULT false NOT NULL,
	CONSTRAINT "business_window" CHECK ("businesses"."call_window_start" >= '08:00' AND "businesses"."call_window_end" <= '19:00' AND "businesses"."call_window_start" < "businesses"."call_window_end"),
	CONSTRAINT "business_caps" CHECK ("businesses"."max_attempts_per_day" > 0 AND "businesses"."max_attempts_per_week" > 0 AND "businesses"."min_gap_hours" >= 0)
);
--> statement-breakpoint
CREATE TABLE "call_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"call_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"speaker" "call_speaker" NOT NULL,
	"text" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "turn_idx_nonnegative" CHECK ("call_turns"."idx" >= 0)
);
--> statement-breakpoint
CREATE TABLE "callbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"debtor_id" uuid NOT NULL,
	"call_id" uuid,
	"requested_for" timestamp with time zone NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"window" time_window NOT NULL,
	"status" "callback_status" DEFAULT 'scheduled' NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"business_id" uuid NOT NULL,
	"debtor_id" uuid,
	"purpose" "call_purpose" NOT NULL,
	"bolna_execution_id" text,
	"bolna_agent_id" text,
	"call_token" text DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"status" text NOT NULL,
	"termination_reason" text,
	"connected" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_sec" integer,
	"transcript" text,
	"recording_url" text,
	"cost_cents" bigint,
	"time_to_first_audio_ms" integer,
	"language" "language",
	"prompt_version_id" uuid,
	"raw" jsonb,
	"analysis" jsonb,
	"analysis_model" text,
	"processed_at" timestamp with time zone,
	CONSTRAINT "calls_collection_debtor" CHECK ("calls"."purpose" <> 'collection' OR "calls"."debtor_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "chase_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"debtor_id" uuid NOT NULL,
	"score" integer,
	"band" "rating_band" NOT NULL,
	"p_pay_7d" numeric(8, 6),
	"components" jsonb NOT NULL,
	"next_action" text NOT NULL,
	"reasons" jsonb NOT NULL,
	"rationale" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rating_score_band" CHECK (("chase_ratings"."score" IS NULL AND "chase_ratings"."band" = 'X') OR ("chase_ratings"."score" BETWEEN 0 AND 100 AND "chase_ratings"."band" <> 'X'))
);
--> statement-breakpoint
CREATE TABLE "compliance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"debtor_id" uuid,
	"call_id" uuid,
	"kind" "compliance_kind" NOT NULL,
	"rule" text NOT NULL,
	"detail" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_dossiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"debtor_id" uuid NOT NULL,
	"text" text NOT NULL,
	"preferred_language" "language" NOT NULL,
	"best_time_window" time_window,
	"tone_hint" text,
	"open_commitments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"do_not_mention" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_hash" text NOT NULL,
	"model" text NOT NULL,
	CONSTRAINT "dossier_length" CHECK (char_length("contact_dossiers"."text") <= 600)
);
--> statement-breakpoint
CREATE TABLE "debtors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"business_id" uuid NOT NULL,
	"shop_name" text NOT NULL,
	"contact_name" text NOT NULL,
	"phone_e164" text NOT NULL,
	"preferred_language" "language" DEFAULT 'hi' NOT NULL,
	"city" text NOT NULL,
	"segment" "segment" NOT NULL,
	"status" "debtor_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"first_contact_disclosed_at" timestamp with time zone,
	CONSTRAINT "debtors_id_business_uq" UNIQUE("id","business_id"),
	CONSTRAINT "debtor_e164" CHECK ("debtors"."phone_e164" ~ '^[+][1-9][0-9]{6,14}$')
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"business_id" uuid NOT NULL,
	"debtor_id" uuid NOT NULL,
	"invoice_no" text NOT NULL,
	"issued_on" date NOT NULL,
	"due_on" date NOT NULL,
	"amount_paise" bigint NOT NULL,
	"paid_paise" bigint DEFAULT 0 NOT NULL,
	"status" "invoice_status" DEFAULT 'open' NOT NULL,
	CONSTRAINT "invoice_money" CHECK ("invoices"."amount_paise" > 0 AND "invoices"."paid_paise" >= 0 AND "invoices"."paid_paise" <= "invoices"."amount_paise"),
	CONSTRAINT "invoice_dates" CHECK ("invoices"."due_on" >= "invoices"."issued_on")
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"task" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"features" text[] NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer NOT NULL,
	"ok" boolean NOT NULL,
	"error" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"debtor_id" uuid,
	"call_id" uuid,
	"to_e164" text NOT NULL,
	"channel" "message_channel" NOT NULL,
	"direction" "message_direction" NOT NULL,
	"provider" text NOT NULL,
	"provider_message_id" text,
	"body" text NOT NULL,
	"status" "message_status" DEFAULT 'queued' NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "opt_outs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"debtor_id" uuid NOT NULL,
	"scope" "opt_out_scope" NOT NULL,
	"reason" text NOT NULL,
	"source" "opt_out_source" NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"cleared_at" timestamp with time zone,
	"cleared_by" text
);
--> statement-breakpoint
CREATE TABLE "payment_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"debtor_id" uuid NOT NULL,
	"call_id" uuid,
	"token" text DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"amount_paise" bigint NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_ref" text,
	"provider_url" text,
	"status" "payment_link_status" DEFAULT 'created' NOT NULL,
	"opened_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "payment_link_amount_positive" CHECK ("payment_links"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"debtor_id" uuid NOT NULL,
	"payment_link_id" uuid,
	"amount_paise" bigint NOT NULL,
	"method" "payment_method" NOT NULL,
	"provider_ref" text,
	"received_at" timestamp with time zone NOT NULL,
	"source" "payment_source" NOT NULL,
	CONSTRAINT "payment_amount_positive" CHECK ("payments"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "promises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"debtor_id" uuid NOT NULL,
	"call_id" uuid,
	"amount_paise" bigint NOT NULL,
	"promised_for" date NOT NULL,
	"reason_code" text NOT NULL,
	"source" "promise_source" NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"status" "promise_status" DEFAULT 'pending' NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "promise_amount_positive" CHECK ("promises"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "prompt_prs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"agent_key" "agent_key" NOT NULL,
	"base_version_id" uuid NOT NULL,
	"title" text NOT NULL,
	"problem" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"change" jsonb NOT NULL,
	"expected_impact" text NOT NULL,
	"risk" text NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"status" "prompt_pr_status" DEFAULT 'open' NOT NULL,
	"sim_results" jsonb,
	"decided_at" timestamp with time zone,
	CONSTRAINT "prompt_pr_confidence" CHECK ("prompt_prs"."confidence" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"agent_key" "agent_key" NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"protected_hash" text NOT NULL,
	"created_by" "prompt_creator" NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT false NOT NULL,
	CONSTRAINT "prompt_version_positive" CHECK ("prompt_versions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "tool_invocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"call_id" uuid,
	"debtor_id" uuid NOT NULL,
	"tool_name" text NOT NULL,
	"args" jsonb NOT NULL,
	"result" jsonb,
	"ok" boolean NOT NULL,
	"latency_ms" integer NOT NULL,
	"idempotency_key" text NOT NULL
);
--> statement-breakpoint
-- Preserve Part 1 UUIDs while introducing a monotonic paging cursor.
ALTER TABLE "events" DROP CONSTRAINT "events_pkey";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "id" TO "legacy_id";--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "legacy_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "legacy_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "id" bigserial PRIMARY KEY;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "debtor_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "call_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_turns" ADD CONSTRAINT "call_turns_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "callbacks" ADD CONSTRAINT "callbacks_debtor_id_debtors_id_fk" FOREIGN KEY ("debtor_id") REFERENCES "public"."debtors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "callbacks" ADD CONSTRAINT "callbacks_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_debtor_id_debtors_id_fk" FOREIGN KEY ("debtor_id") REFERENCES "public"."debtors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_prompt_version_id_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."prompt_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chase_ratings" ADD CONSTRAINT "chase_ratings_debtor_id_debtors_id_fk" FOREIGN KEY ("debtor_id") REFERENCES "public"."debtors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_events" ADD CONSTRAINT "compliance_events_debtor_id_debtors_id_fk" FOREIGN KEY ("debtor_id") REFERENCES "public"."debtors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_events" ADD CONSTRAINT "compliance_events_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_dossiers" ADD CONSTRAINT "contact_dossiers_debtor_id_debtors_id_fk" FOREIGN KEY ("debtor_id") REFERENCES "public"."debtors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debtors" ADD CONSTRAINT "debtors_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_debtor_business_fk" FOREIGN KEY ("debtor_id","business_id") REFERENCES "public"."debtors"("id","business_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_debtor_id_debtors_id_fk" FOREIGN KEY ("debtor_id") REFERENCES "public"."debtors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opt_outs" ADD CONSTRAINT "opt_outs_debtor_id_debtors_id_fk" FOREIGN KEY ("debtor_id") REFERENCES "public"."debtors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_debtor_id_debtors_id_fk" FOREIGN KEY ("debtor_id") REFERENCES "public"."debtors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_debtor_id_debtors_id_fk" FOREIGN KEY ("debtor_id") REFERENCES "public"."debtors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_link_id_payment_links_id_fk" FOREIGN KEY ("payment_link_id") REFERENCES "public"."payment_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promises" ADD CONSTRAINT "promises_debtor_id_debtors_id_fk" FOREIGN KEY ("debtor_id") REFERENCES "public"."debtors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promises" ADD CONSTRAINT "promises_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_prs" ADD CONSTRAINT "prompt_prs_base_version_id_prompt_versions_id_fk" FOREIGN KEY ("base_version_id") REFERENCES "public"."prompt_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD CONSTRAINT "tool_invocations_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD CONSTRAINT "tool_invocations_debtor_id_debtors_id_fk" FOREIGN KEY ("debtor_id") REFERENCES "public"."debtors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "briefs_business_date_uq" ON "briefs" USING btree ("business_id","for_date");--> statement-breakpoint
CREATE INDEX "briefs_call_idx" ON "briefs" USING btree ("call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "businesses_seed_key_uq" ON "businesses" USING btree ("seed_key");--> statement-breakpoint
CREATE UNIQUE INDEX "call_turns_call_idx_uq" ON "call_turns" USING btree ("call_id","idx");--> statement-breakpoint
CREATE INDEX "callbacks_debtor_idx" ON "callbacks" USING btree ("debtor_id");--> statement-breakpoint
CREATE INDEX "callbacks_call_idx" ON "callbacks" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "callbacks_status_schedule_idx" ON "callbacks" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "calls_execution_uq" ON "calls" USING btree ("bolna_execution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calls_token_uq" ON "calls" USING btree ("call_token");--> statement-breakpoint
CREATE INDEX "calls_business_started_idx" ON "calls" USING btree ("business_id","started_at");--> statement-breakpoint
CREATE INDEX "calls_debtor_started_idx" ON "calls" USING btree ("debtor_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "calls_prompt_idx" ON "calls" USING btree ("prompt_version_id");--> statement-breakpoint
CREATE INDEX "calls_status_idx" ON "calls" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ratings_debtor_computed_idx" ON "chase_ratings" USING btree ("debtor_id","computed_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "compliance_debtor_at_idx" ON "compliance_events" USING btree ("debtor_id","at");--> statement-breakpoint
CREATE INDEX "compliance_call_idx" ON "compliance_events" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "compliance_kind_at_idx" ON "compliance_events" USING btree ("kind","at");--> statement-breakpoint
CREATE UNIQUE INDEX "dossiers_debtor_uq" ON "contact_dossiers" USING btree ("debtor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "debtors_business_phone_uq" ON "debtors" USING btree ("business_id","phone_e164");--> statement-breakpoint
CREATE INDEX "debtors_business_status_idx" ON "debtors" USING btree ("business_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_business_number_uq" ON "invoices" USING btree ("business_id","invoice_no");--> statement-breakpoint
CREATE INDEX "invoices_debtor_due_idx" ON "invoices" USING btree ("debtor_id","due_on");--> statement-breakpoint
CREATE INDEX "invoices_debtor_status_idx" ON "invoices" USING btree ("debtor_id","status");--> statement-breakpoint
CREATE INDEX "llm_calls_task_at_idx" ON "llm_calls" USING btree ("task","at");--> statement-breakpoint
CREATE INDEX "messages_debtor_created_idx" ON "messages" USING btree ("debtor_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_call_idx" ON "messages" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "messages_provider_id_idx" ON "messages" USING btree ("provider","provider_message_id");--> statement-breakpoint
CREATE INDEX "opt_outs_debtor_active_idx" ON "opt_outs" USING btree ("debtor_id","cleared_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_links_token_uq" ON "payment_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX "payment_links_debtor_idx" ON "payment_links" USING btree ("debtor_id");--> statement-breakpoint
CREATE INDEX "payment_links_call_idx" ON "payment_links" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "payment_links_provider_ref_idx" ON "payment_links" USING btree ("provider","provider_ref");--> statement-breakpoint
CREATE INDEX "payment_links_expiry_idx" ON "payment_links" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "payments_debtor_received_idx" ON "payments" USING btree ("debtor_id","received_at");--> statement-breakpoint
CREATE INDEX "payments_link_idx" ON "payments" USING btree ("payment_link_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_source_ref_uq" ON "payments" USING btree ("source","provider_ref");--> statement-breakpoint
CREATE INDEX "promises_debtor_status_date_idx" ON "promises" USING btree ("debtor_id","status","promised_for");--> statement-breakpoint
CREATE INDEX "promises_debtor_created_idx" ON "promises" USING btree ("debtor_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "promises_call_idx" ON "promises" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "prompt_prs_base_idx" ON "prompt_prs" USING btree ("base_version_id");--> statement-breakpoint
CREATE INDEX "prompt_prs_agent_status_idx" ON "prompt_prs" USING btree ("agent_key","status");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_versions_key_version_uq" ON "prompt_versions" USING btree ("agent_key","version");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_versions_active_uq" ON "prompt_versions" USING btree ("agent_key") WHERE "prompt_versions"."is_active" = true;--> statement-breakpoint
CREATE INDEX "tool_invocations_call_idx" ON "tool_invocations" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "tool_invocations_debtor_idx" ON "tool_invocations" USING btree ("debtor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tool_invocations_idempotency_uq" ON "tool_invocations" USING btree ("idempotency_key");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_debtor_id_debtors_id_fk" FOREIGN KEY ("debtor_id") REFERENCES "public"."debtors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_id_desc_idx" ON "events" USING btree ("id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "events_legacy_id_uq" ON "events" USING btree ("legacy_id");--> statement-breakpoint
CREATE INDEX "events_debtor_idx" ON "events" USING btree ("debtor_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "events_call_idx" ON "events" USING btree ("call_id");
--> statement-breakpoint
ALTER TABLE events DISABLE TRIGGER events_no_update_delete;
--> statement-breakpoint
UPDATE events SET at = created_at, updated_at = created_at;
--> statement-breakpoint
ALTER TABLE events ENABLE TRIGGER events_no_update_delete;
--> statement-breakpoint
CREATE FUNCTION chase_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER businesses_updated_at BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION chase_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER debtors_updated_at BEFORE UPDATE ON debtors FOR EACH ROW EXECUTE FUNCTION chase_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION chase_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER promises_updated_at BEFORE UPDATE ON promises FOR EACH ROW EXECUTE FUNCTION chase_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER callbacks_updated_at BEFORE UPDATE ON callbacks FOR EACH ROW EXECUTE FUNCTION chase_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER payment_links_updated_at BEFORE UPDATE ON payment_links FOR EACH ROW EXECUTE FUNCTION chase_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION chase_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER calls_updated_at BEFORE UPDATE ON calls FOR EACH ROW EXECUTE FUNCTION chase_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER call_turns_updated_at BEFORE UPDATE ON call_turns FOR EACH ROW EXECUTE FUNCTION chase_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER tool_invocations_updated_at BEFORE UPDATE ON tool_invocations FOR EACH ROW EXECUTE FUNCTION chase_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION chase_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER contact_dossiers_updated_at BEFORE UPDATE ON contact_dossiers FOR EACH ROW EXECUTE FUNCTION chase_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER chase_ratings_updated_at BEFORE UPDATE ON chase_ratings FOR EACH ROW EXECUTE FUNCTION chase_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER compliance_events_updated_at BEFORE UPDATE ON compliance_events FOR EACH ROW EXECUTE FUNCTION chase_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER opt_outs_updated_at BEFORE UPDATE ON opt_outs FOR EACH ROW EXECUTE FUNCTION chase_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER prompt_versions_updated_at BEFORE UPDATE ON prompt_versions FOR EACH ROW EXECUTE FUNCTION chase_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER prompt_prs_updated_at BEFORE UPDATE ON prompt_prs FOR EACH ROW EXECUTE FUNCTION chase_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER briefs_updated_at BEFORE UPDATE ON briefs FOR EACH ROW EXECUTE FUNCTION chase_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER llm_calls_updated_at BEFORE UPDATE ON llm_calls FOR EACH ROW EXECUTE FUNCTION chase_touch_updated_at();
