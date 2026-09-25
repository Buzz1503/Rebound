import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'framer-motion'
import { useCallback, useMemo, useState } from 'react'
import type { Workout, WorkoutExerciseState } from '../../data/records'
import type { Exercise, SwapAction } from '../../data/types'
import { db } from '../../db/db'
import { deleteSet, logSet } from '../../db/repo'
import { formatKg, roundToIncrement } from '../../engine/load'
import { platesPerSide } from '../../engine/plates'
import { swapOptions } from '../../engine/swaps'
import { useWakeLock } from '../../hooks/useWakeLock'
import { GhostButton, PrimaryButton, Stepper } from '../../ui/controls'
import { lightBorder, lightSoft, lightText } from '../../ui/light'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import { ExerciseDetail, machineSummary } from '../exercise/ExerciseDetail'
import { HoldTimer } from './HoldTimer'
import { Overview } from './Overview'
import { RestSheet, type RestState } from './RestSheet'
import { SECTION_LABEL } from './sections'
import { effectiveWeight, groupByEntry, jointsOverLimitToday, maxPainToday, nextOpenIndex, nextSlot, type SetSlot } from './sets'

interface Draft {
  weightKg: number | null
  reps: number
  holdSec: number
}

interface Props {
  workout: Workout
  title: string
  onFinish: () => void
  onDiscard: () => void
}

function fmtRest(sec: number | null): string | null {
  if (!sec) return null
  return sec % 60 === 0 ? `rest ${sec / 60} min` : sec > 60 ? `rest ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : `rest ${sec} sec`
}

function prescriptionText(s: WorkoutExerciseState): string {
  const p = s.plan
  const side = p.perSide ? ' per side' : ''
  if (p.durationMin) return p.durationMin.min === p.durationMin.max ? `${p.durationMin.min} min` : `${p.durationMin.min} to ${p.durationMin.max} min`
  const hold = p.holdSec ? (p.holdSec.min === p.holdSec.max ? `${p.holdSec.min} sec` : `${p.holdSec.min} to ${p.holdSec.max} sec`) : null
  const reps = p.reps ? (p.reps.min === p.reps.max ? `${p.reps.min}` : `${p.reps.min} to ${p.reps.max}`) : null
  if (reps && hold) return `${p.sets} × ${reps} × ${hold} holds${side}`
  if (hold) return `${p.sets} × ${hold}${side}`
  return `${p.sets} × ${reps ?? '?'}${side}`
}

/** Does this exercise use a weight stepper? Bodyweight and rehab drills do not. */
function usesWeight(s: WorkoutExerciseState, ex: Exercise | undefined): boolean {
  if (!ex || s.plan.durationMin || s.plan.holdSec) return false
  return ex.progression === 'kneeHsr' || ex.progression === 'double'
}

export function Player({ workout, title, onFinish, onDiscard }: Props) {
  useWakeLock(true)
  const toast = useToast()
  const sets = useLiveQuery(() => db.sets.where('workoutId').equals(workout.id).toArray(), [workout.id])
  const exList = useLiveQuery(() => db.exercises.toArray(), [])
  const machine = useLiveQuery(() => db.machineSettings.toArray(), [])
  const exercises = useMemo(() => new Map((exList ?? []).map((e) => [e.id, e])), [exList])
  const machineMap = useMemo(() => new Map((machine ?? []).map((m) => [m.exerciseId, m])), [machine])
  const setsByEntry = useMemo(() => groupByEntry(sets ?? []), [sets])

  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [rest, setRest] = useState<RestState | null>(null)
  const [restKey, setRestKey] = useState<string | null>(null)
  const [overview, setOverview] = useState(false)
  const [detail, setDetail] = useState<Exercise | null>(null)
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [dir, setDir] = useState(0)

  const states = workout.exercises
  const index = Math.min(workout.cursor, states.length - 1)
  const state = states[index]

  const save = useCallback((patch: Partial<Workout>) => db.workouts.put({ ...workout, ...patch }), [workout])
  const updateState = (key: string, patch: Partial<WorkoutExerciseState>) =>
    save({ exercises: states.map((s) => (s.key === key ? { ...s, ...patch } : s)) })

  const go = (i: number) => {
    if (i < 0 || i >= states.length || i === index) return
    setDir(i > index ? 1 : -1)
    void save({ cursor: i })
  }

  if (!state || !sets) return null

  const currentEx = exercises.get(state.swappedTo ?? state.exerciseId)
  const logged = setsByEntry.get(state.key) ?? []
  const slot = nextSlot(state, logged)
  const over = jointsOverLimitToday(logged)
  const lastLogged = logged[logged.length - 1]

  const draftFor = (s: WorkoutExerciseState, ex: Exercise | undefined): Draft => {
    const d = drafts[s.key]
    if (d) return d
    const last = (setsByEntry.get(s.key) ?? []).at(-1)
    return {
      weightKg: last?.weightKg ?? effectiveWeight(s, ex),
      reps: s.plan.suggestion?.reps.min ?? s.plan.reps?.min ?? 0,
      holdSec: s.plan.suggestion?.holdSec ?? s.plan.holdSec?.min ?? 0,
    }
  }
  const draft = draftFor(state, currentEx)
  const setDraft = (patch: Partial<Draft>) => setDrafts((all) => ({ ...all, [state.key]: { ...draft, ...patch } }))

  const weighted = usesWeight(state, currentEx)
  const incKg = currentEx?.increment?.unit === 'kg' ? currentEx.increment.amount : 2.5
  const showRir = weighted || currentEx?.progression === 'reps'
  const joints = currentEx?.painJoints ?? []

  const log = async (s: SetSlot, values: { weightKg: number | null; reps: number | null; holdSec: number | null }) => {
    const slotKey = state.swappedTo ? `${state.swappedTo}:swap` : state.slotKey
    const row = await logSet(db, {
      workoutId: workout.id,
      entryKey: state.key,
      exerciseId: state.swappedTo ?? state.exerciseId,
      slotKey,
      setIndex: s.setIndex,
      side: s.side,
      ...values,
      rir: null,
      pain: {},
    })
    const label = `Set ${s.setIndex + 1}${s.side ? ` ${s.side}` : ''} logged`
    toast({ message: label, undo: () => deleteSet(db, row.id).then(() => setRest(null)) })

    const after = [...logged, row]
    const finishedExercise = nextSlot(state, after) === null
    const midPair = s.side === 'left'
    const restSec = midPair ? null : finishedExercise ? null : state.plan.restSec
    if (restSec || ((showRir || joints.length > 0) && !midPair)) {
      setRestKey(state.key)
      setRest({ endsAt: restSec ? Date.now() + restSec * 1000 : null, totalSec: restSec ?? 0, setId: row.id })
    }
    if (finishedExercise) {
      const map = new Map(setsByEntry)
      map.set(state.key, after)
      const next = nextOpenIndex(states, map, index + 1)
      if (next !== null && next !== index) {
        setDir(1)
        void save({ cursor: next })
      }
    }
  }

  const restSet = rest ? sets.find((x) => x.id === rest.setId) : undefined
  const restState = restKey ? states.find((s) => s.key === restKey) : undefined
  const restEx = restState ? exercises.get(restState.swappedTo ?? restState.exerciseId) : undefined

  const applySwap = (a: SwapAction) => {
    const prev = { skipped: state.skipped, swappedTo: state.swappedTo, modification: state.modification, loadPct: state.loadPct }
    const undo = () => void updateState(state.key, prev)
    switch (a.kind) {
      case 'replace':
        void updateState(state.key, { swappedTo: a.exerciseId, modification: null })
        break
      case 'modify':
        void updateState(state.key, { modification: a.label })
        break
      case 'loadChange': {
        // Apply to the weight actually being lifted, not just the plan.
        const before = draft
        const w = draft.weightKg === null ? null : roundToIncrement(draft.weightKg * (1 + a.pct / 100), incKg)
        void updateState(state.key, { loadPct: a.pct })
        setDraft({ weightKg: w })
        toast({
          message: `${a.label}: ${w === null ? '' : formatKg(w)}`,
          undo: () => {
            undo()
            setDrafts((all) => ({ ...all, [state.key]: before }))
          },
        })
        return
      }
      case 'drop':
      case 'skip':
        void updateState(state.key, { skipped: true })
        break
      case 'hold':
        toast({ message: 'Load will hold next session.' })
        return
    }
    toast({ message: a.label, undo })
  }

  const skip = (s: WorkoutExerciseState) => {
    void updateState(s.key, { skipped: !s.skipped })
    toast({ message: s.skipped ? 'Exercise back in' : 'Exercise skipped', undo: () => void updateState(s.key, { skipped: s.skipped }) })
  }

  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    const a = states[i]
    const b = states[j]
    if (!a || !b) return
    const next = [...states]
    next[i] = b
    next[j] = a
    const cursor = index === i ? j : index === j ? i : index
    void save({ exercises: next, cursor })
  }

  const gateJoint = state.plan.skipIf
  const gatePain = gateJoint ? maxPainToday(sets, gateJoint.joint) : null
  const gated = gateJoint && gatePain !== null && gatePain > gateJoint.above

  const suggestion = state.plan.suggestion
  const cardLight = over.length > 0 ? 'amber' : null
  const totalSets = sets.length
  const done = nextOpenIndex(states, setsByEntry, 0) === null

  return (
    <div className="flex h-full flex-col">
      <header className="safe-top flex items-center gap-2 border-b border-line px-2 pb-1">
        <GhostButton onClick={() => setOverview(true)} label="Session overview">
          ☰ List
        </GhostButton>
        <div className="flex-1 text-center">
          <div className="text-sm font-semibold">{title}</div>
          <div className="num text-xs text-muted">
            {index + 1} of {states.length} · {totalSets} sets
          </div>
        </div>
        <GhostButton onClick={() => setConfirmEnd(true)} className="text-accent">
          Finish
        </GhostButton>
      </header>

      <div className="relative flex-1 overflow-hidden">
        {/* Enter-only transition: nothing waits on an exit animation. */}
          <motion.div
            key={state.key}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            onDragEnd={(_, info) => {
              if (info.offset.x < -70) go(index + 1)
              else if (info.offset.x > 70) go(index - 1)
            }}
            className={`absolute inset-0 overflow-y-auto px-4 pt-3 pb-4 ${dir < 0 ? 'card-in-left' : 'card-in-right'}`}
          >
            <article aria-label={currentEx?.name} className={`rounded-3xl border p-4 ${cardLight ? `${lightBorder[cardLight]} ${lightSoft[cardLight]}` : 'border-line bg-surface'}`}>
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <div className="text-xs font-semibold tracking-wide text-muted uppercase">{SECTION_LABEL[state.plan.section]}</div>
                  <h2 className={`text-2xl leading-tight font-semibold ${state.skipped ? 'text-muted line-through' : ''}`}>{currentEx?.name}</h2>
                  {state.swappedTo && <div className="text-sm text-amber">Swapped from {exercises.get(state.exerciseId)?.name}</div>}
                </div>
                <button aria-label="Exercise details" onClick={() => setDetail(currentEx ?? null)} className="h-12 w-12 shrink-0 rounded-xl bg-surface-2 text-lg text-muted">
                  i
                </button>
              </div>

              {machineSummary(machineMap.get(currentEx?.id ?? '')) && (
                <div className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">{machineSummary(machineMap.get(currentEx?.id ?? ''))}</div>
              )}

              <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[15px]">
                <span className="num font-semibold">{prescriptionText(state)}</span>
                {state.plan.tempo && <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-sm">Tempo {state.plan.tempo}</span>}
                {fmtRest(state.plan.restSec) && <span className="text-sm text-muted">{fmtRest(state.plan.restSec)}</span>}
              </div>
              {state.plan.note && <p className="mt-1 text-sm text-muted">{state.plan.note}</p>}
              {currentEx?.plateLoaded && draft.weightKg !== null && draft.weightKg > 0 && (
                <p className="num mt-1 text-sm text-muted">Plates per side: {platesPerSide(draft.weightKg).perSide.join(' + ') || 'none'}</p>
              )}

              {suggestion && !state.swappedTo && !(suggestion.status === 'needsWeight' && logged.length > 0) && (
                <p className={`mt-3 text-[15px] ${lightText[suggestion.light]}`}>
                  {suggestion.weightKg !== null && weighted && <span className="num mr-1 font-semibold">{formatKg(suggestion.weightKg)}.</span>}
                  {suggestion.reason}
                </p>
              )}

              {state.modification && <p className="mt-2 rounded-xl bg-amber-soft px-3 py-2 text-sm text-amber">In force: {state.modification}</p>}
              {state.loadPct !== 0 && <p className="mt-2 rounded-xl bg-amber-soft px-3 py-2 text-sm text-amber">Load {state.loadPct}% for the rest of today</p>}

              {gated && !state.skipped && (
                <div className="mt-3 rounded-2xl bg-amber-soft p-3">
                  <p className="text-sm text-amber">
                    Shoulder {gatePain}/10 today (above {gateJoint.above}): skip suggested.
                  </p>
                  <button onClick={() => skip(state)} className="mt-2 min-h-12 w-full rounded-xl bg-amber font-semibold text-bg">
                    Skip {currentEx?.name}
                  </button>
                </div>
              )}

              {over.length > 0 && !state.skipped && (
                <div className="mt-3 rounded-2xl border border-amber/50 p-3">
                  <p className="text-sm font-semibold text-amber">
                    {over.map((o) => `${o.joint.charAt(0).toUpperCase()}${o.joint.slice(1)} ${o.pain}/10`).join(', ')}: above your limit. Swap for the rest of today:
                  </p>
                  <div className="mt-2 grid gap-2">
                    {swapOptions(state.exerciseId, over[0]?.joint ?? 'knee').map((a) => (
                      <button key={a.label} onClick={() => applySwap(a)} className="min-h-12 rounded-xl bg-surface-2 px-3 text-left font-medium active:bg-line">
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {logged.length > 0 && (
                <ol className="mt-3 divide-y divide-line">
                  {logged.map((s) => (
                    <li key={s.id} className="num flex items-center gap-2 py-2 text-[15px]">
                      <span className="w-14 text-muted">
                        Set {s.setIndex + 1}
                        {s.side ? (s.side === 'left' ? ' L' : ' R') : ''}
                      </span>
                      <span className="flex-1 font-semibold">
                        {state.plan.durationMin && s.holdSec ? `${Math.round(s.holdSec / 60)} min` : s.holdSec ? `${s.reps && s.reps > 1 ? `${s.reps} × ` : ''}${s.holdSec} sec` : `${s.weightKg !== null && s.weightKg > 0 ? `${s.weightKg} kg × ` : ''}${s.reps ?? 0}`}
                      </span>
                      {s.rir !== null && <span className="text-sm text-muted">RIR {s.rir === 4 ? '4+' : s.rir}</span>}
                      {Object.entries(s.pain).map(([j, v]) => (
                        <span key={j} className="text-sm text-muted capitalize">
                          {j} {v}
                        </span>
                      ))}
                    </li>
                  ))}
                </ol>
              )}

              {state.note && <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">Note: {state.note}</p>}

              <div className="mt-3 flex gap-2">
                <GhostButton onClick={() => setNoteFor(state.key)} className="flex-1 bg-surface-2">
                  {state.note ? 'Edit note' : 'Add note'}
                </GhostButton>
                <GhostButton onClick={() => skip(state)} className="flex-1 bg-surface-2">
                  {state.skipped ? 'Unskip' : 'Skip'}
                </GhostButton>
              </div>
            </article>

            <div className="mt-3 flex items-center justify-between text-sm text-muted">
              <GhostButton onClick={() => go(index - 1)} label="Previous exercise">
                ‹ Prev
              </GhostButton>
              <span>Swipe to move</span>
              <GhostButton onClick={() => go(index + 1)} label="Next exercise">
                Next ›
              </GhostButton>
            </div>
          </motion.div>
      </div>

      {/* Thumb zone: the set controls live at the bottom. */}
      <div className="border-t border-line bg-bg px-4 pt-3 pb-3">
        {state.skipped ? (
          <PrimaryButton onClick={() => go(nextOpenIndex(states, setsByEntry, index + 1) ?? index + 1)}>Next exercise</PrimaryButton>
        ) : slot === null ? (
          done ? (
            <PrimaryButton onClick={() => setConfirmEnd(true)}>Finish session</PrimaryButton>
          ) : (
            <PrimaryButton onClick={() => go(nextOpenIndex(states, setsByEntry, index + 1) ?? index)}>Next exercise</PrimaryButton>
          )
        ) : state.plan.durationMin ? (
          <PrimaryButton onClick={() => void log(slot, { weightKg: null, reps: null, holdSec: (state.plan.durationMin?.max ?? 0) * 60 })}>
            Done: {prescriptionText(state)}
          </PrimaryButton>
        ) : state.plan.holdSec ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Stepper label="Hold" unit="s" value={draft.holdSec} step={currentEx?.increment?.unit === 'sec' ? currentEx.increment.amount : 1} min={1} onChange={(v) => setDraft({ holdSec: v })} />
            </div>
            <HoldTimer
              key={`${state.key}-${slot.setIndex}-${slot.side ?? ''}`}
              holdSec={draft.holdSec}
              reps={state.plan.reps?.max ?? 1}
              label={`set ${slot.setIndex + 1}${slot.side ? ` ${slot.side}` : ''} · ${draft.holdSec}s${(state.plan.reps?.max ?? 1) > 1 ? ` × ${state.plan.reps?.max}` : ''}`}
              onComplete={(reps, holdSec) => void log(slot, { weightKg: null, reps, holdSec })}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              {weighted && <Stepper label="kg" value={draft.weightKg} step={incKg} onChange={(v) => setDraft({ weightKg: v })} />}
              <Stepper label="Reps" value={draft.reps} step={1} onChange={(v) => setDraft({ reps: v })} />
            </div>
            {weighted && draft.weightKg === null && <p className="text-center text-sm text-amber">Tap the kg number to enter your working weight.</p>}
            <PrimaryButton
              disabled={weighted && draft.weightKg === null}
              onClick={() => void log(slot, { weightKg: weighted ? draft.weightKg : currentEx?.startWeightKg === 0 ? 0 : null, reps: draft.reps, holdSec: null })}
            >
              {lastLogged && (lastLogged.reps !== draft.reps || lastLogged.weightKg !== draft.weightKg) && logged.length > 0 ? 'Log set' : 'Done as planned'}
              <span className="ml-2 text-base font-normal opacity-80">
                set {slot.setIndex + 1}
                {slot.side ? ` ${slot.side}` : ''}
              </span>
            </PrimaryButton>
          </div>
        )}
      </div>

      <RestSheet
        rest={rest}
        set={restSet}
        joints={restEx?.painJoints ?? []}
        showRir={!!restEx && !!restState && (usesWeight(restState, restEx) || restEx.progression === 'reps')}
        onAdd30={() => setRest((r) => (r?.endsAt ? { ...r, endsAt: r.endsAt + 30_000, totalSec: r.totalSec + 30 } : r))}
        onClose={() => setRest(null)}
        onUpdate={(patch) => {
          if (restSet) void db.sets.put({ ...restSet, ...patch })
        }}
      />

      <Overview
        open={overview}
        onClose={() => setOverview(false)}
        states={states}
        setsByEntry={setsByEntry}
        exercises={exercises}
        current={index}
        onJump={go}
        onMove={move}
      />

      <ExerciseDetail exercise={detail} weightKg={draft.weightKg} onClose={() => setDetail(null)} />

      <NoteSheet
        state={states.find((s) => s.key === noteFor) ?? null}
        onClose={() => setNoteFor(null)}
        onSave={(key, note) => {
          const prev = states.find((s) => s.key === key)?.note ?? ''
          void updateState(key, { note })
          toast({ message: 'Note saved', undo: () => void updateState(key, { note: prev }) })
        }}
      />

      <Sheet open={confirmEnd} onClose={() => setConfirmEnd(false)} label="Finish session">
        <h2 className="text-xl font-semibold">Finish {title}?</h2>
        <p className="mt-1 text-muted">{totalSets} sets logged. Everything is already saved.</p>
        <div className="mt-4 space-y-2">
          <PrimaryButton
            onClick={() => {
              setConfirmEnd(false)
              onFinish()
            }}
          >
            Finish and see summary
          </PrimaryButton>
          <button
            onClick={() => {
              setConfirmEnd(false)
              onDiscard()
            }}
            className="min-h-14 w-full rounded-2xl text-red"
          >
            Discard session
          </button>
          <button onClick={() => setConfirmEnd(false)} className="min-h-14 w-full rounded-2xl bg-surface-2 font-semibold">
            Keep going
          </button>
        </div>
      </Sheet>
    </div>
  )
}

function NoteSheet({ state, onClose, onSave }: { state: WorkoutExerciseState | null; onClose: () => void; onSave: (key: string, note: string) => void }) {
  const [text, setText] = useState('')
  const [forKey, setForKey] = useState<string | null>(null)
  if (state && forKey !== state.key) {
    setForKey(state.key)
    setText(state.note)
  }
  return (
    <Sheet open={state !== null} onClose={onClose} label="Exercise note">
      <label className="block">
        <span className="text-sm text-muted">Note for this exercise</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-2xl border border-line bg-surface-2 p-3 text-base"
          placeholder="e.g. seat one notch lower next time"
        />
      </label>
      <PrimaryButton
        className="mt-2"
        onClick={() => {
          if (state) onSave(state.key, text.trim())
          setForKey(null)
          onClose()
        }}
      >
        Save note
      </PrimaryButton>
    </Sheet>
  )
}

