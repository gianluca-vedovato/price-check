import { describe, expect, it } from 'vitest'
import { extract, learnLocator } from './extract'

const page = (head: string, body = '') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`
const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`

describe('structured data', () => {
  it('reads a JSON-LD Product with a single Offer', () => {
    const html = page(
      `<title>Fallback</title><meta property="og:title" content="Nice Chair"><meta property="og:image" content="/img/chair.jpg">` +
        ld({ '@context': 'https://schema.org', '@type': 'Product', name: 'Chair', offers: { '@type': 'Offer', price: '129.00', priceCurrency: 'EUR' } }),
    )
    expect(extract(html, 'https://shop.example.it/p/chair')).toEqual({
      title: 'Nice Chair',
      image: 'https://shop.example.it/img/chair.jpg',
      price: 129,
      currency: 'EUR',
      source: 'jsonld',
    })
  })

  it('finds the product inside @graph and uses AggregateOffer.lowPrice', () => {
    const html = page(
      ld({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebSite', name: 'Shop' },
          { '@type': 'Product', name: 'Lamp', image: ['https://cdn.x/lamp.jpg'], offers: { '@type': 'AggregateOffer', lowPrice: 39.9, highPrice: 59, priceCurrency: 'USD' } },
        ],
      }),
    )
    expect(extract(html, 'https://x.com/lamp')).toMatchObject({ price: 39.9, currency: 'USD', title: 'Lamp', image: 'https://cdn.x/lamp.jpg' })
  })

  it('takes the lowest offer, reads priceSpecification and ignores broken JSON-LD', () => {
    const html = page(
      `<script type="application/ld+json">{ broken json</script>` +
        ld([{ '@type': 'Product', name: 'Shoes', offers: [{ price: '99,00', priceCurrency: 'EUR' }, { priceSpecification: { price: 89, priceCurrency: 'EUR' } }] }]),
    )
    expect(extract(html, 'https://x.it/s')).toMatchObject({ price: 89, currency: 'EUR' })
  })

  it('handles a ProductGroup with variants (Shopify style)', () => {
    const html = page(ld({ '@type': 'ProductGroup', name: 'Tee', hasVariant: [{ '@type': 'Product', offers: { price: 25, priceCurrency: 'EUR' } }] }))
    expect(extract(html, 'https://x.it/t').price).toBe(25)
  })

  it('falls back to price meta tags, then microdata', () => {
    expect(extract(page(`<meta property="product:price:amount" content="1299.00"><meta property="product:price:currency" content="EUR">`), 'https://x.it/p')).toMatchObject({ price: 1299, currency: 'EUR', source: 'meta' })
    const micro = page('', `<div itemscope><span itemprop="price" content="45.50">45,50 €</span><meta itemprop="priceCurrency" content="EUR"></div>`)
    expect(extract(micro, 'https://x.it/p')).toMatchObject({ price: 45.5, currency: 'EUR', source: 'microdata' })
  })
})

describe('embedded JSON state', () => {
  it('finds the price in a `window.x = {...}` assignment (ASOS style)', () => {
    const state = {
      product: { name: 'T-shirt serafino slim nera', price: { current: { value: 19.99, text: '19,99 €' }, previous: { value: 29.99 } }, currency: 'EUR' },
      recommendations: [{ name: 'Other tee', price: { current: { value: 9.99 } } }],
    }
    const html = page(
      `<title>Bershka - T-shirt serafino slim nera | ASOS</title>`,
      `<h1>T-shirt serafino slim nera</h1><div id="app"></div><p>Prezzo 19,99 €</p><script>window.asos = window.asos || {}; window.asos.pdp = ${JSON.stringify(state)};</script>`,
    )
    const result = extract(html, 'https://www.asos.com/it/prd/1')
    expect(result).toMatchObject({ price: 19.99, currency: 'EUR', source: 'json' })
    expect(result.locator).toMatch(/^json\/1:/)
    // A later check reads the same spot, even when the price changes.
    const later = html.replaceAll('19.99', '14.99').replaceAll('19,99', '14,99')
    expect(extract(later, 'https://www.asos.com/it/prd/1', result.locator)).toMatchObject({ price: 14.99, source: 'locator' })
  })

  it('detects prices stored in cents and prefers the product over related items and old prices (Mytheresa style)', () => {
    const state = {
      pdp: {
        product: {
          name: 'Scarpe Derby in pelle',
          price: { currencyCode: 'EUR', original: 98000, discount: 73500, percentage: 25 },
          variants: [1, 2, 3].map((size) => ({ size, price: { discount: 73500, original: 98000 } })),
        },
        relatedProducts: [{ name: 'Mocassini', price: { discount: 45000 } }],
      },
    }
    const html = page(
      '<title>Scarpe Derby in pelle in Nero - Gucci | Mytheresa</title>',
      `<h1>Scarpe Derby in pelle</h1><span>€ 980</span><span>€ 735</span><div class="related"><span>€ 450</span></div>` +
        `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: state } })}</script>`,
    )
    expect(extract(html, 'https://www.mytheresa.com/it/it/uomo/x-p01200532')).toMatchObject({
      title: 'Scarpe Derby in pelle',
      price: 735,
      source: 'json',
      currency: 'EUR',
    })
  })

  it('trusts a product id from the URL when the price is not rendered yet (real ASOS shape)', () => {
    const response = [{ productId: 211300449, productPrice: { current: { value: 19.99, text: '19,99 €' }, previous: { value: 24.99, text: '24,99 €' } } }]
    const html = page(
      '<title>Bershka - T-shirt | ASOS</title>',
      `<div id="pdp"></div><p>Spedizione gratuita sopra 70 €</p>` +
        `<script>window.asos.pdp.config.stockPriceResponse = '${JSON.stringify(response)}';</script>` +
        `<script>window.recs = ${JSON.stringify({ items: [{ productId: 999999, productPrice: { current: { value: 5 } } }] })}</script>`,
    )
    expect(extract(html, 'https://www.asos.com/it/bershka/t-shirt/prd/211300449')).toMatchObject({ price: 19.99, currency: 'EUR', source: 'json' })
  })

  it('reads minor-unit prices declared with fractionDigits (commercetools style)', () => {
    const state = { product: { name: 'Trail Shoe', masterVariant: { price: { value: { centAmount: 12900, currencyCode: 'EUR', fractionDigits: 2 } } } } }
    const html = page('<title>Trail Shoe</title>', `<div id="app"></div><script>window.__NUXT__ = ${JSON.stringify(state)}</script>`)
    expect(extract(html, 'https://x.it/trail-shoe')).toMatchObject({ price: 129, source: 'json' })
  })

  it('ignores the EU "lowest price in the last 30 days"', () => {
    const state = { product: { name: 'Bike Pro', price: { lowestPrice30Days: 899, sellingPrice: 999 } } }
    const html = page('<title>Bike Pro</title>', `<p>999 € (prezzo più basso 899 €)</p><script>var s = ${JSON.stringify(state)}</script>`)
    expect(extract(html, 'https://x.it/bike').price).toBe(999)
  })
})

describe('visible HTML', () => {
  it('uses the price next to the title and skips struck-through and related prices', () => {
    const html = page(
      '<title>Kindle Paperwhite : Amazon.it</title>',
      `<div class="carousel-related"><span class="item-price">5,00 €</span></div>` +
        `<h1 id="title"><span id="productTitle">Kindle Paperwhite</span></h1>` +
        `<div id="corePrice_feature_div"><span class="a-price a-text-price" data-a-strike="true"><span class="a-offscreen">169,99 €</span></span>` +
        `<span class="a-price"><span class="a-offscreen">119,99 €</span><span aria-hidden="true">119,99€</span></span></div>` +
        `<img id="landingImage" alt="Kindle Paperwhite" src="https://m.media-amazon.com/small.jpg" data-old-hires="https://m.media-amazon.com/big.jpg">`,
    )
    const result = extract(html, 'https://www.amazon.it/dp/B0CFP')
    expect(result).toMatchObject({
      price: 119.99,
      currency: 'EUR',
      source: 'dom',
      title: 'Kindle Paperwhite',
      image: 'https://m.media-amazon.com/big.jpg',
    })
    expect(extract(html, 'https://www.amazon.it/dp/B0CFP', result.locator)).toMatchObject({ price: 119.99, source: 'locator' })
  })

  it('does not treat utility classes as "old price" markers', () => {
    const html = page('', `<h1>Lamp</h1><ul class="list-none"><li><span class="price font-regular">€ 49,00</span></li></ul>`)
    expect(extract(html, 'https://x.it/l')).toMatchObject({ price: 49, source: 'dom' })
  })

  it('guesses the currency from the URL locale before the domain', () => {
    const withSymbol = page('', '<h1>Lamp</h1><span class="product-price">€ 49</span>')
    expect(extract(withSymbol, 'https://www.shop.com/en-gb/lamp').currency).toBe('EUR')
    expect(extract(page('<meta property="product:price:amount" content="49">'), 'https://www.shop.com/en-gb/lamp').currency).toBe('GBP')
    expect(extract(page('<meta property="product:price:amount" content="49">'), 'https://www.shop.com/it_it/lamp').currency).toBe('EUR')
    expect(extract(page('<meta property="product:price:amount" content="49">'), 'https://www.shop.com/lamp').currency).toBe('USD')
  })

  it('returns no price when nothing is there', () => {
    expect(extract(page('<title>Hi</title>', '<h1>Hi</h1><p>Contact us</p>'), 'https://x.it').price).toBeUndefined()
  })
})

describe('learnLocator', () => {
  it('finds the element showing the typed price', () => {
    const html = page('', `<main><div class="card"><h1>Bike</h1><p class="old">1.499,00 €</p><p class="now">1.199,00 €</p></div><footer>Spedizione 9,90 €</footer></main>`)
    const locator = learnLocator(html, 1199)
    expect(locator).toMatch(/^css:/)
    expect(extract(html, 'https://x.it', locator).price).toBe(1199)
  })

  it('falls back to a JSON path, in cents too', () => {
    const html = page('', `<div id="root"></div><script>window.__STATE__ = ${JSON.stringify({ item: { pricing: { amountCents: 4995 } } })}</script>`)
    const locator = learnLocator(html, 49.95)
    expect(locator).toMatch(/^json\/100:/)
    expect(extract(html, 'https://x.it', locator).price).toBe(49.95)
  })

  it('returns undefined when the price is not on the page', () => {
    expect(learnLocator(page('', '<p>9,90 €</p>'), 1199)).toBeUndefined()
  })
})
