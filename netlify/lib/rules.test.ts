import { describe, expect, it } from 'vitest'
import type { Product } from '../../shared/types'
import { applyCheck, isDue, needsConfirmation, shouldNotify } from './rules'

const HOUR = 3600_000

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  url: 'https://x.it/p',
  title: 'Thing',
  rule: { type: 'drop' },
  intervalHours: 6,
  addedPrice: 100,
  lastPrice: 100,
  lowestPrice: 100,
  history: [{ t: 0, p: 100 }],
  lastCheckedAt: 0,
  createdAt: 0,
  ...overrides,
})

describe('shouldNotify: any drop', () => {
  it('alerts only when the price goes down', () => {
    expect(shouldNotify(product(), 99)).toBe(true)
    expect(shouldNotify(product(), 100)).toBe(false)
    expect(shouldNotify(product(), 120)).toBe(false)
  })
})

describe('shouldNotify: below cap', () => {
  const capped = (o: Partial<Product> = {}) => product({ rule: { type: 'below', cap: 80 }, ...o })

  it('does not alert above the cap', () => {
    expect(shouldNotify(capped(), 85)).toBe(false)
  })

  it('alerts when crossing the cap, including exactly at the cap', () => {
    expect(shouldNotify(capped(), 80)).toBe(true)
    expect(shouldNotify(capped(), 70)).toBe(true)
  })

  it('does not repeat the alert at the same price, but does on further drops', () => {
    const p = applyCheck(capped(), 75, HOUR, true)
    expect(p.lastNotifiedPrice).toBe(75)
    expect(shouldNotify(p, 75)).toBe(false)
    expect(shouldNotify(p, 78)).toBe(false)
    expect(shouldNotify(p, 70)).toBe(true)
  })

  it('re-arms after the price goes back above the cap', () => {
    let p = applyCheck(capped(), 75, HOUR, true)
    p = applyCheck(p, 90, 2 * HOUR, false)
    expect(p.lastNotifiedPrice).toBeUndefined()
    expect(shouldNotify(p, 79)).toBe(true)
  })
})

describe('applyCheck', () => {
  it('tracks lowest price, clears errors and only stores changed points', () => {
    let p = product({ lastError: 'boom' })
    p = applyCheck(p, 100, HOUR, false)
    expect(p.history).toHaveLength(1)
    p = applyCheck(p, 90, 2 * HOUR, true)
    p = applyCheck(p, 95, 3 * HOUR, false)
    expect(p.history.map((h) => h.p)).toEqual([100, 90, 95])
    expect(p.lowestPrice).toBe(90)
    expect(p.lastPrice).toBe(95)
    expect(p.lastError).toBeUndefined()
  })

  it('keeps at most 60 points', () => {
    let p = product()
    for (let i = 1; i <= 80; i++) p = applyCheck(p, 100 + i, i * HOUR, false)
    expect(p.history).toHaveLength(60)
  })
})

describe('needsConfirmation', () => {
  it('holds back jumps over 70% until a second check sees the same price', () => {
    const p = product({ lastPrice: 100 })
    expect(needsConfirmation(p, 60)).toBe(false)
    expect(needsConfirmation(p, 20)).toBe(true)
    expect(needsConfirmation(p, 500)).toBe(true)
    expect(needsConfirmation({ ...p, pendingPrice: 20 }, 20)).toBe(false)
    expect(applyCheck({ ...p, pendingPrice: 20 }, 20, HOUR, true).pendingPrice).toBeUndefined()
  })
})

describe('isDue', () => {
  it('respects the interval with a little slack for the hourly cron', () => {
    const p = product({ lastCheckedAt: 0, intervalHours: 6 })
    expect(isDue(p, 5 * HOUR)).toBe(false)
    expect(isDue(p, 6 * HOUR - 2 * 60_000)).toBe(true)
  })
})
