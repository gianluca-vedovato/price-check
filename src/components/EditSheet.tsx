import { useEffect, useState } from 'react'
import { formatPrice } from '../../shared/format'
import type { IntervalHours, Product } from '../../shared/types'
import { currencySymbol, defaultCap, IntervalChips, parseCap, RuleControl, type RuleDraft } from './AlertControls'
import { IconExternal, IconRefresh, IconTrash } from './icons'
import { Sheet } from './Sheet'

type Props = {
  product: Product | null
  onClose: () => void
  onSave: (product: Product, changes: { rule: Product['rule']; intervalHours: IntervalHours }) => Promise<void>
  onCheck: (product: Product) => Promise<void>
  onDelete: (product: Product) => void
}

export function EditSheet({ product, onClose, onSave, onCheck, onDelete }: Props) {
  const [rule, setRule] = useState<RuleDraft>({ type: 'drop', cap: '' })
  const [interval, setInterval] = useState<IntervalHours>(6)
  const [busy, setBusy] = useState<'save' | 'check' | null>(null)

  useEffect(() => {
    if (!product) return
    setRule(
      product.rule.type === 'below'
        ? { type: 'below', cap: String(product.rule.cap).replace('.', ',') }
        : { type: 'drop', cap: product.pending ? '' : defaultCap(product.lastPrice) },
    )
    setInterval(product.intervalHours)
  }, [product])

  const cap = parseCap(rule)
  const canSave = rule.type === 'drop' || cap !== undefined

  return (
    <Sheet open={Boolean(product)} onClose={onClose} label="Modifica avviso">
      {product && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            {product.image && (
              <img src={product.image} alt="" referrerPolicy="no-referrer" className="size-12 rounded-xl bg-white object-contain ring-1 ring-line" />
            )}
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium">{product.title}</p>
              <p className="tabular text-sm text-muted">
                {product.pending
                  ? 'Sto recuperando il prezzo…'
                  : `Ora ${formatPrice(product.lastPrice, product.currency)} · minimo ${formatPrice(product.lowestPrice, product.currency)}`}
                {product.route === 'browser' && ' · controllato con un browser'}
              </p>
            </div>
          </div>

          {product.lastError && (
            <p className="rounded-2xl bg-sunken px-4 py-3 text-sm text-warn">⚠ Ultimo controllo non riuscito: {product.lastError}</p>
          )}

          <RuleControl
            value={rule}
            onChange={setRule}
            currencySymbol={currencySymbol(product.currency)}
            currentPrice={product.pending ? undefined : product.lastPrice}
          />
          <IntervalChips value={interval} onChange={setInterval} />

          <button
            type="button"
            disabled={!canSave || busy !== null}
            onClick={async () => {
              setBusy('save')
              try {
                await onSave(product, {
                  rule: rule.type === 'below' && cap ? { type: 'below', cap } : { type: 'drop' },
                  intervalHours: interval,
                })
              } finally {
                setBusy(null)
              }
            }}
            className="h-14 rounded-2xl bg-accent text-[17px] font-semibold text-on-accent transition active:scale-[0.98] disabled:opacity-40"
          >
            {busy === 'save' ? 'Salvataggio…' : 'Salva'}
          </button>

          <div className="grid grid-cols-3 gap-2 border-t border-line pt-4">
            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-16 flex-col items-center justify-center gap-1 rounded-2xl text-[13px] font-medium active:bg-sunken"
            >
              <IconExternal />
              Apri
            </a>
            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                setBusy('check')
                try {
                  await onCheck(product)
                } finally {
                  setBusy(null)
                }
              }}
              className="flex h-16 flex-col items-center justify-center gap-1 rounded-2xl text-[13px] font-medium active:bg-sunken disabled:opacity-50"
            >
              <IconRefresh className={busy === 'check' ? 'animate-spin' : ''} />
              {busy === 'check' ? 'Controllo…' : 'Controlla ora'}
            </button>
            <button
              type="button"
              onClick={() => onDelete(product)}
              className="flex h-16 flex-col items-center justify-center gap-1 rounded-2xl text-[13px] font-medium text-up active:bg-sunken"
            >
              <IconTrash />
              Elimina
            </button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
