CREATE TABLE "inbound_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"app" text,
	"source" text,
	"severity" text,
	"fingerprint" text,
	"title" text,
	"payload" text,
	"status" text DEFAULT 'received' NOT NULL,
	"fail_reason" text,
	"issue_name" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "inbound_event_status_idx" ON "inbound_event" USING btree ("status");