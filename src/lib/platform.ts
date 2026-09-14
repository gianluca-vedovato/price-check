export const isAndroid = /Android/i.test(navigator.userAgent)

// iPadOS reports itself as a Mac, so also look for touch support.
export const isIOS =
  !isAndroid &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

export const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

export const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let installPrompt: InstallPrompt | null = null
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  installPrompt = e as InstallPrompt
})

export const getInstallPrompt = () => installPrompt

export function vibrate(pattern: number | number[]) {
  navigator.vibrate?.(pattern)
}

export function timeAgo(ts: number): string {
  const minutes = Math.round((Date.now() - ts) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}
