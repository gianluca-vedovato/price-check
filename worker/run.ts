/**
 * Browser worker: checks products whose shops block plain server requests.
 * Runs in GitHub Actions (see .github/workflows/price-worker.yml) or locally:
 *
 *   PRICE_CHECK_URL=http://localhost:8888 WORKER_SECRET=… npx tsx worker/run.ts
 */
import { chromium, type Browser } from 'playwright'
import type { CheckOutcome, WorkerJob } from '../shared/types'
import { extract } from '../netlify/lib/extract'
import { BLOCKED_MESSAGE, looksBlocked, shopErrorMessage } from '../netlify/lib/fetchPage'

const API = (process.env.PRICE_CHECK_URL ?? '').replace(/\/$/, '')
const KEY = process.env.WORKER_SECRET ?? ''
const CONCURRENCY = 2
const MAX_ROUNDS = 5

if (!API || !KEY) {
  console.error('Set PRICE_CHECK_URL and WORKER_SECRET')
  process.exit(1)
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-worker-key': KEY, ...init.headers },
  })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

async function check(browser: Browser, job: WorkerJob): Promise<CheckOutcome> {
  // A fresh context per product, so one shop's cookies never affect another.
  const context = await browser.newContext({
    // Headless Chromium announces itself as "HeadlessChrome", which bot protection blocks instantly.
    userAgent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version().split('.')[0]}.0.0.0 Safari/537.36`,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    viewport: { width: 1366, height: 900 },
  })
  const page = await context.newPage()
  try {
    const res = await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined)
    const html = await page.content()
    if (res?.status() === 403 || res?.status() === 429 || looksBlocked(html)) {
      return { ok: false, blocked: true, message: BLOCKED_MESSAGE }
    }
    if (res && res.status() >= 400) return { ok: false, blocked: false, message: shopErrorMessage(res.status()) }
    const data = extract(html, page.url(), job.locator)
    return { ok: true, price: data.price, currency: data.currency, title: data.title, image: data.image, locator: data.locator }
  } catch (e) {
    return { ok: false, blocked: false, message: (e as Error).message.split('\n')[0] }
  } finally {
    await context.close()
  }
}

// Full Chromium in the new headless mode: the lighter headless shell gets blocked everywhere.
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const done = new Set<string>()
let checked = 0

try {
  // Products added while a round is running get picked up by the next one.
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const jobs = (await api<WorkerJob[]>('/api/worker/jobs')).filter((j) => !done.has(j.id))
    if (jobs.length === 0) break
    console.log(`round ${round}: ${jobs.length} product(s)`)

    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        for (let job = jobs.shift(); job; job = jobs.shift()) {
          done.add(job.id)
          const started = Date.now()
          const outcome = await check(browser, job)
          const result = await api<{ price: number; error?: string; notified: boolean }>('/api/worker/result', {
            method: 'POST',
            body: JSON.stringify({ id: job.id, outcome }),
          }).catch((e: Error) => ({ price: 0, error: e.message, notified: false }))
          checked++
          const status = outcome.ok ? (outcome.price ? `€${outcome.price}` : 'no price') : outcome.blocked ? 'blocked' : 'error'
          console.log(`  ${status.padEnd(10)} ${String(Date.now() - started).padStart(6)}ms ${result.notified ? 'notified ' : ''}${result.error ?? ''} ${job.url}`)
        }
      }),
    )
  }
} finally {
  await browser.close()
}

console.log(`done: ${checked} checked`)
