# Implementation Plan: Correções de UX - Lembretes, Pontuação e Bolões Finalizados

**Branch**: `007-fix-ux-scores-reminders` | **Date**: 2026-04-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-fix-ux-scores-reminders/spec.md`

## Summary

Five UX corrections: (1) show user prediction alongside real score on live/finished matches, (2) display finished pools on home page, (3) enhance Telegram reminders with pool name and direct link, (4) fix incorrect 5-point scoring example, (5) standardize Portuguese text accents and punctuation across codebase.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js >= 20)  
**Primary Dependencies**: Hono (API), React 19, TanStack Router/Query, grammY (Telegram), Drizzle ORM  
**Storage**: PostgreSQL 16  
**Testing**: Vitest  
**Target Platform**: Web (PWA)  
**Project Type**: Web application (monorepo)  
**Performance Goals**: Standard web app expectations  
**Constraints**: Mobile-first design, all monetary values in centavos (BRL)  
**Scale/Scope**: ~1000 users, ~50 matches per competition

## Constitution Check

*GATE: PASS — No violations.*

- **I. Code Quality**: All changes are targeted fixes. No new abstractions or patterns.
- **II. Testing**: Scoring logic already tested. New visual states verifiable via dev server.
- **III. UX Consistency**: This feature directly addresses UX inconsistencies (missing data, incorrect text, broken information hierarchy).
- **IV. Performance**: No performance impact. `getUserPools` adds closed pools to existing query (no new queries).

## Project Structure

### Documentation (this feature)

```text
specs/007-fix-ux-scores-reminders/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (no schema changes)
├── spec.md              # Feature specification
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (files to modify)

```text
apps/api/
├── src/
│   ├── index.ts                      # Task 5: Fix "nao" → "não"
│   ├── jobs/
│   │   └── reminderJob.ts            # Task 3: Restructure + Task 5: Fix accents
│   ├── lib/
│   │   └── telegram.ts               # Task 5: Fix 13 accent instances
│   └── services/
│       ├── pool.ts                   # Task 2: Include closed pools + Task 5: Fix accents
│       └── competition.ts            # Task 5: Fix accents

apps/web/
├── src/
│   ├── components/
│   │   ├── prediction/
│   │   │   └── ScoreInput.tsx        # Task 1: Show dual scores
│   │   ├── pool/
│   │   │   └── PoolCard.tsx          # Task 2: Add "Finalizado" badge
│   │   └── ui/
│   │       └── OtpInput.tsx          # Task 5: Fix accents
│   └── routes/
│       ├── index.tsx                 # Task 2: Separate active/finished sections + Task 5
│       ├── how-it-works.tsx          # Task 4: Fix 5-point example
│       └── pools/
│           └── create.tsx            # Task 5: Fix accents
```

**Structure Decision**: Existing monorepo structure. No new files or directories needed (except env var addition).
