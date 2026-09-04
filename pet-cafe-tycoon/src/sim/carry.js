// src/sim/carry.js — pure carry-slot helper shared by the owner and any staff member who can
// pick things up. A carrier holds EITHER product items (tracked by the caller's own count/array —
// owner.items for the owner, s.items for a runner — unchanged by this module) OR one supply sack
// (`sack: 'beans' | 'kibble'`, `sackLeft` counting down from 20) OR harvested `fruit` — never a
// mix. This module owns just the sack/fruit half of that exclusivity; callers gate "may I pick up
// a product item" on canTakeItems(c) before touching their own items array/count, and gate "may I
// take a sack / harvest fruit" on isEmpty(c) (their own item count must also be 0 — canTakeItems
// doesn't know about it, since it's tracked outside this module).
export function createCarry() {
  return { sack: null, sackLeft: 0, fruit: 0 };
}
export function isEmpty(c) { return c.sack == null && c.fruit === 0; }
export function canTakeItems(c) { return c.sack == null && c.fruit === 0; }
export function takeSack(c, kind) {
  if (!isEmpty(c)) return false;
  c.sack = kind; c.sackLeft = 20;
  return true;
}
export function useSack(c, n) {
  if (!c.sack) return 0;
  const used = Math.max(0, Math.min(n, c.sackLeft));
  c.sackLeft -= used;
  if (c.sackLeft <= 0) { c.sack = null; c.sackLeft = 0; }
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
