<!--
Sync Impact Report
==================
- Version change: 1.1.0 → 1.2.0
- Modified principles:
  - I. Code Quality: Added SOLID principles reference and value object
    mandate for domain primitives
  - II. Testing Standards: Added domain unit test requirements and
    port/adapter test strategy
- Added sections:
  - V. Hexagonal Architecture & SOLID (new core principle)
- Removed sections: None
- Templates requiring updates:
  - .specify/templates/plan-template.md ✅ No changes needed
    (Constitution Check section is generic, will pick up new principle)
  - .specify/templates/spec-template.md ✅ No changes needed
    (success criteria already support architecture constraints)
  - .specify/templates/tasks-template.md ✅ No changes needed
    (phase structure supports domain-first task ordering)
- Follow-up TODOs: None
-->

# Manita Constitution

## Core Principles

### I. Code Quality

Every module MUST be readable, maintainable, and self-documenting.
Non-negotiable rules:

- Functions MUST have a single, clear responsibility (SRP). If a
  function requires more than one sentence to describe, it MUST be
  split.
- No dead code, commented-out blocks, or TODO comments in merged code.
  TODOs MUST be tracked as issues, never left inline.
- Naming MUST be explicit and intention-revealing. Abbreviations are
  forbidden unless they are universally understood domain terms.
  Naming priority: consistency > understandability > specificity >
  brevity > searchability.
- Cognitive complexity per function SHOULD NOT exceed 15. Functions
  exceeding this threshold SHOULD be refactored. Biome enforces this
  as a warning; errors block CI, warnings do not.
- All public interfaces MUST have type annotations. Explicit `any`
  types SHOULD be avoided and are flagged as warnings by Biome.
  Implicit `any` types are forbidden by TypeScript strict mode.
- Code duplication MUST be eliminated when the same logic appears in
  three or more locations (Rule of Three). Two occurrences MAY be
  tolerated if extraction would reduce clarity.
- Linting and formatting rules MUST be enforced via automated tooling
  (Biome). Lint errors block CI; warnings are permitted but SHOULD be
  addressed over time. No PR may be merged with lint errors.
- Domain primitives (IDs, monetary amounts, email, codes) MUST be
  wrapped in value objects. Raw primitives MUST NOT be used for
  domain concepts in function signatures or entity fields.
- Methods MUST NOT exceed 10 lines. Classes MUST NOT exceed 50 lines.
  No more than one level of indentation per method.
- Prefer early returns over `else` blocks. Prefer `Tell, Don't Ask`
  over querying state and deciding externally.

**Rationale**: Code is read far more often than it is written.
Investing in clarity reduces onboarding time, bug surface area,
and cognitive load during reviews.

**How this guides decisions**: When choosing between a clever
one-liner and a verbose but clear implementation, always choose
clarity. When designing APIs, favor explicit parameters over
configuration objects with many optional fields. When handling
domain concepts, always wrap them in value objects that validate
and encapsulate behavior.

### II. Testing Standards

Every feature MUST be backed by tests that verify behavior,
not implementation details. Non-negotiable rules:

- Unit tests MUST cover all public functions and edge cases.
  Coverage below 80% on new code blocks merge.
- Domain layer (entities, value objects, domain services) MUST have
  100% unit test coverage. These are pure, no-dependency classes
  that are trivial to test.
- Integration tests MUST verify all cross-boundary interactions:
  API contracts, database queries, external service calls.
- Adapter tests MUST verify that infrastructure implementations
  (repositories, gateways) correctly satisfy their port interfaces.
- Tests MUST be deterministic. Flaky tests MUST be quarantined
  and fixed within 48 hours or deleted.
- Test names MUST describe the scenario and expected outcome,
  following the pattern: `[unit]_[scenario]_[expectedResult]`.
- Mocking MUST be limited to ports and external dependencies only.
  Domain and application layers MUST be tested with real
  implementations. Infrastructure adapters MAY be mocked when
  testing use cases.
- Tests MUST run in isolation. No test may depend on the execution
  order or side effects of another test.
- Performance-sensitive paths MUST include benchmark tests that
  enforce defined thresholds.

**Rationale**: Tests are the executable specification of the system.
They MUST provide confidence that changes do not break existing
behavior and MUST serve as living documentation.

**How this guides decisions**: When implementing a feature, write
the test first (TDD: Red-Green-Refactor). When a bug is found,
write a failing test that reproduces it before fixing. Domain
logic tests MUST NOT depend on any infrastructure (no database,
no HTTP, no file system).

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

### V. Hexagonal Architecture & SOLID

The API backend MUST follow hexagonal architecture (ports and
adapters) with strict SOLID principles. Non-negotiable rules:

- **Three-layer structure**: Code MUST be organized into three
  layers: `domain/`, `application/`, `infrastructure/`. Each layer
  has a clear responsibility and strict dependency direction.
- **Dependency Rule**: Source code dependencies MUST point inward.
  Domain MUST NOT import from application or infrastructure.
  Application MUST NOT import from infrastructure. Infrastructure
  implements interfaces defined by inner layers.
- **Domain layer** (`domain/`): Contains entities, value objects,
  domain services, domain errors, and port interfaces (repository
  contracts). MUST have zero external dependencies (no ORM, no
  HTTP framework, no third-party libraries). MUST be pure
  TypeScript.
- **Application layer** (`application/`): Contains use cases that
  orchestrate domain objects and ports. Each use case MUST have a
  single public `execute()` method. External service ports
  (payment gateways, notification services, external APIs) are
  defined here.
- **Infrastructure layer** (`infrastructure/`): Contains adapters
  that implement ports: Drizzle repositories, Stripe gateway, HTTP
  routes (Hono), Telegram notifications. This is the only layer
  that MAY import third-party libraries.
- **Value objects are mandatory**: Every domain primitive (Money,
  EntryFee, InviteCode, Score, PixKey, MatchdayRange, PoolStatus)
  MUST be a value object with validation and behavior. Raw
  primitives (string, number) MUST NOT represent domain concepts.
- **Entities MUST encapsulate behavior**: Domain entities MUST NOT
  be anemic data bags. Business rules (state transitions, fee
  calculations, eligibility checks) MUST live inside entities or
  domain services, not in use cases or routes.
- **Ports are TypeScript interfaces**: Repository ports live in
  `domain/`. External service ports live in `application/ports/`.
  Adapters in `infrastructure/` implement these interfaces.
- **Manual dependency injection**: Dependencies MUST be wired in a
  composition root (`container.ts`). No DI framework. Use cases
  receive ports via constructor. Routes import from container.
- **Pragmatic scope**: Not every domain needs full hexagonal
  treatment. Simple CRUD without business logic (e.g., competition
  listing) MAY remain as thin services. Full treatment is required
  when: the domain has state machines, complex validation, multi-
  step orchestration, or cross-domain coordination.
- **SOLID compliance**:
  - **SRP**: Each class has one reason to change.
  - **OCP**: Extend behavior via new adapters, not modifying
    existing domain code.
  - **LSP**: All adapter implementations MUST be substitutable
    for their port interface.
  - **ISP**: Port interfaces MUST be specific to client needs.
    No fat interfaces that force implementers to stub methods.
  - **DIP**: High-level modules (domain, application) depend on
    abstractions (ports), not on concretions (Drizzle, Stripe).

**Rationale**: Hexagonal architecture isolates business rules from
infrastructure, making the domain testable without databases or
external services. SOLID principles ensure the codebase scales
without accumulating coupling. When infrastructure changes (e.g.,
switching payment providers), only adapters change — domain and
application layers remain untouched.

**How this guides decisions**: When adding a new feature, start
with the domain (entities, value objects, ports), then define
use cases, then implement adapters. When choosing where to place
logic, ask: "Is this a business rule?" → domain. "Is this
orchestration?" → application. "Is this a technical concern?" →
infrastructure. When in doubt, push logic toward the domain.

## Technical Decision Guidelines

These guidelines codify how the core principles translate into
day-to-day technical choices:

- **Dependency selection**: Every new dependency MUST be evaluated
  against bundle size impact (Principle IV), type safety
  (Principle I), and accessibility support (Principle III).
  Dependencies without active maintenance (no release in 12 months)
  MUST NOT be adopted. New dependencies MUST only be imported in
  the infrastructure layer (Principle V).
- **Architecture choices**: The API backend follows hexagonal
  architecture (Principle V). New features MUST be structured as
  domain → application → infrastructure. Simple patterns are
  preferred; a new architectural pattern MUST demonstrate
  measurable benefit to at least two principles before adoption.
- **Data modeling**: Domain entities MUST reflect the domain
  language (Principle III terminology consistency). Field names
  MUST be self-documenting (Principle I). Domain models MUST be
  separate from persistence models; mappers bridge the gap
  (Principle V). Queries MUST be benchmarked (Principle IV).
- **API design**: Endpoints MUST follow consistent naming
  conventions and response structures (Principle III). Response
  times MUST meet performance budgets (Principle IV). Every
  endpoint MUST have contract tests (Principle II). Routes are
  infrastructure adapters that delegate to use cases (Principle V).
- **Error handling**: Domain errors MUST be typed and specific
  (Principle I, V). User-facing errors MUST be actionable
  (Principle III). Error paths MUST be tested (Principle II).
  Domain errors are caught in the infrastructure layer (routes)
  and mapped to HTTP status codes (Principle V).

## Development Workflow

The development workflow MUST enforce constitutional compliance
at every stage:

- **Before implementation**: Feature specifications MUST define
  acceptance criteria that map to Principles II (testability),
  III (UX expectations), IV (performance budgets), and V
  (architectural layer placement).
- **During implementation**: Start with domain layer (value objects,
  entities, ports), then application layer (use cases), then
  infrastructure layer (adapters, routes). Write tests first
  (TDD). Code MUST pass automated linting (Principle I) and
  tests (Principle II) locally before pushing.
- **Code review**: Reviewers MUST verify compliance with all five
  principles. A single principle violation is sufficient grounds
  to block a merge. Reviewers MUST specifically check that domain
  code has no infrastructure imports (Principle V).
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

**Version**: 1.2.0 | **Ratified**: 2026-03-15 | **Last Amended**: 2026-04-12
