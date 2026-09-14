import { useId } from 'react'
import { parsePrice } from '../../netlify/lib/parsePrice'
import { INTERVALS, type IntervalHours } from '../../shared/types'

export type RuleDraft = { type: 'drop' | 'below'; cap: string }

type RuleProps = {
  value: RuleDraft
  onChange: (value: RuleDraft) => void
  currencySymbol: string
  currentPrice?: number
}

export function RuleControl({ value, onChange, currencySymbol, currentPrice }: RuleProps) {
  const inputId = useId()
  const capNumber = parseCap(value)
  const pct = currentPrice && capNumber ? Math.round((1 - capNumber / currentPrice) * 100) : undefined

  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-medium text-muted">Alert me on</legend>
      <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-2xl bg-sunken p-1">
        {(['drop', 'below'] as const).map((type) => (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={value.type === type}
            onClick={() => onChange({ ...value, type })}
            className={`h-11 rounded-xl text-[15px] font-semibold transition ${
              value.type === type ? 'bg-surface text-ink shadow-sm' : 'text-muted active:bg-line'
            }`}
          >
            {type === 'drop' ? 'Any drop' : 'Price below'}
          </button>
        ))}
      </div>

      {value.type === 'below' && (
        <div className="animate-rise mt-3 flex items-center gap-3">
          <label htmlFor={inputId} className="sr-only">
            Target price
          </label>
          <div className="flex h-14 flex-1 items-center rounded-2xl border border-line bg-surface px-4 focus-within:border-ink">
            <span className="mr-1 text-xl font-semibold text-faint">{currencySymbol}</span>
            <input
              id={inputId}
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              value={value.cap}
              onChange={(e) => onChange({ ...value, cap: e.target.value.replace(/[^\d.,]/g, '') })}
              onFocus={(e) => e.target.select()}
              className="tabular w-full bg-transparent font-display text-2xl font-semibold outline-none"
            />
          </div>
          {pct !== undefined && pct > 0 && (
            <span className="tabular shrink-0 text-sm font-medium text-muted">−{pct}%</span>
          )}
        </div>
      )}
    </fieldset>
  )
}

type IntervalProps = { value: IntervalHours; onChange: (value: IntervalHours) => void }

export function IntervalChips({ value, onChange }: IntervalProps) {
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-medium text-muted">Check every</legend>
      <div role="radiogroup" className="flex gap-2">
        {INTERVALS.map((hours) => (
          <button
            key={hours}
            type="button"
            role="radio"
            aria-checked={value === hours}
            onClick={() => onChange(hours)}
            className={`tabular h-11 flex-1 rounded-full border text-[15px] font-semibold transition ${
              value === hours ? 'border-ink bg-ink text-canvas' : 'border-line bg-surface text-ink active:bg-sunken'
            }`}
          >
            {hours}h
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/** Suggested target: 10% below the current price, a round number for pricier items. */
export function defaultCap(price: number): string {
  const target = price * 0.9
  return target >= 50 ? String(Math.floor(target)) : target.toFixed(2).replace('.', ',')
}

export function parseCap(draft: RuleDraft): number | undefined {
  return parsePrice(draft.cap)
}

export function currencySymbol(currency = 'EUR'): string {
  try {
    return (
      new Intl.NumberFormat('it-IT', { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')
        ?.value ?? currency
    )
  } catch {
    return currency
  }
}
