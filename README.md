# Rebound

Mobile-first rehab and strength training app for one user. Runs the rehab
program from `rehab-strength-master-plan.md` automatically, works offline,
and stores everything on the device (IndexedDB). No accounts, no backend.

> Not medical advice. Check stage changes with your physio.

**Live app:** https://buzz1503.github.io/Rebound/

## Install on iPhone

1. Open the link in **Safari** (not Chrome).
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Open Rebound from the home screen. It runs full-screen and works in airplane mode after the first open.

Your data lives only on the phone. Export a backup from **More → Data** now and then.

## Development

```bash
npm install
npm run dev          # dev server
npm test             # unit tests (engine, data layer, session builder, import/export)
npm run coverage     # engine coverage
npm run build        # type-check + production build (PWA)
npx vite preview     # serve the build at /Rebound/
node e2e/player.mjs  # morning check + full Session A at 390px (needs preview running)
node e2e/pain.mjs    # pain flag -> swap flow
node e2e/more.mjs    # program editor, Hevy import, export, theme
node e2e/screens.mjs # Today, morning check, Rehab, Progress screenshots
node e2e/offline.mjs # airplane mode after first load
node scripts/make-icons.mjs  # regenerate icons and iOS splash screens
```

Pushing to `main` runs `.github/workflows/deploy.yml`: tests, build, publish to GitHub Pages.

## Layout

- `src/data/seed.ts`: master plan as typed seed data (editable in the app)
- `src/engine/`: pure progression rules, gates, flare mode, questionnaires
- `src/db/`: Dexie schema (versioned), seeding, repository helpers
- `src/features/`: workout player, Today, Rehab, Progress, More
