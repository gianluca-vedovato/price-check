import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { Product } from '../../shared/types'
import { EditSheet } from '../components/EditSheet'
import { IconClipboard, IconSettings, IconShare } from '../components/icons'
import { dropPercent, ProductCard } from '../components/ProductCard'
import { useToast } from '../components/Toast'
import { api, ApiError, readCache, writeCache } from '../lib/api'
import { extractUrl } from '../lib/extractUrl'
import { isAndroid, isIOS } from '../lib/platform'

export function ListPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [products, setProducts] = useState<Product[]>(readCache)
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [link, setLink] = useState('')

  const commit = useCallback((next: Product[]) => {
    setProducts(next)
    writeCache(next)
  }, [])

  const refresh = useCallback(async () => {
    try {
      commit(await api.list())
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) navigate('/setup', { replace: true })
      else if (!navigator.onLine) toast('You’re offline, showing saved prices')
    } finally {
      setLoaded(true)
    }
  }, [commit, navigate, toast])

  useEffect(() => {
    refresh()
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  // While the browser worker is fetching a price, refresh quietly so it appears without a reload.
  const waiting = products.some((p) => (p.pending && !p.lastError) || p.checkRequested)
  useEffect(() => {
    if (!waiting) return
    const timer = window.setInterval(() => document.visibilityState === 'visible' && refresh(), 15_000)
    return () => window.clearInterval(timer)
  }, [waiting, refresh])

  const sorted = useMemo(
    () => [...products].sort((a, b) => dropPercent(b) - dropPercent(a) || b.createdAt - a.createdAt),
    [products],
  )

  const goAdd = (value: string) => {
    const url = extractUrl(value)
    if (url) navigate(`/add?url=${encodeURIComponent(url)}`)
    else toast('That doesn’t look like a link')
  }

  const pasteFromClipboard = async () => {
    try {
      goAdd(await navigator.clipboard.readText())
    } catch {
      toast('Paste the link in the field')
    }
  }

  const replace = (updated: Product) => commit(products.map((p) => (p.id === updated.id ? updated : p)))

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pt-safe pb-safe">
      <header className="flex items-center justify-between pt-2 pb-4">
        <h1 className="font-display text-[32px] leading-none font-bold tracking-tight">Prices</h1>
        <Link to="/setup" aria-label="Settings" className="grid size-11 place-items-center rounded-full text-muted active:bg-sunken">
          <IconSettings />
        </Link>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          goAdd(link)
        }}
        className="mb-5 flex h-14 items-center gap-2 rounded-2xl border border-line bg-surface pr-1.5 pl-4 focus-within:border-ink"
      >
        <label htmlFor="link" className="sr-only">
          Product link
        </label>
        <input
          id="link"
          type="url"
          inputMode="url"
          enterKeyHint="go"
          autoComplete="off"
          placeholder="Paste a product link"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onPaste={(e) => {
            const url = extractUrl(e.clipboardData.getData('text'))
            if (url) {
              e.preventDefault()
              goAdd(url)
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint"
        />
        {link ? (
          <button type="submit" className="h-11 rounded-xl bg-accent px-4 text-[15px] font-semibold text-on-accent">
            Add
          </button>
        ) : (
          'clipboard' in navigator && 'readText' in navigator.clipboard && (
            <button
              type="button"
              onClick={pasteFromClipboard}
              className="flex h-11 items-center gap-1.5 rounded-xl bg-sunken px-3 text-[15px] font-semibold active:bg-line"
            >
              <IconClipboard width={18} height={18} />
              Paste
            </button>
          )
        )}
      </form>

      {!loaded && products.length === 0 ? (
        <ul className="flex flex-col gap-2.5" aria-label="Loading">
          {[0, 1, 2].map((i) => (
            <li key={i} className="skeleton h-[100px] rounded-3xl" />
          ))}
        </ul>
      ) : sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {sorted.map((product, i) => (
            <ProductCard
              key={product.id}
              product={product}
              onMore={() => setEditing(product)}
              style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
            />
          ))}
        </ul>
      )}

      <EditSheet
        product={editing}
        onClose={() => setEditing(null)}
        onSave={async (product, changes) => {
          try {
            replace(await api.update(product.id, changes))
            setEditing(null)
            toast('Alert updated')
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Couldn’t save')
          }
        }}
        onCheck={async (product) => {
          try {
            const updated = await api.check(product.id)
            replace(updated)
            if (updated.checkRequested || updated.route === 'browser') {
              setEditing(null)
              toast('Checking in a real browser, about 2 minutes')
            } else {
              setEditing(updated)
              toast(updated.lastError ? 'Check failed' : 'Price is up to date')
            }
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Check failed')
          }
        }}
        onDelete={(product) => {
          setEditing(null)
          commit(products.filter((p) => p.id !== product.id))
          const removal = api.remove(product.id).catch(() => {
            refresh()
            toast('Couldn’t delete')
          })
          toast('Removed', {
            label: 'Undo',
            run: async () => {
              commit(products)
              // Wait for the delete to land so the restore isn't overwritten by it.
              await removal
              await api.restore(product).catch(() => toast('Couldn’t restore'))
            },
          })
        }}
      />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="animate-rise flex flex-col items-center px-6 pt-14 text-center">
      <div className="mb-5 grid size-16 place-items-center rounded-3xl bg-surface text-muted">
        <IconShare width={28} height={28} />
      </div>
      <h2 className="font-display text-xl font-bold">Track your first product</h2>
      <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-muted">
        {isIOS
          ? 'In Safari, tap Share → “Track price”. Or paste a link above.'
          : isAndroid
            ? 'In any app, tap Share → Prices. Or paste a link above.'
            : 'Paste a product link above, or use the bookmarklet from Settings.'}
      </p>
      {isIOS && (
        <Link to="/setup" className="mt-4 text-[15px] font-semibold underline underline-offset-4">
          Set up the share button
        </Link>
      )}
    </div>
  )
}
