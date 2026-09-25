// Records the app stores as you use it (as opposed to seeded program data).
// Dates are local calendar days as 'YYYY-MM-DD'; times are epoch ms.

import type { Suggestion } from '../engine/types'
import type { Joint, KneeStageId, ProgressionKind, RepRange, SectionId, SessionId, WristStageId } from './types'

export type ISODate = string

export type PainScores = Partial<Record<Joint, number>>

export type Side = 'left' | 'right'

export interface SetLog {
  id: string
  workoutId: string
  /** WorkoutExerciseState.key this set belongs to (stable through swaps). */
  entryKey: string
  exerciseId: string
  /** Load-tracking key: exercise + rep range, so heavy and volume days progress apart. */
  slotKey: string
  setIndex: number
  side: Side | null
  weightKg: number | null
  reps: number | null
  holdSec: number | null
  rir: number | null
  pain: PainScores
  loggedAt: number
}

export type WorkoutStatus = 'active' | 'done' | 'abandoned'

/** What the player shows for one exercise, frozen when the session starts. */
export interface PlannedExercise {
  exerciseId: string
  slotKey: string
  section: SectionId
  /** Optional blocks (shoulder care) start collapsed and are not counted as skipped. */
  optional: boolean
  sets: number
  /** Counted reps per set (or holds per set for holdReps). null for timed sets. */
  reps: RepRange | null
  /** Seconds per hold, for timed sets and holdReps. */
  holdSec: RepRange | null
  durationMin: RepRange | null
  restSec: number | null
  tempo: string | null
  note: string | null
  perSide: boolean
  skipIf: { joint: Joint; above: number } | null
  progression: ProgressionKind
  weightKg: number | null
  suggestion: Suggestion | null
}

export interface WorkoutExerciseState {
  /** Unique within the workout. */
  key: string
  exerciseId: string
  slotKey: string
  plan: PlannedExercise
  skipped: boolean
  /** Replacement exercise for the rest of the session, if swapped. */
  swappedTo: string | null
  /** Swap modification in force (e.g. "Use straps"). */
  modification: string | null
  /** Load change in force from a swap, e.g. -30. */
  loadPct: number
  note: string
}

export interface Workout {
  id: string
  date: ISODate
  kind: 'gym' | 'home' | 'rest'
  sessionId: SessionId | null
  status: WorkoutStatus
  startedAt: number
  finishedAt: number | null
  /** Ordered exercises; order is editable mid-session. */
  exercises: WorkoutExerciseState[]
  /** Where the player was, for resume. */
  cursor: number
  source: 'app' | 'hevy'
}

export interface MorningCheck {
  date: ISODate
  kneeLeft: number
  kneeRight: number
  wristPain: number
  wristSwelling: boolean
  createdAt: number
}

export interface Baseline {
  kneeLeft: number
  kneeRight: number
  wristPain: number
  setAt: ISODate
}

export type QuestionnaireType = 'VISA-P' | 'PRWE'

export interface QuestionnaireResult {
  id: string
  type: QuestionnaireType
  date: ISODate
  answers: Record<string, number>
  score: number
}

export interface StageChange {
  date: ISODate
  from: string
  to: string
  reason: string
  manual: boolean
}

export interface KneeStageState {
  id: 'knee'
  current: KneeStageId
  stage2Start: ISODate | null
  history: StageChange[]
}

export interface WristStageState {
  id: 'wrist'
  current: WristStageId
  history: StageChange[]
}

export type StageState = KneeStageState | WristStageState

export interface MachineSettings {
  exerciseId: string
  seatHeight: string
  padPosition: string
  pin: string
  notes: string
}

export interface MilestoneState {
  id: string
  achievedAt: ISODate | null
}

export interface DeclineSquatTest {
  date: ISODate
  pain: number
}

export interface FlareState {
  startedAt: ISODate
  /** Knee lift weights before the flare, used for the -20% restart. */
  preFlareWeights: Record<string, number>
  endedAt: ISODate | null
}

export interface Settings {
  gymDays: number[]
  theme: 'dark' | 'light'
  baseline: Baseline | null
  flare: FlareState | null
  /** Starting weights you set on day 1, per slot key. */
  workingWeights: Record<string, number>
  /** "Not yet" on a stage prompt hides it until the next day. */
  snooze: Partial<Record<'knee' | 'wrist' | 'wristRegress' | 'flare', ISODate>>
}
