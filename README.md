# Price Check

Personal price-drop alerts. Share a product link → tap **Track** → get a push notification when it gets cheaper.

- **App:** React PWA (Vite + Tailwind), installable, with a share target on Android and an iOS Shortcut
- **API + cron:** Netlify Functions, with an hourly scheduled function that checks products when they're due
- **Storage:** Netlify Blobs (no database)
- **Alerts:** Web Push (VAPID)
- **Price detection:** no LLM and no per-site code. See [How prices are found](#how-prices-are-found)

## Deploy (free)

1. Push this folder to a Git repo and create a Netlify site from it (the build settings come from `netlify.toml`).
2. Generate push keys: `npm run vapid`
3. In Netlify → Site configuration → Environment variables, add:
   - `APP_SECRET`: any long random string
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`: from step 2
   - `VAPID_SUBJECT`: `mailto:you@example.com`
4. Redeploy, open the site, paste `APP_SECRET` once.

## Phone setup

- **iPhone:** Safari → Share → *Add to Home Screen*. Open the app from the Home Screen, paste the key, and turn on notifications (iOS only allows push for Home Screen apps). Then follow the Settings page to create the *Track price* Shortcut for Safari's share sheet.
- **Android:** Chrome → *Install app*. **Prices** then appears in every app's share menu.
- **Desktop:** paste links in the list, or drag the bookmarklet from Settings.

## Local development

```bash
cp .env.example .env   # fill in values
npm install
npm run dev:netlify    # app + functions + blobs on http://localhost:8888
npm test
```

To run the cron once locally: `npx netlify-cli functions:invoke check-prices --port 8888`.

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

**Limit:** some shops block server requests with bot protection before any HTML arrives. As of Sept 2026 that includes Zara, H&M, Mytheresa, Pull&Bear and YOOX. These show *"This shop blocks automatic price checks"*.
