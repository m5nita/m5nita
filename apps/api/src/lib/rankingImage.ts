import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatBrl } from '@m5nita/shared'
import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'

const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../assets/fonts')
const fontInter = readFileSync(join(FONTS_DIR, 'Inter-Regular.ttf'))
const fontInterBold = readFileSync(join(FONTS_DIR, 'Inter-Bold.ttf'))
const fontBarlow = readFileSync(join(FONTS_DIR, 'BarlowCondensed-Black.ttf'))

const COLORS = {
  cream: '#f5f0e8',
  dark: '#1a1613',
  red: '#ef4444',
  green: '#22a06b',
  border: '#e5dfd2',
  muted: '#8a8079',
  rowTint: '#efe7d8',
}

const WIDTH = 1080
const HEADER_H = 300
const ROW_H = 96
const FOOTER_H = 120
const BASE_H = 1350

type Element = { type: string; props: { style?: Record<string, unknown>; children?: unknown } }

export interface RankingImageRow {
  position: number
  name: string
  points: number
  isViewer: boolean
}

export interface RankingImageInput {
  poolName: string
  competitionName: string
  prizeCentavos: number
  rows: RankingImageRow[]
}

export function rankingImageDimensions(memberCount: number): { width: number; height: number } {
  const needed = HEADER_H + memberCount * ROW_H + FOOTER_H
  return { width: WIDTH, height: Math.max(BASE_H, needed) }
}

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

function rankingRow(row: RankingImageRow): Element {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        height: ROW_H,
        padding: '0 56px',
        borderBottom: `1px solid ${COLORS.border}`,
        backgroundColor: row.isViewer ? COLORS.rowTint : COLORS.cream,
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              fontFamily: 'BarlowCondensed',
              fontSize: 52,
              width: 96,
              color: row.position === 1 ? COLORS.red : COLORS.dark,
            },
            children: `${MEDALS[row.position] ?? ''} ${row.position}`,
          },
        },
        {
          type: 'div',
          props: {
            style: {
              flex: 1,
              fontFamily: 'BarlowCondensed',
              fontSize: 46,
              color: COLORS.dark,
              textTransform: 'uppercase',
              overflow: 'hidden',
            },
            children: row.isViewer ? `${row.name} (você)` : row.name,
          },
        },
        {
          type: 'div',
          props: {
            style: { fontFamily: 'BarlowCondensed', fontSize: 52, color: COLORS.dark },
            children: `${row.points} pts`,
          },
        },
      ],
    },
  }
}

function template(input: RankingImageInput, height: number): Element {
  return {
    type: 'div',
    props: {
      style: {
        width: WIDTH,
        height,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: COLORS.cream,
        fontFamily: 'Inter',
      },
      children: [
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', padding: '64px 56px 24px', gap: 8 },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontFamily: 'Inter',
                    fontWeight: 700,
                    fontSize: 24,
                    letterSpacing: 5,
                    color: COLORS.red,
                    textTransform: 'uppercase',
                  },
                  children: `Ranking · ${input.competitionName}`,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontFamily: 'BarlowCondensed',
                    fontSize: 96,
                    lineHeight: 0.95,
                    letterSpacing: -2,
                    color: COLORS.dark,
                    display: 'flex',
                  },
                  children:
                    input.poolName.length > 26 ? `${input.poolName.slice(0, 25)}…` : input.poolName,
                },
              },
              {
                type: 'div',
                props: {
                  style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { width: 44, height: 5, backgroundColor: COLORS.red },
                        children: '',
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontFamily: 'Inter',
                          fontWeight: 700,
                          fontSize: 26,
                          color: COLORS.green,
                        },
                        children: `Prêmio ${formatBrl(input.prizeCentavos)}`,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              borderTop: `2px solid ${COLORS.dark}`,
            },
            children: input.rows.map(rankingRow),
          },
        },
        {
          type: 'div',
          props: {
            style: {
              marginTop: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: COLORS.dark,
              color: COLORS.cream,
              padding: '28px',
              fontFamily: 'Inter',
              fontWeight: 700,
              fontSize: 26,
              letterSpacing: 6,
              textTransform: 'uppercase',
            },
            children: 'Monte o seu · m5nita.com',
          },
        },
      ],
    },
  }
}

export async function renderRankingOgPng(input: RankingImageInput): Promise<Buffer> {
  const { width, height } = rankingImageDimensions(input.rows.length)
  const svg = await satori(template(input, height) as unknown as Parameters<typeof satori>[0], {
    width,
    height,
    fonts: [
      { name: 'Inter', data: fontInter, weight: 400, style: 'normal' },
      { name: 'Inter', data: fontInterBold, weight: 700, style: 'normal' },
      { name: 'BarlowCondensed', data: fontBarlow, weight: 900, style: 'normal' },
    ],
  })
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng()
  return Buffer.from(png)
}
