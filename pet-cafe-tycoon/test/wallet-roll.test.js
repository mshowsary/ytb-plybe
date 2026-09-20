// test/wallet-roll.test.js — the wallet numeral always lands on the real balance.
//
// src/ui/hud.js rolled the numeral up over 350 ms and only wrote it while the roll was in
// progress. A frame gap longer than the roll (YouTube pause/resume, a background tab, a GC hitch)
// jumped straight past that branch, and the wallet kept the old number until the next coin change:
// measured live as 9,731,169 on the HUD against 4,210 in the pause card. createWalletRoll is the
// roll as a pure clock-driven state; H.update draws whatever it returns.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createWalletRoll, WALLET_ROLL_MS } from '../src/ui/hud.js';

test('a frame that arrives after the whole roll has elapsed draws the target, not the old value', () => {
  const roll = createWalletRoll();
  roll.set(777, 1000);
  // The main thread was blocked for 500 ms: the very first frame after setCoins is already late.
  assert.equal(roll.frame(1000 + 500), 777);
  assert.equal(roll.shown, 777);
  // Settled: nothing more to draw until the balance changes again.
  assert.equal(roll.frame(1000 + 600), null);
});

test('an ordinary roll eases up and its last frame is exactly the target', () => {
  const roll = createWalletRoll();
  roll.set(100, 0);
  const mid = roll.frame(WALLET_ROLL_MS / 2);
  assert.ok(mid > 0 && mid < 100, `mid-roll value ${mid} is between the old and new balance`);
  assert.equal(roll.frame(WALLET_ROLL_MS), 100);
  assert.equal(roll.frame(WALLET_ROLL_MS + 16), null);
});

test('a new balance mid-roll starts from what is on screen, and still lands exactly', () => {
  const roll = createWalletRoll();
  roll.set(1000, 0);
  const onScreen = roll.frame(100);
  roll.set(40, 100);
  const next = roll.frame(150);
  assert.ok(next < onScreen && next > 40, 'rolls down from the drawn value, not from 0 or 1000');
  assert.equal(roll.frame(100 + WALLET_ROLL_MS * 3), 40);
});

test('the HUD draws the numeral from the roll on every frame it returns a value', () => {
  // The call path from normal play: game.js calls hud.setCoins on every wallet change and
  // hud.update() every frame; both must go through the roll, and update must write its value.
  const src = fs.readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
  assert.match(src, /H\.setCoins = n => \{\s*roll\.set\(n, performance\.now\(\)\)/);
  assert.match(src, /const v = roll\.frame\(performance\.now\(\)\);\s*if \(v != null\) \{ num\.textContent = fmt\(v\);/);
});
