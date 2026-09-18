// Shared economic ledger for live runtime and headless tools.
//
// A sale is NOT wallet income: it accrues into a physical register pile. Collection is the
// separate transaction that moves that pile into the wallet. Bonuses add wallet value; spends and
// deductions remove it. Keeping those concepts separate lets experiments reconcile the actual
// wallet without calling every positive number "earnings".

export const LEDGER_TYPES = Object.freeze(['sale', 'collection', 'bonus', 'spend', 'deduction']);
const TYPE_SET = new Set(LEDGER_TYPES);
const DEFAULT_DELTA = Object.freeze({ sale: 0, collection: 1, bonus: 1, spend: -1, deduction: -1 });

function whole(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}
function dayNumber(value) { return Math.max(1, Number(value) | 0); }
function cleanCategory(value) {
  const s = typeof value === 'string' ? value.trim() : '';
  return s || 'uncategorized';
}
function cleanMeta(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw == null || typeof raw === 'string' || typeof raw === 'boolean' || Number.isFinite(raw)) out[key] = raw;
  }
  return Object.keys(out).length ? out : null;
}
function cloneEntry(e) { return { ...e, meta: e.meta ? { ...e.meta } : null }; }

function sanitizeEntry(raw, fallbackDay) {
  if (!raw || typeof raw !== 'object' || !TYPE_SET.has(raw.type)) return null;
  const amount = whole(raw.amount);
  if (!amount) return null;
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 120) : null;
  if (!id) return null;
  const type = raw.type;
  // Old/future snapshots may carry delta explicitly. Clamp it to the only legal relationship for
  // the declared transaction type so malformed save data cannot manufacture or erase wealth.
  const delta = amount * DEFAULT_DELTA[type];
  return {
    id,
    type,
    category: cleanCategory(raw.category),
    amount,
    delta,
    day: dayNumber(raw.day || fallbackDay),
    meta: cleanMeta(raw.meta),
  };
}

export function createLedger(raw = null, { day = 1, openingWallet = 0 } = {}) {
  let currentDay = dayNumber(day);
  let opening = whole(openingWallet);
  let next = 1;
  let entries = [];
  let seen = new Set();

  function load(source, fallbackWallet = opening, fallbackDay = currentDay) {
    currentDay = dayNumber(source && source.day || fallbackDay);
    opening = whole(source && source.openingWallet != null ? source.openingWallet : fallbackWallet);
    next = Math.max(1, source && source.next | 0);
    entries = [];
    seen = new Set();
    for (const candidate of source && Array.isArray(source.entries) ? source.entries : []) {
      const e = sanitizeEntry(candidate, currentDay);
      if (!e || seen.has(e.id) || e.day !== currentDay) continue;
      entries.push(e); seen.add(e.id);
    }
    // Generated IDs are monotonically increasing inside one shift. Imported stable IDs do not
    // need to participate; advancing beyond entry count is enough to avoid a normal restore clash.
    next = Math.max(next, entries.length + 1);
  }

  function generatedId() { return `d${currentDay}:tx${next++}`; }

  function record(type, category, amount, options = null) {
    if (!TYPE_SET.has(type)) throw new Error(`Unknown ledger transaction type: ${type}`);
    const n = whole(amount);
    if (!n) return null;
    const opts = options && typeof options === 'object' ? options : {};
    const id = typeof opts.id === 'string' && opts.id.trim() ? opts.id.trim().slice(0, 120) : generatedId();
    if (seen.has(id)) return cloneEntry(entries.find(e => e.id === id));
    const entry = {
      id,
      type,
      category: cleanCategory(category),
      amount: n,
      delta: n * DEFAULT_DELTA[type],
      day: currentDay,
      meta: cleanMeta(opts.meta),
    };
    entries.push(entry); seen.add(id);
    return cloneEntry(entry);
  }

  function totals() {
    const out = { sale: 0, collection: 0, bonus: 0, spend: 0, deduction: 0, walletDelta: 0 };
    for (const e of entries) { out[e.type] += e.amount; out.walletDelta += e.delta; }
    return out;
  }

  function report(wallet = null) {
    const t = totals();
    const expectedWallet = opening + t.walletDelta;
    const actualWallet = wallet == null ? null : whole(wallet);
    return {
      day: currentDay,
      openingWallet: opening,
      ...t,
      expectedWallet,
      actualWallet,
      reconciled: actualWallet == null ? null : actualWallet === expectedWallet,
      difference: actualWallet == null ? null : actualWallet - expectedWallet,
      transactionCount: entries.length,
    };
  }

  function snapshot() {
    return { v: 1, day: currentDay, openingWallet: opening, next, entries: entries.map(cloneEntry) };
  }

  function reset(newDay, wallet) {
    currentDay = dayNumber(newDay);
    opening = whole(wallet);
    next = 1; entries = []; seen = new Set();
  }

  function restore(source, wallet, restoredDay) {
    if (!source || typeof source !== 'object' || (source.v | 0) !== 1 || dayNumber(source.day) !== dayNumber(restoredDay)) {
      reset(restoredDay, wallet);
      return false;
    }
    load(source, wallet, restoredDay);
    return true;
  }

  load(raw, openingWallet, day);
  return {
    record,
    report,
    snapshot,
    reset,
    restore,
    has(id) { return typeof id === 'string' && seen.has(id); },
    get day() { return currentDay; },
    get entries() { return entries.map(cloneEntry); },
  };
}
