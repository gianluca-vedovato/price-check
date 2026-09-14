import { describe, expect, it } from 'vitest'
import { detectCurrency, parsePrice } from './parsePrice'

describe('parsePrice', () => {
  it.each([
    ['1.299,00 €', 1299],
    ['€ 1.299,90', 1299.9],
    ['$1,299.99', 1299.99],
    ['1 299,90 zł', 1299.9],
    ['1 299,90', 1299.9],
    ["CHF 1'299.50", 1299.5],
    ['12,5', 12.5],
    ['49,99€', 49.99],
    ['49.99', 49.99],
    ['1299', 1299],
    ['1.299', 1299],
    ['1,299', 1299],
    ['2.499.000', 2499000],
    ['EUR 49.-', 49],
    ['0.99', 0.99],
    ['Prezzo: 89,00 € IVA inclusa', 89],
  ])('%s → %d', (input, expected) => {
    expect(parsePrice(input)).toBe(expected)
  })

  it('accepts numbers and rejects junk', () => {
    expect(parsePrice(19.9)).toBe(19.9)
    expect(parsePrice('')).toBeUndefined()
    expect(parsePrice('free')).toBeUndefined()
    expect(parsePrice(0)).toBeUndefined()
    expect(parsePrice(null)).toBeUndefined()
  })
})

describe('detectCurrency', () => {
  it('reads ISO codes and symbols', () => {
    expect(detectCurrency('1.299,00 €')).toBe('EUR')
    expect(detectCurrency('usd 10')).toBe('USD')
    expect(detectCurrency('£10')).toBe('GBP')
    expect(detectCurrency('10')).toBeUndefined()
  })
})
