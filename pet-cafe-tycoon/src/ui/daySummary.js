// src/ui/daySummary.js — the "day complete" card, built whole from one model.
//
// It used to be a collage. sheets.js drew two plain rows ("Gross sales: 2,305 / Served: 36"),
// then five modules each bolted a block onto the card after a polling timer: a service-quality
// strip (served again, guests left again), a SERVICE row of stars, a reputation row with its own
// "+3 ★", a CONTRACT row that said WON or MISS without saying what it paid, a "W2 4/24" row that
// meant nothing without the rules, and the rewarded bonus. On a real day-8 phone screenshot the
// day's income — the one number the whole shift was about — was the smallest text on the card,
// "36 served" appeared twice, and three kinds of star stacked up (2026-09-17).
//
// One card, one hierarchy:
//   hero     what today earned, counting up, with the guests, followers and photos behind it
//   rows     the contract (and what it paid), today's stars and the reputation they fed, the week
//   actions  the bonus, when there is one, and Continue — pinned, so they never scroll away
//
// Contract with the rest of the game, kept deliberately:
//   - `.continue` is the Continue button (tools/shift-transition-regression.js clicks it).
//   - A hidden `.meta-reward` marker ends the rows. systems/goldenPaw.js and systems/franchise.js
//     insert their own rows immediately before `.meta-reward`, so they land among the rows rather
//     than between the bonus and Continue.
//   - The card keeps `.card` and `.ctitle` so sheets.js's shell, the close chevron and every
//     playables-shell size rule still apply.
import { coinIcon, personIcon, heartIcon, trophyIcon, streakIcon, checkIcon, giftIcon, medalIcon } from './icons.js';
import { photoIcon } from './serviceSummary.js';

const STYLE_ID = 'pet-cafe-day-summary-style';
const fmt = n => Math.round(Math.max(0, Number(n) || 0)).toLocaleString('en-US');

function reducedMotion() {
  try {
    return document.body.classList.contains('reduced-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) { return false; }
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID;
  s.textContent = `
    .card.ds-card{gap:12px;padding:22px 20px 0;overflow-x:hidden}
    .ds-card .ctitle.ds-kicker{font:900 13px/1 system-ui,sans-serif;letter-spacing:.14em;opacity:.62;margin:6px 48px 0}
    .ds-hero{width:100%;display:flex;flex-direction:column;align-items:center;gap:9px;opacity:1}
    .ds-earned{display:flex;align-items:center;justify-content:center;gap:10px;font:950 44px/1 system-ui,sans-serif;letter-spacing:-.01em;color:var(--ink)}
    .ds-earned .ds-coin{width:38px;height:38px;flex:none;filter:drop-shadow(0 3px 0 #c98a0033)}
    .ds-earned .ds-coin svg{width:100%;height:100%;display:block}
    .ds-earned.bump{animation:ds-bump .5s cubic-bezier(.2,.8,.2,1)}
    @keyframes ds-bump{0%{transform:scale(1)}40%{transform:scale(1.12)}100%{transform:scale(1)}}
    .ds-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:6px}
    .ds-chip{display:inline-flex;align-items:center;gap:5px;min-height:30px;padding:0 11px;border-radius:999px;background:#0000000b;font:900 14px/1 system-ui,sans-serif}
    .ds-chip i{width:17px;height:17px;display:inline-flex}.ds-chip i svg{width:100%;height:100%;display:block}
    .ds-chip.ok{background:#7fd69a2e}.ds-chip.attn{background:#ffb45f33}
    .ds-tip{font:700 12px/1.35 system-ui,sans-serif;opacity:.68;max-width:300px}
    .ds-rows{width:100%;display:flex;flex-direction:column;gap:7px}
    .ds-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:4px 10px;min-height:50px;box-sizing:border-box;padding:8px 12px;border-radius:15px;background:#ffffffb8;text-align:left}
    .ds-row .ds-ico{width:26px;height:26px;display:flex;align-items:center;justify-content:center}
    .ds-row .ds-ico svg{width:100%;height:100%;display:block}
    .ds-row .ds-ico.stars{font-size:13px;letter-spacing:-.08em;color:#E7A92F;width:28px}
    .ds-main{min-width:0;display:flex;flex-direction:column;gap:5px}
    .ds-label{display:flex;align-items:baseline;gap:6px;min-width:0;font:900 14px/1.15 system-ui,sans-serif}
    /* The title never truncates — "Neighborhood Favorite" wraps before it is cut — and only the side note gives way. */
    .ds-label .ds-title{flex:0 1 auto;min-width:0;overflow-wrap:break-word}
    .ds-label small{flex:1 1 0;min-width:0;font:750 11px/1 system-ui,sans-serif;opacity:.55;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ds-bar{position:relative;height:7px;border-radius:999px;background:#0000000f;overflow:visible}
    .ds-bar>b{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:var(--accent,#8B7CF6);transition:width .6s cubic-bezier(.2,.8,.2,1)}
    .ds-bar.gold>b{background:linear-gradient(90deg,#F7C963,#E7A92F)}
    .ds-bar>u{position:absolute;top:-2px;width:2px;height:11px;border-radius:2px;background:#3B2E2A33;text-decoration:none}
    .ds-right{font:950 14px/1 system-ui,sans-serif;white-space:nowrap;display:flex;align-items:center;gap:5px}
    .ds-right i{width:16px;height:16px;display:inline-flex}.ds-right i svg{width:100%;height:100%;display:block}
    .ds-row.won{background:linear-gradient(90deg,#e9f8ee,#ffffffc8)}
    .ds-row.won .ds-right{color:#2f8a4f}
    .ds-rank{grid-column:2/4;justify-self:start;font:950 10px/1 system-ui,sans-serif;letter-spacing:.1em;color:#fff;background:#E7A92F;border-radius:6px;padding:4px 6px}
    .ds-award{grid-column:2/4;justify-self:start;display:flex;align-items:center;gap:6px;font:950 12px/1 system-ui,sans-serif;color:#8a6516}
    .ds-award i{width:18px;height:18px;display:inline-flex}.ds-award i svg{width:100%;height:100%;display:block}
    .ds-card .meta-reward.ds-anchor{display:none!important}
    .ds-actions{position:sticky;bottom:0;width:100%;margin:2px 0 0;box-sizing:border-box;padding:10px 0 calc(18px + var(--sab,0px));display:flex;flex-direction:column;gap:8px;background:linear-gradient(180deg,#0000 0,var(--cream,#FFF4E6) 12px)}
    .ds-bonus{width:100%;min-height:58px;border:0;border-radius:16px;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;color:#fff;font:950 22px/1 system-ui,sans-serif;background:linear-gradient(180deg,#9A8CFA,#6F60DC);box-shadow:0 5px 0 #5145AE}
    .ds-bonus:active{transform:translateY(2px);box-shadow:0 3px 0 #5145AE}
    .ds-bonus .ds-bonus-badge{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:26px;padding:0 6px;box-sizing:border-box;border-radius:8px;background:#ffffff2e;border:1px solid #ffffff66;font:950 11px/1 system-ui,sans-serif;letter-spacing:.06em}
    .ds-bonus .ds-bonus-badge svg{width:18px;height:18px;display:block}
    .ds-bonus i{width:24px;height:24px;display:inline-flex}.ds-bonus i svg{width:100%;height:100%;display:block}
    .ds-bonus:disabled{cursor:default;opacity:1;background:#e9f8ee;color:#2f8a4f;box-shadow:none}
    .ds-card .sbtn.continue.secondary{background:#fff;border:2px solid #3b2e2a1c;min-height:48px;font-size:16px}
    @media(max-height:520px) and (min-aspect-ratio:5/4){
      .card.ds-card{max-width:min(760px,calc(100vw - 24px));width:min(760px,calc(100vw - 24px));max-height:calc(100svh - 16px);padding:14px 16px 0;display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);grid-template-rows:auto 1fr auto;column-gap:14px;row-gap:8px;align-items:start}
      .ds-card .ctitle.ds-kicker{grid-column:1;grid-row:1;margin:4px 0 0}
      .ds-card .ds-hero{grid-column:1;grid-row:2;align-self:center}
      .ds-card .ds-rows{grid-column:2;grid-row:1/3;align-self:center;width:auto;margin:52px 0 0}
      .ds-card .ds-actions{grid-column:1/3;grid-row:3;flex-direction:row;width:100%;margin:0;padding:8px 0 12px}
      .ds-card .ds-actions>*{flex:1}
      .ds-earned{font-size:38px}.ds-earned .ds-coin{width:32px;height:32px}
      .ds-row{min-height:44px;padding:6px 10px}
      .ds-bonus{min-height:50px;font-size:19px}
    }
    /* Very short screens (the publisher's 418x218 and 218x418 checks): drop the kicker and the side
       notes, shrink the hero, keep every tap target at 48 px. */
    @media(max-height:260px){
      .ds-card .ctitle.ds-kicker{display:none}
      .ds-card .ds-rows{margin-top:52px}
      .ds-earned{font-size:28px}.ds-earned .ds-coin{width:24px;height:24px}
      .ds-chip{min-height:24px;font-size:12px;padding:0 8px}
      .ds-row{min-height:38px;padding:4px 8px}.ds-label small{display:none}
      .ds-bonus{min-height:48px;font-size:17px}
    }
    /* ...and in a landscape that short, the close chevron and the buttons leave room beside the hero
       for exactly one row: the contract, which is what the day was judged on. Reputation and the
       week cup stay one tap away on the Café menu's Journey page. */
    @media(max-height:260px) and (min-aspect-ratio:5/4){.ds-card .ds-week,.ds-card .ds-rep{display:none}.ds-card .ds-rows{align-self:start;margin-top:58px}}
    @media(max-width:250px){.ds-label{font-size:11px}.ds-earned{font-size:30px;gap:6px}.ds-earned .ds-coin{width:26px;height:26px}.ds-bonus{gap:6px;font-size:18px}.ds-bonus i{display:none}.ds-row{grid-template-columns:20px minmax(0,1fr) auto;gap:4px 6px;padding:6px 7px}.ds-row .ds-ico{width:20px;height:20px}.ds-row .ds-ico.stars{font-size:9px;width:20px}.ds-row .ds-right{font-size:12px}.ds-row .ds-right i{display:none}.ds-card .ctitle.ds-kicker{font-size:11px;margin:6px 50px 0 0;text-align:left}}
    @media(max-width:340px){.ds-earned{font-size:36px}.ds-row{grid-template-columns:24px minmax(0,1fr) auto;padding:7px 9px}.ds-label small{display:none}}
    @media(prefers-reduced-motion:reduce){.ds-earned.bump{animation:none}.ds-bar>b{transition:none}}
  `;
  document.head.appendChild(s);
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
const icon = svg => `<i aria-hidden="true">${svg}</i>`;

// Count a number up on screen. Reduced motion, or a hidden tab, just sets it.
function countUp(node, from, to, ms = 750) {
  if (reducedMotion() || typeof requestAnimationFrame !== 'function') { node.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = now => {
    const p = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - p, 3);
    node.textContent = fmt(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function contractRow(c) {
  const kindIcon = c.kind === 'serve' ? personIcon() : c.kind === 'streak' ? streakIcon() : coinIcon();
  const unit = c.kind === 'serve' ? 'guests' : c.kind === 'streak' ? 'in a row' : 'coins';
  const row = el('div', 'ds-row ds-contract' + (c.met ? ' won' : ''));
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', c.met
    ? `Contract met: ${fmt(c.target)} ${unit}. Paid ${fmt(c.reward)} coins.`
    : `Contract: ${fmt(c.progress)} of ${fmt(c.target)} ${unit}.`);
  row.append(el('span', 'ds-ico', kindIcon));
  const main = el('div', 'ds-main');
  main.append(el('div', 'ds-label', `<span class="ds-title">Contract</span><small>${fmt(c.target)} ${unit}${c.rival ? ' · rival' : ''}</small>`));
  if (!c.met) {
    // Progress, not a verdict. The owner's rule: never punish. A missed contract is simply a bar
    // that did not fill today, with tomorrow's contract already waiting.
    const bar = el('div', 'ds-bar');
    const fill = el('b'); fill.style.width = '0%'; bar.append(fill);
    requestAnimationFrame(() => { fill.style.width = `${Math.min(100, Math.round((c.progress / Math.max(1, c.target)) * 100))}%`; });
    main.append(bar);
  }
  row.append(main);
  row.append(el('span', 'ds-right', c.met
    ? `${icon(checkIcon())}+${fmt(c.reward)}`
    : `${fmt(Math.min(c.progress, c.target))}/${fmt(c.target)}`));
  return row;
}

function reputationRow(rating, rep) {
  const r = Math.max(0, Math.min(3, rating | 0));
  const row = el('div', 'ds-row ds-rep');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', `Service ${r} of 3 stars. ${rep.title}${rep.nextTitle ? `, ${Math.round(rep.frac * 100)} percent toward ${rep.nextTitle}` : ''}.`);
  row.append(el('span', 'ds-ico stars', '★'.repeat(r) + '<span style="opacity:.28">' + '★'.repeat(3 - r) + '</span>'));
  const main = el('div', 'ds-main');
  main.append(el('div', 'ds-label', `<span class="ds-title">${rep.title}</span>${rep.nextTitle ? `<small>next: ${rep.nextTitle}</small>` : ''}`));
  const bar = el('div', 'ds-bar gold');
  const fill = el('b'); fill.style.width = '0%'; bar.append(fill);
  requestAnimationFrame(() => { fill.style.width = `${rep.nextTitle ? Math.round(Math.max(0, Math.min(1, rep.frac)) * 100) : 100}%`; });
  main.append(bar);
  row.append(main);
  row.append(el('span', 'ds-right', rep.awarded > 0 ? `+${rep.awarded}` : ''));
  if (rep.levelUp) row.append(el('span', 'ds-rank', 'NEW RANK'));
  return row;
}

// The medal thresholds from src/sim/career.js weeklyCupState: bronze 14, silver 20, gold 24.
const CUP_MAX = 24, CUP_TICKS = [14, 20];
function weekRow(w) {
  const row = el('div', 'ds-row ds-week');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', `Week ${w.week} cup: ${w.points} of ${CUP_MAX} points after ${w.played} of 7 days. Bronze at 14, silver at 20, gold at 24.`);
  row.append(el('span', 'ds-ico', trophyIcon()));
  const main = el('div', 'ds-main');
  main.append(el('div', 'ds-label', `<span class="ds-title">Week ${w.week} cup</span><small>day ${Math.max(1, Math.min(7, w.played))} of 7</small>`));
  const bar = el('div', 'ds-bar gold');
  const fill = el('b'); fill.style.width = '0%'; bar.append(fill);
  for (const t of CUP_TICKS) { const u = el('u'); u.style.left = `${(t / CUP_MAX) * 100}%`; bar.append(u); }
  requestAnimationFrame(() => { fill.style.width = `${Math.round(Math.min(1, w.points / CUP_MAX) * 100)}%`; });
  main.append(bar);
  row.append(main);
  row.append(el('span', 'ds-right', `${w.points}/${CUP_MAX}`));
  if (w.award && w.award.awarded) {
    row.append(el('span', 'ds-award', `${icon(medalIcon(w.award.tier === 'gold' ? 3 : w.award.tier === 'silver' ? 2 : 1))}${w.award.tier.toUpperCase()} CUP · +${fmt(w.award.reward)}`));
  }
  return row;
}

/**
 * Build the card's contents into `card` (sheets.js's shell, already holding the close chevron and
 * a `.ctitle`). `model` is assembled once by game.js openDaySummary; `onContinue` finishes the day.
 */
export function renderDaySummary(card, model, { onContinue }) {
  ensureStyle();
  card.classList.add('ds-card');
  const title = card.querySelector('.ctitle');
  if (title) { title.classList.add('ds-kicker'); title.textContent = `DAY ${model.day} COMPLETE`; }

  // ---- hero ---------------------------------------------------------------------------------
  // `.cbody` so the pre-existing playables-shell rules and anchors that look for it still find one.
  const hero = el('section', 'ds-hero cbody');
  const guests = `${fmt(model.served)} ${model.served === 1 ? 'guest' : 'guests'} served`;
  hero.setAttribute('aria-label', `Earned ${fmt(model.earned)} coins today. ${guests}.${model.lost > 0 ? ` ${model.lost} left without buying.` : ''}`);
  const earned = el('div', 'ds-earned');
  earned.append(el('span', 'ds-coin', coinIcon()));
  const num = el('span', 'ds-earned-num', '0');
  earned.append(num);
  hero.append(earned);
  const chips = el('div', 'ds-chips');
  chips.append(el('span', 'ds-chip' + (model.lost === 0 ? ' ok' : ''), `${icon(personIcon())}${fmt(model.served)}`));
  if (model.followers > 0) chips.append(el('span', 'ds-chip ok', `${icon(heartIcon())}+${fmt(model.followers)}`));
  if (model.photos > 0) chips.append(el('span', 'ds-chip ok', `${icon(photoIcon())}${fmt(model.photos)}`));
  if (model.lost > 0) chips.append(el('span', 'ds-chip attn', `${fmt(model.lost)} left`));
  hero.append(chips);
  if (model.lost > 0) hero.append(el('div', 'ds-tip', 'A little more stock before the rush keeps them in the queue.'));
  card.append(hero);
  countUp(num, 0, model.earned);

  // ---- rows ---------------------------------------------------------------------------------
  const rows = el('div', 'ds-rows');
  rows.append(contractRow(model.contract));
  rows.append(reputationRow(model.rating, model.reputation));
  rows.append(weekRow(model.week));
  const anchor = el('div', 'meta-reward ds-anchor'); anchor.hidden = true;
  rows.append(anchor);
  card.append(rows);

  // ---- actions ------------------------------------------------------------------------------
  const actions = el('div', 'ds-actions');
  const cont = document.createElement('button');
  cont.type = 'button'; cont.className = 'sbtn continue'; cont.textContent = 'CONTINUE';
  cont.addEventListener('click', () => onContinue());
  const bonus = model.bonus;
  if (bonus) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'ds-bonus';
    const paint = () => {
      btn.disabled = !!bonus.claimed;
      if (bonus.claimed) {
        btn.innerHTML = `${icon(checkIcon())}<span>+${fmt(bonus.amount)}</span>`;
        btn.setAttribute('aria-label', `Bonus collected, ${fmt(bonus.amount)} coins`);
        cont.classList.remove('secondary');
      } else {
        const badge = bonus.liveAd ? 'AD' : giftIcon();
        btn.innerHTML = `<span class="ds-bonus-badge">${badge}</span>${icon(coinIcon())}<span>+${fmt(bonus.amount)}</span>`;
        btn.setAttribute('aria-label', `${bonus.liveAd ? 'Watch an ad for' : 'Collect'} a bonus of ${fmt(bonus.amount)} coins`);
        cont.classList.add('secondary');
      }
    };
    paint();
    btn.addEventListener('click', async () => {
      if (btn.disabled || bonus.claimed) return;
      btn.disabled = true;
      const ok = await bonus.onClaim();
      if (ok) {
        bonus.claimed = true;
        earned.classList.remove('bump'); void earned.offsetWidth; earned.classList.add('bump');
        countUp(num, model.earned, model.earned + bonus.amount, 600);
      }
      paint();
    });
    actions.append(btn);
  }
  actions.append(cont);
  card.append(actions);
  return card;
}
