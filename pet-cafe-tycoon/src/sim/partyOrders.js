import { PRODUCTS, familyOf } from './economy.js';

const THEMES = [
  ['Shelter Snack Box', 'A local rescue is packing a thank-you table for volunteers.'],
  ['Puppy Birthday', 'A very good dog has invited the whole park.'],
  ['Bunny Brunch', 'A quiet garden meetup needs a tiny café spread.'],
  ['Cat Club Platter', 'The neighbourhood cat club has extremely specific standards.'],
  ['Adoption Day Treats', 'Send a cheerful snack box to the next adoption meetup.'],
];
const FAMILY_KEYS = ['cookie', 'cupcake', 'coffee', 'smoothie', 'treat'];

export function ensurePartyOrders(meta) {
  if (!meta.partyOrders || typeof meta.partyOrders !== 'object') meta.partyOrders = {};
  const p = meta.partyOrders;
  if (!Number.isFinite(p.nextId) || p.nextId < 1) p.nextId = 1;
  if (!Number.isFinite(p.completed) || p.completed < 0) p.completed = 0;
  if (!Number.isFinite(p.lastOfferDay) || p.lastOfferDay < 0) p.lastOfferDay = 0;
  if (p.active && typeof p.active === 'object') {
    // Sanitize in place. Gameplay/UI systems are allowed to retain the active-order reference;
    // replacing it on every ensure() made an apparently-live order silently go stale after a sale.
    const a = p.active;
    a.id = a.id | 0;
    a.title = String(a.title || 'Pet Party Order');
    a.subtitle = String(a.subtitle || '');
    a.createdDay = a.createdDay | 0;
    a.expiresDay = a.expiresDay | 0;
    a.reward = Math.max(0, a.reward | 0);
    a.claimed = !!a.claimed;
    a.requirements = (a.requirements || []).map(r => ({
      key: String(r.key), target: Math.max(1, r.target | 0), count: Math.max(0, r.count | 0),
    }));
  } else p.active = null;
  return p;
}

export function availablePartyProducts(world) {
  const set = new Set();
  for (const id of world.displays || []) {
    const st = world.stations.get(id);
    if (!st || !st.active) continue;
    const fam = familyOf(st.product);
    if (FAMILY_KEYS.includes(fam)) set.add(fam);
  }
  for (const st of world.stations.values()) if (st.active && st.type === 'bowl') set.add('treat');
  if (!set.size) set.add('cookie');
  return FAMILY_KEYS.filter(k => set.has(k));
}

function chooseRequirements(day, available) {
  const count = Math.min(available.length, day >= 8 ? 3 : 2);
  const start = day % available.length;
  const out = [];
  for (let i = 0; i < count; i++) {
    const key = available[(start + i) % available.length];
    const target = 3 + ((day + i) % 3);
    out.push({ key, target, count: 0 });
  }
  return out;
}
function rewardFor(day, reqs) {
  const retail = reqs.reduce((sum, r) => sum + (PRODUCTS[r.key]?.price || 8) * r.target, 0);
  return Math.min(320, Math.max(110, Math.round((70 + day * 8 + retail * 0.45) / 10) * 10));
}

export function maybeStartPartyOrder(meta, world, day) {
  const p = ensurePartyOrders(meta);
  if (p.active) return { started: false, active: p.active };
  if (day < 3 || day - p.lastOfferDay < 3) return { started: false, active: null };
  const available = availablePartyProducts(world);
  const requirements = chooseRequirements(day, available);
  const theme = THEMES[(day + p.completed) % THEMES.length];
  p.active = {
    id: p.nextId++, title: theme[0], subtitle: theme[1],
    createdDay: day, expiresDay: day + 1, reward: rewardFor(day, requirements), claimed: false,
    requirements,
  };
  p.lastOfferDay = day;
  return { started: true, active: p.active };
}

export function partyOrderComplete(active) {
  return !!active && active.requirements.length > 0 && active.requirements.every(r => r.count >= r.target);
}
export function partyOrderProgress(active) {
  if (!active) return { count: 0, target: 0, frac: 0 };
  const count = active.requirements.reduce((n, r) => n + Math.min(r.target, r.count), 0);
  const target = active.requirements.reduce((n, r) => n + r.target, 0);
  return { count, target, frac: target ? Math.min(1, count / target) : 0 };
}

export function recordPartyOrderSale(meta, productKeys) {
  const p = ensurePartyOrders(meta), active = p.active;
  if (!active || active.claimed || partyOrderComplete(active)) return { changed: false, completedNow: false };
  const wasComplete = partyOrderComplete(active);
  let changed = false;
  for (const product of productKeys || []) {
    const fam = familyOf(product);
    const row = active.requirements.find(r => r.key === fam);
    if (!row || row.count >= row.target) continue;
    row.count++; changed = true;
  }
  const complete = partyOrderComplete(active);
  return { changed, completedNow: !wasComplete && complete, active };
}

export function expirePartyOrder(meta, day) {
  const p = ensurePartyOrders(meta), a = p.active;
  if (!a || partyOrderComplete(a) || day <= a.expiresDay) return { expired: false, active: a };
  p.active = null;
  return { expired: true, active: null };
}

export function claimPartyOrder(meta) {
  const p = ensurePartyOrders(meta), a = p.active;
  if (!a || a.claimed || !partyOrderComplete(a)) return { ok: false, reward: 0 };
  a.claimed = true;
  const reward = a.reward | 0;
  p.completed++;
  p.active = null;
  return { ok: true, reward, completed: p.completed };
}

export function clonePartyOrders(meta) {
  const p = ensurePartyOrders(meta);
  return {
    nextId: p.nextId | 0,
    completed: p.completed | 0,
    lastOfferDay: p.lastOfferDay | 0,
    active: p.active ? { ...p.active, requirements: p.active.requirements.map(r => ({ ...r })) } : null,
  };
}
