import { useEffect, useRef, useState } from 'react'
import { useNow } from '../../hooks/useNow'

/** Gap between holds inside one set (e.g. 3 x 10 x 5 sec). A UI default, not a plan value. */
export const BETWEEN_HOLDS_SEC = 5

interface Props {
  holdSec: number
  reps: number
  label: string
  onComplete: (repsDone: number, holdSec: number) => void
}

type Phase = { kind: 'idle' } | { kind: 'hold' | 'gap'; rep: number; endsAt: number } | { kind: 'paused'; rep: number; phase: 'hold' | 'gap'; leftMs: number }

function buzz(pattern: number | number[]) {
  if ('vibrate' in navigator) navigator.vibrate(pattern)
}

/** Countdown for isometric holds and planks with hold/rest intervals. */
export function HoldTimer({ holdSec, reps, label, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const running = phase.kind === 'hold' || phase.kind === 'gap'
  const now = useNow(100, running)
  const done = useRef(false)

  useEffect(() => {
    if (!running || now < phase.endsAt) return
    if (phase.kind === 'hold') {
      if (phase.rep + 1 >= reps) {
        buzz([200, 100, 200])
        if (!done.current) {
          done.current = true
          setPhase({ kind: 'idle' })
          onComplete(reps, holdSec)
        }
      } else {
        buzz(120)
        setPhase({ kind: 'gap', rep: phase.rep, endsAt: now + BETWEEN_HOLDS_SEC * 1000 })
      }
    } else {
      buzz(60)
      setPhase({ kind: 'hold', rep: phase.rep + 1, endsAt: now + holdSec * 1000 })
    }
  }, [now, running, phase, reps, holdSec, onComplete])

  const start = () => {
    done.current = false
    setPhase({ kind: 'hold', rep: 0, endsAt: Date.now() + holdSec * 1000 })
  }
  const pause = () => {
    if (phase.kind === 'hold' || phase.kind === 'gap') setPhase({ kind: 'paused', rep: phase.rep, phase: phase.kind, leftMs: phase.endsAt - Date.now() })
  }
  const resume = () => {
    if (phase.kind === 'paused') setPhase({ kind: phase.phase, rep: phase.rep, endsAt: Date.now() + phase.leftMs })
  }
  const stop = () => {
    const rep = phase.kind === 'idle' ? 0 : phase.rep
    const completed = phase.kind === 'gap' || (phase.kind === 'paused' && phase.phase === 'gap') ? rep + 1 : rep
    setPhase({ kind: 'idle' })
    if (completed > 0) onComplete(completed, holdSec)
  }

  if (phase.kind === 'idle') {
    return (
      <button onClick={start} className="min-h-16 w-full rounded-2xl bg-accent text-lg font-semibold text-accent-ink active:opacity-80">
        Start {label}
      </button>
    )
  }

  const leftMs = phase.kind === 'paused' ? phase.leftMs : Math.max(0, phase.endsAt - now)
  const isHold = phase.kind === 'hold' || (phase.kind === 'paused' && phase.phase === 'hold')
  const total = (isHold ? holdSec : BETWEEN_HOLDS_SEC) * 1000
  return (
    <div className={`rounded-2xl p-3 ${isHold ? 'bg-green-soft' : 'bg-surface-2'}`} aria-live="polite">
      <div className="flex items-baseline justify-between">
        <span className={`text-sm font-semibold tracking-wide uppercase ${isHold ? 'text-green' : 'text-muted'}`}>{isHold ? 'Hold' : 'Rest'}</span>
        {reps > 1 && (
          <span className="num text-sm text-muted">
            {phase.rep + 1} of {reps}
          </span>
        )}
      </div>
      <div className="num text-center text-6xl font-semibold">{Math.ceil(leftMs / 1000)}</div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div className={`h-full ${isHold ? 'bg-green' : 'bg-muted'}`} style={{ width: `${100 - (leftMs / total) * 100}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={phase.kind === 'paused' ? resume : pause} className="min-h-12 rounded-xl bg-surface-2 font-semibold active:bg-line">
          {phase.kind === 'paused' ? 'Resume' : 'Pause'}
        </button>
        <button onClick={stop} className="min-h-12 rounded-xl bg-surface-2 font-semibold active:bg-line">
          Stop and log
        </button>
      </div>
    </div>
  )
}
