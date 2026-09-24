import { subscribeWorld } from '../sim/events.js';
// Cosmetic relationship layer for named pet visitors.
// Successful checkout visits build New Face -> Regular -> Friend -> Bestie progression.
// This module deliberately observes pay events without changing prices, patience, traffic or service logic.
import { awardFirstBestieKeepsake, ensurePetBook, recordPetVisit } from '../sim/petBook.js';
import { getActiveRenovationDecor } from '../render/renovation.js';
import { admitResident, currentResidentStars } from './residentPets.js';
import { addFollowers, followersForBestie } from '../sim/followers.js';
import { cue } from '../ui/hud.js';
import { showToast } from '../ui/moments.js';
import { heartIcon, giftIcon } from '../ui/icons.js';
import { petPortrait } from '../ui/petPortrait.js';

// A level-up or the day's first pet: a toast in the Pet Book's pink, queued with every other moment
// (ui/moments.js) so it never lands on another toast or on an open sheet.
const announce = text => showToast(text, 2300, 'friend');

function prefersReducedMotion(G) {
  if (G?.settings?.reducedMotion) return true;
  try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches; }
  catch (_) { return false; }
}

export function installPetFriendship(G, platform = null) {
  ensurePetBook(G.meta);
  if (!('petKeepsake' in G)) G.petKeepsake = null;
  const decor = getActiveRenovationDecor();
  let lastPromotionKey = '', spotlightDay = -1, lastSpotlightKey = '';

  // Snapshot ownership remains in game.js; this wrapper adds only the cosmetic relationship map
  // and one stable keepsake ID. The canonical save gate sanitizes the ID before restore.
  const baseSnapshot = G.snapshot;
  G.snapshot = () => {
    const save = baseSnapshot();
    if (!save.meta || typeof save.meta !== 'object') save.meta = {};
    save.meta.petFriendship = { ...G.meta.petFriendship };
    save.petKeepsake = G.petKeepsake ? { ...G.petKeepsake } : null;
    return save;
  };

  function syncKeepsake() {
    if (!decor) return;
    decor.setKeepsake(G.petKeepsake && G.petKeepsake.key || null);
  }

  // WHAT A TABLE IS FOR.
  //
  // This used to credit a friendship visit on every 'pay'. Paying is not a relationship: a guest who
  // buys a cookie at the counter and walks straight back out has not spent any time with you, and
  // crediting them made the Pet Book fill itself whatever the café was like. It also left the
  // tables with no positive payoff at all once a guest who could not sit simply took their order
  // away (sim/customers.js) — they existed only to avoid a penalty, which is not a reason to build
  // or clean anything.
  //
  // A SETTLED VISIT is the relationship: the pet came in, sat down at one of your tables, and had a
  // whole meal there. That is what advances New Face -> Regular -> Friend -> Bestie now, so a clean
  // table is directly how the collection fills, and the Cleaner and every seat upgrade pay for
  // themselves in pets rather than in coins.
  //
  // Coins were the other option and this is deliberately not that: the economy bot already reports
  // the core café completing in 8 days against a 10-12 target, so a seated tip would have made an
  // existing balance problem worse to solve a design one. Collection value costs the economy
  // nothing and surfaces the meta the owner keeps asking to see.
  //
  // Discovery is untouched — every pet that walks in still appears in the Book (systems/
  // customers.js calls discoverPet on spawn). You MEET everyone; you BEFRIEND the ones you seat.
  const observedPush = function friendshipObservedPush(...items) {
    for (const event of items) {
      if (!event || event.type !== 'settled') continue;
      const customer = G.customers.find(c => c && c.id === event.id);
      if (!customer || !customer.species) continue;
      // A VIP invited by the Special Guest offer counts DOUBLE for friendship (ship plan 1.7a).
      // Two real visits, not a multiplier: the tier ladder stays one authored list of visit counts.
      // The promotion flag is OR-ed so a level-up on the first of the two is still announced.
      const first = recordPetVisit(G.meta, customer.species, customer.petVariant | 0);
      const second = customer.vip ? recordPetVisit(G.meta, customer.species, customer.petVariant | 0) : null;
      const result = second ? { ...second, promoted: second.promoted || first.promoted } : first;
      const day = Math.max(1, (G.dayState && G.dayState.day) | 0);
      const firstPetThisDay = spotlightDay !== day;
      if (firstPetThisDay) { spotlightDay = day; lastSpotlightKey = result.key; }

      let keepsakeAwarded = false;
      if (result.promoted && result.friendship.max) {
        // Task 2.5: the instant a pet reaches the Bestie tier it is offered the next open resident
        // slot -- true first-come-first-served, since promotions happen in real play order. A
        // no-op once every slot is filled or this pet already lives here. residentPets.js does not
        // render the move-in until the next in-game morning (see that module's header).
        admitResident(G.meta, result.key, currentResidentStars(G));
        G.meta.followers = addFollowers(G.meta.followers, followersForBestie());
        const award = awardFirstBestieKeepsake(G.petKeepsake, result.key);
        if (award.changed) {
          G.petKeepsake = award.data;
          keepsakeAwarded = true;
          // Start just above the actual customer/pet visit. Only the portrait flies; the customer,
          // pet and camera remain owned by their existing systems throughout the reveal.
          decor?.revealKeepsake(result.key, { x: customer.x, y: 1.2, z: customer.z }, prefersReducedMotion(G));
        }
      }

      if (result.promoted) {
        lastPromotionKey = result.key;
        // The owner's 2026-09-09 phone playtest: five English sentences ("Calico is now a Regular
        // ♥") printed over the play field in five minutes. The tier is now READ, not printed: the
        // pet's name plus one heart per tier already reached (Regular 1, Friend 2, Bestie 3, taken
        // straight from friendship.level -- src/sim/petBook.js's PET_FRIENDSHIP_TIERS index, so a
        // tier added later still counts correctly), plus a gift glyph when a keepsake was just won.
        // The sentence survives verbatim as the cue's aria text; only the DRAWING changed.
        const sentence = keepsakeAwarded
          ? `${result.profile.name} is your Bestie ♥ · a memory joins the café`
          : `${result.profile.name} is now a ${result.friendship.label} ♥`;
        const tierHearts = Array.from({ length: Math.max(0, Math.min(3, result.friendship.level)) }, () => heartIcon());
        announce(cue(
          [result.profile.name, ...tierHearts, ...(keepsakeAwarded ? [giftIcon()] : [])],
          sentence,
        ));
        // The Pet Book's model changed (a friendship level): re-send it so the chip's dot lights.
        G.syncPetBook?.();
        // Friendship/keepsake mutation occurs during the simulation event pass. Use the game's
        // material checkpoint so the serialized snapshot is taken only after the full update step.
        if (typeof G.requestCheckpoint === 'function') G.requestCheckpoint(keepsakeAwarded ? 'pet-keepsake' : 'pet-friendship');
        else if (platform && G.snapshot) platform.save(G.snapshot());
      } else if (firstPetThisDay) {
        // One quiet pet spotlight per shift makes the named-pet layer visible during Days 1–4
        // without throwing a toast for every customer. This has no gameplay/economy effect.
        // The trait ('Sunbeam seeker') was a sentence on the play field. What the moment is about
        // is WHICH pet and that it likes you: its portrait, its name, a heart. The trait stays in
        // the aria text and in the Pet Book, where words are allowed.
        announce(cue(
          [{ swatch: petPortrait(customer.species, result.profile, customer.petVariant) }, result.profile.name, heartIcon()],
          `${result.profile.name} ♥ ${result.profile.trait}`,
        ));
      }
      // Do not sync the wall here: a just-awarded keepsake may still be flying toward it.
    }
  };
  const unsubscribe = subscribeWorld(G.world, event => observedPush(event), 10);

  function refresh() {
    // main.js calls this after G.restore: already-earned memories should appear at their settled
    // wall home immediately and must never replay their award animation on reload.
    syncKeepsake();
  }

  return {
    refresh,
    get lastPromotionKey() { return lastPromotionKey; },
    get lastSpotlightKey() { return lastSpotlightKey; },
    get keepsakeKey() { return G.petKeepsake && G.petKeepsake.key || null; },
    destroy() { unsubscribe(); },
  };
}
