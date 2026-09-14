import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { Product } from '../../shared/types'
import { EditSheet } from '../components/EditSheet'
import { IconClipboard, IconSettings, IconShare } from '../components/icons'
import { dropPercent, ProductCard } from '../components/ProductCard'
import { useToast } from '../components/Toast'
import { api, readCache, writeCache } from '../lib/api'
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
    } catch {
      if (!navigator.onLine) toast('Sei offline, questi sono gli ultimi prezzi salvati')
    } finally {
      setLoaded(true)
    }
  }, [commit, toast])

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
    else toast('Questo non sembra un link')
  }

  const pasteFromClipboard = async () => {
    try {
      goAdd(await navigator.clipboard.readText())
    } catch {
      toast('Incolla il link nel campo')
    }
  }

  const replace = (updated: Product) => commit(products.map((p) => (p.id === updated.id ? updated : p)))

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pt-safe pb-safe">
      <header className="flex items-center justify-between pt-2 pb-4">
        <h1 className="font-serif text-[34px] leading-none tracking-tight">Prezzi</h1>
        <Link to="/setup" aria-label="Impostazioni" className="grid size-11 place-items-center rounded-full text-muted active:bg-sunken">
          <IconSettings />
        </Link>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          goAdd(link)
        }}
        className="mb-5 flex h-14 items-center gap-2 rounded-[20px] border border-line bg-surface pr-1.5 pl-4 focus-within:border-ink"
      >
        <label htmlFor="link" className="sr-only">
          Link del prodotto
        </label>
        <input
          id="link"
          type="url"
          inputMode="url"
          enterKeyHint="go"
          autoComplete="off"
          placeholder="Incolla il link di un prodotto"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onPaste={(e) => {
            const url = extractUrl(e.clipboardData.getData('text'))
            if (url) {
              e.preventDefault()
              goAdd(url)
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
        />
        {link ? (
          <button
            type="submit"
            className="h-10 rounded-[14px] bg-gradient-to-br from-accent to-accent2 px-4 text-[14px] font-semibold text-on-accent"
          >
            Aggiungi
          </button>
        ) : (
          'clipboard' in navigator && 'readText' in navigator.clipboard && (
            <button
              type="button"
              onClick={pasteFromClipboard}
              className="flex h-10 items-center gap-1.5 rounded-[14px] bg-sunken px-3 text-[14px] font-semibold active:bg-line"
            >
              <IconClipboard width={15} height={15} />
              Incolla
            </button>
          )
        )}
      </form>

      {!loaded && products.length === 0 ? (
        <ul className="flex flex-col gap-2.5" aria-label="Caricamento">
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
            toast('Avviso aggiornato')
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Salvataggio non riuscito')
          }
        }}
        onCheck={async (product) => {
          try {
            const updated = await api.check(product.id)
            replace(updated)
            if (updated.checkRequested || updated.route === 'browser') {
              setEditing(null)
              toast('Controllo con un browser vero, circa 2 minuti')
            } else {
              setEditing(updated)
              toast(updated.lastError ? 'Controllo non riuscito' : 'Il prezzo è aggiornato')
            }
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Controllo non riuscito')
          }
        }}
        onDelete={(product) => {
          setEditing(null)
          commit(products.filter((p) => p.id !== product.id))
          const removal = api.remove(product.id).catch(() => {
            refresh()
            toast('Eliminazione non riuscita')
          })
          toast('Eliminato', {
            label: 'Annulla',
            run: async () => {
              commit(products)
              // Wait for the delete to land so the restore isn't overwritten by it.
              await removal
              await api.restore(product).catch(() => toast('Ripristino non riuscito'))
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
      <h2 className="font-serif text-2xl">Segui il tuo primo prodotto</h2>
      <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-muted">
        {isIOS
          ? 'In Safari tocca Condividi → «Segui prezzo». Oppure incolla un link qui sopra.'
          : isAndroid
            ? 'Da qualsiasi app tocca Condividi → Price Check. Oppure incolla un link qui sopra.'
            : 'Incolla qui sopra il link di un prodotto, oppure usa il pulsante per i preferiti dalle Impostazioni.'}
      </p>
      <Link to="/setup" className="mt-4 text-[15px] font-semibold underline underline-offset-4">
        {isIOS || isAndroid ? 'Configura il pulsante Condividi e le notifiche' : 'Configura le notifiche'}
      </Link>
    </div>
  )
}
