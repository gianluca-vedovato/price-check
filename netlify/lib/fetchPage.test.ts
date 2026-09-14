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

  it('refuses local and private addresses, since the API has no login', () => {
    for (const url of ['http://localhost:8888/api', 'http://127.0.0.1/', 'http://169.254.169.254/latest', 'http://10.0.0.5/', 'http://192.168.1.1/', 'http://[::1]/', 'http://intranet/', 'https://user:pw@shop.it/p']) {
      expect(normalizeUrl(url), url).toBeUndefined()
    }
    expect(normalizeUrl('https://8.8.8.8/p')).toBe('https://8.8.8.8/p')
    expect(normalizeUrl('https://it.maxmara.com/p-1')).toBe('https://it.maxmara.com/p-1')
  })
})
