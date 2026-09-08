// test/play-field-text.test.js — the play field draws pictures, never sentences.
//
// The owner's requirement, verbatim: "these type of games from the competitor tends to have less
// text to no text at all, only visuals icons, dialogue or demos." Program rule 5 turns that into a
// hard line: no English prose is DRAWN over the 3D world. Menus and sheets are exempt — the Pet
// Book, the Café Journey, the kiosk and the shift summary may use all the words they like, because
// the player has stopped playing to read them. A banner, a toast, a floating button or the
// objective caption is not a menu: it sits over the world while the world is moving.
//
// This file is a STATIC guard, not a behaviour test. It reads the source of the surfaces that draw
// over the world and checks their shape:
//
//   A. every banner/toast call takes a cue(), never a string
//   B. every cue()'s CELLS carry only pictograms, numerals, punctuation and proper nouns
//   C. every world-anchored control paints itself from the cue helpers, never from textContent
//   D. no emoji leak into any of the above
//
// The words themselves are not deleted anywhere — they move into a cue's second argument, which is
// the accessible name, and into the .cueSr span that rides inside the element. Checking the SHAPE
// rather than grepping for banned phrases is what makes this survive new features: a banner added
// next month has to be built out of glyphs to compile past this file, whatever it wants to say.
//
// PLAY_FIELD_SRC exists so the same guard can be pointed at a checkout of an earlier revision to
// demonstrate that it fails there. Nothing in the game reads it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.env.PLAY_FIELD_SRC
  ? path.resolve(process.env.PLAY_FIELD_SRC)
  : path.resolve(new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

// Every file that owns a surface drawn over the 3D world.
const PLAY_FIELD_FILES = [
  'game.js',
  'ui/hud.js',
  'ui/meta.js',
  'systems/objective.js',
  'systems/petSocials.js',
  'systems/rewardsSystem.js',
  'systems/economyExperience.js',
  'systems/stations.js',
  'systems/partyOrders.js',
  'systems/customers.js',
  'systems/guestCare.js',
];

const read = rel => fs.readFileSync(path.join(SRC, rel), 'utf8');

// ---- source scanning ---------------------------------------------------------------------------
// A tiny bracket matcher that understands JS string and template literals, line comments and block
// comments, so a "(" inside a comment or a quoted glyph never throws the balance off. It is not a
// parser and does not need to be: it only has to find the end of one argument list.
function matchBracket(src, open) {
  const CLOSE = { '(': ')', '[': ']', '{': '}' };
  const want = CLOSE[src[open]];
  let depth = 0, i = open;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) return -1; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i); if (i < 0) return -1; i += 2; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c; i++;
      while (i < src.length && src[i] !== quote) { if (src[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) return c === want ? i : -1; }
    i++;
  }
  return -1;
}

// Splits an argument list (or array literal) body on its TOP-LEVEL commas only.
function splitTopLevel(body) {
  const out = []; let depth = 0, start = 0, i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === "'" || c === '"' || c === '`') {
      const quote = c; i++;
      while (i < body.length && body[i] !== quote) { if (body[i] === '\\') i++; i++; }
      i++; continue;
    }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { out.push(body.slice(start, i).trim()); start = i + 1; }
    i++;
  }
  const tail = body.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

// Every call of `name(` in a file, as { index, args: [rawArgText, …] }.
function callsTo(src, name) {
  const out = [];
  const needle = new RegExp(`(^|[^\\w$.])${name}\\s*\\(`, 'g');
  let m;
  while ((m = needle.exec(src))) {
    const open = src.indexOf('(', m.index + m[0].length - 1);
    const close = matchBracket(src, open);
    if (close < 0) continue;
    out.push({ index: open, args: splitTopLevel(src.slice(open + 1, close)) });
  }
  return out;
}

// The four sinks that paint over the world. `.banner(` / `.toast(` in any receiver shape the code
// actually uses: hud.banner, ctx.hud.toast, metaUI.toast, M.toast, G.hud?.banner?.(…).
function sinkCalls(src) {
  const out = [];
  const needle = /\.(banner|toast)\s*\??\.?\s*\(/g;
  let m;
  while ((m = needle.exec(src))) {
    const open = src.indexOf('(', m.index);
    const close = matchBracket(src, open);
    if (close < 0) continue;
    const args = splitTopLevel(src.slice(open + 1, close));
    out.push({ kind: m[1], first: args[0] || '', line: src.slice(0, m.index).split('\n').length });
  }
  return out;
}

// ---- what a drawn cell may be -------------------------------------------------------------------
// A pictogram call: anything ending in Icon(), the product-icon selector, or a lookup into one of
// the icon tables. The ARGUMENTS of these are exempt from the word rule — `iconFor('coffee')`
// chooses a picture, it does not print the word "coffee".
const ICON_EXPR = /^(?:[A-Za-z_$][\w$]*Icon\s*\(|iconFor\s*\(|[A-Z][A-Z0-9_]*_ICON\s*\[|\{\s*swatch\s*:)/;
// A quoted literal holding a real word. Two letters or more, so a punctuation cell like '%' or a
// unit like '/' is fine and a sentence is not. Unicode escapes ('→') never match.
const QUOTED_WORD = /(['"`])(?:\\.|(?!\1)[\s\S])*?\1/g;
function hasWord(text) {
  // A `${…}` inside a template literal is an expression, not drawn text: `+${up.bonus}%` prints
  // "+9%". What the expression evaluates to is governed by the same rule as a bare cell — a numeral
  // or a proper noun off the model — so only the literal parts are checked here.
  const literalOnly = String(text).replace(/\$\{[^}]*\}/g, '');
  let m; QUOTED_WORD.lastIndex = 0;
  while ((m = QUOTED_WORD.exec(literalOnly))) if (/[A-Za-z]{2,}/.test(m[0])) return true;
  return false;
}
// Emoji, or anything else outside the Latin/punctuation planes that a font would render in colour.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

test('A. every banner and toast on the play field is built from a cue, never from a string', () => {
  const offenders = [];
  for (const rel of PLAY_FIELD_FILES) {
    const src = read(rel);
    for (const call of sinkCalls(src)) {
      // hud.js defines the sinks; it does not call them.
      if (rel === 'ui/hud.js') continue;
      const first = call.first;
      // A cue() anywhere in the first argument (a plain call, or either arm of a ternary), or a
      // named all-caps cue helper such as stations.js's NOT_ENOUGH_COINS().
      const ok = /(^|[^\w$.])cue\s*\(/.test(first) || /^[A-Z][A-Z0-9_]*\s*\(\s*\)$/.test(first);
      if (!ok) offenders.push(`${rel}:${call.line}  .${call.kind}(${first.slice(0, 72)})`);
    }
  }
  assert.deepEqual(offenders, [], `play-field ${offenders.length} banner/toast call(s) still pass text:\n  ${offenders.join('\n  ')}`);
});

test('B. a cue draws only pictograms, numerals, punctuation and proper nouns', () => {
  const offenders = [];
  for (const rel of PLAY_FIELD_FILES) {
    const src = read(rel);
    for (const call of callsTo(src, 'cue')) {
      const cells = call.args[0] || '';
      const line = src.slice(0, call.index).split('\n').length;
      // hud.js's own `export function cue(cells, aria)` is the definition, not a call.
      if (!cells.startsWith('[')) {
        if (rel === 'ui/hud.js') continue;
        offenders.push(`${rel}:${line}  cue() cells must be an array literal, got ${cells.slice(0, 40)}`);
        continue;
      }
      const close = matchBracket(cells, 0);
      for (const cell of splitTopLevel(cells.slice(1, close))) {
        if (!cell) continue;
        if (ICON_EXPR.test(cell)) continue;          // a drawn picture
        if (EMOJI.test(cell)) { offenders.push(`${rel}:${line}  emoji cell ${cell}`); continue; }
        // Anything else may not contain a quoted word. A numeral, an arithmetic expression, or a
        // proper noun read off the model (discovery.profile.name) all pass; 'COINS' does not.
        if (hasWord(cell)) offenders.push(`${rel}:${line}  worded cell ${cell.slice(0, 48)}`);
      }
      // The SECOND argument is the accessible name and is deliberately a full sentence. It is the
      // only place on this surface where English is allowed, and it must be present.
      const aria = call.args[1] || '';
      if (rel !== 'ui/hud.js' && !aria) offenders.push(`${rel}:${line}  cue() without aria text`);
    }
  }
  assert.deepEqual(offenders, [], `cue cells carrying prose:\n  ${offenders.join('\n  ')}`);
});

// The world-anchored controls: a floating button over a guest, over the party crate, the Pet Social
// launcher, the Mystery Gift chip, the objective caption, the party-order HUD chip. Each is named
// by the variable or class its own file uses, so this survives the file being reformatted.
const WORLD_CONTROLS = [
  ['systems/objective.js', ['caption']],
  ['systems/petSocials.js', ['launch']],
  ['systems/guestCare.js', ['button']],
  ['systems/partyOrders.js', ['collect', 'btn', 'party-order-progress']],
  ['systems/rewardsSystem.js', ['mysteryChip']],
];

// Every `.textContent =` / `.innerHTML =` in a file, with the receiver text that precedes it and
// the right-hand side up to the end of that statement. Statement-scoped rather than line-scoped
// because a chip's markup is routinely a multi-line template literal, and a line scan would read
// only its opening backtick.
function assignments(src) {
  const out = [];
  const re = /\.(textContent|innerHTML)\s*=(?!=)/g;
  let m;
  while ((m = re.exec(src))) {
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const receiver = src.slice(Math.max(lineStart, m.index - 160), m.index);
    let i = m.index + m[0].length, depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === "'" || c === '"' || c === '`') {
        const quote = c; i++;
        while (i < src.length && src[i] !== quote) { if (src[i] === '\\') i++; i++; }
        i++; continue;
      }
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) { if (depth === 0) break; depth--; }
      else if ((c === ';' || c === '\n') && depth === 0) break;
      i++;
    }
    out.push({ kind: m[1], receiver, rhs: src.slice(m.index + m[0].length, i), line: src.slice(0, m.index).split('\n').length });
  }
  return out;
}

test('C. world-anchored controls paint glyphs, never textContent', () => {
  const offenders = [];
  for (const [rel, tokens] of WORLD_CONTROLS) {
    for (const a of assignments(read(rel))) {
      if (!tokens.some(t => a.receiver.includes(t))) continue;
      // textContent cannot hold an <svg>, so a control still using it is by definition drawing a
      // word. Every cue helper goes through innerHTML.
      if (a.kind === 'textContent') {
        offenders.push(`${rel}:${a.line}  writes textContent: ${a.receiver.trim().slice(-50)}= ${a.rhs.trim().slice(0, 40)}`);
        continue;
      }
      // Strip the HTML scaffolding and every ${…} interpolation; whatever letters are left inside
      // quotes are letters the player would actually read.
      const drawn = a.rhs.replace(/<[^>]*>/g, '').replace(/\$\{[^}]*\}/g, '');
      if (hasWord(drawn) || EMOJI.test(drawn)) offenders.push(`${rel}:${a.line}  draws text: ${a.rhs.trim().replace(/\s+/g, ' ').slice(0, 70)}`);
    }
  }
  assert.deepEqual(offenders, [], `world-anchored controls still drawing words:\n  ${offenders.join('\n  ')}`);
});

test('D. no emoji reach a banner, a toast or a world-anchored control', () => {
  const offenders = [];
  for (const rel of PLAY_FIELD_FILES) {
    const src = read(rel);
    for (const call of sinkCalls(src)) {
      if (EMOJI.test(call.first)) offenders.push(`${rel}:${call.line}  ${call.first.slice(0, 60)}`);
    }
  }
  for (const [rel, tokens] of WORLD_CONTROLS) {
    read(rel).split('\n').forEach((line, i) => {
      if (line.trim().startsWith('//')) return;
      if (tokens.some(t => line.includes(t)) && EMOJI.test(line)) offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 60)}`);
    });
  }
  assert.deepEqual(offenders, [], `emoji on the play field:\n  ${offenders.join('\n  ')}`);
});

test('E. the accessible name survives every conversion', () => {
  // The rule is about what is DRAWN. A screen reader must still hear every sentence, so the two
  // shared sinks stay live regions and the cue renderer must keep emitting the hidden text span.
  const hud = read('ui/hud.js');
  assert.match(hud, /bannerEl\.setAttribute\('role', 'status'\)/);
  assert.match(hud, /toastEl\.setAttribute\('role', 'status'\)/);
  assert.match(hud, /class="cueSr"/, 'the visually-hidden sentence must still be emitted');
  assert.match(hud, /setAttribute\('aria-label', value\.aria\)/);

  // Every world-anchored control keeps an aria-label of its own; the glyph inside is decorative.
  for (const [rel] of WORLD_CONTROLS) {
    assert.match(read(rel), /setAttribute\('aria-label'/, `${rel} must label its world-anchored control`);
  }
});

test('F. the service policy still explains itself in words, in the sheet that may use them', () => {
  // The pink banner is a six-glyph cue now. The rule it announces is not self-evident from six
  // glyphs alone, so the full sentence has to live somewhere a player can read at rest — the shift
  // summary card, which is a sheet.
  const meta = read('ui/meta.js');
  assert.match(meta, /meta-policy/, 'the shift summary must carry a service-policy block');
  assert.match(meta, /costs you coins in recovery/, 'and it must spell the rule out');
  assert.match(read('game.js'), /servicePolicy: \(\(\) => \{/, 'game.js must feed it the live policy');
});
