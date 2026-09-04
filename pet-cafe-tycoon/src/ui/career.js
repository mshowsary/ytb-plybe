// Career/Journey presentation. It deliberately attaches to the existing reputation chip instead
// of adding another HUD button, keeping the playfield clean on phones while making that chip useful.
const STYLE_ID = 'pet-cafe-career-style';
const TROPHY = { bronze: 'BRONZE', silver: 'SILVER', gold: 'GOLD' };

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID;
  s.textContent = `
    .meta-reputation.career-openable{pointer-events:auto;cursor:pointer;transition:transform .16s ease,box-shadow .16s ease}.meta-reputation.career-openable:active{transform:scale(.97)}.career-peek{margin-left:5px;opacity:.45;font-size:9px;letter-spacing:.04em}
    .career-root{position:fixed;inset:0;z-index:75;display:grid;place-items:center;padding:14px;box-sizing:border-box;font-family:system-ui,sans-serif}.career-root.hidden{display:none}.career-backdrop{position:absolute;inset:0;background:#211a178c;backdrop-filter:blur(5px)}
    .career-card{position:relative;width:min(520px,100%);max-height:min(720px,91vh);overflow:auto;box-sizing:border-box;border-radius:27px;padding:20px;background:linear-gradient(180deg,#fff8eb,#fff1df);color:#3d302b;box-shadow:0 24px 70px #0006;border:1px solid #ffffff}.career-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.career-title{font:950 25px/1 system-ui,sans-serif;letter-spacing:-.02em}.career-sub{font:750 12px/1.3 system-ui,sans-serif;opacity:.57;margin-top:5px}.career-close{width:44px;height:44px;border:0;border-radius:50%;background:#49372c10;color:#3d302b;font:700 22px/1 system-ui;cursor:pointer;flex:none}
    .career-section{margin-top:14px;padding:14px;border-radius:19px;background:#ffffffa8;border:1px solid #5f45300e;box-shadow:inset 0 1px #fff}.career-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.career-kicker{font:900 10px/1 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;opacity:.52}.career-big{font:950 17px/1.1 system-ui,sans-serif}.career-muted{font:700 11px/1.25 system-ui,sans-serif;opacity:.58}.career-bar{height:8px;border-radius:6px;background:#2c211812;overflow:hidden;margin-top:9px}.career-bar>div{height:100%;border-radius:inherit;background:linear-gradient(90deg,#ff927e,#8979f4);transition:width .35s ease}
    .career-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;margin-top:10px}.career-day{min-width:0;height:44px;border-radius:11px;background:#efe5d9;display:flex;flex-direction:column;align-items:center;justify-content:center;font:900 9px/1 system-ui,sans-serif;color:#776960}.career-day.played{background:#fff0c4;color:#704b1e}.career-day .stars{font-size:10px;color:#e8a729;margin-top:3px;white-space:nowrap}.career-day.current{outline:2px solid #8b7cf6;outline-offset:1px}.career-cup{font:950 12px/1 system-ui,sans-serif;color:#9d6612}.career-trophies{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.career-trophy{padding:6px 9px;border-radius:999px;background:#f4eadf;font:900 10px/1 system-ui,sans-serif}.career-trophy.gold{background:#fff0b6;color:#7b5310}.career-trophy.silver{background:#eceff2;color:#586068}.career-trophy.bronze{background:#f2d4bf;color:#845032}
    .career-mastery{display:grid;gap:8px}.career-master-row{display:grid;grid-template-columns:minmax(90px,1.2fr) minmax(100px,2fr) auto;align-items:center;gap:9px}.career-master-name{font:900 12px/1.1 system-ui,sans-serif}.career-master-name small{display:block;font:750 9px/1.2 system-ui,sans-serif;opacity:.5;margin-top:3px}.career-master-bar{height:6px;border-radius:5px;background:#2c211810;overflow:hidden}.career-master-bar>div{height:100%;border-radius:inherit;background:linear-gradient(90deg,#75c88a,#f0b33f)}.career-bonus{font:900 10px/1 system-ui,sans-serif;color:#4f8a5c;white-space:nowrap}
    .career-finish{background:linear-gradient(135deg,#f6efff,#fff);border-color:#8b7cf62d}.career-finish .career-big{color:#674fd0}
    .career-result{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:16px;background:linear-gradient(135deg,#eef8ff,#fff);border:1px solid #5ba3da2c;text-align:left}.career-result.won{background:linear-gradient(135deg,#effbec,#fff8df);border-color:#68b85b32}.career-result-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.career-result-score{font:950 18px/1 system-ui,sans-serif;color:#53779a}.career-result.won .career-result-score{color:#4b8a46}.career-result-delta{margin-top:5px;font:900 11px/1.2 system-ui,sans-serif;color:#6b5bd1}.career-summary{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:16px;background:linear-gradient(135deg,#eef8ff,#fff);border:1px solid #5ba3da2c;text-align:left}.career-summary-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.career-summary-cup{font:950 14px/1 system-ui,sans-serif;color:#4c76a0}.career-summary-award{margin-top:8px;padding:9px 10px;border-radius:12px;background:#fff0bd;font:950 11px/1.2 system-ui,sans-serif;color:#7d5612;text-align:center}.career-next-chase{width:100%;box-sizing:border-box;padding:9px 12px;border-radius:14px;background:#f6f0ff;border:1px solid #8b7cf621;font:850 11px/1.25 system-ui,sans-serif;color:#5d4bc0;text-align:left}.card .career-hidden-report{display:none!important}
    @media(max-width:430px){.career-card{padding:16px;border-radius:23px}.career-title{font-size:22px}.career-section{padding:12px}.career-day{height:40px}.career-master-row{grid-template-columns:90px 1fr auto}.career-master-name{font-size:11px}.career-result-score{font-size:16px}}
    @media(max-height:600px){.career-card{max-height:95vh}.career-section{margin-top:9px;padding:10px}.career-week{margin-top:7px}.career-day{height:34px}}
  `;
  document.head.appendChild(s);
}

function pct(n) { return `${Math.round(Math.max(0, Math.min(1, n || 0)) * 100)}%`; }
function metricValue(kind, n) { return kind === 'earn' ? `${Math.round(n).toLocaleString('en-US')} coins` : kind === 'streak' ? `${n}x streak` : `${n} guests`; }

export function createCareerUI() {
  injectStyle();
  const repChip = document.querySelector('.meta-reputation');
  if (repChip) {
    repChip.classList.add('career-openable'); repChip.tabIndex = 0; repChip.setAttribute('role', 'button'); repChip.setAttribute('aria-label', 'Open Cafe Journey');
    const peek = document.createElement('span'); peek.className = 'career-peek'; peek.textContent = 'JOURNEY';
    const top = repChip.querySelector('.meta-rep-top'); if (top) top.appendChild(peek);
  }

  const root = document.createElement('div'); root.className = 'career-root hidden';
  root.innerHTML = `<div class="career-backdrop"></div><div class="career-card" role="dialog" aria-modal="true" aria-label="Cafe Journey">
    <div class="career-head"><div><div class="career-title">Café Journey</div><div class="career-sub">Win weeks. Master recipes. Become a Legendary Café.</div></div><button class="career-close" type="button" aria-label="Close">×</button></div>
    <div class="career-section career-rank"><div class="career-section-head"><div><div class="career-kicker">CAREER ROAD</div><div class="career-big career-rank-title">Cozy Corner</div></div><div class="career-muted career-rank-value">0 REP</div></div><div class="career-muted career-rank-next"></div><div class="career-bar"><div></div></div></div>
    <div class="career-section"><div class="career-section-head"><div><div class="career-kicker">WEEKLY CUP</div><div class="career-big career-week-title">Week 1</div></div><div class="career-cup career-week-points">0 / 24 GOLD</div></div><div class="career-muted career-week-note">Every strong shift and completed contract adds Cup points.</div><div class="career-week"></div><div class="career-trophies"></div></div>
    <div class="career-section"><div class="career-section-head"><div><div class="career-kicker">RECIPE MASTERY</div><div class="career-big">Permanent craft bonuses</div></div></div><div class="career-muted">Every paid item counts. Each mastery tier adds +3% value to that recipe family.</div><div class="career-mastery"></div></div>
    <div class="career-section career-finish"><div class="career-kicker">THE FINISH LINE</div><div class="career-big career-finish-title">Legendary Café · 220 reputation</div><div class="career-muted career-finish-note">Reach the final career rank. Weekly Cups and mastery continue afterward for high scores.</div></div>
  </div>`;
  document.body.appendChild(root);
  const close = () => root.classList.add('hidden');
  const open = () => root.classList.remove('hidden');
  root.querySelector('.career-close').addEventListener('click', close);
  root.querySelector('.career-backdrop').addEventListener('click', close);
  if (repChip) {
    repChip.addEventListener('click', open);
    repChip.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !root.classList.contains('hidden')) { close(); e.stopPropagation(); } }, true);

  let model = null;
  function render() {
    if (!model) return;
    root.querySelector('.career-rank-title').textContent = model.rank.title;
    root.querySelector('.career-rank-value').textContent = `${model.rank.rep} REP`;
    root.querySelector('.career-rank-next').textContent = model.rank.nextTitle ? `${model.rank.current}/${model.rank.needed} toward ${model.rank.nextTitle}` : 'Career rank complete · you made it.';
    root.querySelector('.career-rank .career-bar>div').style.width = pct(model.rank.frac);

    root.querySelector('.career-week-title').textContent = `Week ${model.week.week} · ${model.week.played}/7 shifts`;
    root.querySelector('.career-week-points').textContent = `${model.week.points} / 24 GOLD`;
    root.querySelector('.career-week-note').textContent = model.week.complete ? `${(model.week.tier || 'bronze').toUpperCase()} CUP COMPLETE` : 'Rating stars + a completed contract = up to 4 Cup points per shift.';
    const weekEl = root.querySelector('.career-week'); weekEl.textContent = '';
    for (let i = 0; i < 7; i++) {
      const r = model.week.shifts[i]; const d = document.createElement('div');
      d.className = 'career-day' + (r ? ' played' : '') + (model.week.currentIndex === i ? ' current' : '');
      d.innerHTML = `<span>${['M','T','W','T','F','S','S'][i]}</span><span class="stars">${r ? '★'.repeat(r.rating) + (r.contractMet ? '✓' : '') : '·'}</span>`;
      weekEl.appendChild(d);
    }
    const trophies = root.querySelector('.career-trophies'); trophies.textContent = '';
    for (const tier of ['gold','silver','bronze']) {
      const el = document.createElement('span'); el.className = `career-trophy ${tier}`; el.textContent = `${TROPHY[tier]} × ${model.trophies[tier] | 0}`; trophies.appendChild(el);
    }

    const mastery = root.querySelector('.career-mastery'); mastery.textContent = '';
    for (const m of model.masteries) {
      const row = document.createElement('div'); row.className = 'career-master-row';
      row.innerHTML = `<div class="career-master-name">${m.label}<small>Mastery ${m.level}/4 · ${m.sales} sold</small></div><div class="career-master-bar"><div style="width:${pct(m.frac)}"></div></div><div class="career-bonus">+${m.bonus}%</div>`;
      mastery.appendChild(row);
    }
    root.querySelector('.career-finish-title').textContent = model.legendary ? 'LEGENDARY CAFÉ ACHIEVED' : `Legendary Café · ${model.legendaryTarget} reputation`;
    root.querySelector('.career-finish-note').textContent = model.legendary ? 'Career complete. Keep chasing Gold Cups, mastery tiers and personal records.' : `${Math.max(0, model.legendaryTarget - model.rank.rep)} reputation to the final career rank.`;
  }

  function decorateSummary(summary) {
    let tries = 0;
    const attach = () => {
      const card = document.querySelector('.sheet-root .card');
      if (!card) { if (++tries < 20) setTimeout(attach, 25); return; }
      card.querySelectorAll('.career-result,.career-summary,.career-next-chase').forEach(el => el.remove());

      const body = card.querySelector('.cbody');
      if (body) {
        for (const row of body.querySelectorAll('.srow-sub')) {
          const t = row.textContent || '';
          if (t.startsWith('Lost sales:')) row.textContent = summary.lost > 0 ? `Service misses: ${summary.lost}` : 'Service: PERFECT · no walkouts';
          else if (t.startsWith('Next unlock:') && !summary.nextUnlock) row.classList.add('career-hidden-report');
        }
      }

      const result = document.createElement('div'); result.className = 'career-result' + (summary.contract.met ? ' won' : '');
      const resultTop = document.createElement('div'); resultTop.className = 'career-result-top';
      const resultCopy = document.createElement('div');
      resultCopy.innerHTML = `<div class="career-kicker">${summary.contract.rival ? 'RIVAL RESULT' : 'DAILY CONTRACT'}</div><div class="career-muted">${summary.contract.label}</div>`;
      const resultScore = document.createElement('div'); resultScore.className = 'career-result-score'; resultScore.textContent = summary.contract.met ? 'WON ✓' : 'NEXT TIME';
      resultTop.append(resultCopy, resultScore); result.appendChild(resultTop);
      const delta = document.createElement('div'); delta.className = 'career-result-delta';
      if (summary.contract.rival && summary.contract.previous != null) {
        const diff = summary.contract.progress - summary.contract.previous;
        const diffText = summary.contract.kind === 'earn' ? Math.round(diff).toLocaleString('en-US') : diff;
        delta.textContent = `${metricValue(summary.contract.kind, summary.contract.progress)} · ${diff >= 0 ? '+' : ''}${diffText} vs last week`;
      } else {
        delta.textContent = `${metricValue(summary.contract.kind, summary.contract.progress)} this shift · ${summary.contract.met ? `+${summary.contract.reward} contract reward` : `${Math.max(0, summary.contract.target - summary.contract.progress)} to target`}`;
      }
      result.appendChild(delta);
      const rating = card.querySelector('.meta-rating');
      if (rating) rating.before(result); else if (body) body.after(result); else card.appendChild(result);

      const box = document.createElement('div'); box.className = 'career-summary';
      const top = document.createElement('div'); top.className = 'career-summary-top';
      const copy = document.createElement('div');
      copy.innerHTML = `<div class="career-kicker">WEEK ${summary.week.week} CUP</div><div class="career-muted">${summary.contractStreak} contract${summary.contractStreak === 1 ? '' : 's'} in a row · ${summary.week.played}/7 shifts</div>`;
      const score = document.createElement('div'); score.className = 'career-summary-cup'; score.textContent = `${summary.week.points}/24`;
      top.append(copy, score); box.appendChild(top);
      if (summary.cupAward && summary.cupAward.awarded) {
        const award = document.createElement('div'); award.className = 'career-summary-award';
        award.textContent = `${summary.cupAward.tier.toUpperCase()} WEEKLY CUP · +${summary.cupAward.reward.toLocaleString('en-US')} COINS`;
        box.appendChild(award);
      }
      const continueBtn = card.querySelector('.continue');
      if (continueBtn) continueBtn.before(box); else card.appendChild(box);

      if (summary.nextChase) {
        const chase = document.createElement('div'); chase.className = 'career-next-chase';
        chase.textContent = `NEXT CHASE · ${summary.nextChase}`;
        box.before(chase);
      }
    };
    attach();
  }

  return {
    setModel(next) { model = next; render(); },
    decorateSummary,
    open, close,
    get isOpen() { return !root.classList.contains('hidden'); },
  };
}
