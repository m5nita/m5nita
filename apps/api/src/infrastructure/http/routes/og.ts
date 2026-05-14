import { eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../../../db/client'
import { competition as competitionTable } from '../../../db/schema/competition'
import { pool as poolTable } from '../../../db/schema/pool'
import { poolMember } from '../../../db/schema/poolMember'
import { getPoolByInviteCode } from '../../../services/pool'
import type { AppEnv } from '../../../types/hono'

const ogRoutes = new Hono<AppEnv>()

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  })
}

function renderHtml(opts: {
  url: string
  title: string
  description: string
  image: string
}): string {
  const { url, title, description, image } = opts
  const t = escapeHtml(title)
  const d = escapeHtml(description)
  const u = escapeHtml(url)
  const i = escapeHtml(image)
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>${t}</title>
    <meta name="description" content="${d}" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${u}" />
    <meta property="og:site_name" content="m5nita" />
    <meta property="og:image" content="${i}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="${i}" />
    <meta http-equiv="refresh" content="0; url=${u}" />
  </head>
  <body>
    <p>Redirecionando para <a href="${u}">${u}</a>...</p>
  </body>
</html>`
}

function poolDescription(opts: {
  competitionName: string
  entryFee: number
  memberCount: number
  prizeTotal: number
}): string {
  const parts = [
    opts.competitionName,
    `Entrada ${formatBRL(opts.entryFee)}`,
    `${opts.memberCount} ${opts.memberCount === 1 ? 'jogador' : 'jogadores'}`,
    `Prêmio ${formatBRL(opts.prizeTotal)}`,
  ]
  return parts.join(' · ')
}

function getPublicUrl(c: { req: { url: string } }): string {
  return process.env.PUBLIC_WEB_URL || new URL(c.req.url).origin
}

const FALLBACK_IMAGE_PATH = '/og-image.png'
const FALLBACK_TITLE = 'm5nita — Monte seu bolão'
const FALLBACK_DESCRIPTION = 'Palpites, ranking e prêmio. Simples assim!'

function fallbackHtml(url: string): string {
  return renderHtml({
    url,
    title: FALLBACK_TITLE,
    description: FALLBACK_DESCRIPTION,
    image: `${new URL(url).origin}${FALLBACK_IMAGE_PATH}`,
  })
}

ogRoutes.get('/og/pool/:poolId', async (c) => {
  const { poolId } = c.req.param()
  const webOrigin = getPublicUrl(c)
  const targetUrl = `${webOrigin}/pools/${poolId}/predictions`

  try {
    const row = await db
      .select({
        id: poolTable.id,
        name: poolTable.name,
        entryFee: poolTable.entryFee,
        competitionName: competitionTable.name,
      })
      .from(poolTable)
      .innerJoin(competitionTable, eq(competitionTable.id, poolTable.competitionId))
      .where(eq(poolTable.id, poolId))
      .limit(1)

    const data = row[0]
    if (!data) {
      return c.html(fallbackHtml(targetUrl))
    }

    const [memberCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(poolMember)
      .where(eq(poolMember.poolId, poolId))

    const memberCount = memberCountRow?.count ?? 0
    const prizeTotal = Math.floor(data.entryFee * memberCount * 0.9)

    return c.html(
      renderHtml({
        url: targetUrl,
        title: `${data.name} — m5nita`,
        description: poolDescription({
          competitionName: data.competitionName,
          entryFee: data.entryFee,
          memberCount,
          prizeTotal,
        }),
        image: `${webOrigin}${FALLBACK_IMAGE_PATH}`,
      }),
    )
  } catch {
    return c.html(fallbackHtml(targetUrl))
  }
})

ogRoutes.get('/og/invite/:inviteCode', async (c) => {
  const { inviteCode } = c.req.param()
  const webOrigin = getPublicUrl(c)
  const targetUrl = `${webOrigin}/invite/${inviteCode}`

  try {
    const data = await getPoolByInviteCode(inviteCode)
    if (!data) {
      return c.html(fallbackHtml(targetUrl))
    }
    return c.html(
      renderHtml({
        url: targetUrl,
        title: `${data.name} — m5nita`,
        description: poolDescription({
          competitionName: data.competitionName,
          entryFee: data.entryFee,
          memberCount: data.memberCount,
          prizeTotal: data.prizeTotal,
        }),
        image: `${webOrigin}${FALLBACK_IMAGE_PATH}`,
      }),
    )
  } catch {
    return c.html(fallbackHtml(targetUrl))
  }
})

export { ogRoutes }
