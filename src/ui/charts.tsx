import { useEffect, useState, type ReactNode } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const TOKENS = ['text', 'muted', 'line', 'grid', 'surface', 'surface-2', 'accent', 'series-1', 'series-2', 'series-3', 'green', 'amber', 'red'] as const
export type Tokens = Record<(typeof TOKENS)[number], string>

function read(): Tokens {
  const cs = getComputedStyle(document.documentElement)
  return Object.fromEntries(TOKENS.map((t) => [t, cs.getPropertyValue(`--${t}`).trim()])) as Tokens
}

/** Resolved colour tokens for SVG charts (SVG attributes can't take var()). Follows the theme toggle. */
export function useTokens(): Tokens {
  const [t, setT] = useState<Tokens>(read)
  useEffect(() => {
    const obs = new MutationObserver(() => setT(read()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return t
}

export const shortDate = (iso: string): string => {
  const [, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}`
}

export function ChartFrame({ title, children, empty, note }: { title: string; children: ReactNode; empty?: boolean; note?: ReactNode }) {
  return (
    <figure className="rounded-3xl border border-line bg-surface p-4">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2">
        <span className="font-semibold">{title}</span>
        {note && <span className="text-xs text-muted">{note}</span>}
      </figcaption>
      {empty ? <p className="py-8 text-center text-sm text-muted">Nothing logged in this range yet.</p> : children}
    </figure>
  )
}

export interface Series {
  key: string
  label: string
  color: string
}

interface LineProps {
  data: Record<string, number | string | null>[]
  series: Series[]
  yDomain?: [number | 'auto', number | 'auto']
  yUnit?: string
  refY?: { value: number; label: string } | null
  refX?: { date: string; label: string }[]
  height?: number
  yTicks?: number[]
}

/** Line chart: 2px lines, markers, recessive grid, crosshair tooltip, end labels for identity. */
export function Lines({ data, series, yDomain = ['auto', 'auto'], yUnit = '', refY, refX = [], height = 200, yTicks }: LineProps) {
  const t = useTokens()
  const offsets = labelOffsets(data, series)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 12, right: series.length > 1 ? 56 : 12, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: t.muted, fontSize: 11 }} axisLine={{ stroke: t.line }} tickLine={false} minTickGap={24} />
        <YAxis domain={yDomain} ticks={yTicks} tick={{ fill: t.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={40} unit={yUnit} allowDecimals={false} />
        <Tooltip
          cursor={{ stroke: t.muted, strokeDasharray: '3 3' }}
          contentStyle={{ background: t['surface-2'], border: `1px solid ${t.line}`, borderRadius: 12, color: t.text }}
          labelStyle={{ color: t.muted }}
          labelFormatter={(l) => shortDate(String(l))}
          formatter={(v, name) => [`${v}${yUnit}`, series.find((s) => s.key === name)?.label ?? String(name)]}
        />
        {refX.map((r) => (
          <ReferenceLine key={`${r.date}${r.label}`} x={r.date} stroke={t.muted} strokeDasharray="2 4" label={{ value: r.label, position: 'insideTopLeft', fill: t.muted, fontSize: 10 }} />
        ))}
        {refY && <ReferenceLine y={refY.value} stroke={t.text} strokeDasharray="6 4" strokeOpacity={0.7} label={{ value: refY.label, position: 'insideBottomRight', fill: t.muted, fontSize: 11 }} />}
        {series.map((s) => (
          <Line
            key={s.key}
            dataKey={s.key}
            stroke={s.color}
            strokeWidth={2}
            dot={{ r: 3, fill: s.color, stroke: t.surface, strokeWidth: 2 }}
            activeDot={{ r: 5 }}
            connectNulls
            isAnimationActive={false}
            label={
              series.length > 1
                ? (p: { index?: number; x?: number; y?: number }) =>
                    p.index === lastIndex(data, s.key) ? (
                      <text x={(p.x ?? 0) + 8} y={(p.y ?? 0) + 4 + (offsets.get(s.key) ?? 0)} fill={t.text} fontSize={11}>
                        {s.label}
                      </text>
                    ) : (
                      <g />
                    )
                : undefined
            }
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

/** End labels that would sit on top of each other get pushed apart by a line of text. */
function labelOffsets(data: Record<string, unknown>[], series: Series[]): Map<string, number> {
  const ends = series
    .map((s) => ({ key: s.key, v: Number(data[lastIndex(data, s.key)]?.[s.key] ?? NaN), i: lastIndex(data, s.key) }))
    .filter((e) => Number.isFinite(e.v))
    .sort((a, b) => b.v - a.v)
  const out = new Map<string, number>()
  ends.forEach((e, n) => {
    const clashes = ends.slice(0, n).filter((o) => o.i === e.i && Math.abs(o.v - e.v) < 1).length
    out.set(e.key, clashes * 13)
  })
  return out
}

function lastIndex(data: Record<string, unknown>[], key: string): number {
  for (let i = data.length - 1; i >= 0; i--) if (data[i]?.[key] !== null && data[i]?.[key] !== undefined) return i
  return -1
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  )
}
