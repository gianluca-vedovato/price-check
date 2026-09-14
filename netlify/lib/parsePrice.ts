const SYMBOLS: Record<string, string> = {
  '€': 'EUR',
  '£': 'GBP',
  '$': 'USD',
  '¥': 'JPY',
  '₹': 'INR',
  'CHF': 'CHF',
  'kr': 'SEK',
  'zł': 'PLN',
}

const ISO = /\b(EUR|USD|GBP|CHF|JPY|SEK|NOK|DKK|PLN|CZK|HUF|RON|CAD|AUD|INR|BRL|MXN)\b/i

export function detectCurrency(text: string): string | undefined {
  const iso = text.match(ISO)
  if (iso) return iso[1].toUpperCase()
  for (const [symbol, code] of Object.entries(SYMBOLS)) {
    if (text.includes(symbol)) return code
  }
  return undefined
}

/**
 * Turns a human price string into a number.
 * Handles "1.299,00 €", "$1,299.99", "1 299,90", "12,5", "1299", "EUR 49.-".
 */
export function parsePrice(input: unknown): number | undefined {
  if (typeof input === 'number') return Number.isFinite(input) && input > 0 ? input : undefined
  if (typeof input !== 'string') return undefined

  // Keep the first run that looks like a number (digits with separators).
  const match = input.replace(/ | /g, ' ').match(/\d[\d.,' ]*/)
  if (!match) return undefined
  let raw = match[0].trim().replace(/[ ']/g, '')
  raw = raw.replace(/[.,]$/, '')

  const lastDot = raw.lastIndexOf('.')
  const lastComma = raw.lastIndexOf(',')

  if (lastDot !== -1 && lastComma !== -1) {
    // Whichever comes last is the decimal separator.
    raw = lastComma > lastDot
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/,/g, '')
  } else if (lastComma !== -1 || lastDot !== -1) {
    const sep = lastComma !== -1 ? ',' : '.'
    const parts = raw.split(sep)
    const tail = parts[parts.length - 1]
    // "1.299" / "1,299" with exactly 3 trailing digits and several groups = thousands.
    const isThousands = tail.length === 3 && (parts.length > 2 || parts[0].length <= 3) && parts.length > 1
    if (isThousands && !(sep === '.' && parts.length === 2 && parts[0] === '0')) {
      raw = parts.join('')
    } else {
      raw = parts.slice(0, -1).join('') + '.' + tail
    }
  }

  const value = Number.parseFloat(raw)
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : undefined
}
