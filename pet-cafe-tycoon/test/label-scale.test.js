// test/label-scale.test.js
//
// Guards the two halves of the world-label work:
//
//   1. the REGISTRY — `.pet-identity` was the only projected label class missing from the arbiter's
//      table, so pet name tags drew at raw projected coordinates and got clipped by `#fx`'s own
//      `overflow:hidden` (the owner's screenshot shows "Biscuit" as "cuit" at the left edge). The
//      registry assertion below is deliberately about the TABLE, not about the fix: any future
//      label class that forgets to register must fail here.
//   2. the SCALE POLICY — the owner's report is that a price pill comes out the size of a customer's
//      head on a phone, and that resizing the window never changes it. A label is drawn at a fixed
//      pixel size while a character is a fixed WORLD size, so the only way to hold that ratio is to
//      scale labels with worldPerPixel(). The tests below pin exactly that, and explicitly NOT the
//      earlier "protect small desktop windows" behaviour, which was backwards for this game and is
//      what left portrait at 0.79 when the character-relative factor was 0.48.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { labelScalePolicy } from '../src/ui/labelLayout.js';

const SRC = readFileSync(new URL('../src/ui/labelLayout.js', import.meta.url), 'utf8');
const FOV = 40;
const TAN_HALF = Math.tan(FOV * Math.PI / 360);

// Mirrors the two constants documented in labelLayout.js. Pinned here on purpose: if either moves,
// the character-relative guarantee below changes and this test should be what notices.
const REF_WORLD_PER_PX = 0.0127;
const LABEL_SCALE_MIN = 0.5;

// Mirrors scene.js's resize(): a fixed number of METRES is fitted across the viewport, and the
// camera distance follows from it. Duplicated here deliberately — if scene.js changes its framing,
// this test should be the thing that notices the label scale went stale.
function cameraDistance(aspect) {
  const want = aspect <= 0.8 ? 10
    : aspect >= 1.25 ? 16.25
      : aspect <= 1 ? 10 + (13 - 10) * ((aspect - 0.8) / 0.2)
        : 13 + (16.25 - 13) * ((aspect - 1) / 0.25);
  return want / (2 * TAN_HALF * aspect);
}
const worldPerPixel = (w, h) => 2 * cameraDistance(w / h) * TAN_HALF / h;

test('every projected label class is registered with the arbiter', () => {
  // The registry is the ANCHORS table; MANAGED (and therefore `layout.managed`) is derived from it.
  for (const cls of ['.wish', '.patience', '.demand', '.chalk', '.objCaption', '.zlabel', '.zprice', '.fbtn', '.polaroid', '.pet-identity']) {
    assert.match(
      SRC,
      new RegExp(`^\\s*\\['${cls.replace('.', '\\.')}',`, 'm'),
      `${cls} must be registered in ANCHORS — an unregistered class is invisible to the solver`,
    );
  }
});

test('the pet tag hangs above its anchor, like a wish bubble', () => {
  assert.match(SRC, /^\s*\['\.pet-identity', 0\.5, 1\.0\],/m);
});

test('gameplay-bearing pet tag states outrank the bare tag', () => {
  // PRIORITY is scanned in order and the first match wins, so the compound rows must come first —
  // otherwise a play-break offer would be ranked as disposable flavour.
  const playBreak = SRC.indexOf("['.pet-identity.play-break'");
  const greeting = SRC.indexOf("['.pet-identity.regular-greeting'");
  const bare = SRC.indexOf("['.pet-identity', 52]");
  assert.ok(playBreak > -1 && greeting > -1 && bare > -1, 'all three pet-tag priorities must exist');
  assert.ok(playBreak < bare && greeting < bare, 'compound pet-tag rows must precede the bare row');
  assert.match(SRC, /const HIDEABLE = new Set\(\['\.chalk', '\.demand', '\.pet-identity'\]\)/);
});

test('labels are drawn at full size at the reference camera', () => {
  // 1280x720 IS the reference: any change here silently resizes every shipped desktop label.
  assert.equal(labelScalePolicy(worldPerPixel(1280, 720)), 1);
});

test('label size tracks CHARACTER size, not viewport size', () => {
  // The property that answers the owner's report. labelPx = BASE * scale and characterPx =
  // HEAD_WORLD / worldPerPixel, so (labelPx / characterPx) is proportional to scale * worldPerPixel.
  // Wherever neither the ceiling nor the floor binds, scale is exactly REF/worldPerPixel, so that
  // product is exactly the reference constant — a bubble keeps the same size relative to a customer
  // no matter how the window is sized. 1280x720 is excluded because there scale is CAPPED at 1 (its
  // own worldPerPixel is a hair under REF, which is itself a rounded constant); that case is pinned
  // by the "full size at the reference camera" test above.
  for (const [w, h] of [[1024, 768], [800, 600], [600, 900], [450, 800]]) {
    const wpp = worldPerPixel(w, h);
    const s = labelScalePolicy(wpp);
    assert.ok(s > LABEL_SCALE_MIN && s < 1, `${w}x${h} should be neither floored nor capped (got ${s})`);
    assert.ok(
      Math.abs(s * wpp - REF_WORLD_PER_PX) < 1e-12,
      `${w}x${h}: scale*worldPerPixel = ${s * wpp}, expected the constant ${REF_WORLD_PER_PX}`,
    );
  }
});

test('a phone no longer draws bubbles the size of a customer head', () => {
  // The regression that started this. At 380x670 the character-relative factor is ~0.48; the old
  // width-floor policy shipped 0.79 there, which is what put a price pill level with a head. The
  // floor now caps it at 0.5, so this asserts the fix and not merely "less than 1".
  const s = labelScalePolicy(worldPerPixel(380, 670));
  assert.ok(Math.abs(s - LABEL_SCALE_MIN) < 1e-12, `expected the absolute floor, got ${s}`);
  assert.ok(s <= 0.52, `portrait must sit near the floor, got ${s}`);

  // And the same viewport under the OLD rule, for contrast: width/480 clamped into [0.78, 1].
  const oldRule = Math.min(1, Math.max(0.78, 380 / 480));
  assert.ok(s < oldRule - 0.25, `expected a material reduction from the old ${oldRule}, got ${s}`);
});

test('the floor binds only on genuinely narrow viewports', () => {
  // 450px wide is already unclamped; 380 and 320 are not. If this inverts, the floor has grown into
  // the role the width term used to play and the character-relative property is gone again.
  assert.ok(labelScalePolicy(worldPerPixel(450, 800)) > LABEL_SCALE_MIN);
  assert.equal(labelScalePolicy(worldPerPixel(380, 670)), LABEL_SCALE_MIN);
  assert.equal(labelScalePolicy(worldPerPixel(320, 568)), LABEL_SCALE_MIN);
});

test('scale stays inside the floor/ceiling band across every viewport shape', () => {
  for (const [w, h] of [[320, 568], [377, 668], [380, 670], [450, 800], [600, 900], [768, 1024],
    [800, 600], [1024, 768], [1280, 720], [1920, 1080], [2560, 1080]]) {
    const s = labelScalePolicy(worldPerPixel(w, h));
    assert.ok(s >= LABEL_SCALE_MIN && s <= 1, `${w}x${h} produced ${s}`);
  }
});

test('scale never grows as the camera pulls back', () => {
  let prev = Infinity;
  for (const wpp of [0.008, 0.0127, 0.02, 0.03, 0.05, 0.1]) {
    const s = labelScalePolicy(wpp);
    assert.ok(s <= prev + 1e-12, `scale rose as the camera pulled back: ${prev} -> ${s}`);
    prev = s;
  }
  assert.ok(prev < 1, 'a far camera must actually reduce the scale');
});

test('degenerate camera input falls back to the reference look', () => {
  for (const bad of [NaN, 0, -1, Infinity, undefined, null]) {
    assert.equal(labelScalePolicy(bad), 1, `worldPerPixel=${bad} must not scale labels`);
  }
});
