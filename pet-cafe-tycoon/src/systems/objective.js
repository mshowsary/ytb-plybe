// Objective arrow: intro target first, then temporary carry guidance, then normal job guidance.
// Routine jobs are deliberately arrow-only: persistent floating words compete with the café itself.
import { jobTarget } from '../sim/jobs.js';
import { chevronMesh } from '../render/props.js';

const CAPTION = {
  register: 'Serve', restock: 'Stock', refill: 'Refill', clean: 'Clean', harvest: 'Pick', build: 'Build',
  bake: 'Bake', stock: 'Stock', serve: 'Serve', collect: 'Cash', deliver: 'Deliver', return: 'Return',
};
const HOVER_Y = 2.4, BOB_AMP = 0.15, BOB_HZ = 2;
const RECOMPUTE_INTERVAL = 0.25;

export function createObjective(G, S, ctx) {
  const { world, scene, fx, els } = ctx;
  const chevron = chevronMesh(); chevron.visible = false; scene.add(chevron);
  const caption = document.createElement('div'); caption.className = 'objCaption hidden'; els.fx.appendChild(caption);
  const tmp = { sx: 0, sy: 0, visible: true };
  let t = 0, cd = 0, target = null, guided = false;

  return {
    update(dt) {
      t += dt;
      if (G.intro && G.intro.active) {
        target = G.intro.target;
        guided = true;
      } else if (G.contextGuide) {
        target = G.contextGuide;
        guided = true;
      } else {
        guided = false;
        cd -= dt;
        if (cd <= 0) { cd = RECOMPUTE_INTERVAL; target = jobTarget(world, G); }
      }

      if (!target) {
        if (chevron.visible) chevron.visible = false;
        caption.classList.add('hidden');
        return;
      }

      chevron.visible = true;
      const y = HOVER_Y + Math.sin(t * Math.PI * 2 * BOB_HZ) * BOB_AMP;
      chevron.position.set(target.x, y, target.z);
      const cam = fx.camera;
      chevron.rotation.y = Math.atan2(cam.position.x - target.x, cam.position.z - target.z);

      // Only onboarding and carry-routing need a word. Normal maintenance jobs get the arrow only.
      if (!guided) { caption.classList.add('hidden'); return; }
      fx.project(target.x, y - 0.4, target.z, tmp);
      const word = target.caption || CAPTION[target.kind] || '';
      if (caption.textContent !== word) caption.textContent = word;
      caption.style.left = tmp.sx + 'px'; caption.style.top = tmp.sy + 'px';
      caption.classList.toggle('hidden', !tmp.visible || !word);
    },
  };
}
