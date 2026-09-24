// test/modal.test.js — every sheet pauses the café, whichever door opened it.
//
// Before Batch D the Café menu set G.userPaused, but the same Pet Book opened from the HUD chip did
// not, nor the Shop at the staff desk: guests' patience drained while the player shopped. Every
// sheet now opens through src/ui/modal.js. These tests pin its rule on a fake game object; the live
// probe (tools/ux-redesign-smoke.mjs) proves each real door goes through it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bindModalHost, openModal, closeModal, isModalOpen } from '../src/ui/modal.js';
import { presentationScheduler } from '../src/core/presentationScheduler.js';

const game = () => ({ userPaused: false, P: { vx: 3, vz: -2 }, _force: { x: 1, z: 0 } });

test('opening a sheet pauses the simulation and presentation, and stops the owner where he stands', () => {
  const G = game(); bindModalHost(G);
  openModal('petbook');
  assert.equal(G.userPaused, true);
  assert.equal(presentationScheduler.pauseReasons.has('modal'), true);
  assert.deepEqual([G.P.vx, G.P.vz, G._force], [0, 0, null]);
  closeModal('petbook');
  assert.equal(G.userPaused, false);
  assert.equal(presentationScheduler.pauseReasons.has('modal'), false);
  assert.equal(isModalOpen(), false);
});

test('a sheet over a sheet: only the last close resumes play', () => {
  const G = game(); bindModalHost(G);
  openModal('cafe'); openModal('shop');
  assert.equal(isModalOpen('shop') && isModalOpen('cafe'), true);
  // The Café card hands over to a tile: the tile's sheet opens first, then the card closes.
  closeModal('cafe');
  assert.equal(G.userPaused, true, 'still paused: the Shop is open');
  closeModal('shop');
  assert.equal(G.userPaused, false);
});

test('the same sheet opened twice is one entry, and closing an unopened sheet is a no-op', () => {
  const G = game(); bindModalHost(G);
  assert.equal(openModal('sheet'), true);
  assert.equal(openModal('sheet'), false);
  assert.equal(closeModal('nothing'), false);
  closeModal('sheet');
  assert.equal(isModalOpen(), false);
  assert.equal(G.userPaused, false);
});

test('binding a game while a sheet is already open paints it paused', () => {
  openModal('summary');
  const G = game(); bindModalHost(G);
  assert.equal(G.userPaused, true);
  closeModal('summary');
  assert.equal(G.userPaused, false);
});

test('every sheet opens through the helper: Café card, Shop/pantry/summary host, Pet Book, Café Stars', () => {
  const read = rel => fs.readFileSync(new URL(`../src/ui/${rel}`, import.meta.url), 'utf8');
  assert.match(read('pauseMenu.js'), /openModal\('cafe'/);
  assert.match(read('sheets.js'), /openModal\('sheet'/, 'the one host for the Shop, the pantry and the day summary');
  assert.match(read('meta.js'), /openModal\('petbook'/);
  assert.match(read('pawSheet.js'), /openModal\('stars'/);
  // ...and nothing sets the pause flag by hand any more.
  for (const f of ['pauseMenu.js', 'sheets.js', 'meta.js', 'pawSheet.js', 'shop.js']) {
    assert.doesNotMatch(read(f), /userPaused\s*=\s*(true|false)/, `${f} must not set G.userPaused itself`);
  }
  // main.js binds the game before G.restore can reopen a finished day's summary.
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(main.indexOf('bindModalHost(G)') > 0 && main.indexOf('bindModalHost(G)') < main.indexOf('G.restore(load.data)'));
});
