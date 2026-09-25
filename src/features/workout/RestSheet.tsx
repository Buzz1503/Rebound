import { useEffect, useRef } from 'react'
import type { SetLog } from '../../data/records'
import { RULES } from '../../data/seed'
import type { Joint } from '../../data/types'
import { useNow } from '../../hooks/useNow'
import { Chips, painOptions, RIR_OPTIONS } from '../../ui/controls'
import { Sheet } from '../../ui/Sheet'

export interface RestState {
  /** null = no rest timer for this set, just the RIR/pain taps. */
  endsAt: number | null
  totalSec: number
  setId: string
}

interface Props {
  rest: RestState | null
  set: SetLog | undefined
  joints: Joint[]
  showRir: boolean
  onAdd30: () => void
  onClose: () => void
  onUpdate: (patch: Partial<Pick<SetLog, 'rir' | 'pain'>>) => void
}

const jointName: Record<Joint, string> = { knee: 'Knee', wrist: 'Wrist', shoulder: 'Shoulder' }

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Auto-starts after each set: countdown, +30 sec, skip, plus one-tap RIR and pain. */
export function RestSheet({ rest, set, joints, showRir, onAdd30, onClose, onUpdate }: Props) {
  const open = rest !== null
  const now = useNow(250, open && rest.endsAt !== null)
  const left = rest?.endsAt ? Math.max(0, Math.ceil((rest.endsAt - now) / 1000)) : null
  const buzzed = useRef<string | null>(null)

  useEffect(() => {
    if (!rest || left !== 0 || buzzed.current === rest.setId) return
    buzzed.current = rest.setId
    if ('vibrate' in navigator) navigator.vibrate([300, 150, 300])
  }, [left, rest])

  const finished = left === 0
  return (
    <Sheet open={open} onClose={onClose} label="Rest" modal={false}>
      {left !== null && (
        <div className="mb-4 flex items-center gap-3">
          <div className="flex-1">
            <div className="text-xs tracking-wide text-muted uppercase">{finished ? 'Rest done' : 'Rest'}</div>
            <div className={`num text-5xl font-semibold ${finished ? 'text-green' : ''}`}>{fmt(left)}</div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full bg-accent" style={{ width: `${rest ? 100 - (left / rest.totalSec) * 100 : 0}%` }} />
            </div>
          </div>
          <button onClick={onAdd30} className="num h-14 w-16 rounded-2xl bg-surface-2 font-semibold active:bg-line">
            +30s
          </button>
        </div>
      )}

      {showRir && (
        <div className="mb-3">
          <div className="mb-1.5 text-sm text-muted">Reps in reserve</div>
          <Chips label="Reps in reserve" options={RIR_OPTIONS} value={set?.rir ?? null} onChange={(rir) => onUpdate({ rir })} />
        </div>
      )}

      {joints.map((j) => (
        <div key={j} className="mb-3">
          <div className="mb-1.5 flex justify-between text-sm text-muted">
            <span>{jointName[j]} pain</span>
            <span>limit {RULES.painLimit[j]}</span>
          </div>
          <Chips
            label={`${jointName[j]} pain`}
            cols={6}
            options={painOptions(RULES.painLimit[j])}
            value={set?.pain[j] ?? null}
            onChange={(v) => onUpdate({ pain: { ...(set?.pain ?? {}), [j]: v } })}
          />
        </div>
      ))}

      <button onClick={onClose} className={`mt-1 min-h-14 w-full rounded-2xl text-lg font-semibold ${finished || left === null ? 'bg-accent text-accent-ink' : 'bg-surface-2'}`}>
        {left === null ? 'Done' : finished ? 'Next set' : 'Skip rest'}
      </button>
    </Sheet>
  )
}
