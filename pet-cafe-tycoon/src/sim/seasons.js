// src/sim/seasons.js — Seasons (plan §3.8): Blossom → Splash → Harvest → Lights, 7 days each,
// cycling forever. Purely additive to the existing weekly rhythm, never a competitor to it.
//
// WHY A SEASON IS A PURE FUNCTION OF THE DAY NUMBER, NOT A COUNTER
// A season index that gets incremented by an event ("day advanced, season++") is exactly the shape
// of bug this project has been bitten by before: a reload that re-delivers or re-processes that
// same event advances the counter a second time, and the player's season silently skips ahead (or,
// depending on where the increment sits relative to the save point, never advances at all). There is
// no such event here. `seasonForDay(day)` is a total, memoryless function of the day number alone —
// call it once, call it a thousand times, call it before or after a reload, and day 22 is always
// Harvest, dayStart 22. See test/seasons.test.js's "reload" tests for a concrete proof.
//
// WHY 7 DAYS, AND WHY IT LINES UP WITH THE CAREER WEEK
// The plan calls Seasons "purely additive to the existing weekly rhythm" and the career week
// (src/sim/career.js WEEK_LENGTH) is already the game's one existing 7-day cadence: the weekly cup
// closes on day%7===0 and career.history is keyed by day. Rather than run a second, independently
// phased 7-day clock that drifts in and out of alignment with the career week (confusing: "why did
// my season change mid-week?"), a season's 7-day window is defined to start on EXACTLY the same days
// the career week does (1, 8, 15, 22, ...). One season == one career week, themed. Four seasons make
// one 28-day cycle, then it repeats. This is why SEASON_LENGTH_DAYS is imported from career.js
// instead of re-declared: if that cadence ever changes, seasons move with it instead of drifting.
//
// WHAT THE SEASON GOAL IS BUILT ON, AND WHY (the "dead content" trap, read the task brief again)
// The plan's illustrative goal is "40 Perfect photos" -- but nothing in the current save schema
// tracks a per-day or per-season photo/Perfect-shot count (meta.album is a lifetime, non-dated
// record; dayStats.photos resets every shift and is not carried into career.history). Inventing a
// new save field to snapshot that would mean editing src/sim/saveSchema.js, which this task does not
// own (see the wiringNeeded note this module's caller is expected to carry). So instead, the season
// goal is built entirely on data that ALREADY exists, is ALREADY normalised, and is ALREADY
// reachable from day 1: meta.career.history[day].contractMet (src/sim/career.js recordCareerShift).
// A player has a daily career contract from day 1 onward (chooseCareerGoal has no gate at all), and
// that contract's own difficulty already self-balances to the player's level (legacyCareerGoal scales
// off the player's own previous performance) -- so a season goal phrased as "meet your daily contract
// on N of this season's 7 days" can NEVER become the plan's warned-about dead content: it does not
// reference a zone, a species, or a coin total that a slow player might not have reached yet, it
// rides on a signal that is already tuned to reach exactly that player. This is a deliberate
// trade-off, not an oversight -- if a richer, photo-flavoured season goal is wanted later, it needs a
// new normalised save field first; see this task's wiringNeeded write-up.
//
// THE ONE GOAL INPUT THAT IS *NOT* UNIVERSALLY REACHABLE: THE SEASONAL ACCESSORY
// Each season's featured accessory (data/accessories.js id) is gated by follower-count tier, exactly
// as every other accessory is (accessoryUnlocked, imported read-only below). Three of the four
// (flower crown, sunglasses, scarf) sit at tiers the plan's own ★5 Seasons-unlock gate already
// clears (★5 requires followers >= 2000, i.e. tier 3). The fourth, Lights -> acc_party_hat, is
// authored at tier 4 (5000 followers) in data/accessories.js -- ABOVE what ★5 guarantees. That file's
// own header comment already flags this exact seam ("Batch 4's Seasons system may prefer to gate it
// on a season goal instead"). This module does NOT silently paper over that gap: `seasonAccessoryFor`
// exposes the accessory id and `seasonAccessoryReachable` reports the true follower-gate answer, so a
// caller can (and, per that file's own comment, probably should) special-case Lights to unlock via
// the season goal instead of the follower tier -- but that is an edit to data/accessories.js this
// task does not own, so it is reported, not made. See wiringNeeded.
//
// PURITY: no DOM, no three.js, no Math.random(), no Date.now(). Every export is a total function of
// its arguments; nothing here reads or writes global state.

import { WEEK_LENGTH, CUP_REWARDS } from './career.js';
import { accessoryUnlocked } from '../../data/accessories.js';

const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);

// ---- identity -------------------------------------------------------------------------------

export const SEASON_IDS = Object.freeze(['blossom', 'splash', 'harvest', 'lights']);
// Reused, not re-declared: keeps a season's 7-day window locked to the career week forever (see
// header). saveSchema.SAVE_LIMITS.maxSeasonIndex (3) matches SEASON_IDS.length - 1 by construction.
export const SEASON_LENGTH_DAYS = WEEK_LENGTH;

function clampDay(day) {
  return Math.max(1, day | 0);
}

// 0-based index of the 7-day window `day` falls in, cycling through the 4 ids forever.
export function seasonIndexForDay(day) {
  const d = clampDay(day);
  return Math.floor((d - 1) / SEASON_LENGTH_DAYS) % SEASON_IDS.length;
}

// The day this window started on (1, 8, 15, 22, ...) -- always <= day, so it always satisfies
// saveSchema's normalizeSeason bound (dayStart clamped to 1..day) without any clamping of its own.
export function seasonStartDay(day) {
  const d = clampDay(day);
  return Math.floor((d - 1) / SEASON_LENGTH_DAYS) * SEASON_LENGTH_DAYS + 1;
}

// How many full 4-season cycles have completed before this one (0 for days 1-28, 1 for 29-56, ...).
// Exposed for callers that want to vary flavour (never balance -- see header) across repeats.
export function seasonCycle(day) {
  const d = clampDay(day);
  return Math.floor(Math.floor((d - 1) / SEASON_LENGTH_DAYS) / SEASON_IDS.length);
}

// The one function most callers need: everything derivable about "what season is today" from the
// day number alone. Every field is recomputed fresh every call -- nothing here is stored state.
export function seasonForDay(day) {
  const d = clampDay(day);
  const index = seasonIndexForDay(d);
  const dayStart = seasonStartDay(d);
  return {
    index,
    id: SEASON_IDS[index],
    dayStart,
    dayEnd: dayStart + SEASON_LENGTH_DAYS - 1,
    dayOfSeason: d - dayStart + 1, // 1..SEASON_LENGTH_DAYS
    cycle: seasonCycle(d),
  };
}

// Exactly the shape saveSchema.js's normalizeSeason validates (`{ index, dayStart }`) -- a caller
// can assign this straight onto a FRESH meta.season object (never mutate the nested one in place;
// G.snapshot() spreads meta one level deep, so an in-place write would corrupt an already-taken
// snapshot -- hard rule, not a style note).
export function deriveSeasonMeta(day) {
  const s = seasonForDay(day);
  return { index: s.index, dayStart: s.dayStart };
}

// Pure predicate: did the season identity change between the last-recorded meta.season and `day`?
// A caller runs this once per day-advance, and ONLY on a true result fires its one-time effects
// (re-tint the garden/terrace, show the season banner) before writing deriveSeasonMeta(day) back
// onto meta.season. Comparing both fields (not just index) means a hand-edited or stale dayStart
// alone is still caught even if index happens to already match.
export function seasonRolledOver(prevSeason, day) {
  const current = seasonForDay(day);
  const prevIndex = isRecord(prevSeason) && Number.isFinite(prevSeason.index) ? prevSeason.index : null;
  const prevDayStart = isRecord(prevSeason) && Number.isFinite(prevSeason.dayStart) ? prevSeason.dayStart : null;
  return prevIndex !== current.index || prevDayStart !== current.dayStart;
}

// ---- content: palette / special-day theme / accessory per season ----------------------------
//
// `paletteId` is an id only -- this module owns none of the actual colour values. The re-tint
// itself is render/environment.js's GARDEN_PALETTE (its own header already anticipates Seasons
// "swapping these arrays"), which this task does not own; see wiringNeeded for the exact hook.
// `specialThemeId` reuses an existing src/sim/specialDays.js THEMES id as this season's "spotlight"
// theme (flavour only -- it does NOT change specialForDay's own deterministic day-seeded rotation).
// `accessoryId` reuses an existing data/accessories.js id (see header re: acc_party_hat's gap).
export const SEASON_CONTENT = Object.freeze({
  blossom: Object.freeze({
    index: 0,
    paletteId: 'blossom',
    specialThemeId: 'bunnybrunch',
    accessoryId: 'acc_flower_crown',
    goal: Object.freeze({ id: 'blossom_contracts', statKey: 'contractsMet', target: 4 }),
  }),
  splash: Object.freeze({
    index: 1,
    paletteId: 'splash',
    specialThemeId: 'berry-blast',
    accessoryId: 'acc_sunglasses',
    goal: Object.freeze({ id: 'splash_contracts', statKey: 'contractsMet', target: 4 }),
  }),
  harvest: Object.freeze({
    index: 2,
    paletteId: 'harvest',
    specialThemeId: 'sweet-tooth',
    accessoryId: 'acc_scarf',
    goal: Object.freeze({ id: 'harvest_contracts', statKey: 'contractsMet', target: 5 }),
  }),
  lights: Object.freeze({
    index: 3,
    paletteId: 'lights',
    specialThemeId: 'latte-rush',
    accessoryId: 'acc_party_hat',
    goal: Object.freeze({ id: 'lights_contracts', statKey: 'contractsMet', target: 5 }),
  }),
});

export function seasonContentFor(seasonId) {
  return SEASON_CONTENT[seasonId] || null;
}

// A season goal's coin reward. Flat across seasons, deliberately pegged to career.js's own bronze
// weekly-cup amount rather than a fresh magic number -- a season goal is a bonus layered on top of
// the weekly cadence (plan: "purely additive"), not a rival prize purse, so it is priced as the
// smallest existing "you did something this week" award, not a new tier above gold.
export const SEASON_GOAL_REWARD = CUP_REWARDS.bronze;

// Whether this season's featured accessory is actually equippable yet for a player with this
// `meta` (reads only meta.followers, via data/accessories.js's own gate -- see header re: the
// known acc_party_hat gap this deliberately does NOT paper over).
export function seasonAccessoryReachable(seasonId, meta) {
  const content = seasonContentFor(seasonId);
  if (!content) return false;
  return accessoryUnlocked(content.accessoryId, meta);
}

// ---- goal progress ----------------------------------------------------------------------------

// The [start, end] day range (inclusive) of the season containing `day`.
export function seasonGoalWindow(day) {
  const s = seasonForDay(day);
  return { start: s.dayStart, end: s.dayEnd };
}

// Progress toward the current season's goal, derived ENTIRELY from meta.career.history -- an
// already-normalised, already-saved, per-day record (src/sim/saveSchema.js normalizeCareer) that
// this module only reads, never writes or mutates. Re-summing it on every call is what makes this
// reload-safe: there is no running counter to double-advance, just a sum over immutable rows that
// either exist (a day the player actually finished) or don't.
export function seasonGoalProgress(meta, day) {
  const d = clampDay(day);
  const s = seasonForDay(d);
  const content = seasonContentFor(s.id);
  const history = isRecord(meta) && isRecord(meta.career) && isRecord(meta.career.history)
    ? meta.career.history : {};
  let current = 0;
  let playedDays = 0;
  for (let i = 0; i < SEASON_LENGTH_DAYS; i++) {
    const historyDay = s.dayStart + i;
    if (historyDay > d) break; // Never read a day later than "now" -- there is nothing there yet,
    // and a tampered save must not be able to pre-claim a season by planting future-day rows.
    const rec = history[String(historyDay)];
    if (!rec) continue;
    playedDays++;
    if (rec.contractMet) current++;
  }
  const target = content.goal.target;
  return {
    seasonId: s.id,
    goalId: content.goal.id,
    dayStart: s.dayStart,
    dayEnd: s.dayEnd,
    current,
    target,
    met: current >= target,
    playedDays,
    windowDays: SEASON_LENGTH_DAYS,
  };
}

// ---- one-call convenience ----------------------------------------------------------------------

// Everything a caller (game.js / a season HUD) needs for "today", in one read: identity, content
// ids, goal progress and whether the accessory can actually be worn yet. `prevSeason` is the
// caller's currently-saved meta.season (or undefined) -- pass it to also get `rolledOver`.
export function seasonSummary(meta, day, prevSeason) {
  const s = seasonForDay(day);
  const content = seasonContentFor(s.id);
  const progress = seasonGoalProgress(meta, day);
  return {
    ...s,
    paletteId: content.paletteId,
    specialThemeId: content.specialThemeId,
    accessoryId: content.accessoryId,
    accessoryReachable: seasonAccessoryReachable(s.id, meta),
    goal: content.goal,
    progress,
    reward: SEASON_GOAL_REWARD,
    rolledOver: prevSeason !== undefined ? seasonRolledOver(prevSeason, day) : null,
  };
}
