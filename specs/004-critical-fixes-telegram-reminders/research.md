# Research: Critical Fixes + Telegram Prediction Reminders

## R-001: Hono middleware ordering for body parsing before auth handler

**Decision**: Use `c.req.raw.clone().json()` to parse body without consuming the original request stream.
**Rationale**: Hono's `c.req.raw` is a Web API `Request` whose body can only be consumed once. Cloning before parsing preserves the stream for Better Auth's downstream handler.
**Alternatives considered**:
- `c.req.json()` — consumes the body stream, breaking Better Auth's handler
- Reconstructing a new Request — complex and error-prone
- `c.req.text()` + `JSON.parse()` — also consumes the stream

## R-002: TanStack Router layout routes for grouped auth guards

**Decision**: Create `routes/pools/route.tsx` as a layout route with `beforeLoad`.
**Rationale**: TanStack Router file-based routing treats `route.tsx` in a directory as the layout for all child routes. A single `beforeLoad` guards all pool routes. `requireAuthGuard()` already throws `redirect()` which TanStack Router handles natively.
**Alternatives considered**:
- Adding `beforeLoad` to each individual route — duplicative
- Custom route wrapper component — less idiomatic

## R-003: Efficient SQL query for users without predictions

**Decision**: `selectDistinctOn([poolMember.userId])` with LEFT JOIN prediction + IS NULL.
**Rationale**: Deduplicates at DB level. Standard "missing records" pattern in SQL.
**Alternatives considered**:
- NOT EXISTS subquery — equivalent performance, less readable in Drizzle
- Application-side dedup — unnecessary complexity

## R-004: In-memory vs persistent dedup for reminders

**Decision**: In-memory `Set<string>` keyed by `${userId}:${matchId}`.
**Rationale**: Max 64K entries (~2MB). Single-process deployment. Worst case on restart: one duplicate reminder — low impact. No migration needed.
**Alternatives considered**:
- DB table `reminder_sent` — requires migration, overkill
- Redis set — not integrated, overkill

## R-005: Reusing findChatIdByPhone helper

**Decision**: Reuse from `apps/api/src/lib/telegram.ts:229`.
**Rationale**: Exact lookup needed. Avoids code duplication.
**Alternatives considered**:
- Joining telegram_chat in main query — more efficient but couples schemas. N+1 acceptable at expected scale.
