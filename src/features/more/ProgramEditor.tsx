import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import type { KneeStageState } from '../../data/records'
import type { Category, Exercise, Joint, MuscleGroup, SectionId, SessionEntry, SessionId, SessionItem, SessionTemplate } from '../../data/types'
import { db } from '../../db/db'
import { KNEE_ORDER } from '../rehab/actions'
import { GhostButton, PrimaryButton, Stepper } from '../../ui/controls'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import { MUSCLE_LABEL } from '../progress/data'
import { SECTION_LABEL } from '../workout/sections'

/** The add-exercise library is limited to machines and cables. */
export function isMachineOrCable(e: Exercise): boolean {
  return ['knee', 'gluteHam', 'calves', 'upper', 'core'].includes(e.category) && /machine|cable|press|pulldown|squat|row/i.test(e.machine)
}

const SECTION_FOR: Partial<Record<Category, SectionId>> = { knee: 'kneeStrength', gluteHam: 'gluteHam', calves: 'gluteHam', upper: 'upper', core: 'core' }
const isItem = (e: SessionEntry): e is SessionItem => 'exerciseId' in e

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      {children}
    </label>
  )
}

const input = 'mt-1 h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-base'

function ItemSheet({ item, name, onSave, onClose }: { item: SessionItem | null; name: string; onSave: (i: SessionItem) => void; onClose: () => void }) {
  const [d, setD] = useState<SessionItem | null>(null)
  const cur = d ?? item
  if (item && d && d.exerciseId !== item.exerciseId) setD(null)
  const set = (patch: Partial<SessionItem>) => cur && setD({ ...cur, ...patch })
  const p = cur?.prescription
  return (
    <Sheet
      open={item !== null}
      onClose={() => {
        setD(null)
        onClose()
      }}
      label={`Edit ${name}`}
    >
      {cur && p && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">{name}</h2>
          {p.kind === 'kneeStage' && <p className="text-sm text-muted">Sets and reps follow your knee Stage 2 week.</p>}
          {(p.kind === 'fixed' || p.kind === 'holdReps' || p.kind === 'timed') && (
            <div className="grid grid-cols-3 gap-2">
              <Stepper label="Sets" value={p.sets} step={1} min={1} onChange={(v) => set({ prescription: { ...p, sets: v } })} />
              {p.kind !== 'timed' && (
                <>
                  <Stepper label="Reps min" value={p.reps.min} step={1} min={1} onChange={(v) => set({ prescription: { ...p, reps: { min: v, max: Math.max(v, p.reps.max) } } })} />
                  <Stepper label="Reps max" value={p.reps.max} step={1} min={1} onChange={(v) => set({ prescription: { ...p, reps: { min: Math.min(v, p.reps.min), max: v } } })} />
                </>
              )}
              {p.kind === 'timed' && (
                <>
                  <Stepper label="Hold min" unit="s" value={p.holdSec.min} step={5} min={5} onChange={(v) => set({ prescription: { ...p, holdSec: { min: v, max: Math.max(v, p.holdSec.max) } } })} />
                  <Stepper label="Hold max" unit="s" value={p.holdSec.max} step={5} min={5} onChange={(v) => set({ prescription: { ...p, holdSec: { min: Math.min(v, p.holdSec.min), max: v } } })} />
                </>
              )}
            </div>
          )}
          {p.kind === 'duration' && (
            <div className="grid grid-cols-2 gap-2">
              <Stepper label="Min" unit="m" value={p.minutes.min} step={1} min={1} onChange={(v) => set({ prescription: { ...p, minutes: { min: v, max: Math.max(v, p.minutes.max) } } })} />
              <Stepper label="Max" unit="m" value={p.minutes.max} step={1} min={1} onChange={(v) => set({ prescription: { ...p, minutes: { min: Math.min(v, p.minutes.min), max: v } } })} />
            </div>
          )}
          <Stepper label="Rest" unit="s" value={cur.restSec ?? 0} step={15} onChange={(v) => set({ restSec: v || null })} />
          <Field label="Tempo label (text only, e.g. 3-0-3)">
            <input className={input} value={cur.tempo ?? ''} onChange={(e) => set({ tempo: e.target.value || null })} />
          </Field>
          <Field label="Note / cue">
            <input className={input} value={cur.note ?? ''} onChange={(e) => set({ note: e.target.value || null })} />
          </Field>
          <label className="flex min-h-12 items-center gap-3">
            <input type="checkbox" checked={cur.perSide} onChange={(e) => set({ perSide: e.target.checked })} className="h-6 w-6" />
            Log left and right separately
          </label>
          <PrimaryButton
            onClick={() => {
              onSave(cur)
              setD(null)
            }}
          >
            Save
          </PrimaryButton>
        </div>
      )}
    </Sheet>
  )
}

const JOINTS: Joint[] = ['knee', 'wrist', 'shoulder']
const CATS: { id: Category; label: string }[] = [
  { id: 'knee', label: 'Knee strength' },
  { id: 'gluteHam', label: 'Glutes & hamstrings' },
  { id: 'calves', label: 'Calves' },
  { id: 'upper', label: 'Upper body' },
  { id: 'core', label: 'Core' },
]

function ExerciseSheet({ exercise, onClose }: { exercise: Exercise | 'new' | null; onClose: () => void }) {
  const toast = useToast()
  const blank: Exercise = {
    id: '',
    name: '',
    machine: 'Machine',
    musclesText: '',
    muscles: [],
    category: 'upper',
    startWeightKg: null,
    startWeightNote: 'Set on day 1',
    increment: { amount: 2.5, unit: 'kg' },
    preInjuryBest: null,
    steps: [],
    flags: [],
    painJoints: [],
    unilateral: false,
    timed: false,
    plateLoaded: false,
    progression: 'double',
    lockedUntil: null,
  }
  const base = exercise === 'new' ? blank : exercise
  const [d, setD] = useState<Exercise | null>(null)
  const [steps, setSteps] = useState<string | null>(null)
  const cur = d ?? base
  const close = () => {
    setD(null)
    setSteps(null)
    onClose()
  }
  const set = (patch: Partial<Exercise>) => cur && setD({ ...cur, ...patch })
  const isNew = exercise === 'new'
  const weighted = cur?.increment?.unit === 'kg'
  return (
    <Sheet open={exercise !== null} onClose={close} label="Edit exercise">
      {cur && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">{isNew ? 'New exercise' : cur.name}</h2>
          <Field label="Name">
            <input className={input} value={cur.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          {isNew ? (
            <div className="grid grid-cols-2 gap-2">
              {['Machine', 'Cable'].map((m) => (
                <button key={m} onClick={() => set({ machine: m })} className={`min-h-12 rounded-xl font-semibold ${cur.machine === m ? 'bg-accent text-accent-ink' : 'bg-surface-2'}`}>
                  {m}
                </button>
              ))}
            </div>
          ) : (
            <Field label="Machine">
              <input className={input} value={cur.machine} onChange={(e) => set({ machine: e.target.value })} />
            </Field>
          )}
          {isNew && (
            <Field label="Group">
              <select className={input} value={cur.category} onChange={(e) => set({ category: e.target.value as Category })}>
                {CATS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {isNew && (
            <Field label="Main muscle">
              <select className={input} value={cur.muscles[0] ?? ''} onChange={(e) => set({ muscles: [e.target.value as MuscleGroup], musclesText: MUSCLE_LABEL[e.target.value as MuscleGroup].toLowerCase() })}>
                <option value="">Choose…</option>
                {(Object.keys(MUSCLE_LABEL) as MuscleGroup[]).filter((m) => m !== 'cardio').map((m) => (
                  <option key={m} value={m}>
                    {MUSCLE_LABEL[m]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {weighted && (
            <div className="grid grid-cols-2 gap-2">
              <Stepper label="Start kg" value={cur.startWeightKg} step={cur.increment?.amount ?? 2.5} onChange={(v) => set({ startWeightKg: v, startWeightNote: null })} />
              <Stepper label="Increment" unit="kg" value={cur.increment?.amount ?? 2.5} step={1.25} min={0.5} onChange={(v) => set({ increment: { amount: v, unit: 'kg' } })} />
            </div>
          )}
          {weighted && (
            <div className="grid grid-cols-2 gap-2">
              <Stepper label="Pre-injury kg" value={cur.preInjuryBest?.weightKg ?? null} step={2.5} onChange={(v) => set({ preInjuryBest: { weightKg: v, reps: cur.preInjuryBest?.reps ?? 10 } })} />
              <Stepper label="× reps" value={cur.preInjuryBest?.reps ?? null} step={1} min={1} onChange={(v) => set({ preInjuryBest: { weightKg: cur.preInjuryBest?.weightKg ?? 0, reps: v } })} />
            </div>
          )}
          <Field label="Setup steps and cues (one per line)">
            <textarea
              rows={4}
              className="mt-1 w-full rounded-xl border border-line bg-surface-2 p-3 text-base"
              value={steps ?? cur.steps.join('\n')}
              onChange={(e) => setSteps(e.target.value)}
            />
          </Field>
          <div>
            <span className="text-xs text-muted">Pain score after each set</span>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {JOINTS.map((j) => (
                <button
                  key={j}
                  role="checkbox"
                  aria-checked={cur.painJoints.includes(j)}
                  onClick={() => set({ painJoints: cur.painJoints.includes(j) ? cur.painJoints.filter((x) => x !== j) : [...cur.painJoints, j] })}
                  className={`min-h-12 rounded-xl font-semibold capitalize ${cur.painJoints.includes(j) ? 'bg-accent text-accent-ink' : 'bg-surface-2'}`}
                >
                  {j}
                </button>
              ))}
            </div>
          </div>
          <PrimaryButton
            disabled={!cur.name.trim() || (isNew && cur.muscles.length === 0)}
            onClick={async () => {
              const next: Exercise = {
                ...cur,
                name: cur.name.trim(),
                id: isNew ? `custom-${cur.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}` : cur.id,
                machine: isNew ? `${cur.machine} (${cur.name.trim()})` : cur.machine,
                steps: (steps ?? cur.steps.join('\n')).split('\n').map((s) => s.trim()).filter(Boolean),
              }
              const prev = isNew ? undefined : await db.exercises.get(next.id)
              await db.exercises.put(next)
              toast({ message: isNew ? `${next.name} added to library` : 'Exercise saved', undo: () => void (prev ? db.exercises.put(prev) : db.exercises.delete(next.id)) })
              close()
            }}
          >
            Save
          </PrimaryButton>
        </div>
      )}
    </Sheet>
  )
}

function SessionEditor({ session, exercises, onBack }: { session: SessionTemplate; exercises: Map<string, Exercise>; onBack: () => void }) {
  const toast = useToast()
  const [editing, setEditing] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const knee = useLiveQuery(() => db.stages.get('knee') as Promise<KneeStageState | undefined>, [])
  const save = (entries: SessionEntry[], message: string) => {
    const prev = session
    void db.sessions.put({ ...session, entries }).then(() => toast({ message, undo: () => void db.sessions.put(prev) }))
  }
  const move = (i: number, dir: -1 | 1) => {
    const e = [...session.entries]
    const a = e[i]
    const b = e[i + dir]
    if (!a || !b) return
    e[i] = b
    e[i + dir] = a
    save(e, 'Moved')
  }
  const kneeIdx = KNEE_ORDER.indexOf(knee?.current ?? 'K2')
  const library = [...exercises.values()].filter(isMachineOrCable).sort((a, b) => a.name.localeCompare(b.name))
  const editingItem = editing !== null ? session.entries[editing] : undefined
  let last = ''
  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2 pt-2">
        <GhostButton onClick={onBack}>‹ Program</GhostButton>
        <h1 className="text-2xl font-semibold">Session {session.id}</h1>
      </div>
      <p className="text-sm text-muted">{session.name}. Changes apply from your next session.</p>
      <ul>
        {session.entries.map((e, i) => {
          const header = e.section !== last ? e.section : null
          last = e.section
          const name = isItem(e) ? (exercises.get(e.exerciseId)?.name ?? e.exerciseId) : e.block === 'wristBlock' ? 'Wrist block (current stage)' : 'Shoulder care (optional)'
          const p = isItem(e) ? e.prescription : null
          const summary = !p
            ? 'Set by your stage'
            : p.kind === 'kneeStage'
              ? 'Knee week sets × reps'
              : p.kind === 'fixed'
                ? `${p.sets} × ${p.reps.min}${p.reps.max !== p.reps.min ? `–${p.reps.max}` : ''}`
                : p.kind === 'timed'
                  ? `${p.sets} × ${p.holdSec.min}${p.holdSec.max !== p.holdSec.min ? `–${p.holdSec.max}` : ''} s`
                  : p.kind === 'duration'
                    ? `${p.minutes.min} min`
                    : `${p.sets} × ${p.reps.min} holds`
          return (
            <li key={i}>
              {header && <div className="mt-3 mb-1 text-xs font-semibold tracking-wide text-muted uppercase">{SECTION_LABEL[e.section]}</div>}
              <div className="flex items-center gap-1 rounded-2xl bg-surface">
                <button disabled={!isItem(e)} onClick={() => setEditing(i)} className="flex min-h-14 flex-1 flex-col justify-center px-3 text-left">
                  <span>{name}</span>
                  <span className="num text-sm text-muted">
                    {summary}
                    {isItem(e) && e.restSec ? ` · rest ${e.restSec}s` : ''}
                    {isItem(e) && e.tempo ? ` · ${e.tempo}` : ''}
                  </span>
                </button>
                <button aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="h-12 w-10 text-muted disabled:opacity-30">
                  ↑
                </button>
                <button aria-label="Move down" disabled={i === session.entries.length - 1} onClick={() => move(i, 1)} className="h-12 w-10 text-muted disabled:opacity-30">
                  ↓
                </button>
                <button aria-label={`Remove ${name}`} onClick={() => save(session.entries.filter((_, j) => j !== i), `${name} removed`)} className="h-12 w-10 text-red">
                  ×
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      <PrimaryButton className="mt-2" onClick={() => setAdding(true)}>
        Add exercise
      </PrimaryButton>

      <ItemSheet
        item={editingItem && isItem(editingItem) ? editingItem : null}
        name={editingItem && isItem(editingItem) ? (exercises.get(editingItem.exerciseId)?.name ?? '') : ''}
        onClose={() => setEditing(null)}
        onSave={(it) => {
          if (editing === null) return
          save(
            session.entries.map((x, j) => (j === editing ? it : x)),
            'Saved',
          )
          setEditing(null)
        }}
      />

      <Sheet open={adding} onClose={() => setAdding(false)} label="Add exercise">
        <h2 className="mb-2 text-xl font-semibold">Machines and cables</h2>
        <ul className="divide-y divide-line">
          {library.map((e) => {
            const locked = e.lockedUntil !== null && kneeIdx < KNEE_ORDER.indexOf(e.lockedUntil.knee)
            return (
              <li key={e.id}>
                <button
                  disabled={locked}
                  onClick={() => {
                    const section = SECTION_FOR[e.category] ?? 'upper'
                    const it: SessionItem = {
                      exerciseId: e.id,
                      section,
                      prescription: { kind: 'fixed', sets: 3, reps: { min: 10, max: 12 } },
                      restSec: 90,
                      tempo: null,
                      note: null,
                      perSide: e.unilateral,
                      skipIf: null,
                    }
                    // Insert at the end of its section so the session order stays intact.
                    const entries = [...session.entries]
                    const order = Object.keys(SECTION_LABEL)
                    let at = entries.length
                    for (let k = entries.length - 1; k >= 0; k--) {
                      const s = entries[k]
                      if (s && order.indexOf(s.section) <= order.indexOf(section)) {
                        at = k + 1
                        break
                      }
                    }
                    entries.splice(at, 0, it)
                    save(entries, `${e.name} added`)
                    setAdding(false)
                  }}
                  className="flex min-h-14 w-full flex-col justify-center py-2 text-left disabled:opacity-40"
                >
                  <span>{e.name}</span>
                  <span className="text-sm text-muted">{locked ? 'Locked until knee Stage 3' : e.machine}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </Sheet>
    </div>
  )
}

export function ProgramEditor({ onBack }: { onBack: () => void }) {
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  const list = useLiveQuery(() => db.exercises.toArray(), [])
  const [open, setOpen] = useState<SessionId | 'library' | null>(null)
  const [editEx, setEditEx] = useState<Exercise | 'new' | null>(null)
  if (!sessions || !list) return null
  const exercises = new Map(list.map((e) => [e.id, e]))
  const session = sessions.find((s) => s.id === open)
  if (session) return <SessionEditor session={session} exercises={exercises} onBack={() => setOpen(null)} />

  if (open === 'library') {
    const groups = CATS.map((c) => ({ ...c, items: list.filter((e) => e.category === c.id).sort((a, b) => a.name.localeCompare(b.name)) }))
    return (
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-center gap-2 pt-2">
          <GhostButton onClick={() => setOpen(null)}>‹ Program</GhostButton>
          <h1 className="text-2xl font-semibold">Exercises</h1>
        </div>
        {groups.map((g) => (
          <section key={g.id}>
            <div className="mt-3 mb-1 text-xs font-semibold tracking-wide text-muted uppercase">{g.label}</div>
            <ul className="divide-y divide-line rounded-2xl bg-surface px-3">
              {g.items.map((e) => (
                <li key={e.id}>
                  <button onClick={() => setEditEx(e)} className="flex min-h-14 w-full items-center justify-between gap-2 py-2 text-left">
                    <span>{e.name}</span>
                    <span className="num text-sm text-muted">
                      {e.startWeightKg ? `${e.startWeightKg} kg` : e.startWeightNote ?? ''}
                      {e.increment ? ` · +${e.increment.amount}${e.increment.unit === 'kg' ? ' kg' : e.increment.unit === 'sec' ? ' s' : ' reps'}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <PrimaryButton className="mt-3" onClick={() => setEditEx('new')}>
          New machine or cable exercise
        </PrimaryButton>
        <ExerciseSheet exercise={editEx} onClose={() => setEditEx(null)} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2 pt-2">
        <GhostButton onClick={onBack}>‹ More</GhostButton>
        <h1 className="text-2xl font-semibold">Program</h1>
      </div>
      {sessions.map((s) => (
        <button key={s.id} onClick={() => setOpen(s.id)} className="flex min-h-16 items-center rounded-2xl bg-surface px-4 text-left">
          <span className="flex-1">
            <span className="block font-semibold">Session {s.id}</span>
            <span className="block text-sm text-muted">{s.name}</span>
          </span>
          <span className="text-muted">›</span>
        </button>
      ))}
      <button onClick={() => setOpen('library')} className="flex min-h-16 items-center rounded-2xl bg-surface px-4 text-left">
        <span className="flex-1">
          <span className="block font-semibold">Exercise library</span>
          <span className="block text-sm text-muted">Start weights, increments, pre-injury bests, cues</span>
        </span>
        <span className="text-muted">›</span>
      </button>
    </div>
  )
}
