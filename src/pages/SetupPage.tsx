import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { IconBack, IconBell, IconShare } from '../components/icons'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'
import { getInstallPrompt, isAndroid, isIOS, isStandalone } from '../lib/platform'
import { disablePush, enablePush, getPushState, type PushState } from '../lib/push'

export function SetupPage() {
  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pt-safe pb-safe">
      <header className="flex items-center gap-1 pt-1 pb-4">
        <Link to="/" aria-label="Torna alla lista" className="-ml-2 grid size-11 place-items-center rounded-full active:bg-sunken">
          <IconBack />
        </Link>
        <h1 className="font-display text-[28px] font-bold tracking-tight">Impostazioni</h1>
      </header>

      <div className="flex flex-col gap-3">
        {!isStandalone && (isIOS || isAndroid) && <InstallStep />}
        <NotificationStep />
        <ShareStep />
        <Link
          to="/"
          className="mt-2 flex h-14 items-center justify-center rounded-2xl bg-accent text-[17px] font-semibold text-on-accent active:scale-[0.98]"
        >
          Vai ai miei prezzi
        </Link>
      </div>
    </div>
  )
}

function Step({ icon, title, done, children }: { icon: ReactNode; title: string; done?: boolean; children: ReactNode }) {
  return (
    <section className="animate-rise rounded-3xl bg-surface p-5">
      <div className="mb-3 flex items-center gap-3">
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${
            done ? 'bg-drop-soft text-drop' : 'bg-sunken text-muted'
          }`}
        >
          {done ? '✓' : icon}
        </span>
        <h2 className="text-[17px] font-semibold">{title}</h2>
      </div>
      <div className="text-[15px] leading-relaxed text-muted">{children}</div>
    </section>
  )
}

function InstallStep() {
  const prompt = getInstallPrompt()
  return (
    <Step icon="1" title="Aggiungi alla schermata Home">
      {isIOS ? (
        <ol className="list-inside list-decimal space-y-1">
          <li>
            Tocca <IconShare width={16} height={16} className="inline -translate-y-0.5 text-ink" /> Condividi nella barra di Safari
          </li>
          <li>Scegli <strong className="text-ink">Aggiungi alla schermata Home</strong></li>
          <li>Apri Prezzi dalla schermata Home</li>
        </ol>
      ) : prompt ? (
        <button type="button" onClick={() => prompt.prompt()} className="h-12 w-full rounded-xl bg-accent font-semibold text-on-accent">
          Installa l’app
        </button>
      ) : (
        <p>
          Apri il menu del browser ⋮ e scegli <strong className="text-ink">Installa app</strong>. Poi Prezzi comparirà nel menu Condividi.
        </p>
      )}
      {isIOS && <p className="mt-2 text-sm">Su iPhone le notifiche funzionano solo per le app aggiunte alla schermata Home.</p>}
    </Step>
  )
}

function NotificationStep() {
  const toast = useToast()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getPushState().then(setState)
  }, [])

  const run = async (fn: () => Promise<PushState>) => {
    setBusy(true)
    try {
      setState(await fn())
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Qualcosa è andato storto')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Step icon={<IconBell width={16} height={16} />} title="Avvisi di prezzo" done={state === 'on'}>
      {state === 'unsupported' ? (
        <p>
          {isIOS && !isStandalone
            ? 'Apri Prezzi dalla schermata Home per attivare le notifiche.'
            : 'Questo browser non supporta le notifiche.'}
        </p>
      ) : state === 'denied' ? (
        <p>Le notifiche sono bloccate. Consentile per questa app nelle impostazioni del dispositivo.</p>
      ) : state === 'on' ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              api.testPush().then(
                ({ sent }) => toast(sent ? 'Notifica di prova inviata' : 'Nessun dispositivo iscritto'),
                () => toast('Invio non riuscito'),
              )
            }
            className="h-12 flex-1 rounded-xl bg-sunken font-semibold text-ink active:bg-line"
          >
            Invia una prova
          </button>
          <button type="button" disabled={busy} onClick={() => run(disablePush)} className="h-12 rounded-xl px-4 font-semibold text-ink active:bg-sunken">
            Disattiva
          </button>
        </div>
      ) : (
        <>
          <p className="mb-3">Ricevi una notifica su questo dispositivo quando un prezzo scende.</p>
          <button
            type="button"
            disabled={busy || state === null}
            onClick={() => run(enablePush)}
            className="h-12 w-full rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-35"
          >
            {busy ? 'Attivazione…' : 'Attiva le notifiche'}
          </button>
        </>
      )}
    </Step>
  )
}

function ShareStep() {
  const toast = useToast()
  const origin = location.origin
  const bookmarklet = useRef<HTMLAnchorElement>(null)
  const shortcutUrl = `${origin}/add?url=`

  useEffect(() => {
    // React refuses javascript: URLs in JSX, so set it directly.
    bookmarklet.current?.setAttribute(
      'href',
      `javascript:void(window.open('${origin}/add?url='+encodeURIComponent(location.href)))`,
    )
  }, [origin])

  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(() => toast('Copiato'), () => toast('Copia non riuscita'))

  if (isAndroid) {
    return (
      <Step icon={<IconShare width={16} height={16} />} title="Aggiungi da qualsiasi app" done={isStandalone}>
        <p>
          Dopo l’installazione tocca <strong className="text-ink">Condividi → Prezzi</strong> in Chrome, Zara, Amazon o qualsiasi app di shopping.
        </p>
      </Step>
    )
  }

  if (isIOS) {
    return (
      <Step icon={<IconShare width={16} height={16} />} title="Aggiungi dal pulsante Condividi">
        <p className="mb-3">
          Crea un comando rapido una volta sola: <strong className="text-ink">Segui prezzo</strong> comparirà nel menu Condividi di Safari.
        </p>
        <ol className="list-inside list-decimal space-y-2">
          <li>
            Apri <strong className="text-ink">Comandi</strong>, tocca <strong className="text-ink">+</strong> e chiamalo «Segui prezzo».
          </li>
          <li>
            Tocca <strong className="text-ink">ⓘ</strong> e attiva <strong className="text-ink">Mostra nel foglio di condivisione</strong> (accetta URL).
          </li>
          <li>
            Aggiungi l’azione <strong className="text-ink">Codifica URL</strong> sull’input del comando.
          </li>
          <li>
            Aggiungi <strong className="text-ink">Apri URL</strong>: incolla questo link e aggiungi alla fine la variabile con il risultato di «Codifica URL».
          </li>
        </ol>
        <button
          type="button"
          onClick={() => copy(shortcutUrl)}
          className="mt-3 w-full rounded-xl bg-sunken p-3 text-left font-mono text-[13px] break-all text-ink active:bg-line"
        >
          {shortcutUrl}
          <span className="mt-2 block font-sans text-sm font-semibold">Tocca per copiare</span>
        </button>
      </Step>
    )
  }

  return (
    <Step icon={<IconShare width={16} height={16} />} title="Aggiungi da qualsiasi pagina">
      <p className="mb-3">Trascina questo pulsante nella barra dei preferiti. Cliccalo sulla pagina di un prodotto per seguirlo.</p>
      <a
        ref={bookmarklet}
        onClick={(e) => {
          e.preventDefault()
          toast('Trascinalo nella barra dei preferiti')
        }}
        className="inline-flex h-11 cursor-grab items-center rounded-xl bg-accent px-4 font-semibold text-on-accent"
      >
        + Segui prezzo
      </a>
    </Step>
  )
}
