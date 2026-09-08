// src/systems/photo.js — Task 2.1: the owner-facing bridge for the Pet Photo Studio (plan 3.2).
// Wires the pure sim mechanics in src/sim/world.js (stepPhotoBooth/resolvePhotoShot — the station's
// queue, session timer and tip math, none of which touch meta or the DOM) to the browser: owner
// proximity (mans a session and collects the tip tray, exactly like src/systems/stations.js does
// for a register's own pile), a real friendship tier read from G.meta via the Pet Visitor Book
// (src/sim/petBook.js), and the visible mini-game + polaroid in src/ui/photoGame.js.
//
// Mirrors src/systems/stations.js's own factory shape — createXxx(G, S, ctx) returning
// { update(dt) } — so wiring this into src/game.js's frame loop is the same one-line pattern every
// other system there already uses (stations.update(dt), zones.update(dt), ...). See this task's own
// wiringNeeded for the exact call site and ctx fields — src/game.js is owned by another task this
// batch, so this file cannot wire itself in.
import { stepPhotoBooth, resolvePhotoShot, collectCash } from '../sim/world.js';
import { addFollowers, followersForShot } from '../sim/followers.js';
import { petFriendship, petKey } from '../sim/petBook.js';
import { createPhotoGame } from '../ui/photoGame.js';

// Radii deliberately match the scale systems/stations.js already uses for a checkout's own
// front-check (near(P, st.front, 1.2)) and its cash-pile auto-collect (AUTO_CASH_RADIUS 1.2) — a
// booth that behaved noticeably differently from a register at the same distance would read as a
// bug, not a design choice.
const SERVE_RADIUS = 1.3;
const COLLECT_RADIUS = 1.2;

// "cats loaf, dogs sit-tilt, bunnies ear-up, hamsters cheeks" (plan 3.2). This table is exported so
// whichever render layer ends up owning the pet's pose rig (out of this task's file list — see
// wiringNeeded) can reuse the exact same species -> pose mapping rather than inventing a second one.
const SPECIES_POSE = { cat: 'loaf', dog: 'sit-tilt', bunny: 'ear-up', hamster: 'cheeks' };
export function poseForSpecies(species) { return SPECIES_POSE[species] || 'loaf'; }

function near(a, b, r) { return (a.x - b.x) ** 2 + (a.z - b.z) ** 2 < r * r; }

export function createPhotoStudio(G, S, ctx) {
  const { world, hud, fx, audio, P, els } = ctx;
  const game = createPhotoGame({
    project: fx && typeof fx.project === 'function' ? fx.project.bind(fx) : null,
    els,
    onResolve(stationId, quality) { resolvePhotoShot(world, stationId, quality); },
    // Optional: src/render/portrait.js's renderPetPortrait(renderer, {petKey, poseId}) turns the
    // polaroid from a blank card into the guest's actual rendered pet, but needs the game's single
    // THREE.WebGLRenderer, which this batch's ctx does not carry yet (see wiringNeeded). Wired in as
    // a plain callback rather than an import so this file never takes a hard dependency on another
    // task's in-flight module — omit ctx.renderPortrait and the polaroid stays a blank frame.
    renderPortrait: typeof ctx.renderPortrait === 'function' ? ctx.renderPortrait : null,
    // Read through G every frame rather than captured: src/main.js builds the label arbiter AFTER
    // createGame, so it does not exist yet at construction time.
    avoid: (x, y, w, h) => (G.labelLayout ? G.labelLayout.avoid(x, y, w, h) : [x, y]),
  });

  // Sim-purity boundary (world.js's stepPhotoBooth comment): this is the one place a queued
  // customer's species/petVariant turns into a friendship tier, via the same Pet Visitor Book
  // src/systems/petFriendship.js already reads on every 'pay' event. `customer` here is the exact
  // sim object stepCustomers/stepPhotoBooth operate on, not a separate render-side copy.
  function tierFor(customer) {
    const variant = typeof customer.petVariant === 'number' ? customer.petVariant : 0;
    return petFriendship(G.meta, customer.species, variant).level;
  }

  function collectTray(st) {
    if (st.pile <= 0 || !P || !near(P, st.front, COLLECT_RADIUS)) return;
    // The golden-shot rewarded ad (systems/rewardsSystem.js, task 2.7) multiplies photo tips for
    // the rest of the shift. This is the only place a photo tip becomes coins, so it is the only
    // place the multiplier can apply — without it the offer is claimable but pays nothing.
    const amt = Math.round(collectCash(world, st.id) * (G.goldenShotMult || 1));
    if (amt <= 0) return;
    G.coins = (G.coins || 0) + amt;
    if (G.stats) G.stats.lifetimeEarned = (G.stats.lifetimeEarned | 0) + amt;
    if (hud && typeof hud.setCoins === 'function') hud.setCoins(G.coins);
    if (audio && typeof audio.play === 'function') audio.play('coin');
    if (fx && typeof fx.number === 'function') fx.number(st.front.x, 0.9, st.front.z, '+' + amt);
    if (fx && typeof fx.coinArc === 'function') fx.coinArc(st.front.x, 0.3, st.front.z, Math.min(10, 2 + (amt / 5 | 0)), () => hud && hud.bump && hud.bump());
    // systems/stations.js marks this same checkpoint when a register pile is swept; without it a
    // photo tray collection is the one way to gain coins that no save is ever triggered by.
    if (typeof G.requestCheckpoint === 'function') G.requestCheckpoint('cash-collection');
  }

  // Which sessions have already paid out their album entry and followers, keyed by station. Both
  // resolution paths land here — a real tap AND stepPhotoBooth's PHOTO_AUTO_RESOLVE timeout — so
  // crediting on the tap callback alone would silently skip every shot the player let run out.
  const creditedFor = new Map();

  function creditShot(st) {
    const s = st.session;
    if (!s || !s.resolved) return;
    if (creditedFor.get(st.id) === s.customerId) return;
    creditedFor.set(st.id, s.customerId);

    const pk = petKey(s.species, s.variant);
    const album = G.meta.album || (G.meta.album = {});
    const prev = album[pk] || null;
    const rank = s.quality === 'perfect' ? 2 : s.quality === 'good' ? 1 : 0;
    // REPLACED, never mutated in place. G.snapshot() spreads meta.album exactly one level deep, so
    // an in-place prev.shots++ would reach through the shared nested reference and rewrite a
    // snapshot that had already been taken (task 2.3 flagged this precise hazard).
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
    if (typeof ctx.syncPetBook === 'function') ctx.syncPetBook();
    if (typeof G.requestCheckpoint === 'function') G.requestCheckpoint('photo-shot');
  }

  let liveKey = null; // `${stationId}:${customerId}` — which session (if any) the mini-game is showing

  return {
    update(dt) {
      let live = null;
      for (const st of world.stations.values()) {
        if (st.type !== 'photo' || !st.active) continue;
        if (P && near(P, st.front, SERVE_RADIUS)) st.serving = true;
        collectTray(st);
        if (st.session) live = st; // whichever session is already running, or was just started below
      }
      // stepPhotoBooth may start a brand-new session (owner present, a guest genuinely waiting at
      // slot 0) or auto-resolve an existing one past its timeout — `live` above is intentionally
      // read before this call so a same-tick start still surfaces to the mini-game exactly one
      // frame later (harmless — the ring's own 1.4s window dwarfs a single frame), while a same-tick
      // timeout resolution is instead caught by ui/photoGame.js's own `st.session.resolved` check.
      stepPhotoBooth(world, dt, tierFor);
      if (!live) for (const st of world.stations.values()) if (st.type === 'photo' && st.session) live = st;
      for (const st of world.stations.values()) if (st.type === 'photo' && st.session) creditShot(st);

      if (live) {
        const key = live.id + ':' + live.session.customerId;
        if (key !== liveKey) {
          liveKey = key;
          const pk = petKey(live.session.species, live.session.variant);
          game.start(live, poseForSpecies(live.session.species), pk);
        }
        game.update(dt, live);
      } else if (liveKey != null) {
        liveKey = null;
        game.stop();
      }
    },
  };
}
