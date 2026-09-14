import { describe, expect, it } from 'vitest'
import type { Product } from '../../shared/types'
import { applyOutcome, BROWSER_BLOCKED_MESSAGE } from './outcome'
import { needsBrowserCheck } from './rules'

const HOUR = 3600_000
const NOW = 100 * HOUR

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  url: 'https://www.zara.com/it/it/camicia-p01030731.html',
  title: 'Camicia',
  rule: { type: 'drop' },
  intervalHours: 6,
  addedPrice: 50,
  lastPrice: 50,
  lowestPrice: 50,
  history: [{ t: 0, p: 50 }],
  lastCheckedAt: NOW - 7 * HOUR,
  createdAt: 0,
  currency: 'EUR',
  ...overrides,
})

const pending = (overrides: Partial<Product> = {}) =>
  product({ addedPrice: 0, lastPrice: 0, lowestPrice: 0, history: [], lastCheckedAt: 0, route: 'browser', pending: true, ...overrides })

const blocked = { ok: false as const, blocked: true, message: 'Questo negozio blocca i controlli automatici dei prezzi' }

describe('applyOutcome: Netlify fetch', () => {
  it('moves a blocked product to the browser worker without marking it failed', () => {
    const { product: next, escalated, push } = applyOutcome(product(), blocked, 'fetch', NOW, true)
    expect(escalated).toBe(true)
    expect(push).toBeUndefined()
    expect(next).toMatchObject({ route: 'browser', lastError: undefined, lastCheckedAt: NOW - 7 * HOUR })
    expect(needsBrowserCheck(next, NOW)).toBe(true)
  })

  it('reports the block when no browser worker is configured', () => {
    const { product: next, escalated } = applyOutcome(product(), blocked, 'fetch', NOW, false)
    expect(escalated).toBeUndefined()
    expect(next.route).toBeUndefined()
    expect(next).toMatchObject({ lastError: blocked.message, lastCheckedAt: NOW })
  })

  it('alerts on a drop and keeps a newly found locator', () => {
    const { product: next, push } = applyOutcome(product(), { ok: true, price: 39.95, locator: 'css:.price' }, 'fetch', NOW, true)
    expect(next).toMatchObject({ lastPrice: 39.95, lowestPrice: 39.95, locator: 'css:.price', lastError: undefined })
    expect(push?.title).toContain('39,95')
  })
})

describe('applyOutcome: browser worker', () => {
  it('fills in the first price of a pending product and announces it', () => {
    const { product: next, push } = applyOutcome(
      pending({ rule: { type: 'below', cap: 30 } }),
      { ok: true, price: 39.95, currency: 'EUR', title: 'CAMICIA BOXY FIT', image: 'https://img/1.jpg' },
      'browser',
      NOW,
      true,
    )
    expect(next).toMatchObject({
      title: 'CAMICIA BOXY FIT',
      image: 'https://img/1.jpg',
      addedPrice: 39.95,
      lastPrice: 39.95,
      lowestPrice: 39.95,
      lastCheckedAt: NOW,
      history: [{ t: NOW, p: 39.95 }],
    })
    expect(next.pending).toBeUndefined()
    expect(next.lastNotifiedPrice).toBeUndefined()
    expect(push?.title).toMatch(/^Lo seguo a 39,95\s€$/)
    expect(push?.body).toMatch(/avviso sotto 30\s€/)
    expect(needsBrowserCheck(next, NOW)).toBe(false)
  })

  it('says so when the first price is already below the target, without a second alert later', () => {
    const { product: next, push } = applyOutcome(pending({ rule: { type: 'below', cap: 45 } }), { ok: true, price: 39.95 }, 'browser', NOW, true)
    expect(push?.title).toContain('Già sotto il tuo obiettivo')
    expect(next.lastNotifiedPrice).toBe(39.95)
  })

  it('gives up on shops that block even the browser twice in a row, and tells the user once', () => {
    const first = applyOutcome(pending(), blocked, 'browser', NOW, true)
    expect(first.product).toMatchObject({ lastError: BROWSER_BLOCKED_MESSAGE })
    expect(first.product.unsupported).toBeUndefined()
    expect(first.push).toBeUndefined()
    expect(needsBrowserCheck(first.product, NOW)).toBe(true)

    const second = applyOutcome(first.product, blocked, 'browser', NOW + HOUR, true)
    expect(second.product).toMatchObject({ unsupported: true, lastError: BROWSER_BLOCKED_MESSAGE })
    expect(second.push?.title).toBe('Non posso seguire questo prodotto')
    expect(needsBrowserCheck(second.product, NOW + HOUR)).toBe(false)
  })

  it('keeps retrying an already tracked product that is blocked once', () => {
    const tracked = product({ route: 'browser' })
    const { product: next, push } = applyOutcome(tracked, blocked, 'browser', NOW, true)
    expect(next).toMatchObject({ lastError: BROWSER_BLOCKED_MESSAGE, lastPrice: 50 })
    expect(next.unsupported).toBeUndefined()
    expect(push).toBeUndefined()
  })

  it('clears a "check now" request whatever the result', () => {
    const { product: next } = applyOutcome(product({ route: 'browser', checkRequested: true }), { ok: true, price: 50 }, 'browser', NOW, true)
    expect(next.checkRequested).toBeUndefined()
  })
})

describe('needsBrowserCheck', () => {
  it('takes pending, requested, due and soon-due browser products only', () => {
    expect(needsBrowserCheck(product(), NOW)).toBe(false)
    expect(needsBrowserCheck(pending(), NOW)).toBe(true)
    expect(needsBrowserCheck(product({ route: 'browser', lastCheckedAt: NOW - HOUR, checkRequested: true }), NOW)).toBe(true)
    // 6h interval: due within the next 3h counts.
    expect(needsBrowserCheck(product({ route: 'browser', lastCheckedAt: NOW - 4 * HOUR }), NOW)).toBe(true)
    expect(needsBrowserCheck(product({ route: 'browser', lastCheckedAt: NOW - 2 * HOUR }), NOW)).toBe(false)
  })
})
