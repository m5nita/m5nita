import { describe, expect, it } from 'vitest'
import { isKnockout } from './MatchStage'

describe('isKnockout', () => {
  it.each([
    'round-of-32',
    'round-of-16',
    'quarter',
    'semi',
    'third-place',
    'final',
  ])('treats %s as knockout', (stage) => {
    expect(isKnockout(stage)).toBe(true)
  })

  it.each(['group', 'league'])('treats %s as non-knockout', (stage) => {
    expect(isKnockout(stage)).toBe(false)
  })
})
