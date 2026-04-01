CREATE TABLE "competition" (
	"id" uuid PRIMARY KEY NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"season" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "competition_external_id_season_idx" UNIQUE("external_id","season")
);
--> statement-breakpoint
INSERT INTO "competition" ("id", "external_id", "name", "season", "type", "status", "created_at", "updated_at")
VALUES ('00000000-0000-0000-0000-000000000001', 'WC', 'Copa do Mundo 2026', '2026', 'cup', 'active', now(), now());
--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "competition_id" uuid;--> statement-breakpoint
ALTER TABLE "pool" ADD COLUMN "competition_id" uuid;--> statement-breakpoint
ALTER TABLE "pool" ADD COLUMN "matchday_from" integer;--> statement-breakpoint
ALTER TABLE "pool" ADD COLUMN "matchday_to" integer;--> statement-breakpoint
UPDATE "match" SET "competition_id" = '00000000-0000-0000-0000-000000000001' WHERE "competition_id" IS NULL;--> statement-breakpoint
UPDATE "pool" SET "competition_id" = '00000000-0000-0000-0000-000000000001' WHERE "competition_id" IS NULL;--> statement-breakpoint
ALTER TABLE "match" ALTER COLUMN "competition_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pool" ALTER COLUMN "competition_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "competition_external_id_idx" ON "competition" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "competition_status_idx" ON "competition" USING btree ("status");--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool" ADD CONSTRAINT "pool_competition_id_competition_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competition"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_competition_id_idx" ON "match" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "pool_competition_id_idx" ON "pool" USING btree ("competition_id");
