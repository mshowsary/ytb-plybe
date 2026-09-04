import test from 'node:test';
import assert from 'node:assert/strict';
import { applySave } from '../src/sim/save.js';

function target() {
  return {
    coins:0,
    up:{ speed:0, carry:0, income:0 },
    staff:{ runner:0, cashier:0, cleaner:0 },
    stats:{}, settings:{}, boosts:{},
  };
}
function saveFor(phase, day = 4) {
  return {
    coins:10,
    upgrades:{ speed:0, carry:0, income:0 },
    staff:{ runner:0, cashier:0, cleaner:0 },
    stats:{}, settings:{}, staffLevels:{}, machineLevels:{}, meta:{}, intro:{}, stars:{}, dayStats:{},
    dayState:{ day, phase, t:110 },
    boosts:{ petPlayBreak:{ day:4, remaining:8.25, slots:2 } },
  };
}

test('applySave restores Pet Play Break only into the exact same active rush', () => {
  const active = target(); applySave(active, saveFor('rush'));
  assert.deepEqual(active.boosts.petPlayBreak, { day:4, remaining:8.25, slots:2, recipientIds:[], needsRecipients:true });

  const afternoon = target(); applySave(afternoon, saveFor('afternoon'));
  assert.equal(afternoon.boosts.petPlayBreak, undefined);

  const laterDay = target(); applySave(laterDay, saveFor('rush', 5));
  assert.equal(laterDay.boosts.petPlayBreak, undefined);
});
