import test from 'node:test';
import assert from 'node:assert/strict';
import { refillLessonNeed } from '../src/ui/interactionCoach.js';

function game({ coffeeBeans = 0, bowlStock = 5, activeCoffee = true, activeBowl = true } = {}) {
  const stations = new Map([
    ['coffee1', { id: 'coffee1', type: 'coffee', active: activeCoffee, beans: coffeeBeans, front: { x: 2, z: 0 } }],
    ['bowl1', { id: 'bowl1', type: 'bowl', active: activeBowl, stock: bowlStock, capacity: 10, front: { x: 4, z: 0 } }],
  ]);
  return { world: { stations }, carry: { sack: null, sackLeft: 0 }, P: { x: 0, z: 0 } };
}

test('refill lesson triggers only when the real consumable is empty', () => {
  assert.equal(refillLessonNeed(game({ coffeeBeans: 4, bowlStock: 3 }), new Set()), null);
  const coffee = refillLessonNeed(game({ coffeeBeans: 0, bowlStock: 3 }), new Set());
  assert.equal(coffee.key, 'refillCoffee');
  assert.equal(coffee.supply, 'beans');
});

test('pet treat refill lesson asks for kibble', () => {
  const G = game({ coffeeBeans: 4, bowlStock: 0 });
  const lesson = refillLessonNeed(G, new Set());
  assert.equal(lesson.key, 'refillBowl');
  assert.equal(lesson.supply, 'kibble');
  assert.equal(lesson.label, 'PET TREATS');
});

test('completed lessons do not return and inactive stations never coach', () => {
  const seen = new Set(['refillCoffee']);
  assert.equal(refillLessonNeed(game({ coffeeBeans: 0, bowlStock: 3 }), seen), null);
  assert.equal(refillLessonNeed(game({ coffeeBeans: 0, bowlStock: 3, activeCoffee: false }), new Set()), null);
});
