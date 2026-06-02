CREATE TABLE "pool_standing" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pool_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"points_total" integer DEFAULT 0 NOT NULL,
	"exact_matches" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pool_standing" ADD CONSTRAINT "pool_standing_pool_id_pool_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pool"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_standing" ADD CONSTRAINT "pool_standing_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pool_standing_pool_id_user_id_idx" ON "pool_standing" USING btree ("pool_id","user_id");--> statement-breakpoint
-- Backfill: one standing row per pool member from existing finished predictions.
INSERT INTO "pool_standing" ("id", "pool_id", "user_id", "points_total", "exact_matches", "updated_at")
SELECT gen_random_uuid(), pm.pool_id, pm.user_id,
  COALESCE(SUM(p.points), 0)::int,
  COUNT(CASE WHEN m.status = 'finished' AND p.home_score = m.home_score AND p.away_score = m.away_score THEN 1 END)::int,
  now()
FROM "pool_member" pm
LEFT JOIN "prediction" p ON p.user_id = pm.user_id AND p.pool_id = pm.pool_id
LEFT JOIN "match" m ON m.id = p.match_id
GROUP BY pm.pool_id, pm.user_id
ON CONFLICT ("pool_id", "user_id") DO UPDATE SET
  "points_total" = EXCLUDED."points_total",
  "exact_matches" = EXCLUDED."exact_matches",
  "updated_at" = now();