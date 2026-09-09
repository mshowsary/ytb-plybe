import test from 'node:test';
import assert from 'node:assert/strict';
import { PET_PROFILES, PET_SPECIES } from '../src/sim/petBook.js';
import { petAppearance, petAppearanceCount } from '../src/render/petAppearance.js';

test('all 20 stable Pet Book identities have authored render metadata', () => {
  assert.equal(petAppearanceCount(), 20);
  for (const species of PET_SPECIES) {
    assert.equal(PET_PROFILES[species].length, 5);
    for (let variant = 0; variant < 5; variant++) {
      const look = petAppearance(species, variant);
      assert.ok(look.size > 0 && look.width > 0 && look.height > 0 && look.length > 0);
      assert.match(look.pattern, /^(tabby|tuxedo|mask|calico|constellation|saddle|cloud|blaze|nose)$/);
    }
  }
});

test('each species varies silhouette as well as coat treatment', () => {
  for (const species of PET_SPECIES) {
    const looks = [0, 1, 2, 3, 4].map(variant => petAppearance(species, variant));
    assert.ok(new Set(looks.map(x => `${x.size}:${x.width}:${x.height}:${x.length}:${x.head}`)).size >= 4, `${species} needs distinct proportions`);
    assert.ok(new Set(looks.map(x => x.pattern)).size >= 4, `${species} needs distinct markings`);
  }
});
