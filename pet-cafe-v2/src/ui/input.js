// src/ui/input.js — a floating joystick (press anywhere on the play field and drag) plus WASD/arrows.
// Returns a screen-space vector: x to the right, y downward, length 0..1.
export function createInput(root) {
  const base = document.createElement('div'); base.className = 'joy hidden';
  const knob = document.createElement('div'); knob.className = 'joy-knob'; base.appendChild(knob);
  root.appendChild(base);
  const R = 52;
  const st = { x: 0, y: 0, active: false, id: null, ox: 0, oy: 0, moved: false };
  const keys = new Set();

  const isUi = e => e.target && e.target.closest && e.target.closest('button, .ui, .sheet');
  root.addEventListener('pointerdown', e => {
    if (isUi(e) || st.id !== null) return;
    st.id = e.pointerId; st.active = true; st.ox = e.clientX; st.oy = e.clientY; st.x = st.y = 0;
    base.style.transform = `translate(${st.ox}px,${st.oy}px)`; base.classList.remove('hidden');
    knob.style.transform = 'translate(-50%,-50%)';
    try { root.setPointerCapture(e.pointerId); } catch (_) {}
  });
  root.addEventListener('pointermove', e => {
    if (e.pointerId !== st.id) return;
    let dx = e.clientX - st.ox, dy = e.clientY - st.oy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    st.x = dx / R; st.y = dy / R; if (d > 6) st.moved = true;
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  });
  const end = e => {
    if (e.pointerId !== st.id) return;
    st.id = null; st.active = false; st.x = st.y = 0; base.classList.add('hidden');
  };
  root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end);
  addEventListener('keydown', e => { keys.add(e.key.toLowerCase()); if (e.key.startsWith('Arrow')) e.preventDefault(); });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => { keys.clear(); st.id = null; st.active = false; st.x = st.y = 0; base.classList.add('hidden'); });

  return {
    read() {
      let x = st.x, y = st.y;
      if (!st.active) {
        x = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
        y = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
        const d = Math.hypot(x, y); if (d > 1) { x /= d; y /= d; }
        if (d) st.moved = true;
      }
      return { x, y };
    },
    get everMoved() { return st.moved; },
    get touching() { return st.active; },
  };
}
