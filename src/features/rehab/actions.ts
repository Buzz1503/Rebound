import type { ISODate, KneeStageState, QuestionnaireType, StageChange, WristStageState } from '../../data/records'
import type { KneeStageId, WristStageId } from '../../data/types'
import type { ReboundDB } from '../../db/db'
import { getSettings, newId, updateSettings } from '../../db/repo'
import { scoreQuestionnaire } from '../../engine/questionnaires'

export const KNEE_ORDER: KneeStageId[] = ['K1', 'K2', 'K3', 'K4']
export const WRIST_ORDER: WristStageId[] = ['W1', 'W2', 'W3']

export async function setKneeStage(db: ReboundDB, to: KneeStageId, date: ISODate, reason: string, manual: boolean): Promise<KneeStageState> {
  const cur = (await db.stages.get('knee')) as KneeStageState
  const change: StageChange = { date, from: cur.current, to, reason, manual }
  const next: KneeStageState = {
    ...cur,
    current: to,
    // Re-entering Stage 2 restarts the week count at the next knee session.
    stage2Start: to === 'K2' && cur.current !== 'K2' ? null : cur.stage2Start,
    history: [...cur.history, change],
  }
  await db.stages.put(next)
  return cur
}

export async function setWristStage(db: ReboundDB, to: WristStageId, date: ISODate, reason: string, manual: boolean): Promise<WristStageState> {
  const cur = (await db.stages.get('wrist')) as WristStageState
  await db.stages.put({ ...cur, current: to, history: [...cur.history, { date, from: cur.current, to, reason, manual }] })
  return cur
}

/** Restore a stage record exactly (undo). */
export async function restoreStage(db: ReboundDB, prev: KneeStageState | WristStageState): Promise<void> {
  await db.stages.put(prev)
}

/** Flare mode: knee to isometrics for 3 days, then knee lifts restart 20% below these weights. */
export async function startFlare(db: ReboundDB, today: ISODate): Promise<void> {
  const sets = await db.sets.where('slotKey').anyOf('leg-extension:knee', 'leg-press:knee').toArray()
  const workouts = new Map((await db.workouts.bulkGet([...new Set(sets.map((s) => s.workoutId))])).filter((w) => !!w).map((w) => [w!.id, w!]))
  const pre: Record<string, number> = {}
  for (const id of ['leg-extension', 'leg-press']) {
    const last = sets
      .filter((s) => s.exerciseId === id && s.weightKg !== null && workouts.get(s.workoutId)?.status === 'done')
      .sort((a, b) => b.loggedAt - a.loggedAt)[0]
    if (last?.weightKg != null) pre[id] = last.weightKg
  }
  await updateSettings(db, { flare: { startedAt: today, preFlareWeights: pre, endedAt: null } })
}

export async function endFlare(db: ReboundDB, today: ISODate): Promise<void> {
  const s = await getSettings(db)
  if (s.flare) await updateSettings(db, { flare: { ...s.flare, endedAt: today } })
}

export async function snooze(db: ReboundDB, key: 'knee' | 'wrist' | 'wristRegress' | 'flare', today: ISODate): Promise<void> {
  const s = await getSettings(db)
  await updateSettings(db, { snooze: { ...s.snooze, [key]: today } })
}

export async function saveQuestionnaire(db: ReboundDB, type: QuestionnaireType, answers: Record<string, number>, date: ISODate): Promise<string> {
  const id = newId()
  await db.questionnaires.put({ id, type, date, answers, score: scoreQuestionnaire(type, answers) })
  return id
}
