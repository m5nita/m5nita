import { formatBrl } from '@m5nita/shared'
import type { ClosePoolResult } from '../application/pool/ClosePoolUseCase'

export type PoolCloseArgs =
  | { error: string; code?: undefined; force?: undefined }
  | { error?: undefined; code: string; force: boolean }

/**
 * `/bolao_encerrar CODIGO [confirmar]`. Pure so it can be tested without
 * driving grammY — the handler is only a shell around this and the renderer.
 */
export function parsePoolCloseArgs(raw: string): PoolCloseArgs {
  const args = raw.split(/\s+/).filter(Boolean)
  const code = args[0]
  if (!code) {
    return { error: 'Uso: /bolao_encerrar CODIGO [confirmar]' }
  }

  const second = args[1]
  if (second !== undefined && second.toLowerCase() !== 'confirmar') {
    return { error: 'Segundo argumento inválido. Use: /bolao_encerrar CODIGO confirmar' }
  }

  return { code: code.toUpperCase(), force: second !== undefined }
}

export function renderPoolCloseResult(result: ClosePoolResult, code: string): string {
  if (result.outcome === 'not-found') {
    return `Nenhum bolão com o código ${code}.`
  }

  if (result.outcome === 'not-active') {
    return `Bolão "${result.poolName}" não está ativo (status: ${result.status}). Nada a fazer.`
  }

  if (result.outcome === 'blocked') {
    return [
      `❌ Não encerrado — ${result.blocking.length} jogo(s) em aberto:`,
      ...result.blocking.map((m) => `• ${m.label} (${m.live ? 'em andamento' : 'agendado'})`),
      '',
      'Para encerrar mesmo assim:',
      `/bolao_encerrar ${code} confirmar`,
    ].join('\n')
  }

  const header =
    result.blocking.length > 0
      ? `⚠️ Bolão "${result.poolName}" encerrado com ${result.blocking.length} jogo(s) ainda em aberto:\n${result.blocking
          .map((m) => `• ${m.label} (${m.live ? 'em andamento' : 'agendado'})`)
          .join('\n')}`
      : `Bolão "${result.poolName}" encerrado.`

  const lines = [header, '', `Jogos pendentes ignorados: ${result.stranded.length}`]

  if (result.winners.length === 0) {
    lines.push('Ninguém pontuou — sem vencedor e sem prêmio a pagar.')
    return lines.join('\n')
  }

  if (result.winners.length === 1) {
    const winner = result.winners[0]
    lines.push(
      `Vencedor: ${winner?.name ?? 'sem nome'} — ${winner?.totalPoints} pts — ${formatBrl(result.prizeShare)}`,
    )
  } else {
    lines.push(`Vencedores (${result.winners.length}) — ${formatBrl(result.prizeShare)} cada:`)
    lines.push(...result.winners.map((w) => `• ${w.name ?? 'sem nome'} — ${w.totalPoints} pts`))
  }

  lines.push('Notificação enviada.')
  return lines.join('\n')
}
