import { eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../../../db/client'
import { user as userTable } from '../../../db/schema/auth'
import { competition as competitionTable } from '../../../db/schema/competition'
import { match as matchTable } from '../../../db/schema/match'
import { pool as poolTable } from '../../../db/schema/pool'
import { poolMember } from '../../../db/schema/poolMember'
import { renderPoolOgPng } from '../../../lib/ogImage'
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

const FALLBACK_TITLE = 'm5nita — Crie um bolão com amigos e ganhe em Pix'
const FALLBACK_DESCRIPTION =
  'Monte seu bolão da Copa, Brasileirão e mais em 1 minuto. Convide amigos, faça palpites a cada rodada, suba no ranking e receba o prêmio direto via Pix.'

function renderHtml(opts: {
  url: string
  title: string
  description: string
  image: string
  imageAlt: string
}): string {
  const { url, title, description, image, imageAlt } = opts
  const t = escapeHtml(title)
  const d = escapeHtml(description)
  const u = escapeHtml(url)
  const i = escapeHtml(image)
  const a = escapeHtml(imageAlt)
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>${t}</title>
    <meta name="description" content="${d}" />
    <meta name="theme-color" content="#1a1613" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${u}" />
    <meta property="og:site_name" content="m5nita" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:image" content="${i}" />
    <meta property="og:image:secure_url" content="${i}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${a}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="${i}" />
    <meta name="twitter:image:alt" content="${a}" />
    <meta http-equiv="refresh" content="0; url=${u}" />
  </head>
  <body>
    <p>Redirecionando para <a href="${u}">${u}</a>...</p>
  </body>
</html>`
}

function poolDescription(opts: {
  poolName: string
  competitionName: string
  entryFeeCentavos: number
  memberCount: number
  prizeCentavos: number
  ownerName?: string | null
}): string {
  const participantLabel = opts.memberCount === 1 ? 'participante' : 'participantes'
  const author = opts.ownerName ? ` criado por ${opts.ownerName}` : ''
  return (
    `Participe do bolão "${opts.poolName}"${author} do ${opts.competitionName}: ` +
    `entrada de ${formatBRL(opts.entryFeeCentavos)}, possui ${opts.memberCount} ` +
    `${participantLabel} e o prêmio acumulado já está em ${formatBRL(opts.prizeCentavos)}.`
  )
}

function poolTitle(poolName: string): string {
  return `${poolName} · Bolão m5nita`
}

function getPublicUrl(c: { req: { url: string } }): string {
  return process.env.PUBLIC_WEB_URL || new URL(c.req.url).origin
}

function fallbackHtml(opts: { url: string; webOrigin: string; imagePath: string }): string {
  return renderHtml({
    url: opts.url,
    title: FALLBACK_TITLE,
    description: FALLBACK_DESCRIPTION,
    image: `${opts.webOrigin}${opts.imagePath}`,
    imageAlt: 'm5nita — Monte seu bolão com amigos',
  })
}

async function loadPoolForOg(poolId: string) {
  const row = await db
    .select({
      id: poolTable.id,
      name: poolTable.name,
      entryFee: poolTable.entryFee,
      matchId: poolTable.matchId,
      ownerName: userTable.name,
      competitionName: competitionTable.name,
    })
    .from(poolTable)
    .innerJoin(competitionTable, eq(competitionTable.id, poolTable.competitionId))
    .innerJoin(userTable, eq(userTable.id, poolTable.ownerId))
    .where(eq(poolTable.id, poolId))
    .limit(1)

  const data = row[0]
  if (!data) return null

  const [memberCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(poolMember)
    .where(eq(poolMember.poolId, poolId))

  const memberCount = memberCountRow?.count ?? 0
  const prizeTotal = Math.floor(data.entryFee * memberCount * 0.95)

  let singleMatch: {
    homeTeam: string
    awayTeam: string
    kickoffAt: Date
    stageLabel: string | null
  } | null = null
  if (data.matchId) {
    const [m] = await db
      .select({
        homeTeam: matchTable.homeTeam,
        awayTeam: matchTable.awayTeam,
        matchDate: matchTable.matchDate,
        stage: matchTable.stage,
        matchday: matchTable.matchday,
      })
      .from(matchTable)
      .where(eq(matchTable.id, data.matchId))
      .limit(1)
    if (m) {
      singleMatch = {
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        kickoffAt: m.matchDate,
        stageLabel: m.matchday != null ? `Rodada ${m.matchday}` : (m.stage ?? null),
      }
    }
  }

  return { ...data, memberCount, prizeTotal, singleMatch }
}

// HTML preview routes -------------------------------------------------------

ogRoutes.get('/og/pool/:poolId', async (c) => {
  const { poolId } = c.req.param()
  const webOrigin = getPublicUrl(c)
  const targetUrl = `${webOrigin}/pools/${poolId}/predictions`

  try {
    const data = await loadPoolForOg(poolId)
    if (!data) {
      return c.html(fallbackHtml({ url: targetUrl, webOrigin, imagePath: '/og-image.png' }))
    }
    return c.html(
      renderHtml({
        url: targetUrl,
        title: poolTitle(data.name),
        description: poolDescription({
          poolName: data.name,
          competitionName: data.competitionName,
          entryFeeCentavos: data.entryFee,
          memberCount: data.memberCount,
          prizeCentavos: data.prizeTotal,
          ownerName: data.ownerName,
        }),
        image: `${webOrigin}/og/pool/${poolId}/image.png`,
        imageAlt: `Bolão "${data.name}" — ${data.competitionName} no m5nita`,
      }),
    )
  } catch {
    return c.html(fallbackHtml({ url: targetUrl, webOrigin, imagePath: '/og-image.png' }))
  }
})

ogRoutes.get('/og/invite/:inviteCode', async (c) => {
  const { inviteCode } = c.req.param()
  const webOrigin = getPublicUrl(c)
  const targetUrl = `${webOrigin}/invite/${inviteCode}`

  try {
    const data = await getPoolByInviteCode(inviteCode)
    if (!data) {
      return c.html(fallbackHtml({ url: targetUrl, webOrigin, imagePath: '/og-image.png' }))
    }
    return c.html(
      renderHtml({
        url: targetUrl,
        title: `Você foi convidado para "${data.name}" no m5nita`,
        description: poolDescription({
          poolName: data.name,
          competitionName: data.competitionName,
          entryFeeCentavos: data.entryFee,
          memberCount: data.memberCount,
          prizeCentavos: data.prizeTotal,
          ownerName: data.owner.name,
        }),
        image: `${webOrigin}/og/invite/${inviteCode}/image.png`,
        imageAlt: `Convite para "${data.name}" — ${data.competitionName} no m5nita`,
      }),
    )
  } catch {
    return c.html(fallbackHtml({ url: targetUrl, webOrigin, imagePath: '/og-image.png' }))
  }
})

// PNG image routes ----------------------------------------------------------

function pngResponse(buffer: Buffer): Response {
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300, s-maxage=86400, stale-while-revalidate=86400',
    },
  })
}

ogRoutes.get('/og/pool/:poolId/image.png', async (c) => {
  const { poolId } = c.req.param()
  try {
    const data = await loadPoolForOg(poolId)
    if (!data) return c.notFound()
    const png = await renderPoolOgPng({
      poolName: data.name,
      competitionName: data.competitionName,
      ownerName: data.ownerName,
      entryFeeCentavos: data.entryFee,
      memberCount: data.memberCount,
      prizeCentavos: data.prizeTotal,
      cta: 'Faça seus palpites · m5nita.com',
      singleMatch: data.singleMatch ?? undefined,
    })
    return pngResponse(png)
  } catch (err) {
    console.error('[OG image]', err)
    return c.notFound()
  }
})

ogRoutes.get('/og/invite/:inviteCode/image.png', async (c) => {
  const { inviteCode } = c.req.param()
  try {
    const data = await getPoolByInviteCode(inviteCode)
    if (!data) return c.notFound()
    const singleMatch = data.singleMatch
      ? {
          homeTeam: data.singleMatch.homeTeam,
          awayTeam: data.singleMatch.awayTeam,
          kickoffAt: new Date(data.singleMatch.kickoffAt),
          stageLabel:
            data.singleMatch.matchday != null
              ? `Rodada ${data.singleMatch.matchday}`
              : (data.singleMatch.stage ?? null),
        }
      : undefined
    const png = await renderPoolOgPng({
      poolName: data.name,
      competitionName: data.competitionName,
      ownerName: data.owner.name,
      entryFeeCentavos: data.entryFee,
      memberCount: data.memberCount,
      prizeCentavos: data.prizeTotal,
      cta: 'Entre no bolão · m5nita.com',
      singleMatch,
    })
    return pngResponse(png)
  } catch (err) {
    console.error('[OG image]', err)
    return c.notFound()
  }
})

export { ogRoutes }
