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
  // Persist a timestamp that actually belongs to the phase under test. Task 09 deliberately derives
  // phase from time so a contradictory JSON label cannot resurrect a day-scoped reward.
  const t = phase === 'rush' ? 110 : 150;
  return {
    coins:10,
    upgrades:{ speed:0, carry:0, income:0 },
    staff:{ runner:0, cashier:0, cleaner:0 },
    stats:{}, settings:{}, staffLevels:{}, machineLevels:{}, meta:{}, intro:{}, stars:{}, dayStats:{},
    dayState:{ day, phase, t },
    boosts:{ petPlayBreak:{ day:4, remaining:8.25, slots:2 } },
  };
}

test('applySave preserves the promised Pet Play Break duration through same-day phase change', () => {
  const active = target(); applySave(active, saveFor('rush'));
  assert.deepEqual(active.boosts.petPlayBreak, { day:4, remaining:8.25, slots:2, recipientIds:[], needsRecipients:true });

  // The ad promised seconds of protection, not "until Rush ends". A host pause/reload after the
  // phase boundary must therefore keep the unused seconds available on the same day.
  const afternoon = target(); applySave(afternoon, saveFor('afternoon'));
  assert.deepEqual(afternoon.boosts.petPlayBreak, { day:4, remaining:8.25, slots:2, recipientIds:[], needsRecipients:true });

  // Day-scoped state still expires safely once the calendar day advances.
  const laterDay = target(); applySave(laterDay, saveFor('rush', 5));
  assert.equal(laterDay.boosts.petPlayBreak, undefined);
});