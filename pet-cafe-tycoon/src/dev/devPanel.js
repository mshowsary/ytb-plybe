// src/dev/devPanel.js — hidden developer panel, ?dev=1 outside the YouTube Playables host only
// (see the guarded dynamic import in main.js). The owner tests every change by playing from day 1
// to day 10+ by hand, which takes about an hour; this exists so they can jump ahead instead.
// Never shown to players, so plain English here is fine.
import { DAY_LENGTH } from '../sim/day.js';
import { STAFF, hireCost, hire } from '../sim/economy.js';
import { payZone } from '../sim/world.js';
import { pickSavingTarget } from '../ui/hud.js';
import { discoverPet, petKey, PET_SPECIES, PET_PROFILES } from '../sim/petBook.js';

// Median gross sales per day, from the program plan's balance table. A day advanced by this panel
// gets topped up to "a plausible result" for its day number rather than being settled at whatever
// the owner happened to earn by hand before reaching for the button. Linearly interpolated between
// authored points, clamped at both ends.
const INCOME_POINTS = [
  [1, 400], [3, 650], [5, 950], [8, 1400], [10, 1600], [12, 1900], [14, 2200],
  [16, 3000], [20, 3800], [24, 4400], [28, 5000], [32, 6200], [36, 7000], [40, 7500],
];
function incomeFor(day) {
  const d = Math.max(1, day | 0);
  const last = INCOME_POINTS[INCOME_POINTS.length - 1];
  if (d <= INCOME_POINTS[0][0]) return INCOME_POINTS[0][1];
  if (d >= last[0]) return last[1];
  for (let i = 0; i < INCOME_POINTS.length - 1; i++) {
    const [d0, v0] = INCOME_POINTS[i], [d1, v1] = INCOME_POINTS[i + 1];
    if (d >= d0 && d <= d1) return Math.round(v0 + (v1 - v0) * (d - d0) / (d1 - d0));
  }
  return last[1];
}

// sim/day.js's PHASE_BOUNDS table is that file's own private constant (not exported), so the
// closing phase's length is mirrored here as one number rather than reaching into day.js's
// internals. day.js already hardcodes this same 30s everywhere it authors the day's four phases.
const CLOSING_SECONDS = 30;

const PANEL_CSS = `
.dev-panel{position:fixed;left:8px;bottom:8px;z-index:999;pointer-events:auto;
  font:11px/1.5 ui-monospace,Menlo,Consolas,monospace;color:#f3ede4;
  background:#20161066;background:#201610e6;border:1px solid #ffffff2b;border-radius:9px;
  padding:8px 9px;width:max-content;max-width:min(240px,calc(100vw - 16px));box-shadow:0 6px 20px #0008;}
.dev-panel .dp-readout{font-weight:700;margin-bottom:6px;white-space:normal;word-break:break-word;}
.dev-panel .dp-row{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px;}
.dev-panel button{font:inherit;color:inherit;background:#ffffff1a;border:1px solid #ffffff33;
  border-radius:5px;padding:3px 6px;cursor:pointer;}
.dev-panel button:hover{background:#ffffff30;}
.dev-panel button:disabled{opacity:.45;cursor:default;}
.dev-panel .dp-note{opacity:.6;margin-top:2px;font-size:10px;}
`;

function ensureStyle() {
  if (document.getElementById('dev-panel-style')) return;
  const style = document.createElement('style');
  style.id = 'dev-panel-style';
  style.textContent = PANEL_CSS;
  document.head.appendChild(style);
}

// Cheapest role still hireable right now, across every STAFF kind (hireCost returns null once a
// kind is maxed out, which drops it from consideration entirely).
function cheapestHireKind(G) {
  let best = null;
  for (const kind of Object.keys(STAFF)) {
    const cost = hireCost(kind, G.staff);
    if (cost == null) continue;
    if (!best || cost < best.cost) best = { kind, cost };
  }
  return best;
}

// Same "cheapest reachable unbuilt zone" the wallet's own saving-for ring targets (src/ui/hud.js),
// topped up and paid in one go via the same payZone() a normal build-and-hold uses.
function buildCheapestZone(G) {
  const target = pickSavingTarget(G.world.area.zones, G.world.built);
  if (!target) return false;
  if (G.coins < target.price) G.coins += target.price - G.coins;
  const r = payZone(G.world, target.id, G.coins, 9999);
  G.coins -= r.spent;
  G.hud?.setCoins?.(G.coins);
  return r.done;
}

function hireCheapestRole(G) {
  const best = cheapestHireKind(G);
  if (!best) return false;
  if (G.coins < best.cost) G.coins += best.cost - G.coins;
  const r = hire(G, best.kind);
  G.hud?.setCoins?.(G.coins);
  return !!r.ok;
}

function discoverThreePets(G) {
  let found = 0;
  for (const species of PET_SPECIES) {
    const profiles = PET_PROFILES[species];
    for (let variant = 0; variant < profiles.length && found < 3; variant++) {
      if (G.meta.petBook[petKey(species, variant)]) continue;
      discoverPet(G.meta, species, variant);
      found++;
    }
    if (found >= 3) break;
  }
  return found;
}

// Ends the CURRENT day the way the game itself ends one: give it a plausible result, run the real
// day-end tick so dayEnd fires and the real summary sheet opens with the real settlement, then hand
// it to the exact finishDayTransition() the CONTINUE button on that sheet calls. Nothing here
// bypasses settlement math -- it only supplies sales the day did not have time to earn by hand.
async function advanceOneDay(G) {
  // The tutorial (systems/intro.js) keeps guests away and the HUD reduced until its five steps are
  // done; a skipped day must not carry it along, or day 9 still looks like the first minute.
  if (G.intro && G.intro.active) { G.intro.step = 5; G.intro.active = false; G.intro.target = null; }
  const target = incomeFor(G.dayState.day);
  const extra = Math.max(0, target - (G.dayStats.earned | 0));
  G.dayStats.earned += extra;
  G.dayStats.served += Math.round(extra / 20);
  G.coins += extra;
  G.stats.lifetimeEarned = (G.stats.lifetimeEarned | 0) + extra;
  G.stats.served = (G.stats.served | 0) + Math.round(extra / 20);

  G.dayState.t = DAY_LENGTH - 0.01;
  for (let i = 0; i < 20 && !G.dayState._ended; i++) G.update(0.05);

  await G.dev.finishDayTransition('dev');
}

export function installDevPanel(G, S, platform) {
  ensureStyle();
  const root = document.createElement('div');
  root.className = 'dev-panel';
  root.innerHTML = `
    <div class="dp-readout"></div>
    <div class="dp-row">
      <button type="button" data-a="day1">+1 day</button>
      <button type="button" data-a="day5">+5 days</button>
      <button type="button" data-a="coins">+1,000 coins</button>
    </div>
    <div class="dp-row">
      <button type="button" data-a="build">Build next</button>
      <button type="button" data-a="hire">Hire</button>
      <button type="button" data-a="dusk">Dusk</button>
    </div>
    <div class="dp-row">
      <button type="button" data-a="pets">Discover 3 pets</button>
    </div>
    <div class="dp-note">dev only, never shown to players</div>
  `;
  document.body.appendChild(root);

  const readout = root.querySelector('.dp-readout');
  const buttons = [...root.querySelectorAll('button')];
  function refresh() {
    const total = (G.world.area.zones || []).length;
    const built = G.world.built.size;
    readout.textContent = `dev · day ${G.dayState.day} · ${Math.round(G.coins).toLocaleString('en-US')} coins · built ${built}/${total}`;
  }
  // Keeps the readout honest during ordinary play too (selling/building outside the panel), not
  // only right after a button click.
  setInterval(refresh, 400);
  refresh();

  function setBusy(busy) { for (const b of buttons) b.disabled = busy; }

  async function onDay1() {
    setBusy(true);
    try { await advanceOneDay(G); }
    finally { setBusy(false); refresh(); }
  }
  async function onDay5() {
    setBusy(true);
    try {
      for (let i = 0; i < 5; i++) {
        await advanceOneDay(G);
        refresh();
        // Lets the UI settle (sheet close, next-morning banners) between days rather than firing
        // five terminal transitions back to back.
        if (i < 4) await new Promise(resolve => setTimeout(resolve, 50));
      }
    } finally { setBusy(false); refresh(); }
  }
  function onCoins() { G.coins += 1000; G.hud?.setCoins?.(G.coins); refresh(); }
  function onBuild() { buildCheapestZone(G); refresh(); }
  function onHire() { hireCheapestRole(G); refresh(); }
  function onDusk() {
    G.dayState.t = DAY_LENGTH - CLOSING_SECONDS;
    // dt:0 -- forces the phase to recompute against the new clock right now instead of waiting for
    // the next real animation frame, the same as every other system reading G.dayState this tick.
    G.update(0);
    refresh();
  }
  function onPets() { discoverThreePets(G); refresh(); }

  const handlers = { day1: onDay1, day5: onDay5, coins: onCoins, build: onBuild, hire: onHire, dusk: onDusk, pets: onPets };
  root.addEventListener('click', e => {
    const btn = e.target.closest('button[data-a]');
    if (!btn || btn.disabled) return;
    handlers[btn.dataset.a]?.();
  });

  // NOTE (speed x4, skipped): main.js's frame() derives dt straight from real elapsed time
  // (frameMs / 1000, clamped) with no multiplier variable to hook, and only one guarded import line
  // in main.js is in scope for this task -- adding a time-scale hook there is not. `S` and
  // `platform` are accepted (main.js already has both in hand at the call site) but otherwise
  // unused for the same reason: nothing below needs the renderer or the host boundary directly.
}
