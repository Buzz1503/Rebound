import { useState, type ReactNode } from 'react'
import type { Light } from '../engine/types'
import { lightBg } from './light'

interface StepperProps {
  label: string
  value: number | null
  step: number
  min?: number
  unit?: string
  onChange: (v: number) => void
}

/** Big minus/plus stepper. The number itself is tappable to type a value. Tap targets 56px. */
export function Stepper({ label, value, step, min = 0, unit, onChange }: StepperProps) {
  const [text, setText] = useState<string | null>(null)
  const v = value ?? 0
  const set = (n: number) => onChange(Math.max(min, Number(n.toFixed(3))))
  const commit = () => {
    if (text !== null) {
      const n = Number(text.replace(',', '.'))
      if (text.trim() !== '' && Number.isFinite(n)) set(n)
    }
    setText(null)
  }
  return (
    <div className="flex flex-1 flex-col items-center rounded-2xl bg-surface-2 p-1">
      <span className="pt-1 text-xs tracking-wide text-muted uppercase">{label}</span>
      <div className="flex w-full items-center">
        <button aria-label={`Less ${label}`} onClick={() => set(value === null ? 0 : v - step)} className="h-14 w-14 shrink-0 rounded-xl text-3xl text-muted active:bg-line">
          −
        </button>
        <div className="flex min-w-0 flex-1 items-baseline justify-center">
          <input
            aria-label={label}
            inputMode="decimal"
            enterKeyHint="done"
            value={text ?? (value === null ? '' : String(value))}
            placeholder="—"
            onFocus={(e) => {
              setText(value === null ? '' : String(value))
              e.currentTarget.select()
            }}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            style={{ width: `${Math.max(2, (text ?? (value === null ? '' : String(value))).length + 0.6)}ch` }}
            className="num min-w-0 bg-transparent text-center text-3xl font-semibold outline-none placeholder:text-muted"
          />
          {unit && value !== null && text === null && <span className="text-base text-muted">{unit}</span>}
        </div>
        <button aria-label={`More ${label}`} onClick={() => set(v + step)} className="h-14 w-14 shrink-0 rounded-xl text-3xl text-muted active:bg-line">
          +
        </button>
      </div>
    </div>
  )
}

interface ChipsProps<T extends string | number> {
  options: { value: T; label: string; light?: Light }[]
  value: T | null
  onChange: (v: T) => void
  label: string
  cols?: number
}

/** One-tap choice row/grid (RIR, pain 0–10). */
export function Chips<T extends string | number>({ options, value, onChange, label, cols }: ChipsProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols ?? options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value
        const onClass = o.light ? `${lightBg[o.light]} text-bg` : 'bg-accent text-accent-ink'
        return (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`num h-12 rounded-xl text-lg font-semibold ${on ? onClass : 'bg-surface-2 text-text active:bg-line'}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function painOptions(limit: number): { value: number; label: string; light: Light }[] {
  return Array.from({ length: 11 }, (_, i) => ({
    value: i,
    label: String(i),
    light: i > limit ? 'red' : i === limit ? 'amber' : 'green',
  }))
}

export const RIR_OPTIONS = [
  { value: 0, label: '0' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4+' },
]

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-line bg-surface p-4 ${className}`}>{children}</div>
}

export function PrimaryButton({ children, onClick, disabled, className = '' }: { children: ReactNode; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-h-16 w-full rounded-2xl bg-accent px-5 text-lg font-semibold text-accent-ink active:opacity-80 disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  )
}

export function GhostButton({ children, onClick, className = '', label }: { children: ReactNode; onClick: () => void; className?: string; label?: string }) {
  return (
    <button aria-label={label} onClick={onClick} className={`min-h-12 rounded-xl px-3 text-sm font-medium text-muted active:bg-surface-2 ${className}`}>
      {children}
    </button>
  )
}

/** Thin progress bar. value 0..1. */
export function Bar({ value, className = 'bg-accent', label }: { value: number; className?: string; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-surface-2">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${pct}%` }} />
    </div>
  )
}
