import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import type { MachineSettings } from '../../data/records'
import type { Exercise } from '../../data/types'
import { db } from '../../db/db'
import { formatKg } from '../../engine/load'
import { platesPerSide } from '../../engine/plates'
import { bestSet } from '../../engine/progress'
import { Sheet } from '../../ui/Sheet'
import { exerciseHistory, marks } from './history'

const FIELDS: { key: keyof Omit<MachineSettings, 'exerciseId'>; label: string; placeholder: string }[] = [
  { key: 'seatHeight', label: 'Seat height', placeholder: 'e.g. 4' },
  { key: 'padPosition', label: 'Pad position', placeholder: 'e.g. lower shin, notch 3' },
  { key: 'pin', label: 'Pin number', placeholder: 'e.g. 7' },
  { key: 'notes', label: 'Notes', placeholder: 'Anything that helps next time' },
]

export function machineSummary(m: MachineSettings | undefined): string | null {
  if (!m) return null
  const parts = [m.seatHeight && `Seat ${m.seatHeight}`, m.padPosition && `Pad ${m.padPosition}`, m.pin && `Pin ${m.pin}`, m.notes].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

export function PlateHelper({ initialKg }: { initialKg: number | null }) {
  const [target, setTarget] = useState(initialKg ?? 60)
  const load = platesPerSide(target)
  return (
    <div className="rounded-2xl bg-surface-2 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Plates per side</span>
        <label className="flex items-center gap-2 text-sm text-muted">
          Target
          <input
            inputMode="decimal"
            aria-label="Target weight in kg"
            value={Number.isFinite(target) ? target : ''}
            onChange={(e) => setTarget(Number(e.target.value.replace(',', '.')) || 0)}
            className="num h-12 w-20 rounded-xl border border-line bg-surface px-2 text-right text-lg text-text"
          />
          kg
        </label>
      </div>
      <div className="mt-3 flex min-h-12 flex-wrap items-center gap-1.5">
        {load.perSide.length === 0 && <span className="text-sm text-muted">No plates</span>}
        {load.perSide.map((p, i) => (
          <span key={i} className="num rounded-lg bg-accent px-2.5 py-1.5 text-sm font-semibold text-accent-ink">
            {p}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        Loaded plates only, not the sled.{load.shortByKg > 0 && ` Closest you can load: ${formatKg(load.loadedKg)}.`}
      </p>
    </div>
  )
}

interface Props {
  exercise: Exercise | null
  weightKg: number | null
  onClose: () => void
}

export function ExerciseDetail({ exercise, weightKg, onClose }: Props) {
  const id = exercise?.id ?? ''
  const settings = useLiveQuery(() => (id ? db.machineSettings.get(id) : undefined), [id])
  const history = useLiveQuery(() => (id ? exerciseHistory(db, id) : Promise.resolve([])), [id]) ?? []
  const best = bestSet(history.flatMap((h) => marks(h.sets)))

  const save = (key: keyof Omit<MachineSettings, 'exerciseId'>, value: string) => {
    const cur: MachineSettings = settings ?? { exerciseId: id, seatHeight: '', padPosition: '', pin: '', notes: '' }
    void db.machineSettings.put({ ...cur, [key]: value })
  }

  return (
    <Sheet open={exercise !== null} onClose={onClose} label={exercise?.name ?? 'Exercise'}>
      {exercise && (
        <div className="space-y-4 pb-2">
          <div>
            <h2 className="text-2xl font-semibold">{exercise.name}</h2>
            <p className="text-sm text-muted">{exercise.machine}</p>
          </div>

          <section aria-label="Machine settings" className="grid grid-cols-2 gap-2">
            {FIELDS.map((f) => (
              <label key={f.key} className={`flex flex-col gap-1 ${f.key === 'notes' ? 'col-span-2' : ''}`}>
                <span className="text-xs text-muted">{f.label}</span>
                <input
                  defaultValue={settings?.[f.key] ?? ''}
                  key={`${id}-${f.key}-${settings ? 'loaded' : 'new'}`}
                  placeholder={f.placeholder}
                  onBlur={(e) => save(f.key, e.target.value)}
                  className="h-12 rounded-xl border border-line bg-surface-2 px-3 text-base"
                />
              </label>
            ))}
          </section>

          {exercise.steps.length > 0 && (
            <section>
              <h3 className="mb-1 text-sm font-semibold">Setup</h3>
              <ol className="list-decimal space-y-1 pl-5 text-[15px]">
                {exercise.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </section>
          )}

          <section>
            <h3 className="mb-1 text-sm font-semibold">What you should feel</h3>
            <p className="text-[15px]">Working: {exercise.musclesText}.</p>
            {exercise.flags.length > 0 && <p className="mt-1 text-sm text-muted">{exercise.flags.join(' · ')}</p>}
          </section>

          {exercise.plateLoaded && <PlateHelper initialKg={weightKg} />}

          <section>
            <h3 className="mb-2 text-sm font-semibold">History</h3>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-surface-2 p-3">
                <div className="text-xs text-muted">Best set</div>
                <div className="num text-lg font-semibold">{best ? `${formatKg(best.weightKg)} × ${best.reps}` : '—'}</div>
              </div>
              <div className="rounded-2xl bg-surface-2 p-3">
                <div className="text-xs text-muted">Pre-injury best</div>
                <div className="num text-lg font-semibold">
                  {exercise.preInjuryBest ? `${formatKg(exercise.preInjuryBest.weightKg)} × ${exercise.preInjuryBest.reps}` : 'n/a'}
                </div>
              </div>
            </div>
            {history.length === 0 && <p className="text-sm text-muted">No sessions logged yet.</p>}
            <ul className="divide-y divide-line">
              {history.map((h) => (
                <li key={h.workout.id} className="flex justify-between gap-3 py-2 text-sm">
                  <span className="text-muted">{h.workout.date}</span>
                  <span className="num text-right">
                    {h.sets.map((s) => (s.holdSec ? `${s.holdSec}s` : `${s.weightKg ?? 0}×${s.reps ?? 0}`)).join('  ')}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Sheet>
  )
}
