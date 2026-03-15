<!--
Sync Impact Report
==================
- Version change: 0.0.0 → 1.0.0
- Modified principles: N/A (initial creation)
- Added sections:
  - Core Principles: I. Code Quality, II. Testing Standards,
    III. UX Consistency, IV. Performance Requirements
  - Technical Decision Guidelines
  - Development Workflow
  - Governance
- Removed sections: None
- Templates requiring updates:
  - .specify/templates/plan-template.md ✅ No changes needed (Constitution Check section is generic)
  - .specify/templates/spec-template.md ✅ No changes needed (success criteria already support performance/UX metrics)
  - .specify/templates/tasks-template.md ✅ No changes needed (test-first and polish phases align with principles)
- Follow-up TODOs:
  - TODO(RATIFICATION_DATE): Using today as initial ratification date
-->

# Manita Constitution

## Core Principles

### I. Code Quality

Every module MUST be readable, maintainable, and self-documenting.
Non-negotiable rules:

- Functions MUST have a single, clear responsibility. If a function
  requires more than one sentence to describe, it MUST be split.
- No dead code, commented-out blocks, or TODO comments in merged code.
  TODOs MUST be tracked as issues, never left inline.
- Naming MUST be explicit and intention-revealing. Abbreviations are
  forbidden unless they are universally understood domain terms.
- Cyclomatic complexity per function MUST NOT exceed 10. Functions
  exceeding this threshold MUST be refactored before merge.
- All public interfaces MUST have type annotations. Implicit `any`
  types are forbidden.
- Code duplication MUST be eliminated when the same logic appears in
  three or more locations. Two occurrences MAY be tolerated if
  extraction would reduce clarity.
- Linting and formatting rules MUST be enforced via automated tooling.
  No PR may be merged with linting violations.

**Rationale**: Code is read far more often than it is written.
Investing in clarity reduces onboarding time, bug surface area,
and cognitive load during reviews.

**How this guides decisions**: When choosing between a clever
one-liner and a verbose but clear implementation, always choose
clarity. When designing APIs, favor explicit parameters over
configuration objects with many optional fields.

### II. Testing Standards

Every feature MUST be backed by tests that verify behavior,
not implementation details. Non-negotiable rules:

- Unit tests MUST cover all public functions and edge cases.
  Coverage below 80% on new code blocks merge.
- Integration tests MUST verify all cross-boundary interactions:
  API contracts, database queries, external service calls.
- Tests MUST be deterministic. Flaky tests MUST be quarantined
  and fixed within 48 hours or deleted.
- Test names MUST describe the scenario and expected outcome,
  following the pattern: `[unit]_[scenario]_[expectedResult]`.
- Mocking MUST be limited to external dependencies only. Internal
  modules MUST be tested with real implementations to catch
  integration regressions.
- Tests MUST run in isolation. No test may depend on the execution
  order or side effects of another test.
- Performance-sensitive paths MUST include benchmark tests that
  enforce defined thresholds.

**Rationale**: Tests are the executable specification of the system.
They MUST provide confidence that changes do not break existing
behavior and MUST serve as living documentation.

**How this guides decisions**: When implementing a feature, write
the test first to clarify the expected behavior. When a bug is
found, write a failing test that reproduces it before fixing.
Prefer integration tests for critical user paths over unit tests
that mock away the complexity.

### III. UX Consistency

Every user-facing surface MUST deliver a predictable, coherent
experience. Non-negotiable rules:

- Visual elements MUST follow the project's design system. Ad-hoc
  styles are forbidden in user-facing components.
- Interaction patterns MUST be consistent across the application.
  The same action MUST produce the same type of feedback everywhere.
- Error states MUST be user-friendly. Technical error messages
  MUST NOT be exposed to end users. Every error MUST provide a
  clear description of what happened and what the user can do next.
- Loading states MUST be explicit. No operation that takes more
  than 200ms may leave the user without visual feedback.
- Accessibility MUST be treated as a requirement, not an
  enhancement. WCAG 2.1 AA compliance is the minimum standard.
- Navigation MUST be predictable. Users MUST always know where
  they are, how they got there, and how to go back.
- Content and copy MUST use consistent terminology. A glossary
  MUST be maintained for domain-specific terms.

**Rationale**: Inconsistency erodes user trust and increases
cognitive load. A consistent experience reduces support burden
and increases user confidence in the product.

**How this guides decisions**: When adding a new component or
interaction, first check if an existing pattern covers the use
case. New patterns require explicit justification and design
review. When in doubt, reuse over reinvent.

### IV. Performance Requirements

Every feature MUST meet defined performance thresholds before
release. Non-negotiable rules:

- Page load (first contentful paint) MUST complete within 1.5
  seconds on a 4G connection.
- API responses MUST return within 200ms at p95 under normal load.
- Client-side interactions MUST respond within 100ms. Animations
  MUST maintain 60fps.
- Memory consumption MUST NOT grow unbounded. Every long-lived
  process MUST be profiled for memory leaks before release.
- Database queries MUST be reviewed for N+1 problems, missing
  indexes, and full table scans. No unoptimized query may reach
  production.
- Bundle size increases above 10KB MUST be justified and approved
  in the PR review.
- Performance budgets MUST be enforced via automated CI checks.
  Regressions MUST block the pipeline.

**Rationale**: Performance is a feature. Users abandon slow
applications. Performance debt compounds faster than technical
debt and is harder to pay down retroactively.

**How this guides decisions**: When choosing between a feature-rich
library and a lightweight alternative, favor the lighter option
unless the feature gap is critical. When designing data flows,
optimize for the common case and defer expensive operations.
Always measure before and after; intuition about performance is
unreliable.

## Technical Decision Guidelines

These guidelines codify how the core principles translate into
day-to-day technical choices:

- **Dependency selection**: Every new dependency MUST be evaluated
  against bundle size impact (Principle IV), type safety
  (Principle I), and accessibility support (Principle III).
  Dependencies without active maintenance (no release in 12 months)
  MUST NOT be adopted.
- **Architecture choices**: Favor simple, well-understood patterns
  over novel abstractions. A new architectural pattern MUST
  demonstrate measurable benefit to at least two principles before
  adoption.
- **Data modeling**: Models MUST reflect the domain language
  (Principle III terminology consistency). Field names MUST be
  self-documenting (Principle I). Queries MUST be benchmarked
  (Principle IV).
- **API design**: Endpoints MUST follow consistent naming
  conventions and response structures (Principle III). Response
  times MUST meet performance budgets (Principle IV). Every
  endpoint MUST have contract tests (Principle II).
- **Error handling**: Errors MUST be typed and categorized
  (Principle I). User-facing errors MUST be actionable
  (Principle III). Error paths MUST be tested (Principle II).
  Error handling MUST NOT degrade performance (Principle IV).

## Development Workflow

The development workflow MUST enforce constitutional compliance
at every stage:

- **Before implementation**: Feature specifications MUST define
  acceptance criteria that map to Principles II (testability),
  III (UX expectations), and IV (performance budgets).
- **During implementation**: Code MUST pass automated linting
  (Principle I) and tests (Principle II) locally before pushing.
  Performance-sensitive changes MUST include benchmark results.
- **Code review**: Reviewers MUST verify compliance with all four
  principles. A single principle violation is sufficient grounds
  to block a merge.
- **Before merge**: CI pipeline MUST pass all quality gates:
  lint, type check, test suite, coverage threshold, performance
  budget, and accessibility audit.
- **After deployment**: Performance metrics MUST be monitored.
  Regressions exceeding defined thresholds MUST trigger immediate
  investigation.

## Governance

This constitution is the highest authority for technical decisions
in the Manita project. All other practices, conventions, and
guidelines are subordinate.

- **Compliance**: Every PR and code review MUST verify adherence
  to the core principles. Reviewers are accountable for catching
  violations.
- **Amendments**: Changes to this constitution require:
  1. A written proposal describing the change and its rationale.
  2. Review of impact on all dependent templates and artifacts.
  3. A migration plan for existing code that may violate the
     amended principle.
  4. Update of this document with a version bump and amended date.
- **Versioning**: This constitution follows semantic versioning:
  - MAJOR: Principle removal, redefinition, or backward-incompatible
    governance changes.
  - MINOR: New principle or materially expanded guidance.
  - PATCH: Clarifications, wording, or non-semantic refinements.
- **Complexity justification**: Any deviation from these principles
  MUST be documented in the Complexity Tracking section of the
  implementation plan with a clear rationale and rejected
  alternatives.
- **Runtime guidance**: Use CLAUDE.md or equivalent agent guidance
  files for runtime development instructions that supplement
  this constitution.

**Version**: 1.0.0 | **Ratified**: 2026-03-15 | **Last Amended**: 2026-03-15
