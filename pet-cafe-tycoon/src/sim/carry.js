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
// True while the carry isn't holding a sack or fruit — a caller additionally checks its own item
// count/array before deciding it's fully empty (see the module doc comment above).
export function isEmpty(c) { return c.sack == null && c.fruit === 0; }
// True while the carry is free to accept a product item (not occupied by a sack or fruit) — the
// caller still enforces its own item-count cap (carryCap) separately.
export function canTakeItems(c) { return c.sack == null && c.fruit === 0; }
// Takes a full 20-unit sack of `kind` ('beans' | 'kibble') if the carry is genuinely empty
// (no sack/fruit already held — the caller has already confirmed no items either). Returns true
// on success, false if the carry was occupied.
export function takeSack(c, kind) {
  if (!isEmpty(c)) return false;
  c.sack = kind; c.sackLeft = 20;
  return true;
}
// Draws up to n units from the held sack, clearing it once emptied. Returns the amount actually
// used (0 if no sack is held).
export function useSack(c, n) {
  if (!c.sack) return 0;
  const used = Math.max(0, Math.min(n, c.sackLeft));
  c.sackLeft -= used;
  if (c.sackLeft <= 0) { c.sack = null; c.sackLeft = 0; }
  return used;
}
// Adds up to n fruit onto the carry, capped at `cap` (typically the carrier's carryCap) and only
// while the carry isn't holding a sack. Returns the amount actually added.
export function addFruit(c, n, cap = Infinity) {
  if (c.sack != null) return 0;
  const room = Math.max(0, cap - c.fruit);
  const added = Math.max(0, Math.min(n, room));
  c.fruit += added;
  return added;
}
// Empties the fruit off the carry, returning how much was dropped.
export function dropFruit(c) {
  const n = c.fruit; c.fruit = 0; return n;
}
// Loop v2 Task 1: the return crate — empties the sack/fruit half of the carry unconditionally
// (for zero coins, so the player/bot is never stuck holding something with nowhere to put it).
// The product-item half (owner.items in the browser, a plain count/key pair in tools/bot.js) is
// NOT this module's state — callers clear their own item stack alongside calling this (see
// systems/stations.js's return-crate handler and tools/bot.js's 'returnAll' case). Returns what
// was held, for a toast/FX summary.
export function returnAll(c) {
  const had = { sack: c.sack, sackLeft: c.sackLeft, fruit: c.fruit };
  c.sack = null; c.sackLeft = 0; c.fruit = 0;
  return had;
}
