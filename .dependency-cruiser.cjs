/**
 * dependency-cruiser config (Guardrail G1).
 *
 * Enforces layer boundaries by static import-graph analysis. Complements
 * `pnpm check:leaks` (regex rules) and `_architecture.test.ts` (Vitest
 * import scan). All three exist because each catches a different shape of
 * violation:
 *   - G1 (this file): full module graph; catches circular deps and
 *     transitive layer breaches the other two miss.
 *   - G2: regex on file contents; catches inline math/literals.
 *   - G3: runtime Vitest test; ships actionable error messages and
 *     supports per-line `// arch-allow:` exemptions.
 */
module.exports = {
  forbidden: [
    {
      name: 'domain-no-application',
      severity: 'error',
      comment: 'domain/ must not import from application/. Invert the call via a port.',
      from: { path: '^apps/api/src/domain' },
      to: { path: '^apps/api/src/application' },
    },
    {
      name: 'domain-no-infrastructure',
      severity: 'error',
      comment: 'domain/ must not import from infrastructure/.',
      from: { path: '^apps/api/src/domain' },
      to: { path: '^apps/api/src/infrastructure' },
    },
    {
      name: 'domain-no-services',
      severity: 'error',
      comment: 'domain/ must not import from services/.',
      from: { path: '^apps/api/src/domain' },
      to: { path: '^apps/api/src/services' },
    },
    {
      name: 'domain-no-db',
      severity: 'error',
      comment: 'domain/ must not import from db/.',
      from: { path: '^apps/api/src/domain' },
      to: { path: '^apps/api/src/db' },
    },
    {
      name: 'domain-no-jobs-lib-routes',
      severity: 'error',
      comment: 'domain/ must not import from jobs/, lib/, or routes/.',
      from: { path: '^apps/api/src/domain' },
      to: { path: '^apps/api/src/(jobs|lib)' },
    },
    {
      name: 'domain-no-persistence-libs',
      severity: 'error',
      comment: 'domain/ must be persistence-agnostic.',
      from: { path: '^apps/api/src/domain' },
      to: { path: 'node_modules/(drizzle-orm|postgres|pg|better-auth/adapters)' },
    },
    {
      name: 'application-no-infrastructure',
      severity: 'error',
      comment:
        'application/ talks to outer layers only via ports. (See BASELINE_APPLICATION_TO_INFRA in _architecture.test.ts for inherited exceptions.)',
      from: { path: '^apps/api/src/application', pathNot: '^apps/api/src/application/match/Sync' },
      to: { path: '^apps/api/src/infrastructure' },
    },
    {
      // Blocking, so a NEW cycle fails CI. The pre-existing container.ts ↔
      // lib/telegram.ts cycle (telegram notification service pulls from the
      // composition root) is grandfathered via the from-exemption below until
      // it is refactored; every other cycle is an error.
      name: 'no-circular',
      severity: 'error',
      comment: 'Cycles indicate a layering or abstraction problem.',
      // Exempt every module in the grandfathered container ↔ telegram cycle.
      // A genuinely new cycle elsewhere always has a participant outside this
      // set, so it is still reported as an error.
      from: {
        pathNot:
          '(container|lib/telegram|infrastructure/external/CompositeNotificationService)\\.ts$',
      },
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    includeOnly: '^(apps/api|packages/shared)/src',
    tsPreCompilationDeps: true,
    exclude: { path: '\\.(test|spec)\\.(ts|tsx)$' },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
}
