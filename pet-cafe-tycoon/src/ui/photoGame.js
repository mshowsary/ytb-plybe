// src/ui/photoGame.js — the shot mini-game's on-screen presentation
// (docs/SHIP-PLAN-2026-09-19.md §1.3). A ring shrinks over the posing pet from 2.2x to 0.6x over
// 1.4s; a tap (pointerdown) inside that window judges Perfect/Good/Ok from the ring's CURRENT scale
// — photoJudgeQuality (src/sim/petPose.js), the exact same pure function a real tap and the sim's
// own timeout both read, so a player's tap and the auto-resolve can never disagree about what a
// given ring position is worth. Left untouched, stepPetPoses auto-resolves the shot as Ok at
// PHOTO_AUTO_RESOLVE (1.6s) regardless of anything in this file — the mini-game is player SKILL,
// never a requirement, and nothing here can make automation stall on it.
//
// The ring and the flying card's CSS live in src/style.css (.photoRing*/.polaroid*) so both follow
// the same "anchor via CSS transform, position via JS left/top" split every other labelLayout-
// managed element uses; this file only ever sets style.left/top in raw px on the elements it owns.
// The corner polaroid added by this batch injects its own few rules from here (the same pattern
// systems/stations.js's ensureFbtnStyle and ui/sheets.js's decor CSS already use) because
// src/style.css belongs to another lane this batch — see this batch's wiringNeeded to fold them in.
//
// No English prose on the play field (program rule 5): the ring is pure shape — two concentric
// guide rings (the Perfect/Good bands) plus the shrinking shot ring itself. The polaroid's only
// "text" is the pet's name on its one big reveal, never a caption on the floor.
import {
  photoRingScale, photoJudgeQuality, PHOTO_TARGET_SCALE, PHOTO_PERFECT_BAND, PHOTO_GOOD_BAND,
} from '../sim/petPose.js';
import { runMoment } from './moments.js';
import { presentationScheduler } from '../core/presentationScheduler.js';

// Injected, not in style.css (see the header). Two rules: the corner polaroid that every photo
// after a pet's first gets, and its reduced-motion form.
const CORNER_CSS = [
  '.photoCorner{position:fixed;left:12px;top:250px;z-index:83;width:64px;box-sizing:border-box;',
  'border-radius:5px;background:#fffdf8;box-shadow:0 8px 20px #3b2e2a3d;padding:4px 4px 12px;',
  'pointer-events:none;opacity:0;transform:translateX(-130%);',
  'transition:transform .38s cubic-bezier(.2,1.1,.3,1),opacity .28s ease}',
  '.photoCorner.shown{opacity:1;transform:translateX(0)}',
  '.photoCorner.stowing{opacity:0;transform:translateX(-130%)}',
  '.photoCornerFrame{width:100%;aspect-ratio:1/1;border-radius:3px;background:#e9dfce center/contain no-repeat}',
  '@media(prefers-reduced-motion:reduce){.photoCorner,.photoCorner.shown,.photoCorner.stowing{transition:opacity .25s ease;transform:none}}',
].join('');
let cornerCssInjected = false;
function ensureCornerCss() {
  if (cornerCssInjected || typeof document === 'undefined' || !document.head) return;
  cornerCssInjected = true;
  const style = document.createElement('style');
  style.id = 'photo-corner-css';
  style.textContent = CORNER_CSS;
  document.head.appendChild(style);
}

// `project(x, y, z, tmp)` writes a world point's screen {sx, sy, visible} into `tmp` — the same
// helper src/render/fx.js already exposes and src/systems/stations.js's own floating button uses.
// `els.fx` is the same floating-DOM layer every other world-projected element mounts into.
export function createPhotoGame({ project, els, onResolve, renderPortrait, avoid, isBlocked } = {}) {
  const layer = (els && els.fx) || document.body;
  ensureCornerCss();

  const root = document.createElement('div');
  root.className = 'photoRing hidden';
  const hit = document.createElement('div'); hit.className = 'photoRingHit';
  const good = document.createElement('div'); good.className = 'photoRingBand good';
  const perfect = document.createElement('div'); perfect.className = 'photoRingBand perfect';
  const shot = document.createElement('div'); shot.className = 'photoRingShot';
  root.append(hit, good, perfect, shot);
  layer.appendChild(root);

  // Matches .photoRingHit's 80x80 box in style.css — the actual tap target, which is what has to
  // stay clear of HUD furniture (the .photoRing root itself is a 0x0 positioning anchor).
  const HIT_SIZE = 80;

  let session = null; // { subjectId, t, flown, poseId, petKeyStr }
  const tmp = { sx: 0, sy: 0, visible: true };

  function place(subject) {
    if (typeof project !== 'function') return;
    project(subject.x, 1.35, subject.z, tmp);
    // The ring yields to HUD furniture. The player judges WHEN to tap from the shrinking ring
    // against the fixed guide bands, and those three circles are concentric siblings that move
    // together — the pair's screen position carries no information the player uses. Being trapped
    // under the pause button, by contrast, costs the shot outright. avoid() returns the point
    // unchanged when nothing collides, so in ordinary play it still sits exactly on the pet.
    let sx = tmp.sx, sy = tmp.sy;
    if (typeof avoid === 'function') {
      const moved = avoid(sx, sy, HIT_SIZE, HIT_SIZE);
      if (Array.isArray(moved)) { sx = moved[0]; sy = moved[1]; }
    }
    root.style.left = sx + 'px';
    root.style.top = sy + 'px';
    root.classList.toggle('hidden', !tmp.visible);
  }

  function onPointerDown(e) {
    if (!session || session.flown) return;
    e.preventDefault();
    const quality = photoJudgeQuality(photoRingScale(session.t));
    if (typeof onResolve === 'function') onResolve(session.subjectId, quality);
  }
  hit.addEventListener('pointerdown', onPointerDown);

  // Arrival: the collection chip (the Pet Book's own button) gives a little bump, so the eye that
  // followed the photo in sees where it went.
  function bumpChip() {
    const chip = document.querySelector('.meta-pawbook');
    if (!chip) return;
    chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump');
    setTimeout(() => chip.classList.remove('bump'), 420);
  }
  function chipRect() {
    const chip = document.querySelector('.meta-pawbook');
    const rect = chip && chip.getBoundingClientRect();
    return rect && rect.width > 0 ? rect : null;
  }

  function portraitInto(frame, petKeyStr, poseId) {
    if (typeof renderPortrait !== 'function' || !petKeyStr) return;
    const dataUrl = renderPortrait(petKeyStr, poseId);
    if (dataUrl) frame.style.backgroundImage = `url(${dataUrl})`;
  }

  // A PET'S FIRST PHOTO IS A MOMENT.
  //
  // A soft shutter flash, then the print DEVELOPS in the upper middle of the screen — faded, warm
  // and soft, coming up to full colour — with the pet's name and one to three stars for the shot.
  // It holds for a breath and then files itself into the collection chip, which bumps. It never
  // takes a tap and never blocks the floor: the player keeps walking through it.
  //
  // ONCE PER PET, EVER. It used to fire again for any shot better than the album held, which the
  // day-19 playthrough measured as a full-screen white wash 3-5 times a day. Every later photo of
  // a pet already in the album is the small corner card below, with no flash at all.
  const REVEAL_HOLD_MS = 1500;
  function revealPolaroid(poseId, petKeyStr, info, done) {
    const calm = !!(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (!calm) {
      const flash = document.createElement('div'); flash.className = 'photoFlash moment';
      document.body.appendChild(flash);
      presentationScheduler.schedule(() => flash.remove(), 420);
    }
    const card = document.createElement('div');
    card.className = 'photoReveal moment';
    const frame = document.createElement('div'); frame.className = 'photoRevealFrame developing';
    portraitInto(frame, petKeyStr, poseId);
    const name = document.createElement('div'); name.className = 'photoRevealName';
    name.textContent = info.name || '';
    const stars = document.createElement('div'); stars.className = 'photoRevealStars';
    const filled = Math.max(1, Math.min(3, (info.rank | 0) + 1));
    for (let i = 0; i < 3; i++) {
      const s = document.createElement('span'); s.className = i < filled ? 'on' : 'off'; s.textContent = '★';
      stars.appendChild(s);
    }
    card.append(frame, name, stars);
    card.setAttribute('role', 'img');
    card.setAttribute('aria-label', `${info.name || 'A pet'}: a new ${['', 'good ', 'perfect '][info.rank | 0]}photo for the Pet Book`);
    document.body.appendChild(card);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      card.classList.add('shown');
      frame.classList.remove('developing');
    }));
    presentationScheduler.schedule(() => {
      const rect = chipRect();
      if (rect) {
        card.style.left = (rect.left + rect.width / 2) + 'px';
        card.style.top = (rect.top + rect.height / 2) + 'px';
      }
      card.classList.add('stowing');
    }, REVEAL_HOLD_MS);
    presentationScheduler.schedule(() => { card.remove(); bumpChip(); done(); }, REVEAL_HOLD_MS + 650);
  }

  // Every photo after a pet's first: a small polaroid slides in under the collection chip, holds,
  // and slides back out as the chip bumps. No flash, no screen wash, nothing over the floor —
  // "another one for the album", not an event.
  const CORNER_HOLD_MS = 1400;
  function cornerPolaroid(poseId, petKeyStr, done) {
    const card = document.createElement('div');
    card.className = 'photoCorner moment';
    const frame = document.createElement('div'); frame.className = 'photoCornerFrame';
    portraitInto(frame, petKeyStr, poseId);
    card.appendChild(frame);
    const rect = chipRect();
    if (rect) { card.style.left = rect.left + 'px'; card.style.top = (rect.bottom + 8) + 'px'; }
    document.body.appendChild(card);
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('shown')));
    presentationScheduler.schedule(() => { card.classList.remove('shown'); card.classList.add('stowing'); }, CORNER_HOLD_MS);
    presentationScheduler.schedule(() => { card.remove(); bumpChip(); done(); }, CORNER_HOLD_MS + 420);
  }

  // ONE card at a time, and never on top of something the player opened: both cards are items in
  // the game's single moment queue (ui/moments.js), which starts nothing while a sheet, the day
  // summary or a collection page is open, hides what is on screen when one opens (body.modal-open
  // .moment) and freezes its timers with the presentation clock. The day-19 playthrough caught the
  // failure this replaces: a polaroid drawn on top of the Day 14 summary, hiding its rows.
  return {
    // `poseId` (cats loaf, dogs sit-tilt, bunnies ear-up, hamsters cheeks) and `petKeyStr` are
    // captured now, while the sim session that named them is still fresh, rather than re-read later
    // from subject.session, which may already be gone by the time the card shows.
    start(subject, poseId, petKeyStr) {
      session = { subjectId: subject.id, t: 0, flown: false, poseId: poseId || null, petKeyStr: petKeyStr || null };
      shot.style.transform = 'scale(' + photoRingScale(0) + ')';
      // place() is the ONLY thing that shows the ring: it hides it again when the subject is not on
      // screen. start() used to force it visible, which was harmless when the shot could only ever
      // happen at a booth the owner was standing at — but the hired Photographer shoots pets the
      // player may be nowhere near, and avoid() then pulled the off-screen ring back into frame as a
      // circle floating over nothing (probe, 2026-09-20).
      place(subject);
    },
    // `aiming` is "the owner is close enough to take this shot themselves". False for a shot the
    // Photographer is taking across the café: the timing ring is the PLAYER's mini-game, so it is
    // not drawn (and cannot be tapped) when the shot is not theirs — the card at the end still is.
    update(dt, subject, aiming = true) {
      if (!session || session.subjectId !== subject.id) return;
      if (subject.session && !subject.session.resolved) {
        session.t += dt;
        if (aiming) place(subject); else root.classList.add('hidden');
        const scale = photoRingScale(session.t);
        shot.style.transform = `scale(${scale})`;
        const d = Math.abs(scale - PHOTO_TARGET_SCALE);
        shot.style.borderColor = d <= PHOTO_PERFECT_BAND ? '#ffd766' : d <= PHOTO_GOOD_BAND ? '#ffffff' : '#ffffffaa';
        return;
      }
      // Resolved — by a tap (onResolve already fired above), by the hired Photographer, or by the
      // sim's own timeout. Show the card exactly once, then wait for stop().
      if (!session.flown) {
        session.flown = true;
        const s = subject.session || {};
        const poseId = session.poseId, petKeyStr = session.petKeyStr;
        // Queued, never drawn straight away: pump() runs it on the very next frame unless a sheet
        // or an overlay is up, in which case it waits for that to close.
        const info = { name: s.petName, rank: s.rank };
        runMoment('photo', `photo:${petKeyStr}:${s.rank | 0}:${poseId || ''}`, done => (s.reveal
          ? revealPolaroid(poseId, petKeyStr, info, done)
          : cornerPolaroid(poseId, petKeyStr, done)));
        root.classList.add('hidden');
      }
    },
    stop() {
      session = null;
      root.classList.add('hidden');
    },
    destroy() {
      hit.removeEventListener('pointerdown', onPointerDown);
      root.remove();
    },
  };
}
