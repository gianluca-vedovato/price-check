# Price Check

Personal price-drop alerts. Share a product link → tap **Track** → get a push notification when it gets cheaper.

- **App:** React PWA (Vite + Tailwind), installable, with a share target on Android and an iOS Shortcut
- **API + cron:** Netlify Functions, with an hourly scheduled function that checks products when they're due
- **Browser worker:** GitHub Actions + Playwright, only for shops that block server requests (e.g. Zara)
- **Storage:** Netlify Blobs (no database)
- **Alerts:** Web Push (VAPID)
- **Price detection:** no LLM and no per-site code. See [How prices are found](#how-prices-are-found)

## How checks run

```
            ┌──────────── Netlify (hourly cron) ────────────┐
product ──▶ │ plain fetch → extract → rules → push           │
            │   └─ blocked? → route = browser ─┐             │
            └──────────────────────────────────┼─────────────┘
                                               ▼ workflow_dispatch
            ┌──────── GitHub Actions: price-worker.yml ─────┐
            │ GET /api/worker/jobs → Chromium → extract      │
            │ POST /api/worker/result → same rules → push    │
            └────────────────────────────────────────────────┘
```

- **Adding from a blocked shop:** the product is saved as *Getting the price…* and the worker starts. You get a notification with the price in about 2 minutes.
- **Two blocked runs in a row:** if the browser is blocked twice for a new product, it's marked as not trackable and you get one notification about it.
- **H&M** blocks cloud IPs even for real browsers, so it's currently not trackable from GitHub. The same worker works from a home connection: `npx tsx worker/run.ts`.

## Deploy (free)

**Netlify**

1. Create a Netlify site from this repo (the build settings come from `netlify.toml`).
2. Generate push keys: `npm run vapid`
3. In Netlify → Site configuration → Environment variables, add:
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`: from step 2
   - `VAPID_SUBJECT`: `mailto:you@example.com`
   - `GITHUB_REPO`: `gianluca-vedovato/price-check`
   - `GITHUB_TOKEN`: a [fine-grained token](https://github.com/settings/personal-access-tokens/new) with access to this repository only and the permission **Actions: Read and write**
   - `WORKER_SECRET`: any long random string (shared only between Netlify and the GitHub worker)
4. Redeploy and open the site.

**No login:** the app has no password. Anyone who knows the site URL can see and edit your list, so pick a site name that's hard to guess. Only the worker endpoints (`/api/worker/*`) are protected, so nobody can post fake prices. The API also refuses to fetch local or private network addresses.

**GitHub (browser worker)**

In the repo → Settings → Secrets and variables → Actions:
- **Secrets:**
  - `PRICE_CHECK_URL`: your Netlify site URL
  - `WORKER_SECRET`: same value as on Netlify
- **Variable:** `WORKER_ENABLED` = `true`

Without that variable the workflow skips itself, so there are no failing runs before setup.

Cost: each product takes about 12–15 s in the browser. The worker also takes products due within the next 3 hours, so runs cluster together, and a handful of Zara products fits easily in the 2,000 free Actions minutes/month.

## Phone setup

The app UI is in Italian.

- **iPhone:** Safari → Condividi → *Aggiungi alla schermata Home*. Open the app from the Home Screen and turn on notifications (iOS only allows push for Home Screen apps). Then follow *Impostazioni* to create the *Segui prezzo* Shortcut for Safari's share sheet.
- **Android:** Chrome → *Installa app*. **Prezzi** then appears in every app's share menu.
- **Desktop:** paste links in the list, or drag the bookmarklet from Settings.

## Local development

```bash
cp .env.example .env   # fill in values
npm install
npm run dev:netlify    # app + functions + blobs on http://localhost:8888
npm test
```

- **Run the cron once:** `npx netlify-cli functions:invoke check-prices --port 8888`
- **Run the browser worker against the local API:**
  1. Install Chromium once: `npx playwright install chromium`
  2. Run `PRICE_CHECK_URL=http://localhost:8888 WORKER_SECRET=… npx tsx worker/run.ts`

## How prices are found

Every strategy below is generic. They're tried in order, strongest signal first (`netlify/lib/extract.ts`):

1. **Saved locator:** when a product was found by a heuristic or corrected by you, its exact spot is saved and re-read on every check.
2. **JSON-LD** `schema.org/Product` offers.
3. **Meta tags** (`product:price:amount`) and **microdata** (`itemprop=price`).
4. **Embedded JSON state** (`embeddedJson.ts`): Next.js/Nuxt data, `window.x = {...}` and similar. Price-like values are scored higher when they:
   - sit next to a name matching the page title, or an id that appears in the URL
   - are shown in the visible text (also detects prices stored in cents)
   - are not old, list or "lowest in 30 days" prices, and are not from related products
5. **Visible HTML** (`domPrice.ts`): the price-named element closest after the `<h1>`, skipping struck-through prices and recommendation carousels.

Safety nets:
- **Correct the price when adding:** the add screen has *Not the right price?*. Type what you see and the app learns where that number lives.
- **Big jumps are confirmed first:** a change of more than 70% must be seen on two checks in a row before any alert.

## Shop compatibility (tested Sept 2026)

| Shop | Checked by |
|---|---|
| Max Mara, Intrend, Amazon, IKEA, Zalando, Nike, ASOS, Mango, Shopify stores | Netlify fetch |
| Zara, Pull&Bear | GitHub browser worker |
| H&M | Home connection only (blocks cloud IPs) |
| Mytheresa, YOOX | Not trackable (block even real browsers) |
