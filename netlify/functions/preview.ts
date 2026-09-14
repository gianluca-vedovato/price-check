import type { Config } from '@netlify/functions'
import { titleFromUrl } from '../../shared/format'
import type { Preview } from '../../shared/types'
import { BLOCKED_MESSAGE, FetchError, normalizeUrl } from '../lib/fetchPage'
import { browserWorkerEnabled } from '../lib/github'
import { error, json, requireKey } from '../lib/http'
import { scrape } from '../lib/scrape'

export default async (req: Request) => {
  const denied = requireKey(req)
  if (denied) return denied

  const url = normalizeUrl(new URL(req.url).searchParams.get('url') ?? '')
  if (!url) return error('That doesn’t look like a link')

  try {
    const { data } = await scrape(url)
    const preview: Preview = {
      url,
      title: data.title,
      image: data.image,
      price: data.price,
      currency: data.currency,
      found: Boolean(data.price),
    }
    return json(preview)
  } catch (e) {
    if (!(e instanceof FetchError)) console.error('preview failed', url, e)
    const blocked = e instanceof FetchError && e.message === BLOCKED_MESSAGE
    const preview: Preview = {
      url,
      found: false,
      error: e instanceof FetchError ? e.message : 'Couldn’t read this page',
      blocked,
      browserCheck: blocked && browserWorkerEnabled(),
      title: blocked ? titleFromUrl(url) : undefined,
    }
    return json(preview)
  }
}

export const config: Config = { path: '/api/preview' }
