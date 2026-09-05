// Cosmetic relationship layer for named pet visitors.
// Successful checkout visits build New Face -> Regular -> Friend -> Bestie progression.
// This module deliberately observes pay events without changing prices, patience, traffic or service logic.
import { allPetCards, ensurePetBook, recordPetVisit } from '../sim/petBook.js';

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
    .friendship-toast{position:fixed;left:50%;bottom:calc(172px + env(safe-area-inset-bottom,0px));z-index:82;pointer-events:none;transform:translate(-50%,10px) scale(.96);opacity:0;max-width:min(330px,calc(100vw - 24px));box-sizing:border-box;padding:10px 15px;border-radius:999px;background:#fff4f7f2;color:#704250;border:1px solid #fff;box-shadow:0 10px 28px #7e394431;font:900 12px/1.15 system-ui,sans-serif;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:.2s ease}
    .friendship-toast.show{opacity:1;transform:translate(-50%,0) scale(1)}
    @media(max-width:380px){.pet-friendship-top{font-size:7px}.pet-friendship-visits{display:none}.friendship-toast{font-size:11px}}
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
    if (timer) clearTimeout(timer);
    el.textContent = text;
    el.classList.add('show');
    timer = setTimeout(() => el.classList.remove('show'), 2300);
  };
}

function friendshipCaption(friendship) {
  if (friendship.max) return `${friendship.label} · ${friendship.visits} visits`;
  const remaining = Math.max(0, friendship.needed - friendship.current);
  return `${friendship.label} · ${remaining} to ${friendship.nextLabel}`;
}

export function installPetFriendship(G, platform = null) {
  ensureStyle();
  ensurePetBook(G.meta);
  const announce = makeToast();
  const events = G.world.events;
  const nativePush = events.push;
  let lastPromotionKey = '';

  // Snapshot ownership remains in game.js; this wrapper adds only the new cosmetic map so existing
  // save/certification behavior stays untouched. applySave already migrates old saves to an empty map.
  const baseSnapshot = G.snapshot;
  G.snapshot = () => {
    const save = baseSnapshot();
    if (!save.meta || typeof save.meta !== 'object') save.meta = {};
    save.meta.petFriendship = { ...G.meta.petFriendship };
    return save;
  };

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
  // next frame decorates the fresh cards without making either UI module depend on the other.
  const bookButton = document.querySelector('.meta-pawbook');
  if (bookButton) bookButton.addEventListener('click', () => requestAnimationFrame(renderBook));

  // Observe successful checkout events at their source. The original Array#push still receives the
  // exact same events in the exact same order; friendship is therefore presentation/meta-only.
  events.push = function friendshipObservedPush(...items) {
    for (const event of items) {
      if (!event || event.type !== 'pay') continue;
      const customer = G.customers.find(c => c && c.id === event.id);
      if (!customer || !customer.species) continue;
      const result = recordPetVisit(G.meta, customer.species, customer.petVariant | 0);
      if (result.promoted) {
        lastPromotionKey = result.key;
        announce(`${result.profile.name} is now a ${result.friendship.label} ♥`);
        if (bookButton) {
          bookButton.classList.add('bump');
          setTimeout(() => bookButton.classList.remove('bump'), 500);
        }
        if (platform && G.snapshot) platform.save(G.snapshot());
      }
      renderBook();
    }
    return nativePush.apply(this, items);
  };

  return {
    refresh: renderBook,
    get lastPromotionKey() { return lastPromotionKey; },
    destroy() {
      if (events.push === this) events.push = nativePush;
    },
  };
}
