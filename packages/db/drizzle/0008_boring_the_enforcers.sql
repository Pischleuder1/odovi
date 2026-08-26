CREATE TABLE "location_provider_decisions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "location_provider_decisions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"capability" text NOT NULL,
	"mode" text NOT NULL,
	"provider" text NOT NULL,
	"endpoint" text,
	"credential_header" text,
	"custom_contact_url" text,
	"custom_operating_limits" text,
	"disclosure_version" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "location_provider_decisions_capability_idx" ON "location_provider_decisions" USING btree ("capability","id");