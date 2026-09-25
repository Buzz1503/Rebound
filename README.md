# Rebound

Mobile-first rehab and strength training app for one user. Runs the rehab
program from `rehab-strength-master-plan.md` automatically, works offline,
and stores everything on the device (IndexedDB). No accounts, no backend.

> Not medical advice. Check stage changes with your physio.

## Development

```bash
npm install
npm run dev        # dev server
npm test           # unit tests (engine, data layer, session builder)
npm run coverage   # engine coverage
npm run build      # type-check + production build
npx vite preview   # serve the build at /rebound/
node e2e/player.mjs   # drives a full Session A at 390px (needs preview running)
node e2e/pain.mjs     # pain flag -> swap flow
```

## Layout

- `src/data/seed.ts`: master plan as typed seed data (editable in the app)
- `src/engine/`: pure progression rules, gates, flare mode, questionnaires
- `src/db/`: Dexie schema (versioned), seeding, repository helpers
- `src/features/workout/`: session builder and the workout player
