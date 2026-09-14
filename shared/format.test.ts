import { describe, expect, it } from 'vitest'
import { titleFromUrl } from './format'

describe('titleFromUrl', () => {
  it('turns product slugs into readable names', () => {
    expect(titleFromUrl('https://www.zara.com/it/it/camicia-boxy-fit-a-righe-p01030731.html')).toBe('Camicia boxy fit a righe')
    expect(titleFromUrl('https://it.maxmara.com/p-1018016006001-madame-cammello')).toBe('Madame cammello')
    expect(titleFromUrl('https://www.pullandbear.com/it/maglietta-stwd-con-grafica-l07232525?cS=250')).toBe('Maglietta stwd con grafica')
  })

  it('gives up on URLs without a meaningful slug', () => {
    expect(titleFromUrl('https://www2.hm.com/it_it/productpage.1352054002.html')).toBeUndefined()
    expect(titleFromUrl('https://www.yoox.com/it/10707956BP/item')).toBeUndefined()
    expect(titleFromUrl('not a url')).toBeUndefined()
  })
})
