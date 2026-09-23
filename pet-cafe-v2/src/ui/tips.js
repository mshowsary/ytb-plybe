// src/ui/tips.js — one-time tips: the first time a feature appears (a delivery van, a pet you can pet,
// a table request, the jukebox party…), one short card explains it and the guide arrow points at it.
// Each tip shows once per save, one at a time, never over a sheet and never in the first half-minute.
export function createTips(root, W, audio) {
  root.insertAdjacentHTML('beforeend', `<div class="tipcard" id="tipcard"><span class="tipicon"></span><span class="tiptext"></span></div>`);
  const card = root.querySelector('#tipcard'), icon = card.querySelector('.tipicon'), text = card.querySelector('.tiptext');
  const queue = [];
  let cur = null, t = 0, gap = 0;
  card.addEventListener('pointerdown', e => { e.stopPropagation(); t = Math.min(t, 0.3); });
  return {
    // target: a world point {x, z, y?} (or a function returning one) for the guide arrow while the tip shows
    offer(id, emoji, msg, target = null) {
      if (W.tips.has(id) || queue.some(q => q.id === id) || (cur && cur.id === id)) return;
      queue.push({ id, emoji, msg, target });
    },
    get target() { if (!cur || !cur.target) return null; return typeof cur.target === 'function' ? cur.target() : cur.target; },
    update(dt, blocked, playTime) {
      if (cur) {
        t -= dt;
        if (t <= 0) { card.classList.remove('show'); cur = null; gap = 3; }
        return;
      }
      gap -= dt;
      if (blocked || playTime < 30 || gap > 0 || !queue.length) return;
      cur = queue.shift(); W.tips.add(cur.id); t = 7;
      icon.textContent = cur.emoji; text.textContent = cur.msg;
      card.classList.add('show'); audio.play('ding');
    },
  };
}
