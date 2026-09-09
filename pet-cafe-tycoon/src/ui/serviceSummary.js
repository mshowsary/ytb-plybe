// Compact end-of-shift service-quality readout. Presentation only: Task 23 reports outcomes and
// recovery moments, never wallet penalties. Lost guests remain a real service consequence.
//
// Batch 6 narrows what "reports outcomes" means. The recap used to lead with "20 SERVICE
// RECOVERIES" and then list the chores that produced them -- recovery moments, seat misses, a
// service fee, and a tip telling the player to wipe seats between visits. The owner played the
// shipped build on a phone and read exactly that back to us: "if the player is constantly
// reassuring, cleaning, and recovering, the game is nagging them rather than challenging them."
// The standing rule is that we never overwhelm or punish the player or raise his cortisol level;
// we only keep the game from being boring. So the card now reports the ONE consequence that is
// both real and fair -- guests who left -- alongside what the player gained, and says nothing at
// all about chores. The model keeps every field (misses, missedSeats, returns are still computed
// and still tested), it just stops drawing the ones that read as a scolding.
import { heartIcon } from './icons.js';

const n = value => Math.max(0, Number(value) | 0);

// `n` folds every absent/garbage input to 0, which is the right answer for a service outcome (no
// misses recorded IS no misses). It is the wrong answer for the two gain counters below, where 0
// and "this shift never recorded it" are different facts, so those go through `known` instead.
// Number(null) === 0, so the null/undefined check has to come first -- collapsing it into the
// Number.isFinite test would silently report an unrecorded shift as a shift with zero photos.
const known = value => {
  if (value === null || value === undefined) return null;
  const v = Number(value);
  return Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : null;
};

export function buildServiceSummaryModel(dayStats = {}, meta = null) {
  const served = n(dayStats.served), lost = n(dayStats.lost), misses = n(dayStats.serviceMisses);
  const returns = n(dayStats.returnActions);
  // Program 6.2: guests who paid and then found no clean table. A shift that turned anyone away
  // over dirty tables is not a clean shift, however good the rest of the service was.
  const missedSeats = n(dayStats.missedSeats);
  // Batch 6: "clean" is now exactly "nobody left". Recovery moments and dirty tables are chores the
  // card no longer holds against the player, so a shift full of them and empty of departures IS a
  // clean shift by the only measure still reported -- and the served chip has to agree with the
  // headline it sits under.
  const clean = lost === 0;

  // Batch 3: two GAIN counters beside the service outcomes above. Both are null-when-unknown, not
  // 0-when-unknown: src/sim/saveSchema.js normalizeShiftStats rebuilds G.dayStats from a fixed key
  // whitelist, so a shift restored mid-day carries neither counter, and a chip that confidently
  // shows "0 photos" for a shift in which the player did take photos is a lie the card cannot
  // take back. Unknown draws nothing at all (see decorateCard).
  const photos = known(dayStats.photos);
  // Followers have four independent sources (photo shots, first pet discoveries, Besties, and the
  // Golden Paw ceremony), so a per-source shift counter would have to be threaded through four
  // files that this task does not own. The shift's gain is instead the difference between the
  // running total now and the reading taken when the shift began -- one number to record, and it
  // picks up any source added later for free.
  const followersStart = known(dayStats.followersStart);
  const followersNow = meta ? known(meta.followers) : null;
  // clamped at 0: meta.followers can only rise (sim/followers.js addFollowers), so a negative here
  // means the two readings came from different shifts, not that the player lost an audience.
  const followers = (followersStart === null || followersNow === null)
    ? null : Math.max(0, followersNow - followersStart);

  // One question, asked once: did anyone leave? "20 SERVICE RECOVERIES" was a scoreboard of the
  // player's mistakes at the exact moment the shift was over and nothing could be done about them.
  const headline = lost === 0 ? 'CLEAN SERVICE' : `${lost} ${lost === 1 ? 'GUEST' : 'GUESTS'} LEFT`;
  // And one line under it, phrased as help rather than correction. No chore advice at all: the
  // "wipe seats between visits" sentence in particular was an instruction to do more of the thing
  // the player was already doing too much of.
  const tip = lost > 0
    ? 'A few guests slipped away — a little more stock before the rush.'
    : 'Great rhythm.';

  return { served, lost, misses, missedSeats, returns, photos, followers, clean, headline, tip };
}

const STYLE_ID = 'pet-cafe-service-summary-style';
function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style'); style.id = STYLE_ID;
  style.textContent = `
    .service-summary-strip{width:100%;box-sizing:border-box;border-radius:16px;padding:11px 12px;background:#ffffffa8;border:1px solid #ffffffd0;text-align:left;color:var(--ink,#3B2E2A)}
    .service-summary-top{display:flex;align-items:center;justify-content:space-between;gap:10px;font:800 11px/1.2 system-ui,sans-serif;letter-spacing:.04em;opacity:.78}
    .service-summary-top strong{font:950 12px/1 system-ui,sans-serif;letter-spacing:.03em;opacity:1}
    .service-summary-metrics{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
    .service-summary-chip{display:inline-flex;align-items:center;min-height:26px;padding:0 9px;border-radius:999px;background:#0000000a;font:800 11px/1 system-ui,sans-serif;white-space:nowrap}
    .service-summary-chip.attn{background:#ffb45f24}.service-summary-chip.ok{background:#7fd69a22}
    .service-summary-chip.iconChip{gap:6px;font:950 13px/1 system-ui,sans-serif}
    .service-summary-ico{width:17px;height:17px;flex:none;display:inline-flex;color:var(--ink,#3B2E2A)}
    .service-summary-ico svg{width:100%;height:100%;display:block}
    .service-summary-tip{margin-top:8px;font:700 11px/1.35 system-ui,sans-serif;opacity:.67}
    @media(max-width:260px){.service-summary-strip{padding:9px}.service-summary-top{align-items:flex-start;flex-direction:column;gap:4px}.service-summary-chip{font-size:10px}}
  `;
  document.head.appendChild(style);
}

function chip(text, className = '') {
  const el = document.createElement('span'); el.className = `service-summary-chip ${className}`.trim(); el.textContent = text; return el;
}

// Batch 6 removed this card's seat-miss chip, and with it the local copy of the table-with-X glyph
// that used to live here. The play-field original stays where it belongs, in src/systems/visuals.js.
//
// The developed polaroid the player watched fly to the Pet Book (src/ui/photoGame.js's .polaroid --
// white card, cream frame, deep bottom margin), not a camera: the card that landed is the thing
// this chip is counting. Duplicated in src/ui/hud.js's ring because src/ui/icons.js belongs to
// another task in this batch; both copies should collapse into one icons.js export once it is free.
export function photoIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">'
    + '<rect x="3.6" y="3.4" width="16.8" height="17.4" rx="1.8" fill="#FFFDF8" stroke="#7A583A" stroke-width="1.4"/>'
    + '<rect x="5.9" y="5.7" width="12.2" height="9.4" rx="1" fill="#E9DFCE"/>'
    + '<circle cx="12" cy="10.4" r="2.7" fill="#C97A3A"/>'
    + '</svg>';
}

// Icon + numeral, no words: the one row in this card that also has to make sense at a glance to a
// player who never reads the prose around it.
function iconChip(svg, value, className = '') {
  const el = document.createElement('span');
  el.className = `service-summary-chip iconChip ${className}`.trim();
  const ico = document.createElement('span'); ico.className = 'service-summary-ico'; ico.innerHTML = svg;
  const num = document.createElement('span'); num.textContent = String(value);
  el.append(ico, num);
  return el;
}

function decorateCard(G, card) {
  if (!card || card.querySelector('.service-summary-strip')) return;
  const title = card.querySelector('.ctitle');
  if (!title || !/^Day\s+\d+\s+✓$/.test(title.textContent.trim())) return;
  const body = card.querySelector('.cbody'); if (!body) return;

  const model = buildServiceSummaryModel(G && G.dayStats, G && G.meta);
  const strip = document.createElement('section'); strip.className = 'service-summary-strip';
  // Screen-reader text only -- never rendered, so it stays sentences while the chips stay glyphs.
  // Batch 6: it must say what is DRAWN and nothing more. Reading out recovery moments, seat misses,
  // returns and a service fee to a player who cannot see the card, when the card itself no longer
  // shows any of them, would keep the nagging alive for exactly the players least able to ignore
  // it. Lost guests are announced only when there were any, matching the chip.
  const gains = (model.photos === null || model.photos <= 0 ? '' : ` ${model.photos} photos taken.`)
    + (model.followers === null || model.followers <= 0 ? '' : ` ${model.followers} followers gained.`);
  strip.setAttribute('aria-label', `Service summary. ${model.served} guests served.${model.lost > 0 ? ` ${model.lost} guests left.` : ''}${gains}`);

  const top = document.createElement('div'); top.className = 'service-summary-top';
  const label = document.createElement('span'); label.textContent = 'SERVICE QUALITY';
  const headline = document.createElement('strong'); headline.textContent = model.headline;
  top.append(label, headline);

  const metrics = document.createElement('div'); metrics.className = 'service-summary-metrics';
  // Batch 6, the whole row. `served` is the shift, so it is always there. `lost` is the one
  // remaining consequence, so it appears only when it happened -- a permanent "0 left" chip is a
  // reminder that leaving is possible, printed on every clean shift the player ever has. The
  // recovery-moment chip, the seat-miss chip and the service-fee chip are gone outright, and so is
  // the per-cause tip override that told the player which chore to do more of. Returns are still
  // counted in dayStats, never drawn: handing an item back is a correction the player already made.
  metrics.append(chip(`${model.served} served`, model.clean ? 'ok' : ''));
  if (model.lost > 0) metrics.append(chip(`${model.lost} left`, 'attn'));
  // GAINS, drawn only when the count is known AND non-zero. The photo studio does not exist at all
  // until the terrace chain is bought, so a "0 photos" chip on day 3 would be furniture, not
  // information. `> 0` is also the null guard: an unknown count is neither drawn nor invented.
  if (model.photos > 0) metrics.append(iconChip(photoIcon(), model.photos, 'ok'));
  // heartIcon is imported rather than redrawn so this reads as the same quantity as the HUD's
  // followers pill (src/ui/hud.js), which uses the identical glyph.
  if (model.followers > 0) metrics.append(iconChip(heartIcon(), model.followers, 'ok'));

  const tip = document.createElement('div'); tip.className = 'service-summary-tip'; tip.textContent = model.tip;
  strip.append(top, metrics, tip);
  body.insertAdjacentElement('afterend', strip);
}

export function installServiceSummary(G) {
  if (typeof document === 'undefined') return { refresh() {}, destroy() {} };
  ensureStyle();
  let scheduled = false;
  const refresh = () => {
    scheduled = false;
    for (const card of document.querySelectorAll('.card')) decorateCard(G, card);
  };
  const schedule = () => {
    if (scheduled) return; scheduled = true;
    requestAnimationFrame(refresh);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  refresh();
  return { refresh, destroy() { observer.disconnect(); } };
}
