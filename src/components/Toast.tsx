import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type ToastData = { id: number; message: string; action?: { label: string; run: () => void } }
type Show = (message: string, action?: ToastData['action']) => void

const ToastContext = createContext<Show>(() => undefined)

export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null)
  const timer = useRef<number>(undefined)

  const show = useCallback<Show>((message, action) => {
    window.clearTimeout(timer.current)
    setToast({ id: Date.now(), message, action })
    timer.current = window.setTimeout(() => setToast(null), action ? 5000 : 2500)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-safe">
        {toast && (
          <div
            key={toast.id}
            className="animate-rise pointer-events-auto mb-2 flex min-h-12 w-full max-w-md items-center gap-3 rounded-2xl bg-ink py-2 pl-4 pr-2 text-[15px] text-canvas shadow-lg"
          >
            <span className="flex-1">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.run()
                  setToast(null)
                }}
                className="h-9 rounded-xl px-3 font-semibold text-canvas underline-offset-2 active:bg-white/10"
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
