import type { PricePoint } from '../../shared/types'

export function Sparkline({ points, className = '' }: { points: PricePoint[]; className?: string }) {
  if (points.length < 2) return null
  const w = 72
  const h = 24
  const prices = points.map((p) => p.p)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const step = w / (points.length - 1)
  const coords = prices.map((p, i) => [i * step, h - 2 - ((p - min) / range) * (h - 4)] as const)
  const d = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const down = prices[prices.length - 1] < prices[0]
  const [lx, ly] = coords[coords.length - 1]

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={className} aria-hidden="true">
      <path d={d} fill="none" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" className={down ? 'stroke-drop' : 'stroke-faint'} />
      <circle cx={lx} cy={ly} r="2.25" className={down ? 'fill-drop' : 'fill-faint'} />
    </svg>
  )
}
