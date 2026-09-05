// src/sim/carry.js — pure carry-slot helper shared by the owner and staff.
// A carrier holds EITHER product items, one supply portion, OR harvested fruit — never a mix.
export function createCarry() {
  return { sack: null, sackLeft: 0, fruit: 0 };
}
export function isEmpty(c) { return c.sack == null && c.fruit === 0; }
export function canTakeItems(c) { return c.sack == null && c.fruit === 0; }

// Beans remain a reusable 20-unit bag because the espresso machine can need several top-ups.
// Kibble is a single 10-unit refill portion: after any successful bowl refill the remaining scoop
// is consumed/put away automatically. This removes the pointless "fill bowl, then walk leftovers
// to RETURN" chore while keeping carry exclusivity and the Pantry interaction intact.
export const SUPPLY_PORTIONS = Object.freeze({ beans: 20, kibble: 10 });
export function takeSack(c, kind) {
  if (!isEmpty(c)) return false;
  c.sack = kind;
  c.sackLeft = SUPPLY_PORTIONS[kind] || 20;
  return true;
}
export function useSack(c, n) {
  if (!c.sack) return 0;
  const kind = c.sack;
  const used = Math.max(0, Math.min(n, c.sackLeft));
  c.sackLeft -= used;
  if ((kind === 'kibble' && used > 0) || c.sackLeft <= 0) { c.sack = null; c.sackLeft = 0; }
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
// Deliberate Return interaction. Browser gameplay may attach an ephemeral `onReturn` callback to
// the carry object so economy/presentation can account for food waste. It is intentionally not
// part of createCarry's persisted shape and headless callers remain completely pure/no-op here.
export function returnAll(c) {
  const had = { sack: c.sack, sackLeft: c.sackLeft, fruit: c.fruit };
  if (typeof c.onReturn === 'function') c.onReturn(had);
  c.sack = null; c.sackLeft = 0; c.fruit = 0;
  return had;
}
