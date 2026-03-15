# Research: Manita — Bolao Copa do Mundo 2026

**Date**: 2026-03-15
**Feature Branch**: `001-world-cup-pool-app`

## 1. Autenticacao — Better Auth + WhatsApp

### Decision
Usar **Better Auth** com o plugin **Phone Number** (OTP via WhatsApp) em vez de magic links.

### Rationale
- O plugin Magic Link do Better Auth suporta apenas email, nao telefone.
- O plugin Phone Number envia OTP (codigo de 6 digitos) com callback customizavel `sendOTP`.
- OTP e o padrao esperado por usuarios brasileiros para autenticacao via WhatsApp/SMS.
- Funcionalmente equivalente a magic link para UX mobile.

### Alternativas Consideradas
- **Magic link customizado**: Seria necessario implementar fora do Better Auth, perdendo rate limiting e verificacao built-in.
- **SMS direto**: Mais caro e menos confiavel que WhatsApp no Brasil.

### Detalhes Tecnico
- **Plugin**: `phoneNumber` de `better-auth/plugins/phone-number`
- **Entrega WhatsApp**: Callback `sendOTP(phoneNumber, code)` integrado com **Twilio Verify** (canal WhatsApp)
- **Sessao**: Cookie-based com database storage (padrao Better Auth), NAO JWT
- **Duracao sessao**: `expiresIn: 7776000` (90 dias) com `updateAge: 86400` (sliding window 24h)
- **Tabelas auto-criadas**: `user`, `session`, `account`, `verification`
- **Campos adicionais**: `phoneNumber` e `phoneNumberVerified` na tabela `user`
- **Adapter**: `drizzleAdapter(db, { provider: "pg" })` — suporte first-class
- **Migracao**: CLI `npx auth@latest generate` gera schema Drizzle, depois `drizzle-kit generate + migrate`

### Impacto na Spec
A spec foi atualizada para refletir OTP em vez de magic link.
O fluxo de UX: usuario digita o codigo de 6 digitos recebido via WhatsApp.
OTP expira em 5 minutos (padrao Better Auth: 300s). Rate limit: 3 tentativas/5 min.

---

## 2. Backend — Hono + Drizzle ORM + PostgreSQL

### Decision
Usar **Hono** como framework API com **Drizzle ORM** para acesso type-safe ao PostgreSQL.

### Rationale
- Hono e leve, tem suporte nativo a TypeScript e nao faz parse automatico do body (ideal para webhooks Stripe).
- Drizzle e type-safe sem codegen, com API SQL-like e relational.
- Ambos sao modernos e alinhados com a filosofia TypeScript-first do projeto.

### Alternativas Consideradas
- **Express.js**: Mais pesado, requer workaround para raw body em webhooks, sem RPC type-safe.
- **Prisma**: Requer codegen, runtime mais pesado, menos controle SQL.

### Detalhes Tecnicos

**Estrutura do projeto Hono:**
```
apps/api/src/
  routes/          # Rotas separadas por dominio
  middleware/       # Auth, rate limit
  services/        # Logica de negocio
  schemas/         # Zod validation
  db/              # Drizzle schema + client
  jobs/            # Cron jobs (sync, pontuacao)
  index.ts         # Entry point
```

**Webhook Stripe (raw body nativo):**
- `c.req.text()` retorna body raw, sem parse
- `stripe.webhooks.constructEventAsync(body, sig, secret)` para verificacao

**Rate limiting:** `hono-rate-limiter` com Redis store para producao.

**Validacao:** Zod integrado com middleware validator do Hono + RPC client para type safety end-to-end.

**Drizzle ORM:**
- Schema code-first em TypeScript
- Identity columns (`.generatedAlwaysAsIdentity()`) em vez de serial
- `drizzle-kit generate + migrate` para producao
- `drizzle-kit push` para dev local

---

## 3. Pagamento — Stripe (Pix + Cartao)

### Decision
Usar **Stripe PaymentIntent** com Pix e cartao via **Payment Element** no frontend.

### Rationale
- Stripe suporta Pix nativamente no Brasil (parceria com EBANX).
- Payment Element detecta automaticamente metodos disponiveis para o cliente.
- Elimina necessidade de UI customizada para QR code Pix.

### Alternativas Consideradas
- **MercadoPago**: Popular no Brasil, mas fragmentaria o stack de pagamento.
- **Pix direto (API Banco Central)**: Requer registro como PSP, muito complexo.

### Detalhes Tecnicos

**Fluxo Pix:**
1. Backend cria PaymentIntent com `payment_method_types: ['pix', 'card']`
2. Frontend renderiza `<PaymentElement />` — Pix aparece automaticamente
3. Se Pix: Stripe retorna `next_action.pix_display_qr_code` com `image_url_png` e `expires_at`
4. Webhook `payment_intent.succeeded` confirma pagamento

**Webhooks essenciais:**
- `payment_intent.succeeded` → criar PoolMember
- `payment_intent.payment_failed` → notificar usuario
- `charge.refunded` → remover PoolMember

**Payout (premio) — V2:**
- Stripe Connect com Express accounts
- Transfers API para mover fundos ao vencedor
- Brasil: payouts diarios automaticos por regulacao

**Idempotencia:** Usar event ID do webhook para deduplicacao.

---

## 4. Dados de Jogos — API-Football

### Decision
Usar **API-Football v3** (api-sports.io) para dados da Copa 2026.

### Rationale
- API mais completa para dados de futebol, com ampla cobertura da Copa do Mundo.
- Endpoints REST simples e bem documentados.
- Preco acessivel para o volume necessario.

### Alternativas Consideradas
- **Sportmonks**: Viavel mas menor comunidade e exemplos.
- **football-data.org**: Cobertura mais limitada para Copa do Mundo.

### Detalhes Tecnicos

**Endpoints principais:**
| Endpoint | Uso |
|---|---|
| `GET /fixtures?league={id}&season=2026` | Todos os jogos da Copa |
| `GET /fixtures?live=all` | Jogos ao vivo |
| `GET /fixtures?id={id}` | Detalhe de um jogo (placar final) |
| `GET /standings?league={id}&season=2026` | Classificacao dos grupos |

**Estrategia de polling adaptativo:**
- Jogos ao vivo: poll a cada 30s via `GET /fixtures?live=all`
- Sem jogos ao vivo: poll a cada 5 min
- Jogos finalizados: sem poll
- Dados estaticos (times, logos): cache agressivo

**Rate limits:**
| Plano | Req/dia | Preco |
|---|---|---|
| Free | 100 | $0 (dev/teste) |
| Pago | 1500+ | ~$19/mes |

**Importante:** Free tier insuficiente para producao durante jogos ao vivo (~180 req/jogo de 90 min com poll de 30s). Plano pago necessario durante o torneio.

---

## 5. Frontend — React 19 + TanStack + Tailwind v4

### Decision
Usar **React 19**, **TanStack Router** (file-based), **TanStack Query**, **Tailwind CSS v4**, **vite-plugin-pwa**.

### Rationale
- TanStack Router oferece routing type-safe com code splitting automatico.
- TanStack Query tem `refetchInterval` com funcao callback — perfeito para polling adaptativo de live scores.
- Tailwind v4 elimina config JS, usa `@theme` em CSS, e e 3-10x mais rapido no build.

### Detalhes Tecnicos

**TanStack Router:**
- Plugin Vite `@tanstack/router-plugin/vite` gera route tree automaticamente
- Deve vir antes de `react()` no array de plugins
- Code splitting automatico com `autoCodeSplitting: true`

**TanStack Query — polling adaptativo:**
```
refetchInterval: (query) => {
  const data = query.state.data
  return data?.some(m => m.status === 'live') ? 30_000 : false
}
```

**Tailwind CSS v4:**
- Config via CSS com `@import "tailwindcss"` + `@theme { }`
- Plugin Vite `@tailwindcss/vite` (nao PostCSS)
- Deteccao automatica de conteudo (sem config `content`)
- Design tokens do Manita em `@theme`:
  - `--color-navy: #1a1a2e`
  - `--color-cream: #f5f0e8`
  - `--color-red: #c4362a`
  - `--color-green: #2d6a4f`
  - `--color-gray: #8d8677`

**PWA (vite-plugin-pwa):**
- `registerType: 'autoUpdate'` — atualiza service worker silenciosamente
- Runtime caching `NetworkFirst` para API de jogos
- Precache automatico de assets estaticos

---

## 6. Infraestrutura — Monorepo

### Decision
Monorepo com **pnpm workspaces**: `apps/web`, `apps/api`, `packages/shared`.

### Rationale
- Codigo compartilhado (types, validacao, constantes) em `packages/shared`.
- Deploy independente de frontend e backend.
- pnpm e eficiente em espaco e resolve phantom dependencies.

### Detalhes
- **Linting/Formatting**: Biome (substitui ESLint + Prettier, mais rapido)
- **Dev local**: Docker Compose para PostgreSQL + Redis
- **Package manager**: pnpm com workspaces
