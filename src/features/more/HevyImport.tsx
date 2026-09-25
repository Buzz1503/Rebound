import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useRef, useState } from 'react'
import { db } from '../../db/db'
import { newId } from '../../db/repo'
import { GhostButton, PrimaryButton } from '../../ui/controls'
import { useToast } from '../../ui/Toast'
import { bestMatch, buildHevyImport, parseHevy, type HevyWorkout } from './hevy'

/** Hevy CSV → match each exercise name to the library (auto where similar) → import as past sessions. */
export function HevyImport({ onBack }: { onBack: () => void }) {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const library = useLiveQuery(() => db.exercises.toArray(), []) ?? []
  const [workouts, setWorkouts] = useState<HevyWorkout[] | null>(null)
  const [mapping, setMapping] = useState<Record<string, string | null>>({})
  const [auto, setAuto] = useState<Record<string, number>>({})

  const titles = useMemo(() => {
    const counts = new Map<string, number>()
    for (const w of workouts ?? []) for (const e of w.exercises) counts.set(e.title, (counts.get(e.title) ?? 0) + e.sets.length)
    return [...counts].sort((a, b) => b[1] - a[1])
  }, [workouts])

  const sorted = [...library].sort((a, b) => a.name.localeCompare(b.name))
  const mapped = titles.filter(([t]) => mapping[t]).length

  const load = async (file: File) => {
    const { workouts: ws, error } = parseHevy(await file.text())
    if (error) {
      toast({ message: error })
      return
    }
    const m: Record<string, string | null> = {}
    const a: Record<string, number> = {}
    for (const w of ws)
      for (const e of w.exercises) {
        if (e.title in m) continue
        const best = bestMatch(e.title, library)
        m[e.title] = best.exerciseId
        a[e.title] = best.score
      }
    setWorkouts(ws)
    setMapping(m)
    setAuto(a)
  }

  const importNow = async () => {
    if (!workouts) return
    const out = buildHevyImport(workouts, mapping, newId)
    await db.transaction('rw', db.workouts, db.sets, async () => {
      await db.workouts.bulkPut(out.workouts)
      await db.sets.bulkPut(out.sets)
    })
    toast({
      message: `Imported ${out.workouts.length} session${out.workouts.length === 1 ? '' : 's'}, ${out.sets.length} set${out.sets.length === 1 ? '' : 's'}`,
      undo: () =>
        void db.transaction('rw', db.workouts, db.sets, async () => {
          await db.workouts.bulkDelete(out.workouts.map((w) => w.id))
          await db.sets.bulkDelete(out.sets.map((s) => s.id))
        }),
    })
    onBack()
  }

  return (
    <div className="flex min-h-full flex-col gap-3 p-4">
      <div className="flex items-center gap-2 pt-2">
        <GhostButton onClick={onBack}>‹ More</GhostButton>
        <h1 className="text-2xl font-semibold">Hevy import</h1>
      </div>
      {!workouts ? (
        <>
          <p className="text-[15px] text-muted">
            In Hevy: Profile → Settings → Export &amp; Import Data → Export workouts. Then pick the CSV here. Imported sessions show in history and charts; they don't change your progression.
          </p>
          <PrimaryButton onClick={() => fileRef.current?.click()}>Choose Hevy CSV</PrimaryButton>
        </>
      ) : (
        <>
          <p className="text-[15px]">
            {plural(workouts.length, 'session')}, {plural(titles.length, 'exercise')}. Matched {mapped} of {titles.length}. Unmatched exercises are skipped.
          </p>
          <ul className="space-y-2">
            {titles.map(([title, n]) => {
              const cur = mapping[title] ?? ''
              const isAuto = cur && (auto[title] ?? 0) >= 0.72
              return (
                <li key={title} className="rounded-2xl border border-line bg-surface p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{title}</span>
                    <span className="num shrink-0 text-xs text-muted">{plural(n, 'set')}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${cur ? 'bg-green' : 'bg-line'}`} aria-hidden />
                    <select
                      aria-label={`Match for ${title}`}
                      value={cur}
                      onChange={(e) => setMapping((m) => ({ ...m, [title]: e.target.value || null }))}
                      className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-2 text-base"
                    >
                      <option value="">Skip this exercise</option>
                      {sorted.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {isAuto && <div className="mt-1 text-xs text-muted">Auto-matched. Change it if that's wrong.</div>}
                </li>
              )
            })}
          </ul>
          <div className="sticky bottom-0 bg-bg py-2">
            <PrimaryButton disabled={mapped === 0} onClick={() => void importNow()}>
              Import {mapped} matched exercise{mapped === 1 ? '' : 's'}
            </PrimaryButton>
          </div>
        </>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void load(f)
        }}
      />
    </div>
  )
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
