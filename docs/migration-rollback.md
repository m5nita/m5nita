# Estratégia de rollback de migrations

Drizzle não gera `down` migrations automaticamente e mantê-las à mão tende a degradar em produção. Em vez disso, o rollback depende de três mecanismos: design reversível por padrão, recuperação point-in-time no banco e um runbook de emergência.

## 1. Design reversível por padrão

Toda migration deve ser projetada para ser **expansiva e reversível sem perda de dados** dentro de uma janela de até 24h:

- Adicione colunas como `NULL` ou com `DEFAULT`. Backfill em batch separado. Rode `SET NOT NULL` em uma migration posterior, depois que todos os writers estiverem usando a coluna.
- **Nunca** faça `DROP COLUMN`/`DROP TABLE` no mesmo deploy que remove o código que lê essa coluna. Primeiro: código para de ler. Segundo deploy (depois de 24h+): drop.
- Renomeie via `ADD + backfill + DROP`, não `ALTER ... RENAME`. Nomes velhos ficam como cópia temporária.
- Mudanças de tipo: nova coluna com tipo novo, trigger/backfill, migração de código, drop da antiga.
- Índices grandes: sempre `CREATE INDEX CONCURRENTLY` (fora de transação). Nunca em migration automática — faça à mão com lock awareness.

Migrations que quebram essas regras precisam de aprovação explícita no PR.

## 2. Point-in-time recovery (PITR)

O provedor de Postgres em produção (Supabase/Neon/RDS) expõe snapshot contínuo. Antes de aplicar qualquer migration destrutiva:

1. Anote o timestamp imediatamente anterior ao deploy.
2. Verifique no painel que o PITR está ativo e que a janela cobre pelo menos 7 dias.
3. Se a migration corromper dados, o rollback é restaurar para o timestamp anotado em um banco novo, promover, e cortar o tráfego.

PITR é a rede de segurança real. Down migrations não são — em produção, execuções parciais de down costumam piorar o estado.

## 3. Runbook de emergência

Quando uma migration recém-deployada causa incidente:

1. **Pare o deploy**. Não role outro deploy em cima.
2. **Identifique o escopo**: só schema? schema + dados? só código? Use `drizzle-kit studio` ou `psql` e compare o estado observado vs. o esperado.
3. **Reverta o código** (revert commit) se a tabela nova ainda existir mas estiver idle — o código antigo volta a funcionar contra o schema expandido.
4. **Se houver dados corrompidos**: avalie PITR. Restaure para snapshot pré-migration em banco paralelo, valide integridade, troque a connection string.
5. **Se a migration apenas adicionou algo**: geralmente basta reverter o código. Deixe a coluna/tabela órfã; limpe em migration posterior.
6. **Nunca** apague dados produtivos "pra limpar" durante o incidente. Documente primeiro.

## 4. Checklist pré-merge

Todo PR com migration deve ter no corpo:

- [ ] Migration é expansiva (adiciona, não remove) ou é drop de algo *já* deprecado por deploy anterior.
- [ ] Coluna nova é `NULL` ou tem `DEFAULT`.
- [ ] Índices novos usam `CONCURRENTLY` ou são triviais.
- [ ] Existe plano de backfill separado (link pro script/job).
- [ ] PITR do ambiente-alvo confirmado ativo.

## 5. Quando down migration faz sentido

Em ambientes descartáveis (CI/dev local), escreva `down.sql` à mão se precisar iterar. **Nunca use em produção** — é melhor rodar uma nova migration corretiva.
