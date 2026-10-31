CREATE TYPE "public"."billing_interval" AS ENUM('monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."billing_tier" AS ENUM('free', 'pro', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."enterprise_lead_status" AS ENUM('new', 'contacted', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('pending', 'active', 'on_hold', 'paused', 'cancelled', 'failed', 'expired', 'past_due');--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"business_id" uuid,
	"dodo_webhook_id" text NOT NULL,
	"type" text NOT NULL,
	"payload_type" text,
	"dodo_subscription_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"handled_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "enterprise_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"business_id" uuid,
	"user_id" uuid,
	"company_name" text NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"phone_e164" text,
	"seats" integer,
	"monthly_volume" text,
	"message" text,
	"status" "enterprise_lead_status" DEFAULT 'new' NOT NULL,
	CONSTRAINT "enterprise_lead_email" CHECK (position('@' in "enterprise_leads"."email") > 1),
	CONSTRAINT "enterprise_lead_phone" CHECK ("enterprise_leads"."phone_e164" IS NULL OR "enterprise_leads"."phone_e164" ~ '^[+][1-9][0-9]{6,14}$'),
	CONSTRAINT "enterprise_lead_seats" CHECK ("enterprise_leads"."seats" IS NULL OR "enterprise_leads"."seats" > 0)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"business_id" uuid NOT NULL,
	"tier" "billing_tier" NOT NULL,
	"interval" "billing_interval" NOT NULL,
	"status" "subscription_status" DEFAULT 'pending' NOT NULL,
	"dodo_subscription_id" text,
	"dodo_customer_id" text,
	"dodo_product_id" text NOT NULL,
	"checkout_session_id" text,
	"amount_minor" bigint,
	"currency" text DEFAULT 'INR' NOT NULL,
	"current_period_end" timestamp with time zone,
	"last_dodo_event_at" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"started_by_user_id" uuid,
	CONSTRAINT "subscription_amount_nonnegative" CHECK ("subscriptions"."amount_minor" IS NULL OR "subscriptions"."amount_minor" >= 0),
	CONSTRAINT "subscription_currency" CHECK ("subscriptions"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "billing_tier" "billing_tier" DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "billing_tier_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "dodo_customer_id" text;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_leads" ADD CONSTRAINT "enterprise_leads_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_leads" ADD CONSTRAINT "enterprise_leads_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_started_by_user_id_app_users_id_fk" FOREIGN KEY ("started_by_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_events_webhook_uq" ON "billing_events" USING btree ("dodo_webhook_id");--> statement-breakpoint
CREATE INDEX "billing_events_business_idx" ON "billing_events" USING btree ("business_id","occurred_at");--> statement-breakpoint
CREATE INDEX "billing_events_subscription_idx" ON "billing_events" USING btree ("dodo_subscription_id");--> statement-breakpoint
CREATE INDEX "enterprise_leads_status_idx" ON "enterprise_leads" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "enterprise_leads_business_idx" ON "enterprise_leads" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "subscriptions_business_idx" ON "subscriptions" USING btree ("business_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_dodo_id_uq" ON "subscriptions" USING btree ("dodo_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_checkout_uq" ON "subscriptions" USING btree ("checkout_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_live_uq" ON "subscriptions" USING btree ("business_id") WHERE "subscriptions"."status" IN ('active', 'past_due');--> statement-breakpoint
-- Billing data is server-only, matching the tenant isolation posture of 0011.
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_leads FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_events, public.enterprise_leads, public.subscriptions FROM anon, authenticated;
