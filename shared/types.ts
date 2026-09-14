export type Rule = { type: 'drop' } | { type: 'below'; cap: number }

export const INTERVALS = [1, 3, 6, 12, 24] as const
export type IntervalHours = (typeof INTERVALS)[number]
export const DEFAULT_INTERVAL: IntervalHours = 6

export type PricePoint = { t: number; p: number }

export type Product = {
  id: string
  url: string
  title: string
  image?: string
  currency?: string
  rule: Rule
  intervalHours: IntervalHours
  /** Where the price lives when it wasn't in structured data (`css:…` or `json/<divisor>:…`). */
  locator?: string
  addedPrice: number
  lastPrice: number
  lowestPrice: number
  lastNotifiedPrice?: number
  /** A suspiciously large price change waiting to be confirmed by the next check. */
  pendingPrice?: number
  history: PricePoint[]
  lastCheckedAt: number
  lastError?: string
  createdAt: number
}

export type Preview = {
  url: string
  title?: string
  image?: string
  price?: number
  currency?: string
  found: boolean
  error?: string
}

export type CreateProductInput = {
  url: string
  rule: Rule
  intervalHours: IntervalHours
  /** Price typed by the user when it couldn't be detected automatically. */
  manualPrice?: number
}

export type UpdateProductInput = {
  rule?: Rule
  intervalHours?: IntervalHours
}
