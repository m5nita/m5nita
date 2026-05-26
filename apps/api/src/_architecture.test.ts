/**
 * Architecture tests (Guardrail G3).
 *
 * Runtime-equivalent of dependency-cruiser. These tests fail loudly when
 * the domain layer reaches outward — far more actionable than a CI script
 * because the message names the offending file and the broken rule.
 *
 * If a violation is intentional (very rare — almost always a code smell),
 * add `// arch-allow: <reason>` at the end of the offending import line.
 *
 * Some rules carry an **inherited baseline**: pre-existing offenders that
 * predate the rule. Listed in `BASELINE_*` arrays below. The rule still
 * blocks *new* violations — anything not on the list trips the test. The
 * goal is to shrink each baseline list over time, not grow it.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC_ROOT = join(__dirname)

function listFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'dist'].includes(entry.name)) continue
      out.push(...listFiles(full))
    } else if (
      entry.isFile() &&
      /\.(ts|tsx)$/.test(entry.name) &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.endsWith('.test.ts')
    ) {
      out.push(full)
    }
  }
  return out
}

function relSrc(absPath: string): string {
  return relative(SRC_ROOT, absPath).split(sep).join('/')
}

function extractImports(content: string): { specifier: string; raw: string }[] {
  const result: { specifier: string; raw: string }[] = []
  const regex = /^\s*(?:import|export)\s+(?:[\s\S]+?\s+from\s+)?['"]([^'"]+)['"]/gm
  for (const m of content.matchAll(regex)) {
    if (!m[1] || m.index === undefined) continue
    const lineEnd = content.indexOf('\n', m.index + m[0].length)
    const raw = content.slice(
      content.lastIndexOf('\n', m.index) + 1,
      lineEnd === -1 ? undefined : lineEnd,
    )
    if (raw.includes('arch-allow:')) continue
    result.push({ specifier: m[1], raw })
  }
  return result
}

function offenders(
  filterFile: (file: string) => boolean,
  isForbidden: (importPath: string, sourceFile: string) => boolean,
  baseline: ReadonlySet<string>,
): { file: string; specifier: string }[] {
  const out: { file: string; specifier: string }[] = []
  for (const file of listFiles(SRC_ROOT)) {
    const rel = relSrc(file)
    if (!filterFile(rel)) continue
    if (baseline.has(rel)) continue
    const content = readFileSync(file, 'utf8')
    for (const imp of extractImports(content)) {
      if (isForbidden(imp.specifier, rel)) {
        out.push({ file: rel, specifier: imp.specifier })
      }
    }
  }
  return out
}

const EMPTY = new Set<string>()

// Inherited baselines. Each entry: a file path that predates the rule and is
// allowed to violate it until refactored. Do not extend.
const BASELINE_APPLICATION_TO_INFRA = new Set<string>([
  // SyncFixtures/SyncLiveScores were authored before the Match aggregate
  // existed; they reach into a persistence mapper directly. Tracked work:
  // hydrate domain Match in the repo and return it, so the use cases consume
  // a port output rather than a mapper.
  'application/match/SyncFixturesUseCase.ts',
  'application/match/SyncLiveScoresUseCase.ts',
])

const BASELINE_SERVICES_ROUTES_USING_SCHEMA = new Set<string>([
  'services/competition.ts',
  'services/coupon.ts',
  'services/infinitepay.ts',
  'services/match.ts',
  'services/payment.ts',
  'services/pool.ts',
  'services/ranking.ts',
  'infrastructure/http/routes/pools.ts',
  'infrastructure/http/routes/matches.ts',
  'infrastructure/http/routes/og.ts',
  'infrastructure/http/routes/users.ts',
])

describe('Architecture — domain isolation', () => {
  it('domain/** does not import from application, infrastructure, services, routes, jobs, lib, db', () => {
    const forbidden = /^(?:\.\.\/)+(?:application|infrastructure|services|routes|jobs|lib|db)\//
    const found = offenders(
      (file) => file.startsWith('domain/'),
      (spec) => forbidden.test(spec),
      EMPTY,
    )
    if (found.length) {
      const msg = found.map((o) => `  ${o.file}  ← imports ${o.specifier}`).join('\n')
      throw new Error(
        `domain/** must not depend on outer layers. Offenders:\n${msg}\n\n` +
          'Move the dependency to a port (interface in domain/) or invert the call.',
      )
    }
    expect(found).toHaveLength(0)
  })

  it('domain/** does not import Drizzle ORM, postgres-js, or other persistence libs', () => {
    const persistencePkgs = [
      'drizzle-orm',
      'drizzle-orm/',
      'postgres',
      'pg',
      'better-auth/adapters',
    ]
    const found = offenders(
      (file) => file.startsWith('domain/'),
      (spec) => persistencePkgs.some((p) => spec === p || spec.startsWith(`${p}/`)),
      EMPTY,
    )
    if (found.length) {
      throw new Error(
        `domain/** must be persistence-agnostic. Offenders:\n${found
          .map((o) => `  ${o.file}  ← imports ${o.specifier}`)
          .join('\n')}`,
      )
    }
    expect(found).toHaveLength(0)
  })
})

describe('Architecture — application boundary', () => {
  it('application/** talks to outer layers only via ports (baselined)', () => {
    const forbidden = /^(?:\.\.\/)+(?:infrastructure|services|routes|db|jobs|lib)\//
    const found = offenders(
      (file) => file.startsWith('application/'),
      (spec) => forbidden.test(spec),
      BASELINE_APPLICATION_TO_INFRA,
    )
    if (found.length) {
      throw new Error(
        `New application/** → outer-layer dependency detected:\n${found
          .map((o) => `  ${o.file}  ← imports ${o.specifier}`)
          .join('\n')}\n` +
          'Add a port interface in domain/ instead of importing the concrete adapter.',
      )
    }
    expect(found).toHaveLength(0)
  })
})

describe('Architecture — services/routes bypass (baselined)', () => {
  it('services/** and routes/** do not import db/schema directly (use repos)', () => {
    const found = offenders(
      (file) => file.startsWith('services/') || file.startsWith('infrastructure/http/routes/'),
      (spec) => /^(\.\.\/)+db\/schema\//.test(spec),
      BASELINE_SERVICES_ROUTES_USING_SCHEMA,
    )
    if (found.length) {
      throw new Error(
        `New service/route bypassing the repository layer:\n${found
          .map((o) => `  ${o.file}  ← imports ${o.specifier}`)
          .join('\n')}\nAdd a port method on the relevant repository.`,
      )
    }
    expect(found).toHaveLength(0)
  })
})
