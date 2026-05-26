#!/usr/bin/env node
/**
 * Architecture guardrail (G2).
 *
 * Fails when business rules leak outside the domain layer. Each rule has a
 * pattern, a human-readable message, an allow-list of files where the pattern
 * is the canonical home, and a glob of files to scan.
 *
 * Run via `pnpm check:leaks`. Wired into CI. To exempt a single line, add
 * `// leak-allow: <reason>` at end of line.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()

const SCAN_ROOTS = ['apps/api/src', 'apps/web/src', 'packages/shared/src']
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', 'coverage'])

const RULES = [
  {
    name: 'inline-prize-formula',
    description:
      'Prize total formula must live in PrizeCalculation / FeePolicy / shared fee helper, not be re-derived.',
    pattern: /\*\s*\(1\s*-\s*[A-Za-z_][\w]*[Rr]ate[\w]*\s*\)/,
    allow: [
      'apps/api/src/domain/shared/FeePolicy.ts',
      'apps/api/src/domain/prize/PrizeCalculation.ts',
      'packages/shared/src/lib/fee.ts',
    ],
  },
  {
    name: 'inline-discount-formula',
    description:
      '`(1 - discountPercent / 100)` is FeePolicy / shared fee territory. Use the helper.',
    pattern: /\*\s*\(\s*1\s*-\s*discountPercent\s*\/\s*100\s*\)/,
    allow: ['apps/api/src/domain/shared/FeePolicy.ts', 'packages/shared/src/lib/fee.ts'],
  },
  {
    name: 'magic-platform-fee-rate',
    description: 'Literal 0.05 platform fee rate must come from PLATFORM_FEE_RATE constant.',
    pattern: /\b0\.05\b/,
    allow: [
      'packages/shared/src/constants/index.ts',
      // tests asserting the same invariant the constant encodes:
      'packages/shared/src/lib/fee.ts',
    ],
    onlyFiles: [
      'apps/web/src/lib/utils.ts',
      'apps/api/src/services/pool.ts',
      'apps/api/src/services/coupon.ts',
      'apps/api/src/infrastructure/http/routes/pools.ts',
      'apps/api/src/infrastructure/http/routes/ranking.ts',
      'packages/shared/src/lib/fee.ts',
    ],
  },
  {
    name: 'frontend-financial-calculator',
    description:
      'Front-end must not compute prize/fee. Use `computePlatformFee` from `@m5nita/shared` or consume pre-computed API values.',
    pattern: /export\s+function\s+calculate(Prize|PlatformFee|DiscountedFee)\b/,
    allow: [],
    onlyDirs: ['apps/web/src'],
  },
  {
    name: 'deprecated-getEffectiveFeeRate',
    description:
      '`getEffectiveFeeRate` is removed. Use `FeePolicy.from(discountPercent)` (domain) or `computeEffectiveFeeRate` (shared).',
    pattern: /\bgetEffectiveFeeRate\s*\(/,
    allow: [],
  },
  {
    name: 'scoring-branch-leak',
    description:
      'Branching on `isSingleMatchPool` / `scope.matchId` to pick scoring is domain logic. Use `pool.scoringPolicy()` instead.',
    pattern: /\bisSingleMatchPool\b|\bscope\.matchId\s*!==?\s*null\b/,
    allow: ['apps/api/src/domain/pool/Pool.ts', 'apps/api/src/domain/shared/PoolScope.ts'],
  },
  {
    name: 'direct-scoring-call',
    description:
      'Use `pool.scoringPolicy().score(...)`. Direct `Score.calculate`/`SingleMatchScore.calculate` calls outside domain bypass policy selection.',
    pattern: /\b(Score|SingleMatchScore)\.calculate\s*\(/,
    allow: [
      'apps/api/src/domain/scoring/Score.ts',
      'apps/api/src/domain/scoring/Score.test.ts',
      'apps/api/src/domain/scoring/SingleMatchScore.ts',
      'apps/api/src/domain/scoring/SingleMatchScore.test.ts',
      'apps/api/src/domain/scoring/ScoringPolicy.ts',
      'apps/api/src/domain/prediction/Prediction.ts',
    ],
  },
  {
    name: 'stale-match-12h-leak',
    description:
      '12-hour stale-match rule is domain logic. Use `StaleMatchPolicy.isStaleSinceKickoff(...)`.',
    pattern: /\b12\s*\*\s*60\s*\*\s*60\s*\*\s*1000\b|\bMATCH_MAX_DURATION_MS\b/,
    allow: [
      'apps/api/src/domain/match/StaleMatchPolicy.ts',
      'apps/api/src/domain/match/Match.test.ts',
    ],
  },
  {
    name: 'match-kickoff-comparison-leak',
    description:
      'Comparing `kickoffAt` / `matchDate` against `now` is `Match.canBePredicted` / `MatchEligibility` territory.',
    pattern: /\b(kickoffAt|matchDate)\b.*\.getTime\(\)\s*[<>]=?/,
    allow: [
      'apps/api/src/domain/match/Match.ts',
      'apps/api/src/domain/match/MatchEligibility.ts',
      'apps/api/src/domain/match/StaleMatchPolicy.ts',
      'apps/api/src/domain/prediction/Prediction.ts',
    ],
  },
]

function* walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      yield* walk(full)
    } else if (
      entry.isFile() &&
      /\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/.test(entry.name) &&
      !entry.name.endsWith('.d.ts')
    ) {
      yield full
    }
  }
}

function normalize(p) {
  return relative(ROOT, p).split(sep).join('/')
}

function fileApplies(rule, rel) {
  if (rule.onlyFiles && !rule.onlyFiles.includes(rel)) return false
  if (rule.onlyDirs && !rule.onlyDirs.some((d) => rel.startsWith(`${d}/`))) return false
  return true
}

const offenders = []

for (const root of SCAN_ROOTS) {
  const abs = join(ROOT, root)
  try {
    statSync(abs)
  } catch {
    continue
  }
  for (const file of walk(abs)) {
    const rel = normalize(file)
    const content = readFileSync(file, 'utf8')
    const lines = content.split('\n')
    for (const rule of RULES) {
      if (rule.allow.includes(rel)) continue
      if (!fileApplies(rule, rel)) continue
      lines.forEach((line, idx) => {
        if (line.includes('leak-allow:')) return
        if (rule.pattern.test(line)) {
          offenders.push({ rule: rule.name, file: rel, line: idx + 1, text: line.trim() })
        }
      })
    }
  }
}

if (offenders.length === 0) {
  console.log('✓ check-domain-leaks: no violations.')
  process.exit(0)
}

console.error(`✗ check-domain-leaks: ${offenders.length} violation(s).\n`)
const byRule = new Map()
for (const o of offenders) {
  if (!byRule.has(o.rule)) byRule.set(o.rule, [])
  byRule.get(o.rule).push(o)
}
for (const [ruleName, items] of byRule) {
  const rule = RULES.find((r) => r.name === ruleName)
  console.error(`[${ruleName}] ${rule.description}`)
  for (const item of items) {
    console.error(`  ${item.file}:${item.line}  ${item.text}`)
  }
  console.error('')
}
console.error(
  'Fix the violations, or add `// leak-allow: <reason>` at end of line if the case is legitimate.',
)
process.exit(1)
