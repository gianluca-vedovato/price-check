/**
 * One-off probe: can a real browser on this machine (e.g. a GitHub Actions runner)
 * load bot-protected shops, and does our extractor read the result?
 *
 *   npx tsx worker/probe.ts [new|headed|shell ...]
 */
import { chromium, type Browser } from 'playwright'
import { extract } from '../netlify/lib/extract'
import { looksBlocked } from '../netlify/lib/fetchPage'

const SHOPS = [
  ['Zara', 'https://www.zara.com/it/it/camicia-boxy-fit-a-righe-p01030731.html'],
  ['H&M', 'https://www2.hm.com/it_it/productpage.1352054002.html'],
  ['Pull&Bear', 'https://www.pullandbear.com/it/maglietta-stwd-con-grafica-l07232525?cS=250&pelement=752126548'],
  ['Max Mara', 'https://it.maxmara.com/p-1018016006001-madame-cammello'],
  ['Intrend', 'https://it.intrend.it/p-8131035606001-victor-blu'],
] as const

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

async function launch(mode: string): Promise<Browser> {
  if (mode === 'shell') return chromium.launch({ headless: true })
  if (mode === 'headed') return chromium.launch({ headless: false })
  return chromium.launch({ headless: true, channel: 'chromium' })
}

async function plainFetch(url: string) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'it-IT,it;q=0.9' } })
    const html = await res.text()
    return `${res.status} ${looksBlocked(html) ? 'blocked' : 'ok'}`
  } catch (e) {
    return `error ${(e as Error).message}`
  }
}

const modes = process.argv.slice(2).length ? process.argv.slice(2) : ['new']
const ip = await fetch('https://api.ipify.org').then((r) => r.text(), () => '?')
console.log(`runner ip: ${ip}\n`)

for (const [name, url] of SHOPS) console.log(`[fetch]  ${name.padEnd(10)} ${await plainFetch(url)}`)

for (const mode of modes) {
  console.log('')
  const browser = await launch(mode)
  for (const [name, url] of SHOPS) {
    const context = await browser.newContext({ userAgent: UA, locale: 'it-IT', viewport: { width: 1366, height: 900 } })
    const page = await context.newPage()
    const started = Date.now()
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
      const html = await page.content()
      const data = extract(html, page.url())
      const verdict = looksBlocked(html) ? 'BLOCKED' : data.price ? 'OK' : 'NO PRICE'
      console.log(
        `[${mode}] ${name.padEnd(10)} ${verdict.padEnd(8)} http=${res?.status()} ${String(Date.now() - started).padStart(5)}ms ` +
          `${String(html.length).padStart(8)}b price=${data.price ?? '-'} ${data.currency ?? ''} title="${(await page.title()).slice(0, 50)}"`,
      )
    } catch (e) {
      console.log(`[${mode}] ${name.padEnd(10)} ERROR    ${(e as Error).message.split('\n')[0]}`)
    }
    await context.close()
  }
  await browser.close()
}
