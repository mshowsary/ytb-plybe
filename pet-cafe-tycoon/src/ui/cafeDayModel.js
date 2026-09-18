import { seasonForDay } from '../sim/seasons.js';
import { specialForDaySeasoned } from '../sim/specialDays.js';
import { careerGoalProgress } from '../sim/career.js';

export const THEME_NAMES = Object.freeze({ puppy: 'Puppy playdate', catcafe: 'Cats & cappuccinos', bunnybrunch: 'Bunny brunch', 'latte-rush': 'Latte festival', 'sweet-tooth': 'Bakery parade', 'berry-blast': 'Berry picnic' });
const PHASES = { morning: ['Opening time', 'Stock up before the rush', 60], rush: ['Lunch rush', 'Busy tables, 50% better tips', 150], afternoon: ['Cozy afternoon', 'Refill, build and meet your regulars', 210], closing: ['Last orders', 'Finish serving before closing', 240] };
export function cafeDayModel(G) {
  const day = Math.max(1, G.dayState?.day | 0), t = Math.max(0, Number(G.dayState?.t) || 0);
  const phase = G.dayState?.phase || 'morning', [label, tip, end] = PHASES[phase] || PHASES.morning;
  const season = seasonForDay(day);
  const special = G.special;
  const tomorrowSeason = seasonForDay(day + 1);
  const tomorrow = specialForDaySeasoned(day + 1, tomorrowSeason.id, tomorrowSeason.dayStart);
  const left = Math.max(0, Math.ceil(end - t));
  return { day, phase, label, tip, left, clock: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`,
    soon: phase === 'morning' && left <= 15 && left > 0,
    title: special ? THEME_NAMES[special.id] || 'Café festival' : day === 1 ? 'Welcome to Pet Café' : 'Meet the regulars',
    event: special ? `${Math.min(special.target, G.dayStats?.specialServed || 0)}/${special.target} themed serves · +${special.reward} coins at closing` : 'Every visit grows a friendship. Besties can move in.',
    tomorrow: tomorrow ? THEME_NAMES[tomorrow.id] || 'Café festival' : 'Meet the regulars',
    goal: G.goal ? `${Math.min(G.goal.target, careerGoalProgress(G.goal, G.dayStats || {}))}/${G.goal.target}` : '',
    season: season.id.charAt(0).toUpperCase() + season.id.slice(1),
  };
}
