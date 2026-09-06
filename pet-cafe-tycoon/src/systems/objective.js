// Objective arrow: intro target first, then temporary carry guidance, then normal job guidance.
// Routine jobs use the same Task-30 escalation lane as interactionCoach: natural state first,
// subtle route pulse after ~3s of hesitation, and explicit route/caption after ~7s. Useful movement
// toward the current target resets the timer so the game never nags a player who is already acting.
import { jobTarget } from '../sim/jobs.js';
import { refillGuideTarget } from '../sim/refillGuide.js';
import { coachEscalationStage } from '../sim/mechanicLearning.js';
import { chevronMesh } from '../render/props.js';

const CAPTION = {
  register: 'Serve', restock: 'Stock', refill: 'Refill', supplies: 'Supplies', clean: 'Clean', harvest: 'Pick', build: 'Build',
  bake: 'Bake', stock: 'Stock', serve: 'Serve', collect: 'Cash', deliver: 'Deliver', return: 'Return',
};
const HOVER_Y = 2.4, BOB_AMP = 0.15, BOB_HZ = 2;
const RECOMPUTE_INTERVAL = 0.25;
const PROGRESS_RESET_METERS = 0.18;

function cueKey(target, guided) {
  if (!target) return '';
  return `${guided ? 'g' : 'j'}:${target.id || target.stationId || target.kind || ''}:${Number(target.x).toFixed(2)}:${Number(target.z).toFixed(2)}`;
}
function targetDistance(G, target) {
  if (!G?.P || !target) return null;
  return Math.hypot(G.P.x - target.x, G.P.z - target.z);
}
function reducedMotion() {
  try { return !!matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (_) { return false; }
}

export function createObjective(G, S, ctx) {
  const { world, scene, fx, els } = ctx;
  const chevron = chevronMesh(); chevron.visible = false; scene.add(chevron);
  const caption = document.createElement('div'); caption.className = 'objCaption hidden'; els.fx.appendChild(caption);
  const tmp = { sx: 0, sy: 0, visible: true };
  let t = 0, cd = 0, target = null, guided = false;
  let activeCue = '', hesitateT = 0, bestDistance = null;

  function resetHesitation(nextKey = '', distance = null) {
    activeCue = nextKey;
    hesitateT = 0;
    bestDistance = distance;
  }

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
        if (cd <= 0) {
          cd = RECOMPUTE_INTERVAL;
          target = jobTarget(world, G);
          // Refill is a two-step interaction. Sending an empty-handed player to the empty bowl or
          // espresso machine teaches nothing, so route the objective through Pantry first. Once
          // beans/kibble are in hand the arrow switches back to the correct empty station.
          if (target && target.kind === 'refill') target = refillGuideTarget(world, G) || target;
        }
      }

      // Publish the actionable world class before deciding which visual owns the lane. Lower-priority
      // contextual hints remain suppressed even during the natural/no-overlay phase.
      G.objectiveCueKind = target ? (guided ? 'guided' : target.kind || null) : null;

      if (!target) {
        resetHesitation();
        G.objectiveCueStage = 'natural';
        if (chevron.visible) chevron.visible = false;
        caption.classList.add('hidden');
        return;
      }

      // A first-use interaction hand may replace the arrow, but never coexist with it.
      if (G.coachCueVisible) {
        chevron.visible = false;
        caption.classList.add('hidden');
        return;
      }

      let stage = 'route';
      if (!guided) {
        const key = cueKey(target, false);
        const distance = targetDistance(G, target);
        if (key !== activeCue) resetHesitation(key, distance);
        else if (distance != null && bestDistance != null && distance < bestDistance - PROGRESS_RESET_METERS) {
          // The player is materially closer: useful action is its own feedback, so return to natural.
          resetHesitation(key, distance);
        } else {
          hesitateT += Math.max(0, dt);
          if (distance != null && (bestDistance == null || distance < bestDistance)) bestDistance = distance;
        }
        stage = coachEscalationStage(hesitateT, reducedMotion());
      } else {
        const key = cueKey(target, true);
        if (key !== activeCue) resetHesitation(key, targetDistance(G, target));
      }
      G.objectiveCueStage = stage;

      // Natural world state is the first teacher. Do not overlay another instruction until the
      // player has actually hesitated.
      if (!guided && stage === 'natural') {
        chevron.visible = false;
        caption.classList.add('hidden');
        return;
      }

      chevron.visible = true;
      const animated = stage !== 'static';
      const y = HOVER_Y + (animated ? Math.sin(t * Math.PI * 2 * BOB_HZ) * BOB_AMP : 0);
      chevron.position.set(target.x, y, target.z);
      const cam = fx.camera;
      chevron.rotation.y = Math.atan2(cam.position.x - target.x, cam.position.z - target.z);

      // The 3s stage is visual-only. At ~7s the same single cue earns a compact route word. Explicit
      // intro/context guidance remains immediately captioned because it is already an authored lesson.
      const showWord = guided || stage === 'route';
      if (!showWord) { caption.classList.add('hidden'); return; }
      fx.project(target.x, y - 0.4, target.z, tmp);
      const word = target.caption || CAPTION[target.kind] || '';
      if (caption.textContent !== word) caption.textContent = word;
      caption.style.left = tmp.sx + 'px'; caption.style.top = tmp.sy + 'px';
      caption.classList.toggle('hidden', !tmp.visible || !word);
    },
  };
}
