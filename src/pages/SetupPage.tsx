import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { IconBack, IconBell, IconShare } from '../components/icons'
import { useToast } from '../components/Toast'
import { api, getKey, setKey } from '../lib/api'
import { getInstallPrompt, isAndroid, isIOS, isStandalone } from '../lib/platform'
import { disablePush, enablePush, getPushState, type PushState } from '../lib/push'

export function SetupPage() {
  const [connected, setConnected] = useState<boolean | null>(null)

  useEffect(() => {
    if (!getKey()) return setConnected(false)
    api.list().then(() => setConnected(true), () => setConnected(false))
  }, [])

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pt-safe pb-safe">
      <header className="flex items-center gap-1 pt-1 pb-4">
        {connected && (
          <Link to="/" aria-label="Back to list" className="-ml-2 grid size-11 place-items-center rounded-full active:bg-sunken">
            <IconBack />
          </Link>
        )}
        <h1 className="font-display text-[28px] font-bold tracking-tight">{connected ? 'Settings' : 'Welcome'}</h1>
      </header>

      <div className="flex flex-col gap-3">
        <KeyStep connected={connected} onConnected={() => setConnected(true)} />
        {connected && (
          <>
            {!isStandalone && (isIOS || isAndroid) && <InstallStep />}
            <NotificationStep />
            <ShareStep />
            <Link
              to="/"
              className="mt-2 flex h-14 items-center justify-center rounded-2xl bg-accent text-[17px] font-semibold text-on-accent active:scale-[0.98]"
            >
              Go to my prices
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

function Step({ n, title, done, children }: { n: number | ReactNode; title: string; done?: boolean; children: ReactNode }) {
  return (
    <section className="animate-rise rounded-3xl bg-surface p-5">
      <div className="mb-3 flex items-center gap-3">
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${
            done ? 'bg-drop-soft text-drop' : 'bg-sunken text-muted'
          }`}
        >
          {done ? '✓' : n}
        </span>
        <h2 className="text-[17px] font-semibold">{title}</h2>
      </div>
      <div className="text-[15px] leading-relaxed text-muted">{children}</div>
    </section>
  )
}

function KeyStep({ connected, onConnected }: { connected: boolean | null; onConnected: () => void }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [value, setValue] = useState('')
  const [checking, setChecking] = useState(false)
  const [editing, setEditing] = useState(false)

  const connect = async () => {
    setChecking(true)
    const previous = getKey()
    setKey(value)
    try {
      await api.list()
      setEditing(false)
      onConnected()
      const next = params.get('next')
      if (next?.startsWith('/')) navigate(next, { replace: true })
    } catch {
      if (previous) setKey(previous)
      toast('That key doesn’t match APP_SECRET')
    } finally {
      setChecking(false)
    }
  }

  if (connected && !editing) {
    return (
      <Step n={1} title="Connected" done>
        <div className="flex items-center justify-between gap-3">
          <span>This device can add and see products.</span>
          <button type="button" onClick={() => setEditing(true)} className="h-10 shrink-0 rounded-xl px-3 font-semibold text-ink active:bg-sunken">
            Change
          </button>
        </div>
      </Step>
    )
  }

  return (
    <Step n={1} title="Connect this device">
      <p>Paste the secret key you set as <code className="rounded bg-sunken px-1 text-ink">APP_SECRET</code> on Netlify.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (value.trim()) connect()
        }}
        className="mt-3 flex gap-2"
      >
        <label htmlFor="key" className="sr-only">Secret key</label>
        <input
          id="key"
          type="password"
          autoComplete="current-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Secret key"
          className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 text-[16px] text-ink outline-none focus:border-ink"
        />
        <button type="submit" disabled={!value.trim() || checking} className="h-12 rounded-xl bg-accent px-5 font-semibold text-on-accent disabled:opacity-35">
          {checking ? '…' : 'Connect'}
        </button>
      </form>
    </Step>
  )
}

function InstallStep() {
  const prompt = getInstallPrompt()
  return (
    <Step n={2} title="Add to Home Screen">
      {isIOS ? (
        <ol className="list-inside list-decimal space-y-1">
          <li>
            Tap <IconShare width={16} height={16} className="inline -translate-y-0.5 text-ink" /> Share in Safari’s toolbar
          </li>
          <li>Choose <strong className="text-ink">Add to Home Screen</strong></li>
          <li>Open Prices from the Home Screen and paste the key once more</li>
        </ol>
      ) : prompt ? (
        <button type="button" onClick={() => prompt.prompt()} className="h-12 w-full rounded-xl bg-accent font-semibold text-on-accent">
          Install app
        </button>
      ) : (
        <p>Open the browser menu ⋮ and choose <strong className="text-ink">Install app</strong>. Prices will then show up in the share menu.</p>
      )}
      {isIOS && <p className="mt-2 text-sm">iPhone only allows notifications from apps on the Home Screen.</p>}
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
      toast(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Step n={<IconBell width={16} height={16} />} title="Price alerts" done={state === 'on'}>
      {state === 'unsupported' ? (
        <p>{isIOS && !isStandalone ? 'Open Prices from your Home Screen to turn on notifications.' : 'This browser doesn’t support notifications.'}</p>
      ) : state === 'denied' ? (
        <p>Notifications are blocked. Allow them for this app in your device settings.</p>
      ) : state === 'on' ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => api.testPush().then(({ sent }) => toast(sent ? 'Test sent' : 'No devices subscribed'), () => toast('Couldn’t send'))}
            className="h-12 flex-1 rounded-xl bg-sunken font-semibold text-ink active:bg-line"
          >
            Send test
          </button>
          <button type="button" disabled={busy} onClick={() => run(disablePush)} className="h-12 rounded-xl px-4 font-semibold text-ink active:bg-sunken">
            Turn off
          </button>
        </div>
      ) : (
        <>
          <p className="mb-3">Get a notification on this device when a price drops.</p>
          <button type="button" disabled={busy || state === null} onClick={() => run(enablePush)} className="h-12 w-full rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-35">
            {busy ? 'Enabling…' : 'Turn on notifications'}
          </button>
        </>
      )}
    </Step>
  )
}

function ShareStep() {
  const toast = useToast()
  const key = getKey() ?? ''
  const origin = location.origin
  const bookmarklet = useRef<HTMLAnchorElement>(null)
  const shortcutUrl = `${origin}/add#k=${encodeURIComponent(key)}&url=`

  useEffect(() => {
    // React refuses javascript: URLs in JSX, so set it directly.
    bookmarklet.current?.setAttribute(
      'href',
      `javascript:void(window.open('${origin}/add?url='+encodeURIComponent(location.href)))`,
    )
  }, [origin])

  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(() => toast('Copied'), () => toast('Couldn’t copy'))

  if (isAndroid) {
    return (
      <Step n={<IconShare width={16} height={16} />} title="Add from any app" done={isStandalone}>
        <p>Once installed, tap <strong className="text-ink">Share → Prices</strong> in Chrome, Amazon or any shopping app.</p>
      </Step>
    )
  }

  if (isIOS) {
    return (
      <Step n={<IconShare width={16} height={16} />} title="Add from the Share button">
        <p className="mb-3">Create a Shortcut once, and <strong className="text-ink">Track price</strong> will show up in Safari’s share sheet.</p>
        <ol className="list-inside list-decimal space-y-2">
          <li>Open <strong className="text-ink">Shortcuts</strong>, tap <strong className="text-ink">+</strong> and name it “Track price”.</li>
          <li>Tap <strong className="text-ink">ⓘ</strong> and turn on <strong className="text-ink">Show in Share Sheet</strong> (accepts URLs).</li>
          <li>Add the action <strong className="text-ink">URL Encode</strong> with <em>Shortcut Input</em>.</li>
          <li>
            Add <strong className="text-ink">Open URLs</strong>. Paste this link, then insert the <em>URL Encoded Text</em> variable at the end:
          </li>
        </ol>
        <button
          type="button"
          onClick={() => copy(shortcutUrl)}
          className="mt-3 w-full rounded-xl bg-sunken p-3 text-left font-mono text-[13px] break-all text-ink active:bg-line"
        >
          {shortcutUrl}
          <span className="mt-2 block font-sans text-sm font-semibold">Tap to copy</span>
        </button>
        <p className="mt-2 text-sm">The link contains your key, so keep the Shortcut to yourself.</p>
      </Step>
    )
  }

  return (
    <Step n={<IconShare width={16} height={16} />} title="Add from any page">
      <p className="mb-3">Drag this button to your bookmarks bar. Click it on a product page to track it.</p>
      <a
        ref={bookmarklet}
        onClick={(e) => {
          e.preventDefault()
          toast('Drag it to the bookmarks bar')
        }}
        className="inline-flex h-11 cursor-grab items-center rounded-xl bg-accent px-4 font-semibold text-on-accent"
      >
        + Track price
      </a>
      <button type="button" onClick={() => copy(`${origin}/#k=${encodeURIComponent(key)}`)} className="mt-4 block text-sm font-semibold text-ink underline underline-offset-4">
        Copy a link that connects another device
      </button>
    </Step>
  )
}
