// src/render/view.js — shows the world's state: which stations stand, what is on every tray and
// counter, how much flour each oven has, which tables need wiping. Builds pop in when bought.
import { modelFor } from './props.js';
import { shelfSlot } from './items.js';
import { MACHINE_CAP, SUPPLIES } from '../game/layout.js';
import { easeOutBack } from '../core/tween.js';

export function createView(ctx) {
  const { W, scene, items, bubbles, fx } = ctx;
  const views = new Map();
  for (const st of W.stations.values()) {
    const v = modelFor(st);
    v.group.position.set(st.x, 0, st.z);
    v.group.rotation.y = st.rot || 0;
    v.group.visible = st.built;
    v.group.traverse(o => { if (o.isMesh) { o.receiveShadow = true; } });
    scene.add(v.group);
    v.pop = st.built ? 1 : 0;
    views.set(st.id, v);
  }

  let t = 0;
  function update(dt, party) {
    t += dt;
    for (const st of W.stations.values()) {
      const v = views.get(st.id);
      if (!st.built) { v.group.visible = false; continue; }
      if (v.pop < 1) {       // the build moment: grow in with a little overshoot
        v.pop = Math.min(1, v.pop + dt * 2.2);
        const k = easeOutBack(v.pop); v.group.scale.set(k, k, k);
      }
      v.group.visible = true;
      if (st.type === 'machine') {
        v.setLevel(st.level / MACHINE_CAP);
        v.setBusy(st.busy, t);
        for (let i = 0; i < st.tray; i++) {
          const s = shelfSlot(i, 4, 0.22, 0.2);
          items.add(st.product, st.x + v.tray.x + s.x, v.tray.y, st.z + v.tray.z + s.z);
        }
        if (st.busy && Math.random() < dt * 1.5) fx.steam(st.x + (st.model === 'oven' ? 0 : 0.25), st.model === 'oven' ? 2.4 : 1.6, st.z - 0.3);
        const e = SUPPLIES[st.supply].emoji;
        if (st.level <= 0) bubbles.show('m' + st.id, st.x - 0.48, 2.0, st.z, e + '<b>!</b>', 'need');
        else if (st.level <= 2) bubbles.show('m' + st.id, st.x - 0.48, 2.0, st.z, e, 'need soft');
      } else if (st.type === 'counter') {
        for (let i = 0; i < st.stock; i++) {
          const s = shelfSlot(i, 4, 0.38, 0.28);
          items.add(st.product, st.x + v.shelf.x + s.x, v.shelf.y, st.z + v.shelf.z + s.z);
        }
      } else if (st.type === 'table') {
        v.dirty.visible = st.dirty;
        if (st.dirty) {
          if (st.tip > 0) items.add('tip', st.x + v.tipAt.x, v.tipAt.y, st.z + v.tipAt.z);
          if (!W.staff.has('cleaner')) bubbles.show('tbl' + st.id, st.x, 1.6, st.z, '🧽', 'need soft');
        }
      } else if (st.type === 'pantry') {
        for (const kind in v.rows) v.rows[kind].visible = W.built('machine').some(m => m.supply === kind);
      } else if (st.type === 'jukebox') {
        const hue = party ? (t * 0.35) % 1 : 0.94;
        v.lights.material.color.setHSL(hue, 0.9, party ? 0.62 : 0.72).multiplyScalar(1.5);
      }
    }
  }

  function built(id) {
    const v = views.get(id); if (!v) return;
    const st = W.stations.get(id);
    v.pop = 0; v.group.scale.setScalar(0.01); v.group.visible = true;
    fx.dust(st.x, st.z, 18); fx.burst(st.x, 1.0, st.z, '#FFD84D', 22); fx.confetti(st.x, st.z, 1.4, 30);
  }

  return { update, built, views };
}
