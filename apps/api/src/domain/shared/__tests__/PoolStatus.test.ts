import { describe, expect, it } from 'vitest'
import { PoolStatus } from '../PoolStatus'

describe('PoolStatus', () => {
  describe('static instances', () => {
    it('Pending has value "pending"', () => {
      expect(PoolStatus.Pending.value).toBe('pending')
    })

    it('Active has value "active"', () => {
      expect(PoolStatus.Active.value).toBe('active')
    })

    it('Closed has value "closed"', () => {
      expect(PoolStatus.Closed.value).toBe('closed')
    })

    it('Cancelled has value "cancelled"', () => {
      expect(PoolStatus.Cancelled.value).toBe('cancelled')
    })
  })

  describe('from()', () => {
    it('returns Pending for "pending"', () => {
      expect(PoolStatus.from('pending')).toBe(PoolStatus.Pending)
    })

    it('returns Active for "active"', () => {
      expect(PoolStatus.from('active')).toBe(PoolStatus.Active)
    })

    it('returns Closed for "closed"', () => {
      expect(PoolStatus.from('closed')).toBe(PoolStatus.Closed)
    })

    it('returns Cancelled for "cancelled"', () => {
      expect(PoolStatus.from('cancelled')).toBe(PoolStatus.Cancelled)
    })

    it('throws for invalid value', () => {
      expect(() => PoolStatus.from('invalid')).toThrow('Invalid pool status: invalid')
    })
  })

  describe('canClose()', () => {
    it('returns true for active', () => {
      expect(PoolStatus.Active.canClose()).toBe(true)
    })

    it('returns false for pending', () => {
      expect(PoolStatus.Pending.canClose()).toBe(false)
    })

    it('returns false for closed', () => {
      expect(PoolStatus.Closed.canClose()).toBe(false)
    })

    it('returns false for cancelled', () => {
      expect(PoolStatus.Cancelled.canClose()).toBe(false)
    })
  })

  describe('canCancel()', () => {
    it('returns true for active', () => {
      expect(PoolStatus.Active.canCancel()).toBe(true)
    })

    it('returns true for pending', () => {
      expect(PoolStatus.Pending.canCancel()).toBe(true)
    })

    it('returns false for closed', () => {
      expect(PoolStatus.Closed.canCancel()).toBe(false)
    })

    it('returns false for cancelled', () => {
      expect(PoolStatus.Cancelled.canCancel()).toBe(false)
    })
  })

  describe('canJoin()', () => {
    it('returns true for active', () => {
      expect(PoolStatus.Active.canJoin()).toBe(true)
    })

    it('returns false for pending', () => {
      expect(PoolStatus.Pending.canJoin()).toBe(false)
    })

    it('returns false for closed', () => {
      expect(PoolStatus.Closed.canJoin()).toBe(false)
    })

    it('returns false for cancelled', () => {
      expect(PoolStatus.Cancelled.canJoin()).toBe(false)
    })
  })

  describe('canAcceptPredictions()', () => {
    it('returns true for active', () => {
      expect(PoolStatus.Active.canAcceptPredictions()).toBe(true)
    })

    it('returns true for pending', () => {
      expect(PoolStatus.Pending.canAcceptPredictions()).toBe(true)
    })

    it('returns false for closed', () => {
      expect(PoolStatus.Closed.canAcceptPredictions()).toBe(false)
    })

    it('returns true for cancelled', () => {
      expect(PoolStatus.Cancelled.canAcceptPredictions()).toBe(true)
    })
  })
})
