import test from 'node:test';
import assert from 'node:assert/strict';
import { petPlayBreakOfferFor } from '../src/systems/economyExperience.js';

function world() {
  return { stations: new Map([['hire1', { id:'hire1', type:'hire', active:true }]]) };
}
function state(customers) {
  return {
    coins: 500,
    staff: { runner:0, cashier:0, cleaner:0 },
    staffLevels: { runner:{ speed:0, carry:0 }, cashier:{ speed:0 }, cleaner:{ speed:0 } },
    up: { speed:0, carry:0, income:0 },
    customers,
    dayState: { day:4, phase:'rush', t:100 },
    dayStats: { serviceMisses:0 },
    staffList: [], time:120,
  };
}

test('Pet Play Break surfaces from early broad overload that can survive the five-second UI dwell', () => {
  const customers = [
    { id:1, state:'atBowl', mood:'wait', patience:12, done:false },
    { id:2, state:'atBowl', mood:'wait', patience:13, done:false },
    { id:3, state:'atBowl', mood:'wait', patience:14, done:false },
    { id:4, state:'atBowl', mood:'wait', patience:15, done:false },
    { id:5, state:'eating', mood:'none', patience:17, done:false },
    { id:6, state:'eating', mood:'none', patience:17, done:false },
    { id:7, state:'eating', mood:'none', patience:17, done:false },
  ];
  const offer = petPlayBreakOfferFor(state(customers), world(), { now:120 });
  assert.ok(offer);
  assert.equal(offer.mode, 'petBreak');
  assert.equal(offer.key, 'petBreak');
  assert.equal(offer.slots, 2);
  assert.equal(offer.duration, 15);
  assert.deepEqual(offer.recipientIds, [1, 2]);
  assert.match(offer.detail, /patience cannot fall/i);
});

test('Pet Play Break refuses broad pressure until four of seven active guests are genuinely waiting', () => {
  const customers = [
    { id:1, state:'atBowl', mood:'wait', patience:12, done:false },
    { id:2, state:'atBowl', mood:'wait', patience:13, done:false },
    { id:3, state:'atBowl', mood:'wait', patience:14, done:false },
    { id:4, state:'eating', mood:'none', patience:17, done:false },
    { id:5, state:'eating', mood:'none', patience:17, done:false },
    { id:6, state:'eating', mood:'none', patience:17, done:false },
    { id:7, state:'eating', mood:'none', patience:17, done:false },
  ];
  assert.equal(petPlayBreakOfferFor(state(customers), world(), { now:120 }), null);
});
