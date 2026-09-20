// src/sim/nextThing.js — "what am I working towards?", answered for every single day of the game.
//
// THE FINDING THIS EXISTS FOR (scratchpad economy-ads.md, "no purposeful goal after the last zone"):
// the bot owns the whole 12-zone chain by day 13, and after that the only things left were invisible
// +% ladders. The Café card's goal row must always be able to name a NEXT THING, so this resolves
// one, in order of how much of the café it changes:
//
//   1. build   the next zone the player can already see a pad for      (the early game)
//   2. theme   the next café theme — a visible makeover, coins + ★     (§1.6c.1)
//   3. star    the next Café Star's nearest unfinished row             (the long track)
//   4. upgrade the cheapest station star / hire the café can buy       (the endless sink)
//   5. pets    the collection tail — the pets still unmet              (§1.6c.5)
//
// PURE: no DOM, no three.js, no clocks. It takes the same evidence the Café Stars sheet takes, so a
// test and a live probe can both assert "every day names something".
import { pawRatingState, pawVisibleRequirements } from './pawRating.js';
import { RENOVATIONS, renovationState } from './career.js';
import { unmetPetKeys } from './petArrivals.js';
import { activeZones } from './world.js';

/**
 * @param {object} G  the live game state (coins, meta, stats, world)
 * @param {object} opts.cheapestUpgrade  { kind, label, cost } or null — the shop's cheapest open
 *        purchase, supplied by the caller because pricing lives in sim/economy.js and depends on
 *        what the shop chooses to show.
 * @returns {{kind:string, id:string|null, price:number|null, star:number|null, current:number|null,
 *            target:number|null}} — never null. A café with literally nothing left still answers
 *        'pets' or, at the very end, 'complete'.
 */
export function nextThing(G, opts = {}) {
  const world = G && G.world;
  const meta = (G && G.meta) || {};
  const coins = Math.max(0, (G && G.coins) | 0);

  // 1. A build pad the player can walk to.
  if (world && world.area) {
    const open = activeZones(world);
    if (open && open.length) {
      // Cheapest first: that is the one the wallet ring is already saving for (ui/hud.js
      // setSavingFor uses the same rule), so the card and the ring never name different things.
      const zone = open.slice().sort((a, b) => a.price - b.price)[0];
      return { kind: 'build', id: zone.id, price: zone.price, star: null, current: null, target: null };
    }
  }

  const stars = pawRatingState({ meta, stats: G && G.stats, built: world && world.built, area: world && world.area });

  // 2. The next café theme, once its star is held.
  const reno = renovationState(meta, coins, stars.best);
  if (reno.next && reno.starReady) {
    return { kind: 'theme', id: `theme${reno.next.level}`, price: reno.next.cost, star: reno.next.star, current: reno.level, target: RENOVATIONS.length };
  }

  // 3. The next Café Star: the row with the furthest to go, so the card names the thing that is
  //    actually holding the star rather than the one that happens to be listed first.
  const rows = pawVisibleRequirements(stars.requirements).filter(r => !r.met);
  if (rows.length) {
    const row = rows.slice().sort((a, b) => (b.target - b.current) - (a.target - a.current))[0];
    return { kind: 'star', id: row.id, price: null, star: stars.next, current: row.current, target: row.target };
  }

  // 4. A locked theme (its star is not held yet) is still a real thing to name while that star is
  //    being earned — but rows above already named the star, so this only fires at ★5 with the
  //    ladder unfinished, which cannot happen (★5 needs every theme). Kept as the honest fallthrough.
  if (reno.next) {
    return { kind: 'theme', id: `theme${reno.next.level}`, price: reno.next.cost, star: reno.next.star, current: reno.level, target: RENOVATIONS.length };
  }

  // 5. The endless sink the shop is already selling.
  const upgrade = opts.cheapestUpgrade;
  if (upgrade && Number.isFinite(upgrade.cost)) {
    return { kind: 'upgrade', id: upgrade.id || upgrade.kind || 'upgrade', price: upgrade.cost, star: null, current: null, target: null };
  }

  // 6. The collection tail.
  const unmet = unmetPetKeys(meta, world && world.built);
  if (unmet.length) {
    const found = Object.keys(meta.petBook || {}).filter(k => meta.petBook[k]).length;
    return { kind: 'pets', id: unmet[0], price: null, star: null, current: found, target: found + unmet.length };
  }

  return { kind: 'complete', id: null, price: null, star: null, current: null, target: null };
}
