import { extract, type Extracted } from './extract'
import { fetchPage } from './fetchPage'

export type Scraped = { data: Extracted; html: string; finalUrl: string }

/** Loads a product page and extracts title, image and price. */
export async function scrape(url: string, locator?: string): Promise<Scraped> {
  const { html, finalUrl } = await fetchPage(url)
  return { data: extract(html, finalUrl, locator), html, finalUrl }
}
