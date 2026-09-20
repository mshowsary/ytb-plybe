// src/ui/cafeDayModel.js — the day, as the Café button and the Café card draw it: which phase, how
// long it has left, whether the rush is about to start, and today's theme as a glyph and a count.
// No sentences: the old Today card was five lines of prose ("Cats & cappuccinos · 0/7 themed serves
// · +235 coins at closing · Rush in 0:47 · Stock up before the rush · Tomorrow: …") and the owner's
// rule is pictures, not words.
import { specialProgress, specialReward } from '../sim/specialDays.js';

// When each phase ends (seconds into the day), matching sim/day.js's phase boundaries.
const PHASE_END = { morning: 60, rush: 150, afternoon: 210, closing: 240 };

export function cafeDayModel(G) {
  const day = Math.max(1, G.dayState?.day | 0), t = Math.max(0, Number(G.dayState?.t) || 0);
  const phase = PHASE_END[G.dayState?.phase] ? G.dayState.phase : 'morning';
  const left = Math.max(0, Math.ceil(PHASE_END[phase] - t));
  const special = G.special || null;
  const progress = special ? specialProgress(special, G.dayStats?.specialServed || 0) : null;
  return {
    day, phase, left,
    clock: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`,
    // The last fifteen seconds before the rush: the button's badge counts down instead of D#.
    soon: phase === 'morning' && left <= 15 && left > 0,
    theme: special ? { id: special.id, icon: special.icon, count: progress.count, target: progress.target, met: progress.met, reward: specialReward(special) } : null,
  };
}
