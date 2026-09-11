import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  REWARDED_OFFER_MIN_SESSION_SECONDS,
  compactRewardedOfferModel,
  rewardedOfferSurfaceAllowed,
} from '../src/systems/economyExperience.js';

test('Task 38: rewarded surface is impossible during the first minute', () => {
  assert.equal(REWARDED_OFFER_MIN_SESSION_SECONDS, 60);
  assert.equal(rewardedOfferSurfaceAllowed({ sessionTime: 0 }), false);
  assert.equal(rewardedOfferSurfaceAllowed({ sessionTime: 59.999 }), false);
  assert.equal(rewardedOfferSurfaceAllowed({ sessionTime: 60 }), true);
  assert.equal(rewardedOfferSurfaceAllowed({ sessionTime: 125 }), true);
});

test('Task 38: sheets, pause and active joystick suppress the offer surface', () => {
  const base = { sessionTime: 90 };
  assert.equal(rewardedOfferSurfaceAllowed({ ...base, sheetOpen: true }), false);
  assert.equal(rewardedOfferSurfaceAllowed({ ...base, userPaused: true }), false);
  assert.equal(rewardedOfferSurfaceAllowed({ ...base, inputActive: true }), false);
  assert.equal(rewardedOfferSurfaceAllowed(base), true);
});

test('Task 38: collapsed offers expose one concrete benefit and AD disclosure', () => {
  const cases = [
    [{ mode: 'crew', reward: 0 }, '+1 TIER', 'RUSH CREW'],
    [{ mode: 'petBreak', duration: 18 }, '18s', 'PLAY BREAK'],
    [{ mode: 'roomba', duration: 20 }, '20s', 'ROOMBA'],
    [{ mode: 'coins', reward: 75 }, '+75', 'COINS'],
  ];
  for (const [model, value, label] of cases) {
    const compact = compactRewardedOfferModel(model, false);
    assert.equal(compact.value, value);
    assert.equal(compact.label, label);
    assert.equal(compact.badge, 'AD');
    assert.match(compact.icon, /^<svg /, `${label} must use an authored pictogram`);
  }
  assert.equal(compactRewardedOfferModel({ mode: 'coins', reward: 20 }, true).badge, 'DEV · AD');
});

test('Task 38: collapsed markup cannot hide ad disclosure or auto-render explanatory copy', () => {
  const source = fs.readFileSync(new URL('../src/systems/economyExperience.js', import.meta.url), 'utf8');
  assert.match(source, /class=\"relief-pill-ad\"/);
  assert.match(source, /class=\"relief-benefit-icon\"/);
  assert.doesNotMatch(source, /OPTIONAL · RUSH HELP/);
  assert.match(source, /pill\.addEventListener\('click',[^\n]*expanded = true/);
  assert.match(source, /if \(!next \|\| !model \|\| next\.key !== model\.key\) expanded = false/);
});

test('Task 38: compact surface is anchored away from the left floating-joystick lane', () => {
  const source = fs.readFileSync(new URL('../src/systems/economyExperience.js', import.meta.url), 'utf8');
  assert.match(source, /\.relief-root\{position:fixed;right:/);
  assert.match(source, /calc\(100vw - 142px/,
    'collapsed width must reserve a substantial left-side lane for the floating joystick');
  assert.match(source, /@media\(max-width:360px\)/);
  assert.match(source, /@media\(max-height:520px\)/);
});
