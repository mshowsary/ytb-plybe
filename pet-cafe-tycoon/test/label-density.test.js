// test/label-density.test.js — the two rules that stop a rush turning into icon soup.
//
// THE DEFECT. Every label system projects a world point and writes style.left/top; the arbiter then
// clamped whatever it was handed into the safe box. For a guest standing off the side of the frame
// that clamp is a lie: it drags a bubble belonging to somebody the player cannot see onto the frame
// edge, and because every off-screen guest clamps to the SAME edge they stack into a column there.
// Measured on the shipped build during a rush: 21 labels at 380x670 with a column of 4 against the
// border, 20 at 1280x720 with a column of 4.
//
// THE RULES. A label whose own ANCHOR is outside the viewport hides instead of being dragged in, and
// past a density threshold only the nearest few are drawn at all. Both are asserted here against the
// real arbiter, driven through a DOM small enough to state exactly what it does: an element is a
// rect with a class, getComputedStyle answers what the arbiter actually reads, and nothing else
// exists. That is enough, because everything this file is about is arithmetic on rects.
//
// The properties that matter are the SAFETY ones, and they are the ones a later tuning pass would
// break first: a label anchored on screen is never hidden by the off-screen rule, and a tap target
// or a station's need bubble is never hidden by either rule.
import test from 'node:test';
import assert from 'node:assert/strict';

// ---- the smallest DOM the arbiter will accept -------------------------------------------------
function makeEl(className, w = 44, h = 44, ox = -22, oy = -44) {
  const classes = new Set(String(className).split(/\s+/).filter(Boolean));
  const el = {
    className,
    dataset: {},
    _w: w, _h: h, _ox: ox, _oy: oy, _opacity: 1, _display: 'block',
    style: { left: '', top: '', setProperty() {} },
    classList: {
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      contains: c => classes.has(c),
      toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); },
    },
    matches(sel) { return sel.split('.').filter(Boolean).every(c => classes.has(c)); },
    getBoundingClientRect() {
      const l = parseFloat(el.style.left) || 0, t = parseFloat(el.style.top) || 0;
      return { left: l + el._ox, top: t + el._oy, width: el._w, height: el._h,
        right: l + el._ox + el._w, bottom: t + el._oy + el._h };
    },
    setAttribute() {}, appendChild() {}, remove() {},
    get hidden() { return classes.has('label-crowded'); },
  };
  return el;
}

function installDom(vw, vh) {
  const root = {
    _children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    style: { setProperty() {} },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: vw, height: vh, right: vw, bottom: vh }),
    querySelectorAll(sel) {
      const rows = sel.split(',');
      return root._children.filter(el => rows.some(r => el.matches(r.trim())));
    },
  };
  globalThis.innerWidth = vw;
  globalThis.innerHeight = vh;
  globalThis.addEventListener = () => {};
  globalThis.getComputedStyle = el => ({
    display: el._display || 'block', visibility: 'visible', opacity: String(el._opacity ?? 1),
    filter: 'none', paddingLeft: '0px', paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px',
  });
  globalThis.document = {
    getElementById: () => null,
    createElement: () => makeEl(''),
    querySelectorAll: () => [],
    head: { appendChild() {} },
    body: { appendChild() {} },
  };
  return root;
}

// A wish bubble anchored at (x, y): the arbiter reads the position its owning system wrote.
function place(root, cls, x, y, size = 44) {
  const el = makeEl(cls, size, size, -size / 2, -size);
  el.style.left = x + 'px'; el.style.top = y + 'px';
  root._children.push(el);
  return el;
}
const shown = el => !el.classList.contains('label-crowded');

async function arbiter(root) {
  const { createLabelLayout } = await import('../src/ui/labelLayout.js');
  return createLabelLayout({ fx: root }, { worldPerPixel: () => 0.0127 });
}

// ---- 1. an off-screen anchor hides -------------------------------------------------------------

test('a bubble whose guest is off the side of the frame is dropped, not dragged to the edge', async () => {
  const root = installDom(380, 670);
  const off = place(root, 'wish', -120, 300);     // a guest well past the left edge
  const on = place(root, 'wish', 190, 300);       // one in the middle of the room
  const edge = place(root, 'wish', 30, 306);      // and one standing near, but inside, that edge
  const layout = await arbiter(root);
  layout.update();
  assert.equal(shown(off), false, 'the off-screen guest keeps its bubble off screen');
  assert.equal(shown(on), true);
  // And the shipped behaviour it replaces, which is the actual defect: the clamped bubble used to
  // sit at the frame edge and PUSH the real ones out of the way. A hidden one reserves no space, so
  // the guest who genuinely is near the edge keeps the position their own system asked for.
  assert.equal(shown(edge), true);
  assert.equal(edge.style.top, '306px', `the real bubble was displaced to ${edge.style.top}`);
});

test('every side of the viewport counts, and only outside it', async () => {
  const root = installDom(380, 670);
  const cases = [
    ['left', -5, 300, false], ['right', 385, 300, false],
    ['above', 190, -5, false], ['below', 190, 675, false],
    ['just inside left', 2, 300, true], ['just inside bottom', 190, 668, true],
  ];
  const els = cases.map(([, x, y]) => place(root, 'wish', x, y));
  const layout = await arbiter(root);
  layout.update();
  cases.forEach(([name, , , want], i) => assert.equal(shown(els[i]), want, `${name}`));
});

test('nothing whose anchor is on screen is ever hidden by the off-screen rule', async () => {
  // The rule tests the ANCHOR the owning system wrote, not where the solver put the pill — so a
  // label pushed hard against the frame edge by the declutter pass still counts as on screen.
  const root = installDom(380, 670);
  const els = [];
  for (let i = 0; i < 4; i++) els.push(place(root, 'wish', 190, 100 + i * 2)); // four anchors on top of each other
  const layout = await arbiter(root);
  layout.update();
  for (const el of els) assert.equal(shown(el), true, 'an on-screen anchor survives the solve');
});

test('the in-world action button is exempt: a control is never hidden', async () => {
  const root = installDom(380, 670);
  const btn = place(root, 'fbtn', -200, 300, 48);
  const layout = await arbiter(root);
  layout.update();
  assert.equal(shown(btn), true, 'hiding a tap target is never the right answer');
});

// ---- 2. density: past the threshold, only the nearest few --------------------------------------

test('a crowded café draws the nearest few labels and drops the rest', async () => {
  const root = installDom(1280, 720);
  // Fourteen wish bubbles spread across the frame — a rush at a register, which is where the owner
  // photographed the wall of pills. They are placed outward from the centre so "nearest" is known.
  const els = [];
  for (let i = 0; i < 14; i++) els.push(place(root, 'wish', 640 + (i % 2 ? 1 : -1) * (20 + i * 22), 360 + i * 6));
  const layout = await arbiter(root);
  layout.update();
  const drawn = els.filter(shown);
  assert.ok(drawn.length >= 6 && drawn.length <= 8, `expected a handful, drew ${drawn.length} of 14`);
  // And the ones kept are the ones nearest the middle of the frame, which is where the owner is.
  const kept = new Set(drawn);
  for (let i = 0; i < els.length; i++) {
    if (i >= drawn.length) assert.equal(kept.has(els[i]), false, `label ${i} is further out and should have gone`);
  }
});

test('under the threshold nothing is dropped at all', async () => {
  const root = installDom(1280, 720);
  const els = [];
  for (let i = 0; i < 4; i++) els.push(place(root, 'wish', 400 + i * 120, 300));
  const layout = await arbiter(root);
  layout.update();
  assert.equal(els.filter(shown).length, 4, 'a quiet café shows everything');
});

test('a station NEED and a tap target are never counted out by density', async () => {
  const root = installDom(1280, 720);
  for (let i = 0; i < 14; i++) place(root, 'wish', 640 + (i % 2 ? 1 : -1) * (20 + i * 22), 360 + i * 6);
  // Both sit further from the centre than every bubble above, so distance alone would drop them.
  const need = place(root, 'demand need', 1180, 80);
  const btn = place(root, 'fbtn', 90, 650, 48);
  const layout = await arbiter(root);
  layout.update();
  assert.equal(shown(need), true, 'a station asking for the player is not ambient flavour');
  assert.equal(shown(btn), true, 'and a control is not either');
});

test('a wish bubble and its patience bar are dropped together or not at all', async () => {
  // They are one unit (dataset.labelGroup). A bar left behind by a culled bubble is a stray green
  // line floating over a guest with no bubble — worse than either outcome.
  const root = installDom(1280, 720);
  const pairs = [];
  for (let i = 0; i < 14; i++) {
    const bubble = place(root, 'wish', 640 + (i % 2 ? 1 : -1) * (20 + i * 22), 360 + i * 6);
    const bar = place(root, 'patience', 640 + (i % 2 ? 1 : -1) * (20 + i * 22), 366 + i * 6, 44);
    bubble.dataset.labelGroup = 'g' + i; bar.dataset.labelGroup = 'g' + i;
    pairs.push([bubble, bar]);
  }
  const layout = await arbiter(root);
  layout.update();
  for (const [bubble, bar] of pairs) {
    assert.equal(shown(bubble), shown(bar), 'a bubble and its bar must agree');
  }
});

test('a label comes back when the crowd thins', async () => {
  const root = installDom(1280, 720);
  const els = [];
  for (let i = 0; i < 14; i++) els.push(place(root, 'wish', 640 + (i % 2 ? 1 : -1) * (20 + i * 22), 360 + i * 6));
  const layout = await arbiter(root);
  layout.update();
  const dropped = els.find(el => !shown(el));
  assert.ok(dropped, 'something was dropped to begin with');
  // Guests leave. The arbiter must NOT have written the dropped label out of its own candidate set:
  // it is hidden with a filter, so it still measures at its owner's opacity and is solved again.
  root._children = root._children.filter(el => els.indexOf(el) > 9 || el === dropped);
  layout.update();
  assert.equal(shown(dropped), true, 'a label hidden by density must return once there is room');
});
