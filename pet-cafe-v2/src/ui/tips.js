// src/ui/tips.js — first-time pointers, with no words: the first time a feature appears (a delivery
// van, a pet to stroke, a table request, the jukebox party…) the guide arrow points at it and a ring
// pulses on the floor there for a few seconds. Each one plays once per save, one at a time.
export function createTips(W) {
  const queue = [];
  let cur = null, t = 0, gap = 0;
  const resolve = c => (c && c.target ? (typeof c.target === 'function' ? c.target() : c.target) : null);
  return {
    offer(id, target = null) {
      if (W.tips.has(id) || queue.some(q => q.id === id) || (cur && cur.id === id)) return;
      queue.push({ id, target });
    },
    get target() { return resolve(cur); },
    get id() { return cur ? cur.id : null; },
    update(dt, blocked, playTime, hotspots) {
      if (cur) {
        t -= dt;
        const p = resolve(cur);
        if (p && hotspots) hotspots.show(p.x, p.z, '#FFFFFF', 1.35, 0, (p.floor ?? 0.08));
        if (t <= 0 || !p) { cur = null; gap = 2; }
        return;
      }
      gap -= dt;
      if (blocked || playTime < 20 || gap > 0 || !queue.length) return;
      cur = queue.shift(); W.tips.add(cur.id); t = 6;
    },
  };
}
