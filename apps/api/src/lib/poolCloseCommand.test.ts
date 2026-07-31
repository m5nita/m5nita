import { formatBrl } from '@m5nita/shared'
import { describe, expect, it } from 'vitest'
import type { ClosePoolResult } from '../application/pool/ClosePoolUseCase'
import { parsePoolCloseArgs, renderPoolCloseResult } from './poolCloseCommand'

describe('parsePoolCloseArgs', () => {
  it('reads the code and defaults to not forcing', () => {
    expect(parsePoolCloseArgs('9VZJQ9J9')).toEqual({ code: '9VZJQ9J9', force: false })
  })

  it('uppercases the code', () => {
    expect(parsePoolCloseArgs('9vzjq9j9')).toEqual({ code: '9VZJQ9J9', force: false })
  })

  it('forces when the second argument is confirmar', () => {
    expect(parsePoolCloseArgs('9VZJQ9J9 confirmar')).toEqual({ code: '9VZJQ9J9', force: true })
  })

  it('tolerates extra whitespace', () => {
    expect(parsePoolCloseArgs('  9VZJQ9J9   confirmar ')).toEqual({
      code: '9VZJQ9J9',
      force: true,
    })
  })

  it('returns the usage line when no code is given', () => {
    expect(parsePoolCloseArgs('').error).toBe('Uso: /bolao_encerrar CODIGO [confirmar]')
  })

  it('rejects an unrecognised second argument instead of silently forcing', () => {
    const parsed = parsePoolCloseArgs('9VZJQ9J9 sim')
    expect(parsed.error).toContain('confirmar')
    expect(parsed.code).toBeUndefined()
  })
})

describe('renderPoolCloseResult', () => {
  const closed: ClosePoolResult = {
    outcome: 'closed',
    poolName: 'Rafinha é careca!',
    stranded: [
      { id: 'm1', label: 'São Paulo FC × Santos FC', status: 'postponed' },
      { id: 'm2', label: 'Botafogo FR × Grêmio FBPA', status: 'postponed' },
    ],
    blocking: [],
    predicted: [],
    winners: [{ userId: 'u1', name: 'Igor Túllio', totalPoints: 22 }],
    prizeShare: 285,
  }

  it('reports the close, the ignored matches and the winner', () => {
    const text = renderPoolCloseResult(closed, '9VZJQ9J9')
    expect(text).toContain('Rafinha é careca!')
    expect(text).toContain('Jogos pendentes ignorados: 2')
    expect(text).toContain('Igor Túllio')
    expect(text).toContain('22 pts')
    // formatBrl emits a non-breaking space; never assert on a literal 'R$ 2,85'.
    expect(text).toContain(formatBrl(285))
    expect(text).toContain('Notificação enviada.')
  })

  it('lists the blocking matches, names the pool and shows the confirmar form when refused', () => {
    const text = renderPoolCloseResult(
      {
        outcome: 'blocked',
        poolName: 'Rafinha é careca!',
        blocking: [
          { id: 'm3', label: 'CR Flamengo × CR Vasco da Gama', live: false },
          { id: 'm4', label: 'SE Palmeiras × São Paulo FC', live: true },
        ],
        predicted: [],
      },
      '9VZJQ9J9',
    )
    expect(text).toContain('Rafinha é careca!')
    expect(text).toContain('2 jogo(s) em aberto')
    expect(text).toContain('• CR Flamengo × CR Vasco da Gama (agendado)')
    expect(text).toContain('• SE Palmeiras × São Paulo FC (em andamento)')
    // The command sits directly under its instruction, no blank line between.
    expect(text).toContain('Para encerrar mesmo assim:\n/bolao_encerrar 9VZJQ9J9 confirmar')
  })

  it('lists stranded matches that already have predictions, distinct from blocking matches', () => {
    const text = renderPoolCloseResult(
      {
        outcome: 'blocked',
        poolName: 'Rafinha é careca!',
        blocking: [{ id: 'm3', label: 'CR Flamengo × CR Vasco da Gama', live: false }],
        predicted: [{ id: 'm5', label: 'São Paulo FC × Santos FC', predictionCount: 2 }],
      },
      '9VZJQ9J9',
    )
    expect(text).toContain('Rafinha é careca!')
    // Two distinct reasons must be readable apart from one another.
    expect(text).toContain('1 jogo(s) em aberto')
    expect(text).toContain('• CR Flamengo × CR Vasco da Gama (agendado)')
    expect(text).toContain('já têm palpite registrado')
    expect(text).toContain('• São Paulo FC × Santos FC (2 palpite(s))')
    // The command sits directly under its instruction, no blank line between.
    expect(text).toContain('Para encerrar mesmo assim:\n/bolao_encerrar 9VZJQ9J9 confirmar')
  })

  it('refuses on a predicted stranded match alone, with no blocking match at all', () => {
    const text = renderPoolCloseResult(
      {
        outcome: 'blocked',
        poolName: 'Rafinha é careca!',
        blocking: [],
        predicted: [{ id: 'm5', label: 'São Paulo FC × Santos FC', predictionCount: 1 }],
      },
      '9VZJQ9J9',
    )
    expect(text).toContain('Rafinha é careca!')
    expect(text).toContain('• São Paulo FC × Santos FC (1 palpite(s))')
    expect(text).not.toContain('0 jogo(s) em aberto')
    // The command sits directly under its instruction, no blank line between.
    expect(text).toContain('Para encerrar mesmo assim:\n/bolao_encerrar 9VZJQ9J9 confirmar')
  })

  it('flags a forced close that left matches open', () => {
    const text = renderPoolCloseResult(
      { ...closed, blocking: [{ id: 'm4', label: 'SE Palmeiras × São Paulo FC', live: true }] },
      '9VZJQ9J9',
    )
    expect(text).toContain('⚠️')
    expect(text).toContain('1 jogo(s) ainda em aberto')
  })

  it('flags a forced close that overrode a predicted stranded match', () => {
    const text = renderPoolCloseResult(
      {
        ...closed,
        predicted: [{ id: 'm5', label: 'São Paulo FC × Santos FC', predictionCount: 3 }],
      },
      '9VZJQ9J9',
    )
    expect(text).toContain('⚠️')
    expect(text).toContain('• São Paulo FC × Santos FC (3 palpite(s))')
  })

  it('names every tied winner and the per-winner share', () => {
    const text = renderPoolCloseResult(
      {
        ...closed,
        winners: [
          { userId: 'u1', name: 'Ana', totalPoints: 22 },
          { userId: 'u2', name: 'Bia', totalPoints: 22 },
        ],
        prizeShare: 142,
      },
      '9VZJQ9J9',
    )
    expect(text).toContain('Vencedores (2)')
    expect(text).toContain('Ana')
    expect(text).toContain('Bia')
    expect(text).toContain(formatBrl(142))
  })

  it('says so when nobody scored', () => {
    const text = renderPoolCloseResult({ ...closed, winners: [], prizeShare: 0 }, '9VZJQ9J9')
    expect(text).toContain('Ninguém pontuou')
    expect(text).not.toContain('Notificação enviada.')
  })

  it('reports an unknown code', () => {
    expect(renderPoolCloseResult({ outcome: 'not-found' }, 'NOPE1234')).toContain('NOPE1234')
  })

  it('reports a pool that is not active', () => {
    const text = renderPoolCloseResult(
      { outcome: 'not-active', poolName: 'Rafinha é careca!', status: 'closed' },
      '9VZJQ9J9',
    )
    expect(text).toContain('closed')
    expect(text).toContain('Rafinha é careca!')
  })
})
