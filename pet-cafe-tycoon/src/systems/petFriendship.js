import { subscribeWorld } from '../sim/events.js';
// Cosmetic relationship layer for named pet visitors.
// Successful checkout visits build New Face -> Regular -> Friend -> Bestie progression.
// This module deliberately observes pay events without changing prices, patience, traffic or service logic.
import { allPetCards, awardFirstBestieKeepsake, ensurePetBook, recordPetVisit } from '../sim/petBook.js';
import { getActiveRenovationDecor } from '../render/renovation.js';
import { presentationScheduler } from '../core/presentationScheduler.js';
import { admitResident, currentResidentStars } from './residentPets.js';
import { addFollowers, followersForBestie } from '../sim/followers.js';
import { cue, paintCue } from '../ui/hud.js';
import { heartIcon, giftIcon } from '../ui/icons.js';
import { petPortrait } from '../ui/petPortrait.js';

const STYLE_ID = 'pet-cafe-friendship-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .pet-friendship{width:100%;box-sizing:border-box;margin-top:1px;display:flex;flex-direction:column;gap:3px;align-items:stretch}
    .pet-friendship-top{display:flex;align-items:center;justify-content:center;gap:4px;min-width:0;color:#ba6478;font:950 8px/1 system-ui,sans-serif;letter-spacing:.055em;text-transform:uppercase;white-space:nowrap}
    .pet-friendship-top .heart{font-size:9px;color:#dd7088}.pet-friendship-visits{opacity:.58;font-weight:850;letter-spacing:0;text-transform:none}
    .pet-friendship-track{height:3px;width:100%;overflow:hidden;border-radius:999px;background:#553a3512}
    .pet-friendship-fill{height:100%;border-radius:inherit;background:linear-gradient(90deg,#ef8fa3,#8b7cf6);transition:width .3s ease}
    .meta-pet-card.bestie{border-color:#e29bb56e;box-shadow:inset 0 0 0 1px #fff8,0 4px 14px #d2708c18}
    .meta-pawbook.pet-forward .meta-paw{font-size:15px;line-height:1}.meta-pawbook.pet-forward .meta-book-count{font-size:12px;letter-spacing:.02em}
    .friendship-toast{position:fixed;left:50%;bottom:calc(172px + env(safe-area-inset-bottom,0px));z-index:82;pointer-events:none;transform:translate(-50%,10px) scale(.96);opacity:0;max-width:min(330px,calc(100vw - 24px));box-sizing:border-box;padding:10px 15px;border-radius:999px;background:#fff4f7f2;color:#704250;border:1px solid #fff;box-shadow:0 10px 28px #7e394431;font:900 12px/1.15 system-ui,sans-serif;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:.2s ease}
    .friendship-toast.show{opacity:1;transform:translate(-50%,0) scale(1)}
    /* The toast now draws a cue row (name + hearts, sometimes a gift) instead of a sentence -- see
       the promotion announce() call below. .cueIco (src/ui/hud.js's injected sizing) already scales
       an inline svg to 1.2em, but this belt-and-suspenders rule keeps the hearts a fixed, legible
       size regardless of the toast's own font-size tweaks (the 380px media query below shrinks it). */
    .friendship-toast svg{width:14px;height:14px;vertical-align:-2px}
    @media(max-width:380px){.pet-friendship-top{font-size:7px}.pet-friendship-visits{display:none}.friendship-toast{font-size:11px}.meta-pawbook.pet-forward .meta-book-count:before{display:none}}
    @media(max-width:240px){.pet-friendship{display:none}}
  `;
  document.head.appendChild(style);
}

function makeToast() {
  const el = document.createElement('div');
  el.className = 'friendship-toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  document.body.appendChild(el);
  let timer = null;
  return text => {
    if (timer) presentationScheduler.cancel(timer);
    paintCue(el, text);
    el.classList.add('show');
    timer = presentationScheduler.schedule(() => { el.classList.remove('show'); timer = null; }, 2300);
  };
}

function friendshipCaption(friendship) {
  if (friendship.max) return `${friendship.label} · ${friendship.visits} visits`;
  const remaining = Math.max(0, friendship.needed - friendship.current);
  return `${friendship.label} · ${remaining} to ${friendship.nextLabel}`;
}

function prefersReducedMotion(G) {
  if (G?.settings?.reducedMotion) return true;
  try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches; }
  catch (_) { return false; }
}

export function installPetFriendship(G, platform = null) {
  ensureStyle();
  ensurePetBook(G.meta);
  if (!('petKeepsake' in G)) G.petKeepsake = null;
  const announce = makeToast();
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

  function renderBook() {
    ensurePetBook(G.meta);
    const root = document.querySelector('.meta-book-root');
    const bookCards = [...document.querySelectorAll('.meta-book-grid .meta-pet-card')];
    if (!root || root.classList.contains('hidden') || !bookCards.length) return;

    const subtitle = root.querySelector('.meta-book-sub');
    if (subtitle) subtitle.textContent = 'Meet every visitor and turn your favorites into Besties.';

    const model = allPetCards(G.meta);
    for (let i = 0; i < Math.min(model.length, bookCards.length); i++) {
      const card = bookCards[i], pet = model[i];
      card.dataset.petKey = pet.key;
      card.classList.toggle('bestie', pet.found && pet.friendship.max);
      const stale = card.querySelector('.pet-friendship');
      if (stale) stale.remove();
      if (!pet.found) continue;

      const bond = document.createElement('div'); bond.className = 'pet-friendship';
      const top = document.createElement('div'); top.className = 'pet-friendship-top';
      const heart = document.createElement('span'); heart.className = 'heart'; heart.textContent = '♥';
      const label = document.createElement('span'); label.className = 'pet-friendship-label'; label.textContent = pet.friendship.label;
      const visits = document.createElement('span'); visits.className = 'pet-friendship-visits'; visits.textContent = `${pet.friendship.visits} visit${pet.friendship.visits === 1 ? '' : 's'}`;
      top.append(heart, label, visits);
      const track = document.createElement('div'); track.className = 'pet-friendship-track';
      const fill = document.createElement('div'); fill.className = 'pet-friendship-fill'; fill.style.width = `${Math.round(pet.friendship.frac * 100)}%`; track.appendChild(fill);
      bond.append(top, track); card.appendChild(bond);
      card.title = `${pet.profile.name} · ${friendshipCaption(pet.friendship)}`;
      card.setAttribute('aria-label', `${pet.profile.name}, ${pet.profile.rarity}, ${friendshipCaption(pet.friendship)}`);
    }
  }

  // meta.js owns opening/rebuilding the book. This listener is installed later, so rendering on the
  // next allowed presentation frame decorates the fresh cards without mutating UI during host pause.
  const bookButton = document.querySelector('.meta-pawbook');
  if (bookButton) {
    bookButton.classList.add('pet-forward');
    bookButton.title = 'Pet Visitor Book · meet named pets and build friendships';
    const paw = bookButton.querySelector('.meta-paw'); if (paw) paw.textContent = '🐾';
  }
  const onBookOpen = () => presentationScheduler.afterFrames(renderBook, 1);
  if (bookButton) bookButton.addEventListener('click', onBookOpen);

  // Observe successful checkout events at their source through an explicit subscription.
  // Priorities preserve the former outer-to-inner observer order without replacing Array.push.
  const observedPush = function friendshipObservedPush(...items) {
    for (const event of items) {
      if (!event || event.type !== 'pay') continue;
      const customer = G.customers.find(c => c && c.id === event.id);
      if (!customer || !customer.species) continue;
      const result = recordPetVisit(G.meta, customer.species, customer.petVariant | 0);
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
        if (bookButton) {
          bookButton.classList.add('bump');
          presentationScheduler.schedule(() => bookButton.classList.remove('bump'), 500);
        }
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
          [{ swatch: petPortrait(customer.species, result.profile) }, result.profile.name, heartIcon()],
          `${result.profile.name} ♥ ${result.profile.trait}`,
        ));
        if (bookButton) {
          bookButton.classList.add('bump');
          presentationScheduler.schedule(() => bookButton.classList.remove('bump'), 420);
        }
      }
      // Do not sync the wall here: a just-awarded keepsake may still be flying toward it.
      renderBook();
    }
  };
  const unsubscribe = subscribeWorld(G.world, event => observedPush(event), 10);

  function refresh() {
    // main.js calls this after G.restore: already-earned memories should appear at their settled
    // wall home immediately and must never replay their award animation on reload.
    syncKeepsake();
    renderBook();
  }

  return {
    refresh,
    get lastPromotionKey() { return lastPromotionKey; },
    get lastSpotlightKey() { return lastSpotlightKey; },
    get keepsakeKey() { return G.petKeepsake && G.petKeepsake.key || null; },
    destroy() {
      unsubscribe();
      if (bookButton) bookButton.removeEventListener('click', onBookOpen);
    },
  };
}
