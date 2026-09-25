import type { ReboundDB } from '../../db/db'
import { toCsv } from './csv'

export const BACKUP_APP = 'rebound'
export const BACKUP_VERSION = 1

const TABLES = ['exercises', 'sessions', 'workouts', 'sets', 'morningChecks', 'questionnaires', 'stages', 'machineSettings', 'milestones', 'declineSquatTests', 'settings'] as const
type TableName = (typeof TABLES)[number]

export interface Backup {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
  tables: Record<TableName, unknown[]>
}

export async function exportAll(db: ReboundDB): Promise<Backup> {
  const entries = await Promise.all(TABLES.map(async (t) => [t, await db.table(t).toArray()] as const))
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables: Object.fromEntries(entries) as Record<TableName, unknown[]> }
}

/** Validate a parsed backup file. Returns an error message, or null when it looks right. */
export function checkBackup(x: unknown): string | null {
  if (typeof x !== 'object' || x === null) return 'Not a Rebound backup file.'
  const b = x as Partial<Backup>
  if (b.app !== BACKUP_APP) return 'Not a Rebound backup file.'
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) return 'This backup is from a newer version of Rebound.'
  if (typeof b.tables !== 'object' || b.tables === null) return 'Backup has no data.'
  for (const t of TABLES) if (!Array.isArray((b.tables as Record<string, unknown>)[t])) return `Backup is missing ${t}.`
  return null
}

/** Replace everything with the backup, in one transaction (all or nothing). */
export async function importAll(db: ReboundDB, backup: Backup): Promise<void> {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear()
      await db.table(t).bulkPut(backup.tables[t])
    }
  })
}

/** Flat set log for spreadsheets. */
export async function exportSetsCsv(db: ReboundDB): Promise<string> {
  const [sets, workouts, exercises] = await Promise.all([db.sets.toArray(), db.workouts.toArray(), db.exercises.toArray()])
  const w = new Map(workouts.map((x) => [x.id, x]))
  const e = new Map(exercises.map((x) => [x.id, x.name]))
  const rows = sets
    .filter((s) => w.get(s.workoutId)?.status === 'done')
    .sort((a, b) => a.loggedAt - b.loggedAt)
    .map((s) => {
      const wk = w.get(s.workoutId)
      return [wk?.date, wk?.sessionId ?? wk?.kind, e.get(s.exerciseId) ?? s.exerciseId, s.setIndex + 1, s.side ?? '', s.weightKg ?? '', s.reps ?? '', s.holdSec ?? '', s.rir ?? '', s.pain.knee ?? '', s.pain.wrist ?? '', s.pain.shoulder ?? '', wk?.source]
    })
  return toCsv([['date', 'session', 'exercise', 'set', 'side', 'weight_kg', 'reps', 'hold_sec', 'rir', 'knee_pain', 'wrist_pain', 'shoulder_pain', 'source'], ...rows])
}

export async function exportChecksCsv(db: ReboundDB): Promise<string> {
  const checks = await db.morningChecks.orderBy('date').toArray()
  return toCsv([['date', 'knee_left', 'knee_right', 'wrist_pain', 'wrist_swelling'], ...checks.map((c) => [c.date, c.kneeLeft, c.kneeRight, c.wristPain, c.wristSwelling ? 'yes' : 'no'])])
}

/** Trigger a file download in the browser. */
export function download(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
