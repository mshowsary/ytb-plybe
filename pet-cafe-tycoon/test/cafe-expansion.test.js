import test from 'node:test';
import assert from 'node:assert/strict';
import { cafeDayModel } from '../src/ui/cafeDayModel.js';
import { petSocialPose } from '../src/render/petSocialPose.js';
import { buyDecor } from '../src/sim/economy.js';
import { DECOR_BY_ID } from '../data/decor.js';
import { requestCafeReward } from '../src/platform/cafeReward.js';

test('YouTube rewards require a successful host result; unavailable, cancelled and thrown ads grant nothing', async () => {
  assert.equal(await requestCafeReward({ inPlayables: true, rewardedAvailable: false }, 'test'), false);
  for (const result of [false, undefined, 'true', true]) {
    assert.equal(await requestCafeReward({ inPlayables: true, rewardedAvailable: true, requestRewardedAd: async () => result }, 'test'), result === true);
  }
  assert.equal(await requestCafeReward({ inPlayables: true, rewardedAvailable: true, requestRewardedAd: async () => { throw Error('offline'); } }, 'test'), false);
  assert.equal(await requestCafeReward({ inPlayables: false, rewardedAvailable: false }, 'test'), true);
});

test('day guide follows simulation time and only warns in the final 15 seconds before rush', () => {
  const state = { dayState: { day: 3, t: 44, phase: 'morning' } };
  assert.equal(cafeDayModel(state).soon, false);
  state.dayState.t = 45; assert.equal(cafeDayModel(state).soon, true);
  assert.equal(cafeDayModel(state).clock, '0:15');
  state.dayState.t = 60; state.dayState.phase = 'rush';
  assert.equal(cafeDayModel(state).soon, false);
  assert.equal(cafeDayModel(state).clock, '1:30');
  assert.equal(cafeDayModel(state).label, 'Lunch rush');
});
test('daily event completion and reward use the actual current shift', () => {
  const m = cafeDayModel({ dayState: { day: 7, t: 215, phase: 'closing' }, special: { id: 'puppy', target: 6, reward: 190 }, dayStats: { specialServed: 4 } });
  assert.equal(m.title, 'Puppy playdate'); assert.match(m.event, /4\/6/); assert.match(m.event, /190 coins/);
});
test('all 20 social performances settle and remain within small pose limits', () => {
  for (const species of ['cat', 'dog', 'bunny', 'hamster']) for (let variant = 0; variant < 5; variant++) {
    for (const p of [0, 1]) for (const v of Object.values(petSocialPose(species, variant, p))) assert.ok(Math.abs(v) < 1e-12);
    for (let p = 0; p <= 1; p += .05) for (const v of Object.values(petSocialPose(species, variant, p, 'eat'))) assert.ok(Number.isFinite(v) && Math.abs(v) <= .8);
  }
});
test('play equipment costs coins once, never deducts on refusal, and awards only its authored reputation', () => {
  for (const id of ['d_play_wand', 'd_play_wheel', 'd_play_fountain']) {
    const price = DECOR_BY_ID.get(id).price;
    const g = { coins: price - 1, meta: { decor: [], reputation: 0 } };
    assert.equal(buyDecor(g, id).ok, false); assert.equal(g.coins, price - 1);
    g.coins = price; assert.equal(buyDecor(g, id).ok, true); assert.equal(g.coins, 0); assert.equal(g.meta.reputation, 1);
    g.coins = price; assert.equal(buyDecor(g, id).ok, false); assert.equal(g.coins, price);
  }
});
