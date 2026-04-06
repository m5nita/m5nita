# Tasks: Correções de UX - Lembretes, Pontuação e Bolões Finalizados

**Input**: Design documents from `/specs/007-fix-ux-scores-reminders/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md

**Tests**: Not required — these are UI/text corrections. Existing tests must continue passing.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No setup needed — no schema changes, no new dependencies.

**Checkpoint**: N/A

---

## Phase 2: Foundational (Portuguese Text Fixes)

**Purpose**: Fix accent/punctuation issues across entire codebase. Done first to avoid merge conflicts with other tasks.

- [x] T001 [P] Fix accents in `apps/api/src/lib/telegram.ts`: `Voce` → `Você`, `nao` → `não`, `permissao` → `permissão`, `Codigo` → `Código`, `duracao` → `duração`, `invalido` → `inválido`, `Competicao` → `Competição`, `Competicoes` → `Competições`, `numero` → `número`, `Boloes` → `Bolões`, `mantem` → `mantêm` (13 instances)
- [x] T002 [P] Fix accents in `apps/api/src/services/pool.ts`: `invalido` → `inválido`, `utilizacoes` → `utilizações` (6 instances in coupon error messages)
- [x] T003 [P] Fix accents in `apps/api/src/services/competition.ts`: `Competicao` → `Competição`, `ja` → `já`, `nao` → `não` (3 instances)
- [x] T004 [P] Fix accent in `apps/api/src/index.ts`: `nao` → `não` in 404 handler
- [x] T005 [P] Fix accent in `apps/api/src/middleware/auth.ts`: `Autenticacao` → `Autenticação`, `necessaria` → `necessária`
- [x] T006 [P] Fix accents in `apps/web/src/components/ui/OtpInput.tsx`: `Codigo` → `Código`, `verificacao` → `verificação`, `Digito` → `Dígito`
- [x] T007 [P] Fix accents in `apps/web/src/routes/pools/create.tsx`: `nao` → `não`, `invalido` → `inválido`, `bolao` → `bolão`, `Competicao` → `Competição`
- [x] T008 [P] Fix accents in `apps/web/src/routes/index.tsx`: `Boloes` → `Bolões`, `bolao` → `bolão`
- [x] T009 [P] Fix accents in `apps/web/src/routes/matches.tsx`: `Competicoes` → `Competições`
- [x] T010 [P] Fix accents in `apps/web/src/routes/pools/$poolId/predictions.tsx`: `bolao` → `bolão`
- [x] T011 [P] Fix accent in `apps/web/src/routes/__root.tsx`: `Configuracoes` → `Configurações`
- [x] T012 [P] Fix accent in `apps/api/src/routes/__tests__/predictions.test.ts`: `Voce nao e membro deste bolao` → `Você não é membro deste bolão` to match service

**Checkpoint**: `grep -r "nao\|Voce\|invalido\|Codigo\|Competicao\|bolao\|Boloes" apps/ packages/` returns zero user-facing matches.

---

## Phase 3: User Story 1 — Show Prediction Alongside Real Score (Priority: P1)

**Goal**: When a match is live or finished, show the user's prediction as the primary element and the real score as a smaller secondary line above.

**Independent Test**: Access predictions page for a pool with finished matches. Verify both scores visible, user prediction prominent, real score smaller above. "Sem palpite" shown for matches without predictions.

- [x] T013 [US1] Restructure `apps/web/src/components/prediction/ScoreInput.tsx`: Add `hasPrediction` and `hasActualScore` derived booleans. When `isLocked && hasActualScore`, render real score row above inputs in smaller text. Remove `opacity-60` from locked state. When `isLocked && !hasPrediction`, show `–` placeholders with "Sem palpite" label. Keep user's prediction values in input fields (remove ternary that swapped for actual scores). Change disabled input color to `disabled:text-black` to keep prediction readable.

**Checkpoint**: Predictions page shows dual scores for live/finished matches. User prediction is prominent, real score is secondary above.

---

## Phase 4: User Story 2 — Show Finished Pools on Home Page (Priority: P1)

**Goal**: Finished (closed) pools appear on the home page in a separate "Finalizados" section with a badge.

**Independent Test**: User with active and closed pools sees both sections on home page. Clicking a finished pool navigates to its detail page.

- [x] T014 [US2] Update `getUserPools()` in `apps/api/src/services/pool.ts`: Change filter from `m.pool.status === 'active'` to `m.pool.status !== 'cancelled'` to include closed pools in response.
- [x] T015 [US2] Update `apps/web/src/routes/index.tsx`: Split pools into `activePools` and `finishedPools` arrays. Render active pools in existing "Meus Bolões" section. Add new "Finalizados" section (only when `finishedPools.length > 0`) below with same layout.
- [x] T016 [P] [US2] Update `apps/web/src/components/pool/PoolCard.tsx`: Add "Finalizado" badge when `pool.status === 'closed'` next to pool name.
- [x] T017 [US2] Hide "Convidar Amigos" section in `apps/web/src/routes/pools/$poolId/index.tsx` when `pool.status === 'closed'`.
- [x] T018 [US2] Hide "Zona de Perigo" (Encerrar Bolão) in `apps/web/src/routes/pools/$poolId/manage.tsx` when `pool.status === 'closed'`.
- [x] T019 [US2] Hide "Remover" button for members in `apps/web/src/routes/pools/$poolId/manage.tsx` when `pool.status === 'closed'`.
- [x] T020 [US2] Add confirmation dialog for member removal in `apps/web/src/routes/pools/$poolId/manage.tsx`: clicking "Remover" shows "Confirmar" / "Não" buttons instead of immediately removing.
- [x] T021 [US2] Fix `PrizeWithdrawal` component in `apps/web/src/components/pool/PrizeWithdrawal.tsx`: Return `null` on error instead of showing error message. Remove unused `ErrorMessage` import.
- [x] T022 [US2] Merge "Prêmio" and "Vencedor" sections into one in `apps/web/src/components/pool/PrizeWithdrawal.tsx`: Remove grid with Total/Seu Prêmio. Show section header as "Vencedor(es)". Each winner row shows name, points, and prize amount. Show "Por Vencedor" label for non-winners.

**Checkpoint**: Home page shows active and finished pools separately. Finished pool detail page has no invite section, no danger zone, no remove buttons, and clean prize/winner display.

---

## Phase 5: User Story 3 — Telegram Reminder with Pool Name and Link (Priority: P2)

**Goal**: Reminder messages include pool name and direct link, grouped by pool.

**Independent Test**: Trigger reminder job, verify message contains pool name, list of matches, and direct link to predictions page.

- [x] T023 [US3] Restructure `apps/api/src/jobs/reminderJob.ts`: Collect pending reminders in a `Map<string, {...}>` keyed by `userId:poolId`. Group all missing matches per user per pool. Send one message per pool with: pool name, match list with minutes until kickoff, and direct link using `APP_URL` env var. Update dedup key to `userId:poolId`. Fix accents in message text.

**Checkpoint**: Reminder messages are grouped per pool with name and link. `APP_URL` env var needed for links.

---

## Phase 6: User Story 4 — Fix Scoring Rule Text (Priority: P2)

**Goal**: Scoring rule descriptions and examples on "Como funciona" page are mathematically correct.

**Independent Test**: Visit /how-it-works, verify 5-point example has different goal difference than result, 7-point example includes draw scenario.

- [x] T024 [US4] Fix scoring examples in `apps/web/src/routes/how-it-works.tsx`: Change 5-point example from `'Palpite 1×0, resultado 3×2'` to `'Palpite 1×0, resultado 3×0'` (diff 1 vs diff 3 = correct 5 pts). Change 7-point example to `'Palpite 3×1, resultado 2×0 ou 1×1, resultado 0×0'` (includes draw scenario).

**Checkpoint**: All scoring examples are mathematically consistent with backend logic in `apps/api/src/services/scoring.ts`.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T025 Run `pnpm biome check --write .` to fix formatting
- [x] T026 Run `pnpm build` to verify no build errors
- [x] T027 Run `pnpm test` to verify all existing tests pass

**Checkpoint**: Build passes, all tests green, lint clean.

---

## Dependencies

```
Phase 2 (T001-T012) → No dependencies, all parallel
Phase 3 (T013) → Independent
Phase 4 (T014-T022) → T014 before T015 (API before frontend)
Phase 5 (T023) → Independent
Phase 6 (T024) → Independent
Phase 7 (T025-T027) → After all other phases
```

## Parallel Execution Opportunities

- **Phase 2**: All T001-T012 can run in parallel (different files)
- **Phase 3-6**: User Stories 1, 3, and 4 are fully independent and can run in parallel
- **Phase 4**: T016 can run parallel with T014-T015

## Implementation Strategy

- **MVP**: Phase 2 + Phase 3 (text fixes + dual score display)
- **Incremental**: Add Phase 4 (finished pools), then Phase 5 (reminders), then Phase 6 (scoring text)
- All phases are independently deployable
