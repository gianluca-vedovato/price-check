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
  /**
   * How the product is checked: a plain server request on Netlify, or a real browser
   * in the GitHub Actions worker for shops that block server requests.
   */
  route?: Route
  /** Added from a shop that needs the browser worker; prices are 0 until its first check. */
  pending?: boolean
  /** "Check now" was requested for a browser-route product. */
  checkRequested?: boolean
  /** The worker browser that last loaded the page, tried first next time. */
  engine?: BrowserEngine
  /** The shop blocked even the browser before we ever got a price; no more automatic attempts. */
  unsupported?: boolean
  /** The worker browsers (`WORKER_ENGINES`) that were blocked; a worker with different browsers tries again. */
  unsupportedEngines?: string
}

export type Route = 'fetch' | 'browser'

/**
 * Stealth browsers the GitHub worker tries, in this order: each gets past shops the other can't
 * (tested Sept 2026: only Patchright loads YOOX, only Camoufox loads H&M).
 */
export const BROWSER_ENGINES = ['patchright', 'camoufox'] as const
export type BrowserEngine = (typeof BROWSER_ENGINES)[number]
export const WORKER_ENGINES = BROWSER_ENGINES.join('+')

export type Preview = {
  url: string
  title?: string
  image?: string
  price?: number
  currency?: string
  found: boolean
  error?: string
  /** The shop blocks server requests. */
  blocked?: boolean
  /** A browser worker is configured, so a blocked shop can still be tracked. */
  browserCheck?: boolean
}

export type CreateProductInput = {
  url: string
  rule: Rule
  intervalHours: IntervalHours
  /** Price typed by the user when it couldn't be detected automatically. */
  manualPrice?: number
  /** Page title from the share sheet, used while the price is still being fetched. */
  title?: string
}

/** What a check produced, from either the Netlify fetch or the browser worker. */
export type CheckOutcome =
  | { ok: true; price?: number; currency?: string; title?: string; image?: string; locator?: string; engine?: BrowserEngine }
  | { ok: false; blocked: boolean; message: string }

export type WorkerJob = { id: string; url: string; locator?: string; engine?: BrowserEngine }

export type UpdateProductInput = {
  rule?: Rule
  intervalHours?: IntervalHours
}
