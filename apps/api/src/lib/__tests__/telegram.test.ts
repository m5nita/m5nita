import { afterEach, describe, expect, it, vi } from 'vitest'
import { isAdmin } from '../admin'

describe('isAdmin', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns_true_forAdminUser', () => {
    vi.stubEnv('ADMIN_USER_IDS', '123456789,987654321')
    expect(isAdmin(123456789)).toBe(true)
    expect(isAdmin(987654321)).toBe(true)
  })

  it('returns_false_forNonAdminUser', () => {
    vi.stubEnv('ADMIN_USER_IDS', '123456789')
    expect(isAdmin(999999999)).toBe(false)
  })

  it('returns_false_whenEnvEmpty', () => {
    vi.stubEnv('ADMIN_USER_IDS', '')
    expect(isAdmin(123456789)).toBe(false)
  })

  it('returns_false_whenEnvUndefined', () => {
    delete process.env.ADMIN_USER_IDS
    expect(isAdmin(123456789)).toBe(false)
  })

  it('handles_spacesInEnvVar', () => {
    vi.stubEnv('ADMIN_USER_IDS', ' 123456789 , 987654321 ')
    expect(isAdmin(123456789)).toBe(true)
    expect(isAdmin(987654321)).toBe(true)
  })
})
