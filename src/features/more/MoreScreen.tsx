import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState, type ReactNode } from 'react'
import { PLAN_META, RULES, SOURCES, WEEK_PLAN } from '../../data/seed'
import type { Baseline } from '../../data/records'
import { db } from '../../db/db'
import { clearAll, getSettings, updateSettings } from '../../db/repo'
import { seedIfEmpty } from '../../db/seedDb'
import { backToBackDays } from '../../engine/schedule'
import { useToday } from '../../hooks/today'
import { Card, PrimaryButton, Stepper } from '../../ui/controls'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import { checkBackup, download, exportAll, exportChecksCsv, exportSetsCsv, importAll, type Backup } from './backup'
import { HevyImport } from './HevyImport'
import { ProgramEditor } from './ProgramEditor'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted uppercase">{title}</h2>
      <Card>{children}</Card>
    </section>
  )
}

function Row({ label, sub, onClick, danger }: { label: string; sub?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className="flex min-h-14 w-full items-center gap-3 border-b border-line py-2 text-left last:border-0">
      <span className="flex-1">
        <span className={`block ${danger ? 'text-red' : ''}`}>{label}</span>
        {sub && <span className="block text-sm text-muted">{sub}</span>}
      </span>
      <span className="text-muted">›</span>
    </button>
  )
}

function Schedule() {
  const toast = useToast()
  const settings = useLiveQuery(() => getSettings(db), [])
  if (!settings) return null
  const days = settings.gymDays
  const clash = backToBackDays(days)
  const toggle = (d: number) => {
    const prev = days
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort()
    void updateSettings(db, { gymDays: next }).then(() => toast({ message: 'Gym days updated', undo: () => void updateSettings(db, { gymDays: prev }) }))
  }
  return (
    <>
      <p className="mb-2 text-sm text-muted">
        {RULES.gymDaysPerWeek} gym days a week, never back to back. The day after a gym day is home rehab; other days are rest.
      </p>
      <div className="grid grid-cols-7 gap-1">
        {DAYS.map((name, d) => (
          <button
            key={name}
            role="checkbox"
            aria-checked={days.includes(d)}
            onClick={() => toggle(d)}
            className={`min-h-12 rounded-xl text-sm font-semibold ${days.includes(d) ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}
          >
            {name}
          </button>
        ))}
      </div>
      {clash.length > 0 && (
        <p className="mt-2 rounded-xl bg-amber-soft px-3 py-2 text-sm text-amber">
          {clash.map(([a, b]) => `${DAYS[a]} and ${DAYS[b]}`).join(', ')} are back to back. Tendons need 48 hours between sessions.
        </p>
      )}
      {days.length !== RULES.gymDaysPerWeek && (
        <p className="mt-2 text-sm text-amber">
          {days.length} gym days chosen; the plan is {RULES.gymDaysPerWeek}.
        </p>
      )}
      <p className="mt-2 text-xs text-muted">Sessions rotate {WEEK_PLAN.filter((d) => d.session).map((d) => d.session).join(' → ')} across your gym days.</p>
    </>
  )
}

function BaselineEditor() {
  const toast = useToast()
  const today = useToday()
  const settings = useLiveQuery(() => getSettings(db), [])
  const [draft, setDraft] = useState<Baseline | null>(null)
  if (!settings) return null
  const b = draft ?? settings.baseline
  if (!b) return <p className="text-sm text-muted">Your first morning check sets the baseline.</p>
  const set = (patch: Partial<Baseline>) => setDraft({ ...b, ...patch })
  return (
    <>
      <p className="mb-2 text-sm text-muted">Mornings are compared to this. Set {settings.baseline?.setAt}.</p>
      <div className="grid grid-cols-3 gap-2">
        <Stepper label="L knee" value={b.kneeLeft} step={1} onChange={(v) => set({ kneeLeft: Math.min(10, v) })} />
        <Stepper label="R knee" value={b.kneeRight} step={1} onChange={(v) => set({ kneeRight: Math.min(10, v) })} />
        <Stepper label="Wrist" value={b.wristPain} step={1} onChange={(v) => set({ wristPain: Math.min(10, v) })} />
      </div>
      {draft && (
        <PrimaryButton
          className="mt-2"
          onClick={() => {
            const prev = settings.baseline
            void updateSettings(db, { baseline: { ...draft, setAt: today } }).then(() =>
              toast({ message: 'Baseline updated', undo: () => void updateSettings(db, { baseline: prev }) }),
            )
            setDraft(null)
          }}
        >
          Save baseline
        </PrimaryButton>
      )}
    </>
  )
}

function Reset() {
  const toast = useToast()
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [typed, setTyped] = useState('')
  const close = () => {
    setStep(0)
    setTyped('')
  }
  return (
    <>
      <Row label="Reset all data" sub="Deletes everything on this phone" danger onClick={() => setStep(1)} />
      <Sheet open={step > 0} onClose={close} label="Reset all data">
        {step === 1 ? (
          <>
            <h2 className="text-xl font-semibold text-red">Delete everything?</h2>
            <p className="mt-1 text-muted">All sessions, checks, scores, stages and program edits. Export a backup first if you might want it.</p>
            <button onClick={() => setStep(2)} className="mt-4 min-h-14 w-full rounded-2xl bg-red-soft font-semibold text-red">
              Yes, continue
            </button>
            <button onClick={close} className="mt-2 min-h-14 w-full rounded-2xl bg-surface-2 font-semibold">
              Cancel
            </button>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-red">Second confirmation</h2>
            <label className="mt-2 block text-sm text-muted">
              Type RESET to delete everything.
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" className="mt-1 h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-base text-text" />
            </label>
            <button
              disabled={typed.trim().toUpperCase() !== 'RESET'}
              onClick={async () => {
                const snapshot = await exportAll(db)
                await clearAll(db)
                await seedIfEmpty(db)
                close()
                toast({ message: 'All data deleted', undo: () => void importAll(db, snapshot) })
              }}
              className="mt-3 min-h-14 w-full rounded-2xl bg-red font-semibold text-bg disabled:opacity-30"
            >
              Delete everything
            </button>
          </>
        )}
      </Sheet>
    </>
  )
}

export function MoreScreen() {
  const toast = useToast()
  const [view, setView] = useState<'home' | 'program' | 'hevy'>('home')
  const fileRef = useRef<HTMLInputElement>(null)
  const theme = useLiveQuery(async () => (await getSettings(db)).theme, [], 'dark')
  const [pending, setPending] = useState<Backup | null>(null)

  if (view === 'program') return <ProgramEditor onBack={() => setView('home')} />
  if (view === 'hevy') return <HevyImport onBack={() => setView('home')} />

  const stamp = new Date().toISOString().slice(0, 10)

  return (
    <div className="flex flex-col gap-5 p-4">
      <h1 className="pt-2 text-3xl font-semibold">More</h1>

      <Section title="Appearance">
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-2">
          {(['dark', 'light'] as const).map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={theme === t}
              onClick={() => void updateSettings(db, { theme: t })}
              className={`min-h-12 rounded-xl font-semibold capitalize ${theme === t ? 'bg-accent text-accent-ink' : 'bg-surface-2'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Program">
        <Row label="Program editor" sub="Sessions, exercises, sets, reps, rest, increments, cues" onClick={() => setView('program')} />
      </Section>

      <Section title="Schedule">
        <Schedule />
      </Section>

      <Section title="Morning check baseline">
        <BaselineEditor />
      </Section>

      <Section title="Data">
        <Row
          label="Export backup (JSON)"
          sub="Everything, for re-import"
          onClick={() => void exportAll(db).then((b) => download(`rebound-backup-${stamp}.json`, JSON.stringify(b), 'application/json'))}
        />
        <Row
          label="Export sets (CSV)"
          sub="Every logged set, for spreadsheets"
          onClick={() => void exportSetsCsv(db).then((c) => download(`rebound-sets-${stamp}.csv`, c, 'text/csv'))}
        />
        <Row
          label="Export morning checks (CSV)"
          onClick={() => void exportChecksCsv(db).then((c) => download(`rebound-checks-${stamp}.csv`, c, 'text/csv'))}
        />
        <Row label="Import backup (JSON)" sub="Replaces everything on this phone" onClick={() => fileRef.current?.click()} />
        <Row label="Import from Hevy (CSV)" sub="Match exercises, add as past sessions" onClick={() => setView('hevy')} />
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            try {
              const parsed: unknown = JSON.parse(await f.text())
              const err = checkBackup(parsed)
              if (err) toast({ message: err })
              else setPending(parsed as Backup)
            } catch {
              toast({ message: 'Could not read that file.' })
            }
          }}
        />
        <Reset />
      </Section>

      <Section title="About">
        <p className="font-semibold">Rebound</p>
        <p className="mt-1 text-[15px]">{PLAN_META.disclaimer}</p>
        <p className="mt-2 text-sm text-muted">
          Plan version {PLAN_META.version}, {PLAN_META.date}. {PLAN_META.equipment} Data stays on this phone.
        </p>
        <details className="mt-2">
          <summary className="min-h-12 cursor-pointer py-3 text-sm text-muted">Sources</summary>
          <ul className="space-y-1 text-sm">
            {SOURCES.map((s) => (
              <li key={s.label}>{s.url ? <a href={s.url} className="text-accent underline" target="_blank" rel="noreferrer">{s.label}</a> : s.label}</li>
            ))}
          </ul>
        </details>
      </Section>

      <Sheet open={pending !== null} onClose={() => setPending(null)} label="Import backup">
        <h2 className="text-xl font-semibold">Replace everything with this backup?</h2>
        <p className="mt-1 text-muted">
          Backup from {pending?.exportedAt.slice(0, 10)} with {pending?.tables.workouts.length ?? 0} sessions. Your current data is replaced.
        </p>
        <PrimaryButton
          className="mt-4"
          onClick={async () => {
            if (!pending) return
            const snapshot = await exportAll(db)
            await importAll(db, pending)
            setPending(null)
            toast({ message: 'Backup imported', undo: () => void importAll(db, snapshot) })
          }}
        >
          Replace and import
        </PrimaryButton>
      </Sheet>
    </div>
  )
}
