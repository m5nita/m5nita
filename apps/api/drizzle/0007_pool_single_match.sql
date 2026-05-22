ALTER TABLE "pool" ADD COLUMN "match_id" uuid;--> statement-breakpoint
ALTER TABLE "pool" ADD CONSTRAINT "pool_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pool_match_id_idx" ON "pool" USING btree ("match_id");--> statement-breakpoint
ALTER TABLE "pool" ADD CONSTRAINT "pool_scope_exclusivity_chk" CHECK ((
        ("pool"."match_id" IS NOT NULL)::int
        + (("pool"."matchday_from" IS NOT NULL) OR ("pool"."matchday_to" IS NOT NULL))::int
      ) <= 1);