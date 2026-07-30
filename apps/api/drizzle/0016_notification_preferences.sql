CREATE TABLE "notification_preference" (
	"user_id" text NOT NULL,
	"type_code" text NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preference_pkey" PRIMARY KEY("user_id","type_code")
);
--> statement-breakpoint
CREATE TABLE "notification_type" (
	"code" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"opt_outable" boolean DEFAULT true NOT NULL,
	"default_enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pool" ADD COLUMN "notify_on_create" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_type_code_notification_type_code_fk" FOREIGN KEY ("type_code") REFERENCES "public"."notification_type"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "notification_type" ("code", "label", "description", "opt_outable", "default_enabled", "sort_order") VALUES
	('new_pool', 'Novos bolões', 'Avisos quando alguém cria um bolão novo e libera a entrada.', true, true, 1),
	('prediction_reminder', 'Lembretes de palpite', 'Aviso quando um jogo do seu bolão está perto de começar e falta palpite.', true, true, 2),
	('match_points', 'Pontos por jogo', 'Quantos pontos você fez ao final de cada jogo e sua posição no bolão.', true, true, 3),
	('pool_result', 'Prêmio disponível', 'Aviso de vitória e prêmio disponível para saque.', false, true, 4)
ON CONFLICT ("code") DO NOTHING;
