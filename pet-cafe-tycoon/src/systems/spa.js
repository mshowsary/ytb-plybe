// src/systems/spa.js — Batch 4b (plan 3.9): the owner-facing bridge for the Pet Spa's two service
// stations, groom1 and bath1. Mirrors src/systems/photo.js's shape end to end (read both files
// header-to-header before touching this one): owner proximity to a station's front mans it exactly
// like a photo booth (SERVE_RADIUS), collectTray sweeps the tip pile with the same golden-shot-style
// checkpoint, and a finished session credits the player's progress. src/sim/world.js's groom/bath
// mechanics (stepGroomTable/resolveGroomBeat/stepBath and friends) were authored in parallel with
// this file, by a different task in this same batch, and had landed by the time this file was
// finished -- every name below is bound directly (a normal named import, exactly like photo.js's
// own), not defensively, because it was verified present. See groomGame.js's own header for the
// mini-game's shape now that the real contract is known.
//
// DIVERGENCES FROM THE PHOTO TEMPLATE (mirror the shape, not the numbers -- program rule 8):
//   1. Only groom1 gets a mini-game overlay. stepBath resolves a bath session on its own timer
//      (BATH_DURATION) with no player input at all -- world.js's own comment: "Unlike groom/photo,
//      no player input at all". So this file only ever calls game.start/update for a 'groom'
//      station; a 'bath' session's tray/collect/credit path still runs identically to groom's.
//   2. Friendship + follower crediting (creditGroomSession below) is wired for FINISHED GROOM
//      sessions only -- the task brief's own wording names "a finished groom session" specifically,
//      not "a finished spa session". Bath still pays into its tip pile via collectTray like every
//      other station, it just does not also touch G.meta.petFriendship/followers. If the intent was
//      actually symmetric this is a one-line change (widen the `st.type === 'groom'` guard in this
//      file's own update() to include 'bath') -- flagged explicitly since the brief's asymmetric
//      wording could equally be shorthand for "the spa".
//   3. resolveGroomBeat(world, stationId, phase) takes a raw pulse SCALE (world.js's own comment:
//      "with a real scale sampled from groomPulseScale"), not a precomputed quality string --
//      unlike photo's onResolve, which sends photoJudgeQuality's already-judged result. This file's
//      onResolve callback (passed into groomGame.js) therefore forwards groomGame.js's own scale
//      sample straight through; groomGame.js's header explains why it reads that scale off
//      st.session.t directly rather than keeping a second clock.
//   4. No album entry. A photo produces a physical polaroid/memory; a groom or bath does not, so
//      this file never touches G.meta.album for either station type.
//   5. stepBath takes a `tierFor` third argument too (unlike the task brief's own shorthand,
//      `stepBath(world, dt)`, which omitted it) -- the same friendship-tier lookup groom uses, so
//      this file passes the identical `tierFor` closure to both steppers.
import { collectCash, stepGroomTable, stepBath, resolveGroomBeat } from '../sim/world.js';
import { addFollowers } from '../sim/followers.js';
import * as Followers from '../sim/followers.js';
import { petFriendship, recordPetVisit } from '../sim/petBook.js';
import { createGroomGame } from '../ui/groomGame.js';

// Same scale systems/stations.js already uses for a checkout's own front-check (near(P, st.front,
// 1.2)) and its cash-pile auto-collect (AUTO_CASH_RADIUS 1.2) -- see photo.js's own identical
// comment. A spa station that behaved noticeably differently at the same distance would read as a
// bug, not a design choice.
export const SERVE_RADIUS = 1.3;
export const COLLECT_RADIUS = 1.2;

export function near(a, b, r) { return (a.x - b.x) ** 2 + (a.z - b.z) ** 2 < r * r; }

// The same Pet Visitor Book friendship-tier lookup photo.js's own tierFor uses, factored out as a
// standalone pure function (meta explicit, not closed over G) so it is testable without a bridge
// instance. Shared by BOTH stepGroomTable and stepBath (divergence #5 above) -- a queued sim
// customer's species/variant turns into a 0-3 friendship tier here, the one place sim purity
// (world.js never reads meta) meets the browser's real save data.
export function tierForGroomCustomer(meta, customer) {
  const variant = typeof customer?.petVariant === 'number' ? customer.petVariant : 0;
  return petFriendship(meta, customer?.species, variant).level;
}

// The follower award for a finished groom session -- deliberately modest, no perfect/first-time
// bonus tiers the way a photo has (plan gives the spa no album/collection story of its own). Per
// program rule 9's file-ownership list src/sim/followers.js is not this task's to edit, so the
// NUMBER belongs there (FOLLOWER_SOURCES.spaSession) via wiring, not as a literal here -- see this
// task's own wiringNeeded for the exact addition. Namespace-imported (unlike everything from
// world.js above, which is bound directly because it was verified to already exist) specifically
// because followers.js has NOT landed this export as of this file's authorship, and a plain
// `import { followersForSpaSession } from '../sim/followers.js'` naming an export that does not
// exist is a load-time SyntaxError under real ESM -- this namespace form loads fine either way and
// picks up the real number automatically, zero further edits, the moment that wiring lands.
export function followersForSpaSession() {
  return typeof Followers.followersForSpaSession === 'function' ? Followers.followersForSpaSession() : 2;
}

// Whether a resolved session at `st` still needs crediting, de-duplicated by customerId exactly
// like photo.js's own `creditedFor` map (both resolution paths -- a real 3-beat finish AND the
// sim's own per-beat auto-resolve timeout -- land here, so crediting only on a specific UI event
// would silently skip every session the player let run out). Factored out as a pure function (plain
// Map + plain station-shaped object in, boolean out) so it is testable without any sim/DOM state.
export function sessionNeedsCredit(st, creditedFor) {
  const s = st && st.session;
  if (!s || !s.resolved) return false;
  return creditedFor.get(st.id) !== s.customerId;
}

export function createSpaBridge(G, S, ctx) {
  const { world, hud, fx, audio, P, els } = ctx;
  const game = createGroomGame({
    project: fx && typeof fx.project === 'function' ? fx.project.bind(fx) : null,
    els,
    // Forwards groomGame.js's own scale sample straight into the sim -- see divergence #3 above.
    onResolve(stationId, phase) { resolveGroomBeat(world, stationId, phase); },
    // Read through G every frame rather than captured, same reasoning as photo.js's identical
    // comment: the label arbiter is built after createGame, so it does not exist yet at
    // construction time.
    avoid: (x, y, w, h) => (G.labelLayout ? G.labelLayout.avoid(x, y, w, h) : [x, y]),
    reducedMotion: () => {
      if (G.settings && G.settings.reducedMotion) return true;
      try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches; }
      catch (_) { return false; }
    },
  });

  const tierFor = customer => tierForGroomCustomer(G.meta, customer);

  function collectTray(st) {
    if (st.pile <= 0 || !P || !near(P, st.front, COLLECT_RADIUS)) return;
    // Same golden-shot rewarded-ad reasoning as photo.js's own collectTray: this is the only place
    // a spa tip becomes coins. Left OUT of the multiplier deliberately (see systems/rewardsSystem.js's
    // own wiringNeeded item B12) -- "golden SHOT" is a photo-specific reward chip, and extending it
    // to groom/bath tips is a content decision that belongs to that file's owner, not an assumption
    // this bridge should make silently.
    const amt = Math.round(collectCash(world, st.id));
    if (amt <= 0) return;
    G.coins = (G.coins || 0) + amt;
    if (G.stats) G.stats.lifetimeEarned = (G.stats.lifetimeEarned | 0) + amt;
    if (hud && typeof hud.setCoins === 'function') hud.setCoins(G.coins);
    if (audio && typeof audio.play === 'function') audio.play('coin');
    if (fx && typeof fx.number === 'function') fx.number(st.front.x, 0.9, st.front.z, '+' + amt);
    if (fx && typeof fx.coinArc === 'function') fx.coinArc(st.front.x, 0.3, st.front.z, Math.min(10, 2 + (amt / 5 | 0)), () => hud && hud.bump && hud.bump());
    // systems/stations.js marks this same checkpoint when a register pile is swept; without it a
    // spa tray collection is a way to gain coins that no save is ever triggered by.
    if (typeof G.requestCheckpoint === 'function') G.requestCheckpoint('cash-collection');
  }

  // groom1 only -- see this file's header divergence #2.
  const creditedFor = new Map();

  function creditGroomSession(st) {
    if (!sessionNeedsCredit(st, creditedFor)) return;
    const s = st.session;
    creditedFor.set(st.id, s.customerId);

    // recordPetVisit-style crediting, reusing sim/petBook.js's own pure function directly rather
    // than routing through src/systems/petFriendship.js's 'pay'-event listener: a spa session
    // finishes independently of any register 'pay' event (the spa-guest register payment path is
    // not wired yet either -- see this task's wiringNeeded item E), so there is no 'pay' event for
    // this visit to piggyback on. This is the exact function petFriendship.js itself calls for a
    // checkout visit, just invoked directly instead of via that file's event subscription.
    const variant = typeof s.variant === 'number' ? s.variant : 0;
    recordPetVisit(G.meta, s.species, variant);
    G.meta.followers = addFollowers(G.meta.followers, followersForSpaSession());

    // Refreshes the same Pet Visitor Book screen a photo's album entry or a checkout promotion
    // already refreshes (src/game.js's ctx.syncPetBook = syncPetBookPresentation) -- friendship
    // just moved, so the book's progress bar for this pet is stale until this runs.
    if (typeof ctx.syncPetBook === 'function') ctx.syncPetBook();
    if (typeof G.requestCheckpoint === 'function') G.requestCheckpoint('spa-session');
  }

  let liveKey = null; // `${stationId}:${customerId}` — which groom1 session (if any) the mini-game is showing

  return {
    update(dt) {
      let liveGroom = null;
      for (const st of world.stations.values()) {
        if ((st.type !== 'groom' && st.type !== 'bath') || !st.active) continue;
        if (P && near(P, st.front, SERVE_RADIUS)) st.serving = true;
        collectTray(st);
        if (st.type === 'groom' && st.session) liveGroom = st; // whichever session is already running, or was just started below
      }
      // Same same-tick ordering note as photo.js's own stepPhotoBooth call: `liveGroom` above is
      // read before stepGroomTable/stepBath run so a same-tick session start still surfaces to the
      // mini-game exactly one frame later, and a same-tick auto-resolve is instead caught by
      // groomGame.js's own `st.session.resolved` check.
      stepGroomTable(world, dt, tierFor);
      stepBath(world, dt, tierFor);
      if (!liveGroom) for (const st of world.stations.values()) if (st.type === 'groom' && st.session) liveGroom = st;
      for (const st of world.stations.values()) if (st.type === 'groom' && st.session) creditGroomSession(st);

      if (liveGroom) {
        const key = liveGroom.id + ':' + liveGroom.session.customerId;
        if (key !== liveKey) { liveKey = key; game.start(liveGroom); }
        game.update(dt, liveGroom);
      } else if (liveKey != null) {
        liveKey = null;
        game.stop();
      }
    },
  };
}
