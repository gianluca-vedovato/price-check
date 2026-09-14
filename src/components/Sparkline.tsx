import type { PricePoint } from '../../shared/types'

type Tone = 'drop' | 'up' | 'faint'

const STROKE: Record<Tone, string> = { drop: 'stroke-drop', up: 'stroke-up', faint: 'stroke-faint' }
const FILL: Record<Tone, string> = { drop: 'fill-drop', up: 'fill-up', faint: 'fill-faint' }

export function Sparkline({ points, tone = 'faint', className = '' }: { points: PricePoint[]; tone?: Tone; className?: string }) {
  if (points.length < 2) return null
  const w = 64
  const h = 22
  const prices = points.map((p) => p.p)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const step = w / (points.length - 1)
  const coords = prices.map((p, i) => [i * step, h - 2 - ((p - min) / range) * (h - 4)] as const)
  const d = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const [lx, ly] = coords[coords.length - 1]

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={className} aria-hidden="true">
      <path d={d} fill="none" strokeWidth={tone === 'faint' ? '1.75' : '2'} strokeLinejoin="round" strokeLinecap="round" className={STROKE[tone]} />
      <circle cx={lx} cy={ly} r={tone === 'faint' ? '2.25' : '2.5'} className={FILL[tone]} />
    </svg>
  )
}
