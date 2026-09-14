import { describe, expect, it } from 'vitest'
import { looksBlocked, normalizeUrl } from './fetchPage'

describe('looksBlocked', () => {
  it('flags bot walls, even large ones', () => {
    expect(looksBlocked(`<script>window.isBotPage = true</script>${'x'.repeat(120_000)}`)).toBe(true)
    expect(looksBlocked(`<meta http-equiv="refresh" content="5; URL='/p.html?bm-verify=AAQ'">`)).toBe(true)
    expect(looksBlocked('<title>Access Denied</title>')).toBe(true)
  })

  it('does not flag real pages that merely mention a captcha', () => {
    expect(looksBlocked(`<html>${'product '.repeat(10_000)}<script src="recaptcha.js"></script></html>`)).toBe(false)
  })
})

describe('normalizeUrl', () => {
  it('drops tracking params and hashes but keeps variant params', () => {
    expect(normalizeUrl('https://x.it/p?utm_source=ig&v1=123&gclid=a#reviews')).toBe('https://x.it/p?v1=123')
    expect(normalizeUrl('javascript:alert(1)')).toBeUndefined()
  })
})
