// src/main.js — boot, the frame loop, saving, and the one guide arrow.
import './style.css';
import { createPlatform } from './platform.js';
import { createAudio } from './audio/synth.js';
import { createScene } from './render/scene.js';
import { createRoom } from './render/room.js';
import { createItems } from './render/items.js';
import { createFx } from './render/fx.js';
import { createView } from './render/view.js';
import { createBubbles } from './ui/bubbles.js';
import { createHud } from './ui/hud.js';
import { createInput } from './ui/input.js';
import { createWorld } from './game/world.js';
import { createNav } from './game/nav.js';
import { createOwner } from './game/owner.js';
import { createGuests } from './game/guests.js';
import { createStaff } from './game/staff.js';
import { createPads } from './game/pads.js';
import { createParty } from './game/party.js';
import { createPetBook } from './ui/petbook.js';
import { createLife } from './render/life.js';
import { createUpgrades } from './ui/upgrades.js';
import { STAFF, SUPPLIES, LOCATIONS, LOCATION_ORDER } from './game/layout.js';
import * as L from './game/layout.js';
import * as THREE from 'three';
import { createBeachRoom } from './render/roomBeach.js';
import { createMap } from './ui/map.js';

const platform = createPlatform();
const audio = createAudio();
const canvas = document.getElementById('c');
const root = document.getElementById('ui');
const layer = document.getElementById('fx');

const S = createScene(canvas);
const items = createItems(S.scene);
const hud = createHud(S, root, audio, p => { sheetPaused = p; audio.setPaused(p || hostPaused); });
const fx = createFx(S.scene, S, layer, hud.walletEl);
const bubbles = createBubbles(S, layer);
const input = createInput(root);
const W = createWorld();
const nav = createNav();

let paused = false, hostPaused = false, sheetPaused = false, rushT = 0, nextRush = 150, bookDone = false, playTime = 0, saveT = 0, inFlight = 0, completed = false;
platform.onPause(p => { hostPaused = p; audio.setPaused(p); });
addEventListener('visibilitychange', () => { paused = document.hidden; audio.setPaused(document.hidden || hostPaused); });
audio.setHostMute(!platform.audioEnabled());
platform.onAudioChange(on => audio.setHostMute(!on));
const unlock = () => { audio.unlock(); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);

async function boot() {
  S.render(); platform.firstFrameReady();
  const saved = await platform.load();
  W.restore(saved);
  if (saved && typeof saved.play === "number") playTime = saved.play;
  const petbook = createPetBook(root, W, audio, p => { sheetPaused = p; });
  const upgrades = createUpgrades(root, W, audio, fx, p => { sheetPaused = p; });
  const map = createMap(root, W, audio, p => { sheetPaused = p; }, id => travel(id));

  // ---- one café on stage: everything that belongs to the place you are standing in ----------
  let stage, view, owner, guests, staff, pads, party, life;
  function buildCafe(id) {
    W.enter(id);
    nav.rebuild([...W.stations.values()]);
    stage = new THREE.Group(); S.scene.add(stage);
    if (L.LOC.theme === 'beach') createBeachRoom(stage); else createRoom(stage);
    S.setTheme(L.LOC.theme);
    const ctx = { W, nav, scene: stage, S, items, bubbles, fx, audio, layer, platform, hud };
    view = createView(ctx);
    owner = createOwner(ctx);
    guests = createGuests(ctx);
    staff = createStaff(ctx);
    for (const r of W.staff) staff.hire(r, false);
    pads = createPads({ ...ctx, onBuilt: bid => onBuilt(bid) });
    party = createParty({ ...ctx, guests });
    life = createLife(stage, W);
    completed = W.complete();
    rushT = 0; nextRush = 150;
    S.snap(owner.o.x, owner.o.z);
    window.__v2 = { W, owner, guests, staff, pads, S, nav, travel, guide: () => guideTarget(owner, staff, guests, 0) };
  }
  function tearDown() {
    pads.teardown(); party.teardown(); guests.teardown();
    S.scene.remove(stage);
    stage.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
  let travelling = false;
  function travel(id) {
    if (travelling || id === W.loc) return;
    travelling = true;
    const veil = document.getElementById('veil');
    veil.classList.add('show');
    setTimeout(() => {
      W.stashHere(); save();
      tearDown(); buildCafe(id); save();
      veil.classList.remove('show'); travelling = false;
      hud.banner(`${L.LOC.emoji} Welcome to the ${L.LOC.name}!`, 2600); audio.play('chime');
    }, 450);
  }

  function onBuilt(id) {
    nav.rebuild([...W.stations.values()]);
    if (id.startsWith('staff:')) staff.hire(id.slice(6));
    else view.built(id);
    S.shake(0.08);
    save();
    if (!completed && W.complete()) { completed = true; W.done.add(W.loc); setTimeout(grandOpening, 900); }
  }
  function grandOpening() {
    hud.banner(`🎉 Your ${L.LOC.name} is complete!`, 3600);
    audio.play('fanfare');
    S.look({ x: -1.5, z: 0 }, 26, 4.5);
    for (let i = 0; i < 10; i++) setTimeout(() => { fx.firework(-5 + Math.random() * 9, 4 + Math.random() * 1.5, -3 + Math.random() * 6); audio.play('pop'); if (i % 3 === 0) fx.confetti(-1, 1, 6, 60); }, 300 + i * 380);
    const next = LOCATION_ORDER[LOCATION_ORDER.indexOf(W.loc) + 1];
    setTimeout(() => hud.banner(next && !W.open.has(next) ? `🗺️ A new café awaits: the ${LOCATIONS[next].name}!` : '✨ Legendary pets now visit!', 3400), 5200);
    setTimeout(() => map.nudge(), 5400);
  }
  function save() { platform.save({ ...W.snapshot(), play: Math.floor(playTime) }); }

  buildCafe(W.loc);
  audio.setMusicPhase('morning');
  document.getElementById('loading').remove();
  platform.gameReady();

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (paused || hostPaused || sheetPaused) return;
    playTime += dt;
    items.begin(); bubbles.begin();

    const move = window.__drive || input.read();       // __drive: a test can steer like a thumb would
    owner.update(dt, move);
    W.step(dt);
    staff.update(dt);
    // Rush hour: once the coffee corner is open, every few minutes a short wave of guests (and a
    // banner). A moment, not a test — nothing is lost if some of them are not served.
    if (W.isBuilt('coffee1')) {
      if (rushT > 0) rushT -= dt;
      else if ((nextRush -= dt) <= 0) { rushT = 40; nextRush = 170 + Math.random() * 60; hud.banner('🔔 Rush hour!', 2000); audio.play('chime'); }
    }
    guests.update(dt, owner.o.atTill || staff.cashierAtTill(), rushT > 0, owner.o);
    pads.update(dt, owner.o);
    party.update(dt, false);

    for (const e of W.events) {
      if (e.type === 'earn') {
        inFlight += e.n;
        fx.number(e.x, 2.1, e.z, '+' + e.n, 'gain');
        fx.coins(e.x, 1.3, e.z, Math.min(8, 2 + (e.n / 5) | 0), () => { inFlight -= e.n; hud.bump(); audio.play('coin'); });
      } else if (e.type === 'petted') {
        audio.play('petCat'); fx.burst(e.x, 1.2, e.z, '#FF8FB1', 14, 0.7);
        if (e.f === 4 || e.f === 10) hud.banner(e.f === 10 ? '💖 A new Bestie!' : '❤️ A new pet friend!', 1800);
      } else if (e.type === 'upgrade') { fx.confetti(owner.o.x, owner.o.z, 1.5, 24); audio.play('chime');
      } else if (e.type === 'newpet') {
        petbook.newPet(e); fx.confetti(2.75, 3.8, 1.2, 26);
        if (!bookDone && W.met.size >= W.bookSize()) { bookDone = true; setTimeout(() => { hud.banner('📖 Every pet met! You are the best pet café in town', 3600); audio.play('fanfare'); fx.confetti(-1.5, 1, 6, 90); }, 3200); }
      }
    }
    W.events.length = 0;

    view.update(dt, party.active);
    life.update(dt);
    petbook.update(dt);
    upgrades.update(dt);
    map.update();
    document.getElementById('upbtn').classList.toggle('hidden', !(W.isBuilt('staff:runner') || W.open.size > 1 || Object.keys(W.up).length));
    fx.update(dt);
    hud.setCoins(W.coins - inFlight);
    hud.update(dt);
    hud.hand(!input.everMoved && playTime < 60);
    hud.guide(guideTarget(owner, staff, guests, playTime));
    items.flush(); bubbles.end();
    audio.musicUpdate(dt);
    S.follow(owner.o.x, owner.o.z, dt);
    S.render();

    saveT += dt;
    if (saveT > 8) { saveT = 0; save(); platform.sendScore(W.served); }
  }
  requestAnimationFrame(frame);
}

// One arrow, pointing at the next useful thing. New players (the first three minutes) always get
// it; after that it only appears when the owner has stood still for a while, as if unsure.
function guideTarget(owner, staff, guests, playTime) {
  const o = owner.o;
  if (playTime > 180 && o.idle < 6) return null;
  const c = o.carry, runner = staff.hasRunner();
  const at = (p, y = 1) => ({ x: p.x, z: p.z, y });
  if (c.kind && SUPPLIES[c.kind]) {
    const m = W.built('machine').find(v => v.supply === c.kind && v.level <= 6);
    return at(m ? m.spots.work : W.stations.get('pantry1').spots.work);
  }
  if (c.kind) return at(W.counterFor(c.kind).spots.staff);
  // guests waiting to pay: the till, and the arrow stays there while you serve (it used to jump to the
  // next job the moment you arrived, which walked a new player straight away from the queue)
  if (guests.queue.length && !staff.cashierAtTill()) return at(W.stations.get('till1').spots.staff);
  if (!runner) {
    for (const ct of W.built('counter')) {
      const m = W.machineFor(ct.product);
      const low = playTime < 180 ? ct.cap - 3 : 2;      // new players are shown the make-and-stock loop straight away
      if (ct.stock <= low && m.built && m.tray > 0 && W.freeFor(ct.product) > 0) return at(m.spots.work);
    }
    const dry = W.built('machine').find(v => v.level <= 1);
    if (dry) return at(W.stations.get('pantry1').spots.work);
  }
  const dirty = W.built('table').find(t => t.dirty);
  if (dirty && !staff.crew.has('cleaner')) return at(dirty, 1.3);
  const pad = W.padsOpen().find(p => W.coins + (W.paid[p.id] || 0) >= p.price);
  if (pad) {
    const b = pad.builds;
    return at(b.startsWith('staff:') ? STAFF[b.slice(6)].home : W.stations.get(b), 0.6);
  }
  return null;
}

boot();
