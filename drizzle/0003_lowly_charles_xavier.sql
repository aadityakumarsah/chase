DROP INDEX "messages_provider_id_idx";--> statement-breakpoint
DROP INDEX "tool_invocations_idempotency_uq";--> statement-breakpoint
ALTER TABLE "tool_invocations" ALTER COLUMN "debtor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "debtors" ADD COLUMN "last_inbound_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "kind" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "payment_link_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "delivery_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "unapplied_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_payment_link_id_payment_links_id_fk" FOREIGN KEY ("payment_link_id") REFERENCES "public"."payment_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_provider_id_uq" ON "messages" USING btree ("provider","provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_dedupe_uq" ON "messages" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_links_active_call_uq" ON "payment_links" USING btree ("call_id") WHERE "payment_links"."status" IN ('created', 'opened');--> statement-breakpoint
CREATE INDEX "tool_invocations_idempotency_idx" ON "tool_invocations" USING btree ("idempotency_key");