// src/ui/meta.js — the Pet Book: its chip on the play field, the book itself, and the card reveal a
// new pet gets. Presentation only; game.js owns the model and hands it over through setPetBook /
// setAlbum.
//
// The book used to be two tabs showing the same twenty pets twice (Discover: name, species, trait,
// rarity words; Album: portraits and photo counts) and an outfit row that printed raw ids like
// "acc_bow" with no way to take an outfit off. It is now ONE grid — portrait, name, friendship
// hearts, photo stars, every card the same height — and a tap opens the pet: its 3D portrait,
// friendship, photos and an outfit picker drawn as the accessories' own icons.
import { petPortrait } from './petPortrait.js';
import { showToast, runMoment } from './moments.js';
import { openModal, closeModal } from './modal.js';
import { presentationScheduler } from '../core/presentationScheduler.js';
import { ACCESSORIES } from '../../data/accessories.js';
import {
  pawIcon, heartIcon, photoIcon, lockIcon, noneIcon, sparkleIcon, catIcon, dogIcon, bunnyIcon, hamsterIcon,
} from './icons.js';

const STYLE_ID = 'pet-cafe-pet-book-style';
const SPECIES_ICON = { cat: catIcon, dog: dogIcon, bunny: bunnyIcon, hamster: hamsterIcon };
const HEARTS = 3;   // Regular, Friend, Bestie — sim/petBook.js PET_FRIENDSHIP_TIERS levels 1..3
const STARS = 3;    // a photo's rank 0..2 is drawn as 1..3 stars, as the photo reveal draws it

// Rarity, drawn: one to four pips in the rarity colour, so the Pet Book card and the new-pet card
// agree without either one spelling the tier. Pips rather than a coloured dot because colour alone
// is not a signal a colour-blind player can count.
const RARITY_PIPS = { common: [1, '#8B817A'], rare: [2, '#8B67D5'], epic: [3, '#D06DA7'], legendary: [4, '#C9922E'] };
export function rarityPips(rarity) {
  const [count, color] = RARITY_PIPS[rarity] || RARITY_PIPS.common;
  let pips = '';
  // Diamonds, not stars: at four pips across a 24-wide box five-point stars would touch.
  for (let i = 0; i < count; i++) {
    const cx = (12 + (i - (count - 1) / 2) * 5.4).toFixed(2);
    pips += `<path d="M${cx} 6.4L${(+cx + 2.4).toFixed(2)} 12L${cx} 17.6L${(+cx - 2.4).toFixed(2)} 12Z" fill="${color}"/>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${pips}</svg>`;
}

// What counts as "something new" on a card: found, a friendship level, a photo, a better photo.
// Pure, so the chip's dot rule is testable without a DOM.
export function petCardSignature(card) {
  if (!card) return '';
  const album = card.album || null;
  return `${card.found ? 1 : 0}:${(card.friendship && card.friendship.level) | 0}:${(album && album.shots) | 0}:${(album && album.best) | 0}`;
}
export function newPetKeys(seen, cards) {
  const fresh = new Set();
  if (!seen) return fresh;
  for (const c of cards || []) if (petCardSignature(c) !== (seen.get(c.key) || petCardSignature({ found: false }))) fresh.add(c.key);
  return fresh;
}

// The unlock glyph a locked outfit shows beside its padlock: a heart for a follower tier, the
// season's sparkle for a seasonal piece. Never words.
function unlockGlyph(item) { return item.seasonal ? sparkleIcon() : heartIcon(); }

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID;
  s.textContent = `
    .meta-book-root{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:max(8px,var(--sat)) max(8px,var(--sar)) max(8px,var(--sab)) max(8px,var(--sal));box-sizing:border-box}
    .meta-book-root.hidden{display:none}
    .meta-book-backdrop{position:absolute;inset:0;background:#251d1a88;backdrop-filter:blur(4px)}
    .meta-book{position:relative;width:min(470px,100%);max-height:calc(100svh - 16px);box-sizing:border-box;display:flex;flex-direction:column;gap:10px;overflow:hidden;border-radius:22px;background:#fff4e6;color:#3b2e2a;padding:14px;box-shadow:0 20px 60px #0005;font-family:system-ui,sans-serif}
    .pb-head{flex:none;display:flex;align-items:center;gap:10px;min-height:48px}
    .pb-title{flex:1;min-width:0;font:900 20px/1.05 system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .pb-count{font:900 14px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums;display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:11px;background:#ffffffb8}
    .pb-count i{width:18px;height:18px;display:block}.pb-count i svg{width:100%;height:100%;display:block}
    .meta-book-close,.pb-back{width:48px;height:48px;flex:none;border:0;border-radius:50%;background:#0000000c;color:#3b2e2a;font:800 22px/1 system-ui,sans-serif;cursor:pointer}
    .meta-book button:focus-visible{outline:3px solid #80977C;outline-offset:2px}
    .pb-progress{flex:none;height:7px;border-radius:5px;background:#0000000e;overflow:hidden}
    .pb-progress>div{height:100%;border-radius:5px;background:linear-gradient(90deg,#ff8a80,#8b7cf6)}
    .pb-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;touch-action:pan-y}
    .pb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(74px,1fr));gap:8px;padding:2px}
    .pb-card{position:relative;height:136px;box-sizing:border-box;border-radius:15px;padding:8px 4px 7px;border:2px solid transparent;background:linear-gradient(160deg,#fffdf8,#fbe7d8);color:#3b2e2a;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:3px;text-align:center;font:inherit;cursor:pointer}
    .pb-card.locked{background:#eadfd3;color:#8c817a;cursor:default}
    .pb-card.gold{border-color:#e8b431;box-shadow:0 3px 10px #e8b43133}
    .pb-swatch{width:52px;height:58px;flex:none}.pb-swatch svg{display:block;width:100%;height:100%}
    .pb-card.locked .pb-swatch{display:grid;place-items:center;font:900 30px/1 system-ui,sans-serif;opacity:.4}
    .pb-kind{width:22px;height:22px;opacity:.55}.pb-kind svg{width:100%;height:100%;display:block}
    .pb-name{max-width:100%;font:900 11px/1.15 system-ui,sans-serif;overflow-wrap:anywhere}
    .pb-marks{display:flex;align-items:center;gap:1px;height:12px}
    .pb-marks i{width:11px;height:11px;display:block}.pb-marks i svg{width:100%;height:100%;display:block}
    .pb-marks i.off{opacity:.22;filter:grayscale(1)}
    .pb-stars{font-size:11px;line-height:1;letter-spacing:1px;height:12px}
    .pb-stars .on{color:#F5B83D}.pb-stars .off{color:#0000001f}
    .pb-new{position:absolute;right:6px;top:6px;width:10px;height:10px;border-radius:50%;background:#FF6B5E;box-shadow:0 0 0 2px #fff}
    .pb-detail{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;display:flex;flex-direction:column;align-items:center;gap:10px}
    .pb-detail[hidden],.pb-scroll[hidden]{display:none}
    .pb-big{width:min(200px,52vw,40svh);aspect-ratio:1/1;flex:none;border-radius:20px;overflow:hidden;background:linear-gradient(160deg,#fbe7d8,#fff9f1);display:flex;align-items:center;justify-content:center}
    .pb-big svg,.pb-big img{width:84%;height:84%;object-fit:contain;display:block}
    .pb-detail-name{font:950 20px/1.1 system-ui,sans-serif;text-align:center}
    .pb-detail-trait{font:700 12px/1.3 system-ui,sans-serif;opacity:.65;text-align:center}
    .pb-detail-row{display:flex;align-items:center;justify-content:center;gap:12px;font:900 13px/1 system-ui,sans-serif}
    .pb-detail-row .pb-marks{height:18px}.pb-detail-row .pb-marks i{width:18px;height:18px}.pb-detail-row .pb-stars{font-size:17px;height:18px}
    .pb-outfits{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;padding:4px 0 2px}
    .pb-outfit{position:relative;width:48px;height:48px;box-sizing:border-box;padding:7px;border-radius:13px;border:2px solid #00000012;background:#fff;cursor:pointer}
    .pb-outfit svg{width:100%;height:100%;display:block}
    .pb-outfit[aria-pressed="true"]{border-color:#8b7cf6;background:#f3efff}
    .pb-outfit:disabled{cursor:default;background:#efe7dd}
    .pb-outfit:disabled>svg{opacity:.3;filter:grayscale(1)}
    .pb-outfit .pb-lock{position:absolute;right:-5px;bottom:-5px;display:flex;align-items:center;gap:1px;padding:2px 3px;border-radius:8px;background:#fff;box-shadow:0 1px 4px #0002}
    .pb-outfit .pb-lock i{width:12px;height:12px;display:block}.pb-outfit .pb-lock i svg{width:100%;height:100%;display:block}
    @media(max-height:480px) and (min-aspect-ratio:5/4){.meta-book{width:min(720px,100%)}.pb-detail{display:grid;grid-template-columns:auto minmax(0,1fr);justify-items:center;align-items:center;column-gap:14px}.pb-detail>.pb-big{grid-row:1/6}.pb-big{width:min(170px,40svh)}}
  `;
  document.head.appendChild(s);
}

export function createMetaUI() {
  injectStyle();

  // ---- the chip: paw · found/total · a dot while something is new --------------------------------
  const bookBtn = document.createElement('button'); bookBtn.type = 'button'; bookBtn.className = 'meta-pawbook';
  bookBtn.innerHTML = `<span class="meta-paw">${pawIcon()}</span><span class="meta-book-count">0/20</span><span class="meta-new-dot" hidden></span>`;
  document.body.appendChild(bookBtn);
  const bookCount = bookBtn.querySelector('.meta-book-count'), newDot = bookBtn.querySelector('.meta-new-dot');

  // ---- the book --------------------------------------------------------------------------------
  const bookRoot = document.createElement('div'); bookRoot.className = 'meta-book-root hidden';
  bookRoot.innerHTML = '<div class="meta-book-backdrop"></div><div class="meta-book" role="dialog" aria-modal="true" aria-labelledby="pbTitle">'
    + '<div class="pb-head"><div class="pb-title" id="pbTitle">Pet Book</div><span class="pb-count"></span><button class="meta-book-close" type="button" aria-label="Close">×</button></div>'
    + '<div class="pb-progress"><div></div></div>'
    + '<div class="pb-scroll"><div class="pb-grid"></div></div>'
    + '<div class="pb-detail" hidden></div>'
    + '</div>';
  document.body.appendChild(bookRoot);
  const grid = bookRoot.querySelector('.pb-grid'), scroller = bookRoot.querySelector('.pb-scroll');
  const detail = bookRoot.querySelector('.pb-detail'), headCount = bookRoot.querySelector('.pb-count');
  const fill = bookRoot.querySelector('.pb-progress>div');

  let progress = { found: 0, total: 20, frac: 0 };
  let cards = [], accessories = null, onEquip = null, renderPortrait = null;
  let seen = null, seenOutfits = null, fresh = new Set(), freshOutfits = false, detailKey = null;

  const isOpen = () => !bookRoot.classList.contains('hidden');
  const unlockedOutfits = () => (accessories || []).filter(a => !a.locked).map(a => a.id).join(',');

  function refreshDot() {
    fresh = newPetKeys(seen, cards);
    freshOutfits = seenOutfits != null && unlockedOutfits() !== seenOutfits;
    const any = fresh.size > 0 || freshOutfits;
    newDot.hidden = !any;
    bookBtn.setAttribute('aria-label', `Pet Book, ${progress.found} of ${progress.total} pets${any ? ', something new' : ''}`);
  }
  function markSeen() {
    seen = new Map(cards.map(c => [c.key, petCardSignature(c)]));
    seenOutfits = unlockedOutfits();
  }

  const marks = (n, max, glyph) => {
    let out = '';
    for (let i = 0; i < max; i++) out += `<i class="${i < n ? 'on' : 'off'}">${glyph()}</i>`;
    return `<span class="pb-marks">${out}</span>`;
  };
  const photoStars = album => {
    if (!album || !(album.shots > 0)) return `<span class="pb-marks"><i class="off">${photoIcon()}</i></span>`;
    const on = Math.max(1, Math.min(STARS, ((album.best | 0) + 1)));
    let out = '';
    for (let i = 0; i < STARS; i++) out += `<span class="${i < on ? 'on' : 'off'}">★</span>`;
    return `<span class="pb-stars">${out}</span>`;
  };

  function renderGrid(markFresh) {
    const top = scroller.scrollTop;
    grid.textContent = '';
    for (const c of cards) {
      const el = document.createElement(c.found ? 'button' : 'div');
      el.className = 'pb-card' + (c.found ? '' : ' locked') + (c.album && c.album.best === 2 ? ' gold' : '');
      el.dataset.petKey = c.key;
      if (c.found) {
        el.type = 'button';
        const level = (c.friendship && c.friendship.level) | 0;
        el.innerHTML = `<span class="pb-swatch">${petPortrait(c.species, c.profile, c.variant)}</span><span class="pb-name">${c.profile.name}</span>${marks(level, HEARTS, heartIcon)}${photoStars(c.album)}`;
        el.setAttribute('aria-label', `${c.profile.name}, ${c.profile.rarity}${c.friendship ? `, ${c.friendship.label}` : ''}${c.album && c.album.shots ? `, ${c.album.shots} photos` : ''}`);
        el.addEventListener('click', () => openDetail(c.key));
      } else {
        el.innerHTML = `<span class="pb-swatch">?</span><span class="pb-kind">${(SPECIES_ICON[c.species] || pawIcon)()}</span>`;
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', `Not met yet, a ${c.species}`);
      }
      if (markFresh && fresh.has(c.key)) el.insertAdjacentHTML('beforeend', '<span class="pb-new" aria-hidden="true"></span>');
      grid.appendChild(el);
    }
    scroller.scrollTop = top;
  }

  function openDetail(key) {
    const c = cards.find(x => x.key === key);
    if (!c || !c.found) return;
    detailKey = key;
    detail.textContent = '';
    const back = document.createElement('button'); back.type = 'button'; back.className = 'pb-back'; back.textContent = '‹'; back.setAttribute('aria-label', 'Back to the Pet Book');
    back.addEventListener('click', closeDetail);
    const big = document.createElement('div'); big.className = 'pb-big';
    // The vector portrait at once, the rendered 3D portrait (with its pose and outfit) when the
    // renderer returns one — the book never waits on it.
    big.innerHTML = petPortrait(c.species, c.profile, c.variant);
    if (renderPortrait) {
      try {
        const url = renderPortrait(c.key, (c.album && c.album.poseId) || null, c.equippedId || null);
        if (url) { const img = document.createElement('img'); img.src = url; img.alt = ''; big.textContent = ''; big.appendChild(img); }
      } catch { /* keep the vector portrait */ }
    }
    const name = document.createElement('div'); name.className = 'pb-detail-name'; name.textContent = c.profile.name;
    const trait = document.createElement('div'); trait.className = 'pb-detail-trait'; trait.textContent = c.profile.trait || '';
    const row = document.createElement('div'); row.className = 'pb-detail-row';
    const level = (c.friendship && c.friendship.level) | 0;
    row.innerHTML = `${marks(level, HEARTS, heartIcon)}${photoStars(c.album)}`;
    row.setAttribute('role', 'img');
    row.setAttribute('aria-label', `${c.friendship ? `${c.friendship.label}, ${c.friendship.visits} visits` : ''}${c.album && c.album.shots ? `, ${c.album.shots} photos` : ', no photo yet'}`);
    const outfits = document.createElement('div'); outfits.className = 'pb-outfits'; outfits.setAttribute('role', 'group'); outfits.setAttribute('aria-label', 'Outfit');
    const equipped = c.equippedId || null;
    const chip = (item, icon, label) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'pb-outfit';
      b.innerHTML = icon; b.setAttribute('aria-label', label); b.title = label;
      b.setAttribute('aria-pressed', String((item ? item.id : null) === equipped));
      if (item && item.locked) {
        b.disabled = true;
        b.setAttribute('aria-label', `${label}, locked`);
        b.insertAdjacentHTML('beforeend', `<span class="pb-lock" aria-hidden="true"><i>${lockIcon()}</i><i>${unlockGlyph(item)}</i></span>`);
      } else {
        b.addEventListener('click', () => { if (onEquip) onEquip(c.key, item ? item.id : null); });
      }
      return b;
    };
    outfits.appendChild(chip(null, noneIcon(), 'No outfit'));
    for (const item of accessories || ACCESSORIES) outfits.appendChild(chip(item, item.icon, item.name));
    detail.append(back, big, name, trait, row, outfits);
    scroller.hidden = true; detail.hidden = false;
    back.focus({ preventScroll: true });
  }
  function closeDetail() {
    detailKey = null; detail.hidden = true; detail.textContent = ''; scroller.hidden = false;
  }

  function openBook() {
    if (isOpen()) return;
    openModal('petbook', { close: () => (detailKey ? closeDetail() : closeBook()) });
    bookRoot.classList.remove('hidden');
    refreshDot();
    renderGrid(true);
    // Everything on screen now has been seen: the chip's dot clears, the cards keep their own
    // markers until the book is next opened.
    markSeen(); refreshDot();
    bookRoot.querySelector('.meta-book-close').focus({ preventScroll: true });
  }
  function closeBook() {
    if (!isOpen()) return;
    closeDetail();
    bookRoot.classList.add('hidden');
    closeModal('petbook');
  }
  bookBtn.addEventListener('click', openBook);
  bookRoot.querySelector('.meta-book-close').addEventListener('click', closeBook);
  bookRoot.querySelector('.meta-book-backdrop').addEventListener('click', closeBook);

  const M = {};
  M.openBook = openBook;
  M.closeBook = closeBook;
  Object.defineProperty(M, 'isBookOpen', { get: isOpen });
  // A plain toast from game.js (a refused renovation, a failed ad). Queued like every moment.
  M.toast = showToast;

  M.setPetBook = model => {
    if (!model) return;
    progress = { found: model.found | 0, total: model.total | 0, frac: model.frac || 0 };
    bookCount.textContent = `${progress.found}/${progress.total}`;
    headCount.innerHTML = `<i>${pawIcon()}</i>${progress.found}/${progress.total}`;
    fill.style.width = `${Math.round(progress.frac * 100)}%`;
    if (!cards.length && Array.isArray(model.cards)) cards = model.cards;
  };

  // model = { cards: allPetCards() joined with album + equippedId, accessories: catalogue with
  //   `locked` resolved, renderPortrait(petKey, poseId, accessoryId), onEquip(petKey, id|null) }.
  M.setAlbum = model => {
    cards = (model && Array.isArray(model.cards)) ? model.cards : [];
    accessories = (model && Array.isArray(model.accessories)) ? model.accessories : null;
    onEquip = (model && model.onEquip) || null;
    renderPortrait = (model && typeof model.renderPortrait === 'function') ? model.renderPortrait : null;
    // The first model is the save as it loaded: nothing in it is news.
    if (!seen) markSeen();
    refreshDot();
    if (isOpen()) { renderGrid(false); if (detailKey) openDetail(detailKey); }
  };

  // A NEW PET IS A MOMENT. It used to be a 121x33 toast for 1.8 s; now it is the card the Pet Book
  // will show, revealed like a new photo: it pops up in the middle of the screen, holds for a breath,
  // then flips and files itself into the chip, which bumps. Queued, so it never lands on top of a
  // banner, a toast or an open sheet.
  M.announcePet = discovery => {
    if (!discovery || !discovery.isNew) return;
    const { profile } = discovery;
    runMoment('pet', `pet:${discovery.key || profile.name}`, done => {
      const card = document.createElement('div');
      card.className = 'pet-reveal moment';
      card.setAttribute('role', 'img');
      card.setAttribute('aria-label', `New visitor, ${profile.name}, ${profile.rarity}`);
      card.innerHTML = `<span class="pet-reveal-portrait">${petPortrait(discovery.species, profile, discovery.variant)}</span>`
        + `<span class="pet-reveal-name">${profile.name}</span><span class="pet-reveal-rarity">${rarityPips(profile.rarity)}</span>`;
      document.body.appendChild(card);
      requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('shown')));
      presentationScheduler.schedule(() => {
        const r = bookBtn.getBoundingClientRect();
        if (r.width > 0) { card.style.left = `${r.left + r.width / 2}px`; card.style.top = `${r.top + r.height / 2}px`; }
        card.classList.add('stowing');
        presentationScheduler.schedule(() => {
          card.remove();
          bookBtn.classList.remove('bump'); void bookBtn.offsetWidth; bookBtn.classList.add('bump');
          presentationScheduler.schedule(() => bookBtn.classList.remove('bump'), 420);
          done();
        }, 620);
      }, 1600);
    });
  };
  return M;
}
