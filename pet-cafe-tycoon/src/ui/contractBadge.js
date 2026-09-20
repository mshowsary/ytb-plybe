// src/ui/contractBadge.js — today's goal, as a ring around the Café button.
//
// The contract ring used to live inside #dayPill, which the calm HUD hid all day: the goal was
// computed every frame and nobody could see it. It now wraps the one control that is always on
// screen and already means "the day" — the Café button — and fills as the goal does. The numbers
// and the reward are one tap away, in the Café card's Today row.
import { careerGoalProgress } from '../sim/career.js';
import { personIcon, coinIcon, streakIcon } from './icons.js';

// A goal is one of three verbs, each with a natural picture: guests served, coins earned, a streak.
export const GOAL_ICON = Object.freeze({ serve: personIcon, earn: coinIcon, streak: streakIcon });

export function contractModel(goal, stats, day) {
  if (!goal || !GOAL_ICON[goal.kind] || !(goal.target > 0)) return null;
  const current = Math.max(0, careerGoalProgress(goal, stats)), target = goal.target;
  return { key: `${day}:${goal.kind}:${target}`, kind: goal.kind, current, target, reward: Math.max(0, goal.reward | 0),
    ratio: Math.min(1, current / target), complete: current >= target };
}

const GOAL_LABEL = { serve: 'Guests served', earn: 'Coins earned today', streak: 'Best service streak' };

// Paints the ring onto `button` (a conic gradient behind it, see .goal-ring in style.css). Repaints
// only when the model changes, and pulses once on the frame the goal is met.
export function createGoalRing(button) {
  const ring = document.createElement('span');
  ring.className = 'goal-ring';
  ring.setAttribute('aria-hidden', 'true');
  button.prepend(ring);
  let last = null;
  return {
    update(goal, stats, day) {
      const model = contractModel(goal, stats, day);
      ring.hidden = !model;
      if (!model) { last = null; return null; }
      if (last && last.key === model.key && last.current === model.current) return model;
      if (last?.key !== model.key) button.classList.remove('goal-celebrate');
      if (last?.key === model.key && !last.complete && model.complete) button.classList.add('goal-celebrate');
      button.classList.toggle('goal-complete', model.complete);
      ring.style.setProperty('--goal-progress', `${Math.round(model.ratio * 100)}%`);
      last = model;
      return model;
    },
    label(model) {
      return model ? `${GOAL_LABEL[model.kind]} ${Math.min(model.current, model.target)} of ${model.target}` : '';
    },
  };
}
