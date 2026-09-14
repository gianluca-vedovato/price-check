import { formatPrice, hostOf } from '../../shared/format'
import type { Product } from '../../shared/types'
import { timeAgo } from '../lib/platform'
import { IconMore } from './icons'
import { Sparkline } from './Sparkline'

export function dropPercent(p: Product): number {
  return p.addedPrice > 0 ? Math.round(((p.addedPrice - p.lastPrice) / p.addedPrice) * 100) : 0
}

export function ProductCard({ product, onMore, style }: { product: Product; onMore: () => void; style?: React.CSSProperties }) {
  const pct = dropPercent(product)
  const host = hostOf(product.url)
  const hit = product.rule.type === 'below' && product.lastPrice <= product.rule.cap

  return (
    <li style={style} className="animate-rise relative">
      <a
        href={product.url}
        target="_blank"
        rel="noopener noreferrer"
        className="shadow-card flex gap-3.5 rounded-3xl bg-surface p-3.5 pr-13 transition active:scale-[0.985]"
      >
        <div className="size-[76px] shrink-0 overflow-hidden rounded-[18px] bg-white ring-1 ring-line">
          {product.image ? (
            <img src={product.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-contain" />
          ) : (
            <div className="grid size-full place-items-center font-serif text-3xl text-faint">{host.charAt(0).toUpperCase()}</div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <img
              src={`https://www.google.com/s2/favicons?domain=${host}&sz=32`}
              alt=""
              width={14}
              height={14}
              className="rounded-sm"
              referrerPolicy="no-referrer"
            />
            <span className="truncate">{host}</span>
          </div>
          <h2 className="mt-0.5 line-clamp-2 text-[15px] leading-snug font-medium">{product.title}</h2>

          {product.pending ? (
            <div className="mt-auto pt-2">
              {product.lastError ? (
                <span className="text-xs text-warn">⚠ {product.lastError}</span>
              ) : (
                <span className="flex items-center gap-2 text-sm text-muted" role="status">
                  <span className="size-2 animate-pulse rounded-full bg-drop" aria-hidden="true" />
                  Sto recuperando il prezzo…
                </span>
              )}
            </div>
          ) : (
          <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
            <div className="flex min-w-0 flex-col">
              <div className="flex items-baseline gap-2">
                <span className={`tabular font-serif leading-none ${pct > 0 ? 'text-[23px] text-drop' : 'text-[22px]'}`}>
                  {formatPrice(product.lastPrice, product.currency)}
                </span>
                {pct > 0 && (
                  <span className="tabular rounded-full bg-drop-soft px-2.5 py-0.5 text-xs font-bold text-drop">
                    ↓ {pct}%
                  </span>
                )}
                {pct < 0 && <span className="tabular text-xs font-semibold text-up">↑ {-pct}%</span>}
              </div>
              <span className={`mt-1 truncate text-xs ${product.lastError ? 'text-warn' : 'text-muted'}`}>
                {product.lastError ? (
                  <>⚠ Controllo non riuscito · {timeAgo(product.lastCheckedAt)}</>
                ) : (
                  <>
                    {product.rule.type === 'drop' ? 'Ogni calo' : (
                      <span className={hit ? 'font-semibold text-drop' : ''}>
                        {hit ? '✓ ' : ''}Sotto {formatPrice(product.rule.cap, product.currency)}
                      </span>
                    )}
                    {' · '}ogni {product.intervalHours}h · {timeAgo(product.lastCheckedAt)}
                  </>
                )}
              </span>
            </div>
            <Sparkline points={product.history} tone={pct > 0 ? 'drop' : pct < 0 ? 'up' : 'faint'} className="mb-0.5 shrink-0" />
          </div>
          )}
        </div>
      </a>
      <button
        type="button"
        onClick={onMore}
        aria-label={`Opzioni per ${product.title}`}
        className="absolute top-1.5 right-1.5 grid size-11 place-items-center rounded-full text-muted active:bg-sunken"
      >
        <IconMore />
      </button>
    </li>
  )
}
