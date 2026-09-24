# Pet Café — how to work on it

The owner plays the build. That is the gate. Everything below exists to keep a change cheap.

## Every change
- Make the smallest edit that does the job, then `npm run build` in `pet-cafe-tycoon/`. Build green = done.
- If you touched pure sim logic that has a matching unit test file, you may run that one file
  (`node --test test/<name>.test.js`). Never the whole suite by default.
- Say in plain words what changed and what the owner should look at when they play.

## Never, unless the owner asks for it by name
- Full `npm test`, smoke tools (`tools/*-smoke.mjs`), `scene-cost`, bots, economy/balance sweeps,
  certification, screenshots matrices, multi-agent workflows. They peg the laptop for hours and
  have not caught what the owner catches in one playthrough.
- Reading `docs/archive/` — it is history, not the brief. The brief is `docs/SHIP-PLAN-2026-09-19.md`
  and `pet-cafe-tycoon/HANDOFF.md`.
- Updating a test to "prove" a change. Tests follow the game, not the other way round; if a test
  breaks because the design changed, fix or delete the test in the same edit.

## Safety
- `tools/jev-*.js` are third-party files with a secret in them: never open, stage, commit or push.
  Stage explicit paths; never `git add -A` / `git add .` over `tools/`.
- Don't commit `debug.log`, `output/`, `PLAYABLES-BUILD-PROMPT.md`, `pet-cafe-handoff.zip`.
- Ask before pushing (a push deploys to the live Pages site). Never force-push. Keep `main` unchanged.
