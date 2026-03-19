CREATE TABLE "telegram_chat" (
	"phone_number" text PRIMARY KEY NOT NULL,
	"chat_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "telegram_chat_chat_id_idx" ON "telegram_chat" USING btree ("chat_id");