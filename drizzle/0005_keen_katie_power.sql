ALTER TABLE "calls" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "interruption_stats" jsonb;