// src/ui/cafeDayModel.js — the day, as the Café button and the Café card draw it: which phase, how
// long it has left, whether the rush is about to start, and what the café is working towards next.
// No sentences: the old Today card was five lines of prose ("Cats & cappuccinos · 0/7 themed serves
// · +235 coins at closing · Rush in 0:47 · Stock up before the rush · Tomorrow: …") and the owner's
// rule is pictures, not words.
//
// Batch E1 swapped the second meter for a second PROMISE. The theme chip is gone with the theme
// (one daily goal now, sim/dailyGoal.js), and in its place the card carries the NEXT THING
// (sim/nextThing.js) — the build, the café theme, the star row or the pet the café is heading for.
// That chip is what stops the Café card going blank after the last zone is bought on ~day 13.
import { nextThing } from '../sim/nextThing.js';
import { PHASE_SECONDS } from '../sim/day.js';

// When each phase ends (seconds into the day), derived from sim/day.js's own phase lengths rather
// than copied — the closing phase shortened from 30 s to 15 s in Batch E1 and a second copy of the
// boundary here would have silently kept the old clock on screen.
const PHASE_END = (() => {
  let t = 0;
  const out = {};
  for (const phase of ['morning', 'rush', 'afternoon', 'closing']) { t += PHASE_SECONDS[phase]; out[phase] = t; }
  return out;
})();

export function cafeDayModel(G) {
  const day = Math.max(1, G.dayState?.day | 0), t = Math.max(0, Number(G.dayState?.t) || 0);
  const phase = PHASE_END[G.dayState?.phase] ? G.dayState.phase : 'morning';
  const left = Math.max(0, Math.ceil(PHASE_END[phase] - t));
  let next = null;
  try { next = nextThing(G); } catch (_) { next = null; }
  return {
    day, phase, left,
    clock: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`,
    // The last fifteen seconds before the rush: the button's badge counts down instead of D#.
    soon: phase === 'morning' && left <= 15 && left > 0,
    next,
  };
}
