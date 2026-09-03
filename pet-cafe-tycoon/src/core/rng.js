export function makeRng(seed) {
  let a = seed >>> 0;
  const f = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  return { f, r: (lo, hi) => lo + f() * (hi - lo), i: (lo, hi) => Math.floor(lo + f() * (hi - lo + 1)), pick: arr => arr[f() * arr.length | 0], chance: p => f() < p };
}
