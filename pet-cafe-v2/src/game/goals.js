// src/game/goals.js — three daily goals: small, varied things to aim for once the staff run the café.
// A new set each calendar day; progress comes from world events; each finished goal pays coins
// (and can be doubled for a video). Nothing expires badly: an unfinished goal just gives way to
// tomorrow's set.
import { PRODUCTS } from './layout.js';

const TYPES = [
  { id: 'serve',   icon: '🧾', text: n => `Serve ${n} guests`,          n: [15, 25, 40] },
  { id: 'pet',     icon: '✋', text: n => `Pet ${n} pets`,              n: [3, 5, 8] },
  { id: 'deliver', icon: '🚚', text: n => n > 1 ? `Fill ${n} deliveries` : 'Fill a delivery',       n: [1, 2, 3] },
  { id: 'earn',    icon: '🪙', text: n => `Earn ${n.toLocaleString('en-US')} coins`, n: [400, 900, 1600] },
  { id: 'meet',    icon: '🐾', text: n => n > 1 ? `Meet ${n} new pets` : 'Meet a new pet',          n: [1, 2, 3] },
  { id: 'party',   icon: '🎵', text: () => 'Throw a Pet Party',         n: [1, 1, 1] },
  { id: 'wipe',    icon: '🧽', text: n => `Wipe ${n} tables yourself`, n: [4, 8, 12] },
];

export const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export function createGoals(W) {
  let state = { day: '', list: [] };

  function roll() {
    // three different kinds, gentle to hard; the party and meet goals only when they can be done
    const pool = TYPES.filter(t => (t.id !== 'deliver' || W.isBuilt('staff:runner')) && (t.id !== 'party' || W.served > 10));
    const pick = [];
    let seed = [...today()].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    while (pick.length < 3 && pool.length) pick.push(pool.splice((rnd() * pool.length) | 0, 1)[0]);
    const scale = Math.max(1, Math.min(3, 1 + W.done.size + (W.open.size - 1)));
    state = { day: today(), list: pick.map((t, i) => {
      const n = t.n[Math.min(2, i)] * (t.id === 'earn' ? scale : 1);
      const coin = Math.max(...Object.keys(PRODUCTS).filter(p => W.counterFor(p)?.built).map(p => W.price(p)), 7);
      return { id: t.id, n, got: 0, claimed: false, reward: Math.round((40 + i * 45) * coin / 7 / 5) * 5 };
    }) };
  }

  return {
    get list() { return state.list; },
    text: g => TYPES.find(t => t.id === g.id).text(g.n),
    icon: g => TYPES.find(t => t.id === g.id).icon,
    ensure() { if (state.day !== today() || !state.list.length) roll(); },
    add(id, k = 1) {
      for (const g of state.list) if (g.id === id && !g.claimed && g.got < g.n) g.got = Math.min(g.n, g.got + k);
    },
    claim(i) {
      const g = state.list[i]; if (!g || g.claimed || g.got < g.n) return 0;
      g.claimed = true; return g.reward;
    },
    ready() { return state.list.filter(g => !g.claimed && g.got >= g.n).length; },
    snapshot: () => state,
    restore(s) { if (s && Array.isArray(s.list) && typeof s.day === 'string') state = { day: s.day, list: s.list.map(g => ({ ...g })) }; },
  };
}
