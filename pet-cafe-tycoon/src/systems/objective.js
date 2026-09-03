// src/systems/objective.js — the objective arrow (M3 T5): a bobbing, camera-facing chevron
// hovering above jobs.next's target (src/sim/jobs.js's jobTarget), with a one-word DOM caption
// underneath. Hidden whenever jobTarget(w, G) returns null (nothing pending).
import { jobTarget } from '../sim/jobs.js';
import { chevronMesh } from '../render/props.js';

const CAPTION = {
  register: 'Register', restock: 'Restock', refill: 'Refill', clean: 'Clean', harvest: 'Harvest', build: 'Build',
  // Loop v2 Task 2: the intro's five step verbs (src/systems/intro.js).
  bake: 'Bake', stock: 'Stock', serve: 'Serve', collect: 'Collect',
};
const HOVER_Y = 2.4, BOB_AMP = 0.15, BOB_HZ = 2;
const RECOMPUTE_INTERVAL = 0.25; // at most 4x/second, per the task brief

export function createObjective(G, S, ctx) {
  const { world, scene, fx, els } = ctx;
  const chevron = chevronMesh();
  chevron.visible = false;
  scene.add(chevron);
  const caption = document.createElement('div'); caption.className = 'objCaption hidden';
  els.fx.appendChild(caption);
  const tmp = { sx: 0, sy: 0, visible: true };

  let t = 0, cd = 0, target = null;

  return {
    update(dt) {
      t += dt;
      // Loop v2 Task 2: while the intro (src/systems/intro.js) is active, its own step target
      // (G.intro.target) overrides jobTarget entirely — forced every frame, no throttle, since
      // it's just a cheap station lookup intro.js already did this frame.
      if (G.intro && G.intro.active) {
        target = G.intro.target;
      } else {
        cd -= dt;
        if (cd <= 0) { cd = RECOMPUTE_INTERVAL; target = jobTarget(world, G); }
      }
      if (!target) {
        if (chevron.visible) { chevron.visible = false; caption.classList.add('hidden'); }
        return;
      }
      chevron.visible = true;
      const bob = Math.sin(t * Math.PI * 2 * BOB_HZ) * BOB_AMP;
      const y = HOVER_Y + bob;
      chevron.position.set(target.x, y, target.z);
      const cam = fx.camera;
      chevron.rotation.y = Math.atan2(cam.position.x - target.x, cam.position.z - target.z);
      fx.project(target.x, y - 0.4, target.z, tmp);
      const word = CAPTION[target.kind] || '';
      if (caption.textContent !== word) caption.textContent = word;
      caption.style.left = tmp.sx + 'px'; caption.style.top = tmp.sy + 'px';
      caption.classList.toggle('hidden', !tmp.visible);
    },
  };
}
