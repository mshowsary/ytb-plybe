// src/render/residents.js — the café's own pets, living in the playground: each one wanders to a
// spot (a bed, the bowls, the toys, somewhere on the grass), sits or naps there a while, then moves on.
// Pure decoration: no nav grid, they stay inside their fenced area.
import { createPet } from './pets.js';

export function createResidents(scene, area, spots, who) {
  const pets = who.map(([species, variant], i) => {
    const P = createPet(species, variant);
    const s = spots[i % spots.length];
    P.group.position.set(s.x, s.y || 0, s.z);
    scene.add(P.group);
    return { P, state: 'rest', t: 2 + i * 1.7, target: s, speed: species === 'dog' ? 1.1 : 0.8 };
  });
  const pick = r => {
    const busy = new Set(pets.filter(o => o !== r).map(o => o.target));
    const free = spots.filter(s => !busy.has(s));
    if (Math.random() < 0.35 || !free.length) return { x: area.x0 + Math.random() * (area.x1 - area.x0), z: area.z0 + Math.random() * (area.z1 - area.z0), y: 0 };
    return free[(Math.random() * free.length) | 0];
  };
  return {
    update(dt) {
      for (const r of pets) {
        const g = r.P.group;
        r.t -= dt;
        if (r.state === 'rest') {
          r.P.idleLife?.(dt, {});
          r.P.update(dt, false, 0);
          if (r.t <= 0) { r.target = pick(r); r.state = 'walk'; r.P.stand(); g.position.y = 0; }
        } else {
          const dx = r.target.x - g.position.x, dz = r.target.z - g.position.z, d = Math.hypot(dx, dz);
          if (d < 0.08) {
            r.state = 'rest'; r.t = 4 + Math.random() * 7;
            g.position.y = r.target.y || 0;
            if (r.target.bed || Math.random() < 0.6) r.P.sit();
            if (r.target.face != null) g.rotation.y = r.target.face;
          } else {
            const s = Math.min(d, r.speed * dt);
            g.position.x += dx / d * s; g.position.z += dz / d * s;
            let a = Math.atan2(dx, dz) - g.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a));
            g.rotation.y += a * Math.min(1, dt * 8);
          }
          r.P.update(dt, r.state === 'walk', 0);
        }
      }
    },
  };
}
