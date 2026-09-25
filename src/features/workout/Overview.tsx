import { useState } from 'react'
import type { SetLog, WorkoutExerciseState } from '../../data/records'
import type { Exercise } from '../../data/types'
import { Sheet } from '../../ui/Sheet'
import { SECTION_LABEL } from './sections'
import { entryStatus, type EntryStatus } from './sets'

interface Props {
  open: boolean
  onClose: () => void
  states: WorkoutExerciseState[]
  setsByEntry: Map<string, SetLog[]>
  exercises: Map<string, Exercise>
  current: number
  onJump: (i: number) => void
  onMove: (i: number, dir: -1 | 1) => void
}

const statusDot: Record<EntryStatus, string> = {
  todo: 'border border-line',
  partial: 'bg-amber',
  done: 'bg-green',
  skipped: 'bg-line',
}

/** Every exercise under its section header; tap to jump, arrows to reorder. */
export function Overview({ open, onClose, states, setsByEntry, exercises, current, onJump, onMove }: Props) {
  const [showOptional, setShowOptional] = useState(false)
  let lastSection = ''
  return (
    <Sheet open={open} onClose={onClose} label="Session overview">
      <ul>
        {states.map((s, i) => {
          const header = s.plan.section !== lastSection ? s.plan.section : null
          lastSection = s.plan.section
          const hidden = s.plan.optional && !showOptional
          const logged = setsByEntry.get(s.key) ?? []
          const st = entryStatus(s, logged)
          const ex = exercises.get(s.swappedTo ?? s.exerciseId)
          return (
            <li key={s.key}>
              {header && (
                <div className="mt-3 mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-wide text-muted uppercase">{SECTION_LABEL[s.plan.section]}</span>
                  {s.plan.optional && (
                    <button onClick={() => setShowOptional((v) => !v)} className="min-h-12 px-2 text-sm text-accent">
                      {showOptional ? 'Hide' : 'Show'}
                    </button>
                  )}
                </div>
              )}
              {!hidden && (
                <div className={`flex items-center gap-1 rounded-2xl ${i === current ? 'bg-surface-2' : ''}`}>
                  <button
                    onClick={() => {
                      onJump(i)
                      onClose()
                    }}
                    className="flex min-h-14 flex-1 items-center gap-3 px-3 text-left"
                  >
                    <span className={`h-3 w-3 shrink-0 rounded-full ${statusDot[st]}`} aria-label={st} />
                    <span className={`flex-1 ${st === 'skipped' ? 'text-muted line-through' : ''}`}>{ex?.name ?? s.exerciseId}</span>
                    <span className="num text-sm text-muted">
                      {logged.length}/{s.plan.sets * (s.plan.perSide ? 2 : 1)}
                    </span>
                  </button>
                  <button aria-label="Move up" disabled={i === 0} onClick={() => onMove(i, -1)} className="h-12 w-12 rounded-xl text-muted disabled:opacity-30">
                    ↑
                  </button>
                  <button aria-label="Move down" disabled={i === states.length - 1} onClick={() => onMove(i, 1)} className="h-12 w-12 rounded-xl text-muted disabled:opacity-30">
                    ↓
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
