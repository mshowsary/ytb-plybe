// src/sim/opening.js — THE FIRST THREE SECONDS (Batch E1, ship plan §1.6).
//
// A new save used to open on an empty room with 0 coins and no tables: nothing was happening, and
// the first thing the player could do was walk to a pad they could not yet pay for. A café that is
// already working is a much better first frame, and it is also the honest fiction — the café was
// open before the player took it over this morning.
//
// At t = 0 a fresh save now has:
//   * two guests already seated at seat1 and seat2, each with its pet beside it, mid-meal;
//   * the tip each of them left on their table (OPENING_TABLE_TIP), a walk-past pile the player can
//     sweep in the first few steps — which is also how the game teaches the sweep verb;
//   * OPENING_COINS in the wallet;
//   * a resident cat asleep on its bed (src/game.js seeds meta.residents, systems/residentPets.js
//     mounts it with no walk-in animation the way it mounts any already-settled resident).
// Together the wallet and the two tips clear the first build pad's price, so the first purchase is
// reachable inside the first half-minute without a single sale — test/opening-cafe.test.js asserts
// exactly that against data/area1.js rather than against a copied number.
//
// PURE SIMULATION: it mutates the world's seats and the customer list it is handed, and nothing
// else. No DOM, no three.js, no RNG — the two opening guests are authored, not rolled, so the
// seeded spawn stream is untouched and tools/bot.js replays bit-identically with or without them.
import { createCustomer, EAT_TIME } from './customers.js';

export const OPENING_COINS = 25;
// Per table. Two tables, so 70 coins are standing on the floor at t = 0 waiting to be walked past.
export const OPENING_TABLE_TIP = 35;
// The opening pair are the two commonest coats, one cat and one dog: the two species that visit
// from day 1 (sim/petArrivals.js), so the first frame can never show a pet the café has not opened.
export const OPENING_GUESTS = Object.freeze([
  Object.freeze({ seatId: 'seat1', species: 'cat', petVariant: 0, variant: Object.freeze({ shirt: 1, hair: 0, skin: 1 }), eaten: 1.2 }),
  Object.freeze({ seatId: 'seat2', species: 'dog', petVariant: 0, variant: Object.freeze({ shirt: 3, hair: 2, skin: 0 }), eaten: 0.4 }),
]);
// The resident who already lives here. sim/petBook.js's key format; cat:0 is Marmalade.
export const OPENING_RESIDENT = 'cat:0';

/** The tables the opening guests sit at, for callers that only need the ids. */
export const openingSeatIds = () => OPENING_GUESTS.map(g => g.seatId);

/**
 * Seat the opening pair and lay their tips on the tables.
 *
 * @param world  a live world (sim/world.js createWorld)
 * @param list   the customer array to push into (G.customers)
 * @param area   the area catalogue (world.area)
 * @param nextId () => number — the id allocator. Deliberately NOT the seeded spawn sequence: these
 *               two are authored, and drawing from that stream would shift every later guest.
 * @returns the customers created (empty if the seats do not exist or are already taken)
 */
export function seedOpeningCafe(world, list, area, nextId) {
  const made = [];
  if (!world || !area || typeof nextId !== 'function') return made;
  for (const spec of OPENING_GUESTS) {
    const seat = world.stations.get(spec.seatId);
    if (!seat || seat.type !== 'seat' || !seat.active || seat.occupied || seat.dirty) continue;
    const c = createCustomer(nextId(), spec.species, { ...spec.variant }, area);
    c.petVariant = spec.petVariant;
    // Already served and already paid: their money is the tip on the table, not a sale still to
    // ring up. Setting `paid` keeps every downstream reader (settlement, the register queue, the
    // service-policy incident check) from treating them as an unpaid guest who slipped through.
    c.paid = true;
    c.order = [];
    c.wish = null;
    c.state = 'eating';
    c.timer = Math.max(0, Math.min(EAT_TIME - 0.5, spec.eaten));
    c.seat = seat; c.seatId = seat.id;
    c.x = seat.pair.human.x; c.z = seat.pair.human.z;
    c.rot = Math.atan2(seat.x - c.x, seat.z - c.z);
    c.mover.x = c.x; c.mover.z = c.z; c.mover.hasTarget = false;
    seat.occupied = true;
    seat.pile = (seat.pile || 0) + OPENING_TABLE_TIP;
    list.push(c);
    made.push(c);
  }
  return made;
}
