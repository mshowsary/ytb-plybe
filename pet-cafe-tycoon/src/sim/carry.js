// src/sim/carry.js — pure carry-slot helper shared by the owner and staff.
// A carrier holds EITHER product items, one supply portion, OR harvested fruit — never a mix.
export function createCarry() {
  return { sack: null, sackLeft: 0, fruit: 0 };
}
export function isEmpty(c) { return c.sack == null && c.fruit === 0; }
export function canTakeItems(c) { return c.sack == null && c.fruit === 0; }

// A sack is ONE refill, used up completely by the machine it was fetched for
// (docs/SHIP-PLAN-2026-09-19.md §1.4). It used to be a reusable 20-unit bean bag, which meant the
// owner walked away from every top-up still holding a part-empty sack that blocked the next
// pickup (canTakeItems) — the chore the RETURN crate existed to clean up after. Beans stay a
// 20-portion sack because the espresso machine's own capacity is 20, so one sack fills it from
// empty exactly. Kibble is no longer carried at all: the treat bowl has its own bin
// (systems/stations.js), so nobody walks a sack across the café for it.
export const SUPPLY_PORTIONS = Object.freeze({ beans: 20 });
export function takeSack(c, kind) {
  if (!isEmpty(c) || !SUPPLY_PORTIONS[kind]) return false;
  c.sack = kind;
  c.sackLeft = SUPPLY_PORTIONS[kind];
  return true;
}
// Any successful pour empties the sack, whatever is left in it: leftovers are what sent the owner
// looking for somewhere to put them.
export function useSack(c, n) {
  if (!c.sack) return 0;
  const used = Math.max(0, Math.min(n, c.sackLeft));
  if (used > 0 || c.sackLeft <= 0) { c.sack = null; c.sackLeft = 0; }
  else c.sackLeft -= used;
  return used;
}
export function addFruit(c, n, cap = Infinity) {
  if (c.sack != null) return 0;
  const room = Math.max(0, cap - c.fruit);
  const added = Math.max(0, Math.min(n, room));
  c.fruit += added;
  return added;
}
export function dropFruit(c) {
  const n = c.fruit; c.fruit = 0; return n;
}
// Empties the hands. There is no RETURN crate any more (docs/SHIP-PLAN-2026-09-19.md §1.4): this
// is what the automatic fly-back calls when the owner stops at something that needs empty hands
// (systems/stations.js flyBackHeld). Browser gameplay may attach an ephemeral `onReturn` callback
// to the carry object so economy/presentation can account for food waste. It is intentionally not
// part of createCarry's persisted shape and headless callers remain completely pure/no-op here.
export function returnAll(c) {
  const had = { sack: c.sack, sackLeft: c.sackLeft, fruit: c.fruit };
  if (typeof c.onReturn === 'function') c.onReturn(had);
  c.sack = null; c.sackLeft = 0; c.fruit = 0;
  return had;
}
