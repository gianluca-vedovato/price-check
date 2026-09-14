/**
 * Browser worker: checks products whose shops block plain server requests.
 * Runs in GitHub Actions (see .github/workflows/price-worker.yml) or locally:
 *
 *   PRICE_CHECK_URL=http://localhost:8888 WORKER_SECRET=… npx tsx worker/run.ts
 *
 * With product URLs as arguments it only prints what it finds, without the API:
 *
 *   npx tsx worker/run.ts https://www2.hm.com/it_it/productpage.1352054002.html
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { BROWSER_ENGINES, type BrowserEngine, type CheckOutcome, type WorkerJob } from '../shared/types'
import { extract } from '../netlify/lib/extract'
import { BLOCKED_MESSAGE, looksBlocked, shopErrorMessage } from '../netlify/lib/fetchPage'

const API = (process.env.PRICE_CHECK_URL ?? '').replace(/\/$/, '')
const KEY = process.env.WORKER_SECRET ?? ''
const CONCURRENCY = 2
const MAX_ROUNDS = 5
const dryRunUrls = process.argv.slice(2)

if (!dryRunUrls.length && (!API || !KEY)) {
  console.error('Set PRICE_CHECK_URL and WORKER_SECRET, or pass product URLs to try them without the API')
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

/**
 * A fresh browser and profile per product, so one shop's cookies never affect another.
 * Both run headed (on a virtual display in CI) and keep their own user agent, as their docs advise.
 * They bundle their own Playwright copies, hence the Page casts.
 */
async function openPage(engine: BrowserEngine): Promise<{ page: Page; close: () => Promise<void> }> {
  if (engine === 'patchright') {
    const { chromium } = await import('patchright')
    const profile = mkdtempSync(join(tmpdir(), 'patchright-'))
    const context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: false, viewport: null })
    return {
      page: (await context.newPage()) as unknown as Page,
      close: async () => {
        await context.close()
        rmSync(profile, { recursive: true, force: true })
      },
    }
  }
  const { Camoufox } = await import('camoufox-js')
  const browser = await Camoufox({ headless: false })
  return { page: (await browser.newPage()) as unknown as Page, close: () => browser.close() }
}

async function checkWith(engine: BrowserEngine, job: WorkerJob): Promise<CheckOutcome> {
  let session: Awaited<ReturnType<typeof openPage>> | undefined
  try {
    session = await openPage(engine)
    const { page } = session
    let outcome: CheckOutcome = { ok: false, blocked: true, message: BLOCKED_MESSAGE }
    // Bot checks sometimes pass only on a second load, once their sensor script has run.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = attempt === 1
        ? await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
        : await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 })
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
      await page.waitForTimeout(4000)
      const html = await page.content()
      const status = res?.status() ?? 200
      const data = looksBlocked(html) ? undefined : extract(html, page.url(), job.locator)
      // The first response can be a bot check that reloads into the real page, so a readable price wins over its status.
      if (data?.price) return { ok: true, price: data.price, currency: data.currency, title: data.title, image: data.image, locator: data.locator, engine }
      if (!data || status === 403 || status === 429) outcome = { ok: false, blocked: true, message: BLOCKED_MESSAGE }
      else if (status >= 400) outcome = { ok: false, blocked: false, message: shopErrorMessage(status) }
      else outcome = { ok: true, currency: data.currency, title: data.title, image: data.image, engine }
    }
    return outcome
  } catch (e) {
    return { ok: false, blocked: false, message: (e as Error).message.split('\n')[0] }
  } finally {
    await session?.close().catch(() => undefined)
  }
}

/** Tries the browser that last worked for this product first, then the others. */
async function check(job: WorkerJob): Promise<CheckOutcome> {
  const order = job.engine ? [job.engine, ...BROWSER_ENGINES.filter((e) => e !== job.engine)] : [...BROWSER_ENGINES]
  let best: CheckOutcome | undefined
  for (const engine of order) {
    const outcome = await checkWith(engine, job)
    if (outcome.ok && outcome.price) return outcome
    // Without a price anywhere, report the most telling result: anything beats a block.
    if (!best || (!best.ok && best.blocked)) best = outcome
  }
  return best!
}

function summary(outcome: CheckOutcome): string {
  if (!outcome.ok) return outcome.blocked ? 'blocked' : `error: ${outcome.message}`
  return `${outcome.price ? `${outcome.currency ?? ''} ${outcome.price}` : 'no price'} via ${outcome.engine}`
}

if (dryRunUrls.length) {
  for (const url of dryRunUrls) {
    const started = Date.now()
    const outcome = await check({ id: 'dry-run', url })
    console.log(`${summary(outcome)} · ${Math.round((Date.now() - started) / 1000)}s · ${url}`)
  }
  process.exit(0)
}

const done = new Set<string>()
let checked = 0

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
        const outcome = await check(job)
        const result = await api<{ price: number; error?: string; notified: boolean }>('/api/worker/result', {
          method: 'POST',
          body: JSON.stringify({ id: job.id, outcome }),
        }).catch((e: Error) => ({ price: 0, error: e.message, notified: false }))
        checked++
        console.log(`  ${summary(outcome).padEnd(24)} ${String(Date.now() - started).padStart(6)}ms ${result.notified ? 'notified ' : ''}${result.error ?? ''} ${job.url}`)
      }
    }),
  )
}

console.log(`done: ${checked} checked`)
