import type { PlannedExercise, SetLog } from '../../data/records'
import type { Exercise, Joint } from '../../data/types'
import { formatKg } from '../../engine/load'
import type { Light } from '../../engine/types'

export interface SessionSummary {
  volumeKg: number
  setsDone: number
  setsPlanned: number
  maxPain: Partial<Record<Joint, number>>
}

export function summarise(plans: { plan: PlannedExercise; skipped: boolean }[], sets: SetLog[]): SessionSummary {
  const maxPain: Partial<Record<Joint, number>> = {}
  let volumeKg = 0
  for (const s of sets) {
    volumeKg += (s.weightKg ?? 0) * (s.reps ?? 0)
    for (const [j, v] of Object.entries(s.pain) as [Joint, number][]) maxPain[j] = Math.max(maxPain[j] ?? 0, v)
  }
  const setsPlanned = plans
    .filter((p) => !p.skipped && !p.plan.optional)
    .reduce((n, p) => n + p.plan.sets * (p.plan.perSide ? 2 : 1), 0)
  return { volumeKg: Math.round(volumeKg), setsDone: sets.length, setsPlanned, maxPain }
}

export interface NextChange {
  exerciseId: string
  text: string
  light: Light
}

/** Compare this session's plan with the plan the engine now makes for next time. */
export function nextChanges(before: PlannedExercise[], after: PlannedExercise[], exercises: Map<string, Exercise>, trained: Set<string>): NextChange[] {
  const out: NextChange[] = []
  const seen = new Set<string>()
  for (const next of after) {
    if (seen.has(next.slotKey) || !trained.has(next.slotKey)) continue
    seen.add(next.slotKey)
    const prev = before.find((b) => b.slotKey === next.slotKey)
    const s = next.suggestion
    if (!prev || !s) continue
    const name = exercises.get(next.exerciseId)?.name ?? next.exerciseId
    const a = prev.weightKg
    const b = s.weightKg
    if (s.change === 'hold' && next.progression === 'kneeHsr' && b !== null)
      out.push({ exerciseId: next.exerciseId, text: `${name}: stays at ${formatKg(b)}. ${capitalise(s.reason.split(': ').slice(1).join(': '))}`, light: 'amber' })
    else if (s.painFlag) out.push({ exerciseId: next.exerciseId, text: `${name}: hold load, swap offered (pain flag)`, light: 'amber' })
    else if (a !== null && b !== null && b > a) out.push({ exerciseId: next.exerciseId, text: `${name} +${formatKg(b - a)} next time`, light: 'green' })
    else if (a !== null && b !== null && b < a) out.push({ exerciseId: next.exerciseId, text: `${name} −${formatKg(a - b)} next time`, light: 'red' })
    else if (s.holdSec !== null && prev.holdSec && s.holdSec > prev.holdSec.min)
      out.push({ exerciseId: next.exerciseId, text: `${name}: ${s.holdSec} sec holds next time`, light: 'green' })
    else if (next.progression === 'reps' && prev.reps && s.reps.min > prev.reps.min)
      out.push({ exerciseId: next.exerciseId, text: `${name}: ${s.reps.min} reps next time`, light: 'green' })
  }
  return out
}

function capitalise(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1)
}
