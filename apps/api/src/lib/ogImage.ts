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
}

interface PoolOgImageInput {
  poolName: string
  competitionName: string
  ownerName?: string | null
  entryFeeCentavos: number
  memberCount: number
  prizeCentavos: number
  cta?: string
  /**
   * When the pool is scoped to a single match, this object carries the
   * matchup so the OG image can show the "Jogo único — TeamA vs TeamB"
   * banner per FR-010.
   */
  singleMatch?: {
    homeTeam: string
    awayTeam: string
    kickoffAt: Date
    stageLabel: string | null
  }
}

function formatKickoffPtBR(date: Date): string {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

function statCell(label: string, value: string, color: string = COLORS.dark): Element {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        padding: '32px 28px',
        backgroundColor: COLORS.cream,
        gap: 6,
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              fontFamily: 'BarlowCondensed',
              fontSize: 78,
              color,
              lineHeight: 1,
              letterSpacing: -1,
            },
            children: value,
          },
        },
        {
          type: 'div',
          props: {
            style: {
              fontFamily: 'Inter',
              fontWeight: 700,
              fontSize: 16,
              color: COLORS.muted,
              letterSpacing: 3,
              textTransform: 'uppercase',
            },
            children: label,
          },
        },
      ],
    },
  }
}

type Element = {
  type: string
  props: { style?: Record<string, unknown>; children?: unknown }
}

function fitTitleFontSize(name: string): number {
  const len = name.length
  if (len <= 14) return 132
  if (len <= 20) return 112
  if (len <= 28) return 92
  if (len <= 36) return 76
  return 64
}

function template(input: PoolOgImageInput): Element {
  const cta = (input.cta ?? 'Entre no bolão · m5nita.com').toUpperCase()
  const poolName = input.poolName.length > 48 ? `${input.poolName.slice(0, 47)}…` : input.poolName
  const titleFontSize = fitTitleFontSize(poolName)

  return {
    type: 'div',
    props: {
      style: {
        width: 1200,
        height: 630,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: COLORS.cream,
        fontFamily: 'Inter',
        color: COLORS.dark,
      },
      children: [
        // Top header bar
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '40px 60px 24px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          width: 56,
                          height: 56,
                          backgroundColor: COLORS.dark,
                          color: COLORS.cream,
                          fontFamily: 'BarlowCondensed',
                          fontSize: 46,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          lineHeight: 1,
                        },
                        children: 'M',
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontFamily: 'BarlowCondensed',
                          fontSize: 44,
                          letterSpacing: 1,
                        },
                        children: 'm5nita',
                      },
                    },
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontFamily: 'Inter',
                    fontWeight: 700,
                    fontSize: 18,
                    letterSpacing: 4,
                    color: COLORS.muted,
                    textTransform: 'uppercase',
                  },
                  children: 'Bolão · Palpites · Prêmio',
                },
              },
            ],
          },
        },

        // Hero
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              padding: '12px 60px 32px',
              gap: 10,
              flex: 1,
              overflow: 'hidden',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontFamily: 'Inter',
                    fontWeight: 700,
                    fontSize: 18,
                    letterSpacing: 4,
                    color: COLORS.red,
                    textTransform: 'uppercase',
                  },
                  children: input.competitionName,
                },
              },
              ...(input.singleMatch
                ? [
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          marginTop: 8,
                          fontFamily: 'Inter',
                          fontWeight: 700,
                          fontSize: 22,
                          color: COLORS.dark,
                        },
                        children: [
                          {
                            type: 'span',
                            props: {
                              style: {
                                backgroundColor: COLORS.dark,
                                color: COLORS.cream,
                                padding: '4px 10px',
                                fontSize: 16,
                                letterSpacing: 2,
                                textTransform: 'uppercase',
                              },
                              children: 'Jogo único',
                            },
                          },
                          `${input.singleMatch.homeTeam} × ${input.singleMatch.awayTeam}`,
                        ],
                      },
                    } as Element,
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontFamily: 'Inter',
                          fontSize: 16,
                          color: COLORS.muted,
                          marginTop: 2,
                        },
                        children: `${input.singleMatch.stageLabel ?? ''} · ${formatKickoffPtBR(
                          input.singleMatch.kickoffAt,
                        )}`,
                      },
                    } as Element,
                  ]
                : []),
              {
                type: 'div',
                props: {
                  style: {
                    fontFamily: 'BarlowCondensed',
                    fontSize: titleFontSize,
                    color: COLORS.dark,
                    lineHeight: 0.95,
                    letterSpacing: -2,
                    display: 'flex',
                  },
                  children: poolName,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginTop: 6,
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { width: 36, height: 4, backgroundColor: COLORS.red },
                        children: '',
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontFamily: 'Inter',
                          fontSize: 22,
                          color: COLORS.dark,
                          fontWeight: 400,
                        },
                        children: input.ownerName
                          ? `Criado por ${input.ownerName}`
                          : 'Convite m5nita',
                      },
                    },
                  ],
                },
              },
            ],
          },
        },

        // Stats row
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              gap: 1,
              backgroundColor: COLORS.border,
              borderTop: `1px solid ${COLORS.border}`,
              borderBottom: `1px solid ${COLORS.border}`,
            },
            children: [
              statCell('Jogadores', String(input.memberCount)),
              statCell('Entrada', formatBrl(input.entryFeeCentavos)),
              statCell('Prêmio', formatBrl(input.prizeCentavos), COLORS.green),
            ],
          },
        },

        // CTA footer
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: COLORS.dark,
              color: COLORS.cream,
              padding: '22px 60px',
              fontFamily: 'Inter',
              fontWeight: 700,
              fontSize: 22,
              letterSpacing: 6,
              textTransform: 'uppercase',
            },
            children: cta,
          },
        },
      ],
    },
  }
}

export async function renderPoolOgPng(input: PoolOgImageInput): Promise<Buffer> {
  const svg = await satori(template(input) as unknown as Parameters<typeof satori>[0], {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Inter', data: fontInter, weight: 400, style: 'normal' },
      { name: 'Inter', data: fontInterBold, weight: 700, style: 'normal' },
      { name: 'BarlowCondensed', data: fontBarlow, weight: 900, style: 'normal' },
    ],
  })
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng()
  return Buffer.from(png)
}
