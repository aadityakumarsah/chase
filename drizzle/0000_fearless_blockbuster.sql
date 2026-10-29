CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"entity_id" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "events_created_at_idx" ON "events" USING btree ("created_at");
--> statement-breakpoint
CREATE FUNCTION chase_reject_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'events is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER events_no_update_delete BEFORE UPDATE OR DELETE ON events
FOR EACH ROW EXECUTE FUNCTION chase_reject_event_mutation();
--> statement-breakpoint
CREATE TRIGGER events_no_truncate BEFORE TRUNCATE ON events
FOR EACH STATEMENT EXECUTE FUNCTION chase_reject_event_mutation();
