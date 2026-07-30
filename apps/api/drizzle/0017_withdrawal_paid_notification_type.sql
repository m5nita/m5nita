INSERT INTO "notification_type" ("code", "label", "description", "opt_outable", "default_enabled", "sort_order") VALUES
	('withdrawal_paid', 'Prêmio pago', 'Aviso de que o PIX do seu prêmio foi enviado.', false, true, 5)
ON CONFLICT ("code") DO NOTHING;
