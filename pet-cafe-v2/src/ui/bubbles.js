// src/ui/bubbles.js — small picture bubbles pinned over things in the world (what a guest wants,
// an oven out of flour, a table waiting to be wiped). Keyed, so a bubble that stays up keeps its
// element (and its pop-in animation plays once). Anything not shown this frame is hidden.
export function createBubbles(S, layer) {
  const live = new Map(), seen = new Set(), scr = { x: 0, y: 0, on: true };
  return {
    begin() { seen.clear(); },
    show(key, x, y, z, html, cls = '') {
      S.worldToScreen(x, y, z, scr);
      if (!scr.on) return;
      let el = live.get(key);
      if (!el) { el = document.createElement('div'); el.className = 'bub pop'; layer.appendChild(el); live.set(key, el); el._html = ''; el._cls = ''; }
      if (el._html !== html) { el.innerHTML = html; el._html = html; }
      if (el._cls !== cls) { el.className = 'bub ' + cls; el._cls = cls; }
      el.style.transform = `translate(${scr.x | 0}px,${scr.y | 0}px)`;
      seen.add(key);
    },
    end() {
      for (const [k, el] of live) if (!seen.has(k)) { el.remove(); live.delete(k); }
    },
  };
}
