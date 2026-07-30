import { describe, expect, it, vi } from 'vitest'
import type { NotificationOverrides } from '../../domain/notification/NotificationPreferences'
import type { NotificationPreferencesRepository } from '../../domain/notification/NotificationPreferencesRepository.port'
import { NotificationType } from '../../domain/notification/NotificationType'
import { GetNotificationPreferencesUseCase } from './GetNotificationPreferencesUseCase'
import { UpdateNotificationPreferencesUseCase } from './UpdateNotificationPreferencesUseCase'

const CATALOG = [
  NotificationType.of({
    code: 'match_points',
    label: 'Pontos por jogo',
    description: 'Pontos ao fim de cada jogo.',
    optOutable: true,
    defaultEnabled: true,
    sortOrder: 3,
  }),
  NotificationType.of({
    code: 'new_pool',
    label: 'Novos bolões',
    description: 'Avisos de bolão novo.',
    optOutable: true,
    defaultEnabled: true,
    sortOrder: 1,
  }),
  NotificationType.of({
    code: 'pool_result',
    label: 'Prêmio disponível',
    description: 'Aviso de prêmio para saque.',
    optOutable: false,
    defaultEnabled: true,
    sortOrder: 4,
  }),
]

function makeRepo(overrides: NotificationOverrides = {}) {
  const stored: Record<string, boolean> = { ...overrides }
  return {
    listTypes: vi.fn(async () => CATALOG),
    findOverrides: vi.fn(async () => ({ ...stored })),
    findOverridesForUsers: vi.fn(async () => new Map()),
    upsert: vi.fn(async (_userId: string, code: string, enabled: boolean) => {
      stored[code] = enabled
    }),
  } satisfies NotificationPreferencesRepository
}

describe('GetNotificationPreferencesUseCase', () => {
  it('returns the full catalog in display order for a user who never chose', async () => {
    const useCase = new GetNotificationPreferencesUseCase(makeRepo())

    const result = await useCase.execute({ userId: 'u1' })

    expect(result.types.map((t) => t.code)).toEqual(['new_pool', 'match_points', 'pool_result'])
    expect(result.types.every((t) => t.enabled)).toBe(true)
  })

  it('applies the user’s stored choice', async () => {
    const useCase = new GetNotificationPreferencesUseCase(makeRepo({ new_pool: false }))

    const result = await useCase.execute({ userId: 'u1' })

    expect(result.types.find((t) => t.code === 'new_pool')?.enabled).toBe(false)
    expect(result.types.find((t) => t.code === 'match_points')?.enabled).toBe(true)
  })

  it('reports a locked type as enabled even with a stored disable', async () => {
    const useCase = new GetNotificationPreferencesUseCase(makeRepo({ pool_result: false }))

    const result = await useCase.execute({ userId: 'u1' })

    const locked = result.types.find((t) => t.code === 'pool_result')
    expect(locked).toMatchObject({ enabled: true, optOutable: false })
  })
})

describe('UpdateNotificationPreferencesUseCase', () => {
  it('stores the choice and returns the refreshed list', async () => {
    const repo = makeRepo()
    const useCase = new UpdateNotificationPreferencesUseCase(repo)

    const result = await useCase.execute({ userId: 'u1', code: 'new_pool', enabled: false })

    expect(repo.upsert).toHaveBeenCalledWith('u1', 'new_pool', false)
    expect(result.types.find((t) => t.code === 'new_pool')?.enabled).toBe(false)
  })

  it('leaves the other types untouched', async () => {
    const repo = makeRepo()
    const useCase = new UpdateNotificationPreferencesUseCase(repo)

    await useCase.execute({ userId: 'u1', code: 'new_pool', enabled: false })
    const result = await useCase.execute({ userId: 'u1', code: 'match_points', enabled: false })

    expect(repo.upsert).toHaveBeenCalledTimes(2)
    expect(result.types.find((t) => t.code === 'new_pool')?.enabled).toBe(false)
    expect(result.types.find((t) => t.code === 'match_points')?.enabled).toBe(false)
  })

  it('rejects a code the catalog does not know, without writing anything', async () => {
    const repo = makeRepo()
    const useCase = new UpdateNotificationPreferencesUseCase(repo)

    await expect(
      useCase.execute({ userId: 'u1', code: 'nope', enabled: false }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_TYPE' })
    expect(repo.upsert).not.toHaveBeenCalled()
  })

  it('refuses to disable a locked type, without writing anything', async () => {
    const repo = makeRepo()
    const useCase = new UpdateNotificationPreferencesUseCase(repo)

    await expect(
      useCase.execute({ userId: 'u1', code: 'pool_result', enabled: false }),
    ).rejects.toMatchObject({ code: 'TYPE_LOCKED' })
    expect(repo.upsert).not.toHaveBeenCalled()
  })

  it('accepts enabling a locked type as a harmless no-op', async () => {
    const repo = makeRepo()
    const useCase = new UpdateNotificationPreferencesUseCase(repo)

    const result = await useCase.execute({ userId: 'u1', code: 'pool_result', enabled: true })

    expect(repo.upsert).not.toHaveBeenCalled()
    expect(result.types.find((t) => t.code === 'pool_result')?.enabled).toBe(true)
  })

  it('is idempotent: toggling the same value twice keeps one upsert per call and the same state', async () => {
    const repo = makeRepo()
    const useCase = new UpdateNotificationPreferencesUseCase(repo)

    await useCase.execute({ userId: 'u1', code: 'new_pool', enabled: false })
    const result = await useCase.execute({ userId: 'u1', code: 'new_pool', enabled: false })

    expect(result.types.find((t) => t.code === 'new_pool')?.enabled).toBe(false)
  })
})
