// src/ui/petbook.js — the Pet Book: every pet that has visited, and the ones still to meet.
// A chip under the wallet counts them; a new face slides in as a card (never blocking play);
// tapping the chip opens the book, which pauses the café while it is open.
import { PET_SPECIES, PET_PROFILES } from '../sim/petBook.js';
import { PET_UNLOCKS } from '../game/layout.js';

const EMOJI = { cat: '🐱', dog: '🐶', bunny: '🐰', hamster: '🐹' };
const RARITY = { common: '#9FB7C9', rare: '#6EC6FF', epic: '#B79BFF', legendary: '#FFC940' };
const UNLOCK_HINT = { coffee1: '☕', treats1: '🦴' };

export function createPetBook(root, W, audio, onPause) {
  root.insertAdjacentHTML('beforeend', `
    <button class="petchip ui" id="petchip" aria-label="Pet Book"><span>🐾</span><b id="petcount">0/8</b><i class="dot hidden"></i></button>
    <div class="petcard" id="petcard"><div class="pc-face"></div><div class="pc-txt"><small>New friend!</small><b></b><em></em></div></div>
    <div class="sheet hidden" id="petsheet"><div class="sheet-card ui">
      <div class="sheet-head"><b>🐾 Pet Book</b><button class="close" aria-label="Close">✕</button></div>
      <div class="grid" id="petgrid"></div>
    </div></div>`);
  // the card and the book sit above the world-anchored bubbles, so they live on <body>, not the HUD layer
  document.body.appendChild(root.querySelector('#petcard')); document.body.appendChild(root.querySelector('#petsheet'));
  const chip = root.querySelector('#petchip'), count = root.querySelector('#petcount'), dot = chip.querySelector('.dot');
  const card = document.getElementById('petcard'), sheet = document.getElementById('petsheet'), grid = document.getElementById('petgrid');
  let cardT = 0;
  const queue = [];

  function render() {
    let html = '';
    for (const s of PET_SPECIES) {
      const lockedBy = PET_UNLOCKS[s] && !W.isBuilt(PET_UNLOCKS[s]) ? PET_UNLOCKS[s] : null;
      for (let v = 0; v < 5; v++) {
        const p = PET_PROFILES[s][v], met = W.met.has(s + ':' + v);
        const legendLocked = v === 4 && !W.complete();
        if (met) html += `<div class="pet met" style="--r:${RARITY[p.rarity]};--coat:${p.body}66"><span>${EMOJI[s]}</span><b>${p.name}</b><em>${p.trait}</em></div>`;
        else if (lockedBy) html += `<div class="pet locked"><span>🔒</span><em>${UNLOCK_HINT[lockedBy]}</em></div>`;
        else if (legendLocked) html += `<div class="pet locked legend"><span>✨</span><em>🎉</em></div>`;
        else html += `<div class="pet"><span>❔</span></div>`;
      }
    }
    grid.innerHTML = html;
  }
  chip.addEventListener('click', e => { e.stopPropagation(); render(); sheet.classList.remove('hidden'); dot.classList.add('hidden'); onPause(true); audio.play('tap'); });
  sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('.close')) { sheet.classList.add('hidden'); onPause(false); } });

  function show(ev) {
    card.querySelector('.pc-face').textContent = EMOJI[ev.species];
    card.querySelector('b').textContent = ev.profile.name;
    card.querySelector('em').textContent = ev.profile.trait;
    card.style.setProperty('--r', RARITY[ev.profile.rarity]);
    card.classList.add('show'); cardT = 2.8;
    audio.play('chime');
  }
  return {
    newPet(ev) { queue.push(ev); dot.classList.remove('hidden'); chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump'); },
    update(dt) {
      count.textContent = `${W.met.size}/${W.bookSize()}`;
      if (cardT > 0) { cardT -= dt; if (cardT <= 0) card.classList.remove('show'); }
      else if (queue.length) show(queue.shift());
    },
  };
}
