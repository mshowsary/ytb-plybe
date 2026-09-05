// src/core/input.js — floating joystick (touch/mouse) + keyboard → world move vector
const YAW = 35 * Math.PI / 180, DEAD = 6, FULL = 14, KNOB = 40;
const RX = Math.cos(YAW), RZ = -Math.sin(YAW), FX = -Math.sin(YAW), FZ = -Math.cos(YAW); // screen right / screen up in world xz
const activeInputs = new Set();

export function resetActiveInputs() {
  for (const input of activeInputs) input.reset();
}

export function createInput(joyEl, knobEl) {
  const I = { x: 0, z: 0, active: false, pressed: false };
  let pid = -1, ox = 0, oy = 0, jx = 0, jy = 0; const keys = new Set();
  const isUi = t => t && (t.closest && (t.closest('button') || t.closest('.pill') || t.closest('.sheet') || t.closest('.card') || t.closest('.backdrop') || t.closest('.fbtn')));
  const reset = () => {
    pid = -1; ox = oy = jx = jy = 0; keys.clear();
    I.x = 0; I.z = 0; I.active = false; I.pressed = false;
    if (joyEl) joyEl.classList.add('hidden');
    if (knobEl) knobEl.style.transform = 'translate(-50%,-50%)';
  };
  I.reset = reset;
  activeInputs.add(I);

  const down = e => { if (pid !== -1 || isUi(e.target)) return; pid = e.pointerId; ox = e.clientX; oy = e.clientY; jx = jy = 0; I.pressed = true;
    joyEl.style.left = ox + 'px'; joyEl.style.top = oy + 'px'; joyEl.classList.remove('hidden'); knobEl.style.transform = 'translate(-50%,-50%)'; };
  const move = e => { if (e.pointerId !== pid) return; let dx = e.clientX - ox, dy = e.clientY - oy; const d = Math.hypot(dx, dy);
    let kx = dx, ky = dy; if (d > KNOB) { kx *= KNOB / d; ky *= KNOB / d; } knobEl.style.transform = `translate(calc(-50% + ${kx}px),calc(-50% + ${ky}px))`;
    const m = d < DEAD ? 0 : Math.min(1, (d - DEAD) / (FULL - DEAD)); jx = d ? dx / d * m : 0; jy = d ? dy / d * m : 0; };
  const up = e => { if (e.pointerId !== pid) return; reset(); };
  const cancel = e => { if (pid !== -1 && e && e.pointerId !== pid) return; reset(); };
  addEventListener('pointerdown', down); addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', cancel);
  const kd = e => { if (!e.repeat) keys.add(e.code); }, ku = e => keys.delete(e.code);
  const bl = () => reset();
  addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('blur', bl);
  // first-input latch, used to unlock audio; independent of the isUi filter above — any pointerdown or keydown counts
  let firstDone = false; const firstCbs = [];
  const doFirst = () => { if (firstDone) return; firstDone = true; for (const cb of firstCbs) cb(); firstCbs.length = 0; };
  addEventListener('pointerdown', doFirst); addEventListener('keydown', doFirst);
  I.onFirstInput = cb => { if (firstDone) cb(); else firstCbs.push(cb); };
  I.update = () => {
    let sx = jx, sy = jy;
    if (pid === -1) { sx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      sy = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      const l = Math.hypot(sx, sy); if (l > 1) { sx /= l; sy /= l; } }
    I.x = RX * sx - FX * sy; I.z = RZ * sx - FZ * sy; I.active = (sx || sy) !== 0;
  };
  I.dispose = () => { removeEventListener('pointerdown', down); removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', cancel); removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('blur', bl); removeEventListener('pointerdown', doFirst); removeEventListener('keydown', doFirst); activeInputs.delete(I); reset(); };
  return I;
}
