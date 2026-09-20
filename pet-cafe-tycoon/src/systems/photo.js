// src/systems/photo.js — the owner-facing bridge for photos at the tables
// (docs/SHIP-PLAN-2026-09-19.md §1.3). Wires the pure pose mechanics in src/sim/petPose.js
// (which pet is posing, the shot clock and the tip math, none of which touch meta or the DOM) to
// the browser: the owner's proximity, a real friendship tier read from G.meta via the Pet Visitor
// Book (src/sim/petBook.js), and the visible ring + polaroid in src/ui/photoGame.js.
//
// It replaced the Pet Photo Studio booth's bridge. What went with the booth: the tip TRAY (a tip
// now lands on the pet's own table, swept walking past by systems/stations.js like any other pile)
// and the "stand at the station" idea itself — the owner walks to the pet, not to a machine.
//
// Same factory shape as systems/stations.js — createXxx(G, S, ctx) returning { update(dt) } — and
// src/game.js calls it once per frame between customers.update and staff.update, so a pose starts
// from seat states the same frame produced and the hired Photographer reacts to it on the next.
import { stepPetPoses, resolvePoseShot, POSE_SERVE_RADIUS } from '../sim/petPose.js';
import { addFollowers, followersForShot } from '../sim/followers.js';
import { petFriendship, petKey, petProfile } from '../sim/petBook.js';
import { createPhotoGame } from '../ui/photoGame.js';

// "cats loaf, dogs sit-tilt, bunnies ear-up, hamsters cheeks". Exported so whichever render layer
// poses the pet rig reuses the exact same species -> pose mapping rather than inventing a second
// one; src/render/portrait.js already keys its portrait poses off these names.
const SPECIES_POSE = { cat: 'loaf', dog: 'sit-tilt', bunny: 'ear-up', hamster: 'cheeks' };
export function poseForSpecies(species) { return SPECIES_POSE[species] || 'loaf'; }

// The full-screen surfaces a photo must never be drawn over. Every one of them lives in the DOM all
// the time and shows itself by dropping `hidden` (src/ui/meta.js, pawSheet.js, cafeJournal.js and
// friends), so they cannot be detected through ui/sheets.js's own isOpen — which covers only the
// bottom sheets and the day-summary card.
const OVERLAY_ROOTS = [
  '.meta-book-root:not(.hidden)', '.paw-root:not(.hidden)', '.career-root:not(.hidden)',
  '.party-root:not(.hidden)', '.social-root:not(.hidden)',
].join(',');

export function createPhotoStudio(G, S, ctx) {
  const { world, fx, els, sheets, P } = ctx;
  const game = createPhotoGame({
    project: fx && typeof fx.project === 'function' ? fx.project.bind(fx) : null,
    els,
    onResolve(_subjectId, quality) { resolvePoseShot(world, quality); },
    // Optional: src/render/portrait.js's renderPetPortrait turns the polaroid from a blank card
    // into the guest's actual rendered pet, but needs the game's single THREE.WebGLRenderer, which
    // only main.js owns — so it arrives as a plain callback rather than an import.
    renderPortrait: typeof ctx.renderPortrait === 'function' ? ctx.renderPortrait : null,
    // Read through G every frame rather than captured: src/main.js builds the label arbiter AFTER
    // createGame, so it does not exist yet at construction time.
    avoid: (x, y, w, h) => (G.labelLayout ? G.labelLayout.avoid(x, y, w, h) : [x, y]),
    // A reveal never lands on top of anything the player has opened: the sheets and the day summary
    // (both ui/sheets.js, so sheets.isOpen covers them) and the full-screen collection/progress
    // overlays, which are separate roots that simply drop their `hidden` class. photoGame.js holds
    // the card until this goes false (playthrough.md: a polaroid was drawn over the Day 14 summary,
    // hiding its rows). Only ever called when there is a card to show, so the query costs nothing
    // on an ordinary frame.
    isBlocked: () => !!(sheets && sheets.isOpen) || (typeof document !== 'undefined' && !!document.querySelector(OVERLAY_ROOTS)),
  });

  // Sim-purity boundary: this is the one place a posing guest's species/petVariant turns into a
  // friendship tier, via the same Pet Visitor Book systems/petFriendship.js reads on every 'pay'.
  function tierFor(customer) {
    const variant = typeof customer.petVariant === 'number' ? customer.petVariant : 0;
    return petFriendship(G.meta, customer.species, variant).level;
  }
  // Which pets the album already holds — sim/petPose.js prefers the ones it does not, so photos
  // fill the collection instead of repeating whichever cat happens to be sitting down.
  function photographed(species, variant) {
    const album = G.meta && G.meta.album;
    return !!(album && album[petKey(species, variant)]);
  }

  // Credited on the SESSION, not in a map keyed by who posed: both resolution paths land here — a
  // real tap AND petPose's own timeout — so crediting on the tap callback alone would silently
  // skip every shot the player let run out, and a flag on the shot itself cannot mistake a second
  // pose by the same guest for a repeat of the first.
  function creditShot(pose) {
    const s = pose.session;
    if (!s || !s.resolved || s.credited) return;
    s.credited = true;

    const pk = petKey(s.species, s.variant);
    const album = G.meta.album || (G.meta.album = {});
    const prev = album[pk] || null;
    const rank = s.quality === 'perfect' ? 2 : s.quality === 'good' ? 1 : 0;
    // A pet's FIRST photo is the moment: the full developing-polaroid reveal, once per pet ever.
    // Every later shot is a small corner polaroid with no screen flash (§1.3). The old rule also
    // revealed any shot better than the album held, which washed the screen white 3-5 times a day
    // (playthrough.md). Read by the mini-game on the same frame.
    s.reveal = !prev;
    s.rank = rank;
    s.petName = petProfile(s.species, s.variant).name;
    // REPLACED, never mutated in place. G.snapshot() spreads meta.album exactly one level deep, so
    // an in-place prev.shots++ would reach through the shared nested reference and rewrite a
    // snapshot that had already been taken.
    G.meta.album = { ...album, [pk]: {
      shots: ((prev && prev.shots) | 0) + 1,
      best: Math.max((prev && prev.best) | 0, rank),
      poseId: poseForSpecies(s.species),
      accessoryId: (G.meta.equipped && G.meta.equipped[pk]) || null,
    } };
    G.meta.followers = addFollowers(G.meta.followers, followersForShot({
      isFirstPhotoOfPet: !prev,
      isPerfect: s.quality === 'perfect',
    }));
    // The day summary's photo chip (src/ui/serviceSummary.js). Counted lazily rather than seeded
    // in freshDayStats() so a shift with no photos leaves no counter at all and the chip stays
    // absent instead of drawing a 0.
    if (G.dayStats) G.dayStats.photos = (G.dayStats.photos | 0) + 1;
    if (typeof ctx.syncPetBook === 'function') ctx.syncPetBook();
    if (typeof G.requestCheckpoint === 'function') G.requestCheckpoint('photo-shot');
  }

  // Close enough to be the one taking this shot: the same radius sim/staff.js judges the hired
  // Photographer by.
  function ownerAt(pose) {
    return !!P && (P.x - pose.x) ** 2 + (P.z - pose.z) ** 2 < POSE_SERVE_RADIUS * POSE_SERVE_RADIUS;
  }

  let liveKey = null; // `${seatId}:${customerId}` — which shot (if any) the mini-game is showing

  return {
    update(dt) {
      // The rewarded Golden Shot doubles photo tips for the rest of the shift
      // (systems/rewardsSystem.js). The tip becomes coins on the table, inside the sim, so the
      // multiplier has to reach the sim: it rides on the world like dayState/stars already do.
      world.photoTipMult = G.goldenShotMult || 1;
      // The owner came to take the picture. Proximity IS the interaction — there is no button, no
      // station to stand at and nothing to tap first; the ring appears and the shot is the timing.
      const pose = world.pose;
      if (pose && ownerAt(pose)) pose.serving = true;

      const live = stepPetPoses(world, G.customers, dt, {
        unlocked: world.built.has('z_photo'),
        photographed,
        tierFor,
      });
      if (live && live.session) creditShot(live);

      if (live && live.session) {
        const key = live.seatId + ':' + live.session.customerId;
        if (key !== liveKey) {
          liveKey = key;
          game.start(live, poseForSpecies(live.session.species), petKey(live.session.species, live.session.variant));
        }
        // The ring is only drawn while the owner is the one taking it (see photoGame.update).
        game.update(dt, live, ownerAt(live));
      } else if (liveKey != null) {
        liveKey = null;
        game.stop();
      }
      // Reveals held back while a sheet was open get their moment as soon as it closes.
    },
  };
}
