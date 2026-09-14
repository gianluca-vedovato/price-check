import { useEffect, useId, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { parsePrice } from '../../netlify/lib/parsePrice'
import { formatPrice, hostOf } from '../../shared/format'
import { DEFAULT_INTERVAL, type IntervalHours, type Preview } from '../../shared/types'
import { currencySymbol, defaultCap, IntervalChips, parseCap, RuleControl, type RuleDraft } from '../components/AlertControls'
import { IconBack, IconExternal } from '../components/icons'
import { api } from '../lib/api'
import { extractUrl } from '../lib/extractUrl'
import { isIOS, isStandalone, vibrate } from '../lib/platform'

type State =
  | { status: 'loading' }
  | { status: 'ready'; preview: Preview }
  | { status: 'failed'; message: string }

export function AddPage() {
  const [params] = useSearchParams()
  const url = extractUrl(params.get('url'), params.get('text'), params.get('title'))
  // Android shares the page title; it names the product while a slow shop's price is being fetched.
  const shareTitle = params.get('title')?.trim()
  return url ? <AddForm key={url} url={url} shareTitle={shareTitle && !extractUrl(shareTitle) ? shareTitle : undefined} /> : <NoLink />
}

function AddForm({ url, shareTitle }: { url: string; shareTitle?: string }) {
  const navigate = useNavigate()
  const priceId = useId()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [rule, setRule] = useState<RuleDraft>({ type: 'drop', cap: '' })
  const [interval, setInterval] = useState<IntervalHours>(DEFAULT_INTERVAL)
  const [manualPrice, setManualPrice] = useState('')
  const [correcting, setCorrecting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [done, setDone] = useState<'tracked' | 'pending' | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    api
      .preview(url)
      .then((preview) => {
        if (cancelled) return
        if (preview.error && !preview.browserCheck) return setState({ status: 'failed', message: preview.error })
        setState({ status: 'ready', preview })
        if (preview.price) setRule((r) => ({ ...r, cap: defaultCap(preview.price!) }))
      })
      .catch((e) => {
        if (cancelled) return
        setState({ status: 'failed', message: e instanceof Error ? e.message : 'Non riesco a caricare la pagina' })
      })
    return () => {
      cancelled = true
    }
  }, [url, attempt])

  const preview = state.status === 'ready' ? state.preview : undefined
  // The shop blocks quick checks; the browser worker will fetch the price after saving.
  const slow = Boolean(preview?.browserCheck)
  const typedPrice = parsePrice(manualPrice)
  // Asking for the price when none was found, or when the user says the detected one is wrong.
  const askingPrice = Boolean(preview && !slow && (!preview.price || correcting))
  const price = askingPrice ? typedPrice : preview?.price
  const cap = parseCap(rule)
  const canTrack =
    state.status === 'ready' && !saving && (price !== undefined || slow) && (rule.type === 'drop' || cap !== undefined)

  // Keep the target in sync once the user tells us the price.
  useEffect(() => {
    if (askingPrice && typedPrice) setRule((r) => ({ ...r, cap: defaultCap(typedPrice) }))
  }, [typedPrice, askingPrice])

  const track = async () => {
    if (!canTrack) return
    setSaving(true)
    setSaveError(null)
    try {
      const product = await api.create({
        url,
        rule: rule.type === 'below' && cap ? { type: 'below', cap } : { type: 'drop' },
        intervalHours: interval,
        manualPrice: askingPrice ? typedPrice : undefined,
        title: shareTitle,
      })
      vibrate([10, 40, 20])
      setDone(product.pending ? 'pending' : 'tracked')
      // Opened from the iOS Shortcut in Safari: stay on the success screen, there's nowhere to "go back" to.
      if (!(isIOS && !isStandalone)) setTimeout(() => navigate('/', { replace: true }), 1100)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Salvataggio non riuscito')
      setSaving(false)
    }
  }

  if (done) return <Success fromSafari={isIOS && !isStandalone} pending={done === 'pending'} />

  const currency = preview?.currency ?? 'EUR'

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 pt-safe">
      <header className="flex items-center gap-1 pt-1 pb-3">
        <Link to="/" aria-label="Torna alla lista" className="-ml-2 grid size-11 place-items-center rounded-full active:bg-sunken">
          <IconBack />
        </Link>
        <span className="text-[17px] font-semibold">Segui prezzo</span>
      </header>

      <main className="flex flex-1 flex-col gap-6 pb-32">
        {state.status === 'loading' && <PreviewSkeleton host={hostOf(url)} />}

        {state.status === 'failed' && (
          <div className="shadow-card animate-rise rounded-3xl bg-surface p-5">
            <p className="text-sm text-muted">{hostOf(url)}</p>
            <h2 className="mt-1 font-serif text-2xl">Non riesco a leggere questa pagina</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{state.message}</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setAttempt((a) => a + 1)}
                className="h-12 flex-1 rounded-2xl bg-gradient-to-br from-accent to-accent2 font-semibold text-on-accent active:scale-[0.98]"
              >
                Riprova
              </button>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-sunken font-semibold"
              >
                Apri <IconExternal width={18} height={18} />
              </a>
            </div>
          </div>
        )}

        {preview && (
          <>
            <article className="shadow-card animate-rise overflow-hidden rounded-3xl bg-surface">
              {preview.image && (
                <div className="flex h-[180px] items-center justify-center bg-white p-4">
                  <img src={preview.image} alt="" referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain" />
                </div>
              )}
              <div className="p-4">
                <p className="text-[13px] text-muted">{hostOf(url)}</p>
                <h2 className="mt-0.5 line-clamp-3 text-[17px] leading-snug font-medium">
                  {shareTitle ?? preview.title ?? `Prodotto su ${hostOf(url)}`}
                </h2>
                {slow ? (
                  <div className="mt-3 flex gap-3 rounded-2xl bg-sunken p-3 text-sm leading-relaxed">
                    <span aria-hidden="true" className="text-lg leading-6">⏳</span>
                    <p>
                      <span className="font-medium text-ink">{hostOf(url)} nasconde i prezzi ai controlli veloci.</span>{' '}
                      <span className="text-muted">
                        Lo apriremo con un browser vero e ti manderemo una notifica con il prezzo tra circa 2 minuti.
                      </span>
                    </p>
                  </div>
                ) : !askingPrice && preview.price ? (
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <p className="tabular font-serif text-[36px] leading-none tracking-tight">
                      {formatPrice(preview.price, currency)}
                    </p>
                    <button
                      type="button"
                      onClick={() => setCorrecting(true)}
                      className="-mr-2 h-10 shrink-0 rounded-xl px-2 text-sm font-medium text-muted underline underline-offset-4 active:bg-sunken"
                    >
                      Il prezzo non è giusto?
                    </button>
                  </div>
                ) : (
                  <div className="animate-rise mt-3 rounded-2xl bg-sunken p-3">
                    <div className="flex items-start justify-between gap-2">
                      <label htmlFor={priceId} className="text-sm font-medium">
                        {preview.price
                          ? 'Che prezzo vedi sul sito? Seguiremo quello.'
                          : 'Non abbiamo trovato il prezzo. Che prezzo vedi sul sito?'}
                      </label>
                      {preview.price && (
                        <button
                          type="button"
                          onClick={() => {
                            setCorrecting(false)
                            setManualPrice('')
                          }}
                          className="-mt-1 h-8 shrink-0 rounded-lg px-2 text-sm font-medium text-muted active:bg-line"
                        >
                          Annulla
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex h-14 items-center rounded-xl border border-line bg-surface px-4 focus-within:border-ink">
                      <span className="mr-1 text-xl font-semibold text-faint">{currencySymbol(currency)}</span>
                      <input
                        id={priceId}
                        inputMode="decimal"
                        autoFocus
                        placeholder="0,00"
                        value={manualPrice}
                        onChange={(e) => setManualPrice(e.target.value.replace(/[^\d.,]/g, ''))}
                        className="tabular w-full bg-transparent font-serif text-2xl outline-none placeholder:text-faint"
                      />
                    </div>
                  </div>
                )}
              </div>
            </article>

            <RuleControl value={rule} onChange={setRule} currencySymbol={currencySymbol(currency)} currentPrice={price} />
            <IntervalChips value={interval} onChange={setInterval} />
          </>
        )}
      </main>

      {state.status !== 'failed' && (
        <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-canvas via-canvas to-canvas/0 pt-6">
          <div className="mx-auto max-w-xl px-4 pb-safe">
            {saveError && (
              <p role="alert" className="animate-rise mb-3 rounded-2xl bg-surface px-4 py-3 text-sm text-up">
                {saveError}
              </p>
            )}
            <button
              type="button"
              disabled={!canTrack}
              onClick={track}
              className="h-14 w-full rounded-2xl bg-gradient-to-br from-accent to-accent2 text-[17px] font-semibold text-on-accent shadow-lg transition active:scale-[0.98] disabled:opacity-35 disabled:shadow-none"
            >
              {saving ? 'Salvataggio…' : 'Segui'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PreviewSkeleton({ host }: { host: string }) {
  return (
    <div className="shadow-card overflow-hidden rounded-3xl bg-surface" aria-label={`Caricamento ${host}`}>
      <div className="skeleton h-[180px]" />
      <div className="flex flex-col gap-2.5 p-4">
        <p className="text-[13px] text-muted">{host}</p>
        <div className="skeleton h-4 w-4/5 rounded-full" />
        <div className="skeleton h-4 w-3/5 rounded-full" />
        <div className="skeleton mt-1 h-8 w-32 rounded-xl" />
      </div>
    </div>
  )
}

function Success({ fromSafari, pending }: { fromSafari: boolean; pending: boolean }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center" role="status">
      <div className="flex flex-col items-center">
        <div className="animate-pop grid size-24 place-items-center rounded-full bg-drop-soft">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" className="check-path stroke-drop" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="mt-6 font-serif text-3xl">Fatto, lo seguo</h1>
        <p className="mt-2 max-w-xs text-[15px] text-muted">
          {pending
            ? 'Riceverai una notifica con il prezzo attuale tra circa 2 minuti.'
            : 'Ti avviso quando il prezzo scende.'}
          {fromSafari && ' Puoi chiudere questa scheda.'}
        </p>
        {fromSafari && (
          <Link to="/" replace className="mt-6 text-[15px] font-semibold underline underline-offset-4">
            Vedi tutti i prezzi
          </Link>
        )}
      </div>
    </div>
  )
}

function NoLink() {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const url = extractUrl(value)
  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pt-safe">
      <header className="flex items-center gap-1 pt-1 pb-3">
        <Link to="/" aria-label="Torna alla lista" className="-ml-2 grid size-11 place-items-center rounded-full active:bg-sunken">
          <IconBack />
        </Link>
        <span className="text-[17px] font-semibold">Segui prezzo</span>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (url) navigate(`/add?url=${encodeURIComponent(url)}`, { replace: true })
        }}
        className="flex flex-col gap-3"
      >
        <label htmlFor="add-link" className="text-[15px] text-muted">
          La condivisione non conteneva un link. Incollalo qui:
        </label>
        <input
          id="add-link"
          type="url"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://…"
          className="h-14 rounded-2xl border border-line bg-surface px-4 text-[16px] outline-none focus:border-ink"
        />
        <button
          type="submit"
          disabled={!url}
          className="h-14 rounded-2xl bg-gradient-to-br from-accent to-accent2 font-semibold text-on-accent disabled:opacity-35"
        >
          Continua
        </button>
      </form>
    </div>
  )
}
