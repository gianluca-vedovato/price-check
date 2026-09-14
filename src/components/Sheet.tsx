import { useEffect, useRef, type ReactNode } from 'react'

/** Bottom sheet built on <dialog> so focus trapping and Escape come for free. */
export function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto max-h-[90dvh] w-full max-w-none bg-transparent p-0 backdrop:bg-black/40 backdrop:animate-fade sm:m-auto sm:max-w-md"
    >
      {open && (
        <div className="animate-sheet pb-safe rounded-t-[28px] bg-surface px-5 pt-2 text-ink sm:rounded-[28px]">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line sm:hidden" />
          {children}
        </div>
      )}
    </dialog>
  )
}
