// Career/Journey presentation. Progress is communicated with bars, stars and compact scores;
// long explanatory copy is intentionally kept out of the repeat-use UI.
const STYLE_ID = 'pet-cafe-career-style';

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID;
  s.textContent = `
    .meta-reputation.career-openable{pointer-events:auto;cursor:pointer;transition:transform .16s ease,box-shadow .16s ease}.meta-reputation.career-openable:active{transform:scale(.97)}.career-peek{display:none!important}
    .career-root{position:fixed;inset:0;z-index:75;display:grid;place-items:center;padding:12px;box-sizing:border-box;font-family:system-ui,sans-serif}.career-root.hidden{display:none}.career-backdrop{position:absolute;inset:0;background:#211a178c;backdrop-filter:blur(5px)}
    .career-card{position:relative;width:min(500px,100%);max-height:min(700px,92vh);overflow:auto;box-sizing:border-box;border-radius:25px;padding:16px;background:linear-gradient(180deg,#fff8eb,#fff1df);color:#3d302b;box-shadow:0 24px 70px #0006;border:1px solid #ffffff}.career-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px}.career-title{font:950 22px/1 system-ui,sans-serif;letter-spacing:-.02em}.career-sub{display:none}.career-close{width:48px;height:48px;border:0;border-radius:50%;background:#49372c10;color:#3d302b;font:800 22px/1 system-ui;cursor:pointer;flex:none}
    .career-section{margin-top:10px;padding:12px;border-radius:17px;background:#ffffffa8;border:1px solid #5f45300e;box-shadow:inset 0 1px #fff}.career-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px}.career-kicker{font:900 9px/1 system-ui,sans-serif;letter-spacing:.11em;text-transform:uppercase;opacity:.48}.career-big{font:950 16px/1.05 system-ui,sans-serif}.career-muted{font:800 10px/1.15 system-ui,sans-serif;opacity:.55}.career-rank-value{font:950 12px/1 system-ui,sans-serif;color:#8b67d5;white-space:nowrap}.career-rank-next{margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.career-bar{height:7px;border-radius:6px;background:#2c211812;overflow:hidden;margin-top:7px}.career-bar>div{height:100%;border-radius:inherit;background:linear-gradient(90deg,#ff927e,#8979f4);transition:width .35s ease}
    .career-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin-top:8px}.career-day{min-width:0;height:38px;border-radius:10px;background:#efe5d9;display:flex;flex-direction:column;align-items:center;justify-content:center;font:900 9px/1 system-ui,sans-serif;color:#776960}.career-day.played{background:#fff0c4;color:#704b1e}.career-day .stars{font-size:9px;color:#e8a729;margin-top:3px;white-space:nowrap}.career-day.current{outline:2px solid #8b7cf6;outline-offset:1px}.career-cup{font:950 14px/1 system-ui,sans-serif;color:#9d6612;white-space:nowrap}.career-week-note{display:none}.career-trophies{display:flex;gap:7px;align-items:center;margin-top:8px}.career-medal{height:24px;min-width:35px;padding:0 7px;border-radius:999px;background:#f4eadf;display:inline-flex;align-items:center;justify-content:center;gap:5px;font:950 10px/1 system-ui,sans-serif}.career-medal i{width:10px;height:10px;border-radius:50%;box-shadow:inset 0 0 0 1px #0001}.career-medal.gold i{background:#efb928}.career-medal.silver i{background:#aeb6bd}.career-medal.bronze i{background:#c98356}
    .career-mastery{display:grid;gap:9px}.career-master-row{display:grid;grid-template-columns:minmax(58px,88px) minmax(54px,1fr) auto auto;align-items:center;gap:7px}.career-master-name{font:900 11px/1 system-ui,sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.career-master-name small{display:none}.career-master-bar{height:6px;border-radius:5px;background:#2c211810;overflow:hidden}.career-master-bar>div{height:100%;border-radius:inherit;background:linear-gradient(90deg,#75c88a,#f0b33f)}.career-master-level{font:900 9px/1 system-ui,sans-serif;opacity:.5;white-space:nowrap}.career-bonus{font:950 10px/1 system-ui,sans-serif;color:#4f8a5c;white-space:nowrap}
    .career-finish{background:linear-gradient(135deg,#f6efff,#fff);border-color:#8b7cf62d;display:flex;align-items:center;justify-content:space-between;gap:10px}.career-finish .career-kicker{opacity:.75;color:#674fd0}.career-finish .career-big{color:#674fd0}.career-finish-note{font:950 11px/1 system-ui,sans-serif;color:#674fd0;opacity:1;white-space:nowrap}
    .career-result{width:100%;box-sizing:border-box;padding:9px 11px;border-radius:15px;background:linear-gradient(135deg,#eef8ff,#fff);border:1px solid #5ba3da2c;text-align:left}.career-result.won{background:linear-gradient(135deg,#effbec,#fff8df);border-color:#68b85b32}.career-result-top{display:flex;align-items:center;justify-content:space-between;gap:8px}.career-result-copy{min-width:0;display:flex;align-items:baseline;gap:7px}.career-result-copy .career-muted{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.career-result-score{font:950 15px/1 system-ui,sans-serif;color:#53779a;white-space:nowrap}.career-result.won .career-result-score{color:#4b8a46}.career-result-delta{font:950 10px/1 system-ui,sans-serif;color:#6b5bd1;white-space:nowrap}
    .career-summary{width:100%;box-sizing:border-box;padding:9px 11px;border-radius:15px;background:linear-gradient(135deg,#eef8ff,#fff);border:1px solid #5ba3da2c;text-align:left}.career-summary-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.career-summary-week{font:950 12px/1 system-ui,sans-serif;color:#4c76a0}.career-summary-cup{font:950 14px/1 system-ui,sans-serif;color:#4c76a0}.career-summary-award{margin-top:6px;padding:6px 8px;border-radius:10px;background:#fff0bd;font:950 10px/1 system-ui,sans-serif;color:#7d5612;text-align:center}.career-next-chase{display:none!important}.card .career-hidden-report{display:none!important}
    @media(max-width:300px){.career-root{padding:6px}.career-card{padding:10px;border-radius:20px}.career-title{font-size:19px}.career-section{padding:9px;margin-top:7px}.career-day{height:34px}.career-master-row{grid-template-columns:minmax(48px,68px) minmax(38px,1fr) auto auto;gap:5px}.career-master-name{font-size:9px}.career-close{width:48px;height:48px}.career-medal{min-width:30px;padding:0 5px}}
    @media(max-height:480px){.career-card{max-height:96vh}.career-head{min-height:48px}.career-section{margin-top:6px;padding:8px}.career-week{margin-top:6px}.career-day{height:31px}.career-mastery{gap:7px}}
  `;
  document.head.appendChild(s);
}

function pct(n) { return `${Math.round(Math.max(0, Math.min(1, n || 0)) * 100)}%`; }
function metricDelta(kind, n) { return kind === 'earn' ? Math.round(n).toLocaleString('en-US') : kind === 'streak' ? `${n}x` : `${n}`; }

export function createCareerUI() {
  injectStyle();
  const repChip = document.querySelector('.meta-reputation');
  if (repChip) {
    repChip.classList.add('career-openable'); repChip.tabIndex = 0; repChip.setAttribute('role', 'button'); repChip.setAttribute('aria-label', 'Open Cafe Journey');
    repChip.querySelector('.career-peek')?.remove();
  }

  const root = document.createElement('div'); root.className = 'career-root hidden';
  root.innerHTML = `<div class="career-backdrop"></div><div class="career-card" role="dialog" aria-modal="true" aria-label="Cafe Journey">
    <div class="career-head"><div class="career-title">Café Journey</div><button class="career-close" type="button" aria-label="Close">×</button></div>
    <div class="career-section career-rank"><div class="career-section-head"><div class="career-big career-rank-title">Cozy Corner</div><div class="career-rank-value">0 ★</div></div><div class="career-bar"><div></div></div><div class="career-muted career-rank-next"></div></div>
    <div class="career-section career-week-section"><div class="career-section-head"><div class="career-big career-week-title">Week 1</div><div class="career-cup career-week-points">0/24</div></div><div class="career-week-note"></div><div class="career-week"></div><div class="career-trophies"></div></div>
    <div class="career-section career-mastery-section"><div class="career-section-head"><div class="career-kicker">MASTERY</div></div><div class="career-mastery"></div></div>
    <div class="career-section career-finish"><div class="career-kicker career-finish-title">LEGENDARY</div><div class="career-finish-note">0/220 ★</div></div>
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
    root.querySelector('.career-rank-value').textContent = `${model.rank.rep} ★`;
    root.querySelector('.career-rank-next').textContent = model.rank.nextTitle || 'MAX';
    root.querySelector('.career-rank-next').setAttribute('aria-label', model.rank.nextTitle ? `Next rank ${model.rank.nextTitle}` : 'Maximum career rank');
    root.querySelector('.career-rank .career-bar>div').style.width = pct(model.rank.frac);

    root.querySelector('.career-week-title').textContent = `Week ${model.week.week}`;
    root.querySelector('.career-week-points').textContent = `${model.week.points}/24`;
    const weekEl = root.querySelector('.career-week'); weekEl.textContent = '';
    for (let i = 0; i < 7; i++) {
      const r = model.week.shifts[i]; const d = document.createElement('div');
      d.className = 'career-day' + (r ? ' played' : '') + (model.week.currentIndex === i ? ' current' : '');
      d.innerHTML = `<span>${['M','T','W','T','F','S','S'][i]}</span><span class="stars">${r ? '★'.repeat(r.rating) + (r.contractMet ? '✓' : '') : '·'}</span>`;
      d.setAttribute('aria-label', r ? `${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][i]} ${r.rating} stars${r.contractMet ? ', contract met' : ''}` : `${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][i]} not played`);
      weekEl.appendChild(d);
    }
    const trophies = root.querySelector('.career-trophies'); trophies.textContent = '';
    for (const tier of ['gold','silver','bronze']) {
      const count = model.trophies[tier] | 0; const el = document.createElement('span'); el.className = `career-medal ${tier}`;
      el.innerHTML = `<i aria-hidden="true"></i><span>${count}</span>`; el.setAttribute('aria-label', `${tier} cups ${count}`); trophies.appendChild(el);
    }

    const mastery = root.querySelector('.career-mastery'); mastery.textContent = '';
    for (const m of model.masteries) {
      const row = document.createElement('div'); row.className = 'career-master-row';
      row.innerHTML = `<div class="career-master-name">${m.label}</div><div class="career-master-bar"><div style="width:${pct(m.frac)}"></div></div><div class="career-master-level">${m.level}/4</div><div class="career-bonus">+${m.bonus}%</div>`;
      row.setAttribute('aria-label', `${m.label}, mastery ${m.level} of 4, ${m.sales} sold, plus ${m.bonus} percent value`); mastery.appendChild(row);
    }
    root.querySelector('.career-finish-title').textContent = model.legendary ? 'LEGENDARY ✓' : 'LEGENDARY';
    root.querySelector('.career-finish-note').textContent = `${Math.min(model.legendaryTarget, model.rank.rep)}/${model.legendaryTarget} ★`;
  }

  function decorateSummary(summary) {
    let tries = 0;
    const attach = () => {
      const card = document.querySelector('.sheet-root .card');
      if (!card) { if (++tries < 20) setTimeout(attach, 25); return; }
      card.querySelectorAll('.career-result,.career-summary,.career-next-chase').forEach(el => el.remove());

      const body = card.querySelector('.cbody');
      if (body) {
        const rows = [...body.querySelectorAll('.srow-sub')];
        rows.forEach((row, i) => row.classList.toggle('career-hidden-report', i > 1));
        body.querySelectorAll('.srow-label').forEach(row => row.classList.add('career-hidden-report'));
      }

      const result = document.createElement('div'); result.className = 'career-result' + (summary.contract.met ? ' won' : '');
      const resultTop = document.createElement('div'); resultTop.className = 'career-result-top';
      const resultCopy = document.createElement('div'); resultCopy.className = 'career-result-copy';
      resultCopy.innerHTML = `<span class="career-kicker">CONTRACT</span><span class="career-muted">${summary.contract.label}</span>`;
      const resultScore = document.createElement('div'); resultScore.className = 'career-result-score'; resultScore.textContent = summary.contract.met ? 'WON ✓' : 'MISS';
      resultTop.append(resultCopy, resultScore);
      if (summary.contract.rival && summary.contract.previous != null) {
        const diff = summary.contract.progress - summary.contract.previous; const delta = document.createElement('div'); delta.className = 'career-result-delta';
        delta.textContent = `${diff >= 0 ? '+' : ''}${metricDelta(summary.contract.kind, diff)}`; delta.setAttribute('aria-label', `${diff >= 0 ? 'plus' : 'minus'} ${Math.abs(diff)} versus last week`); resultCopy.appendChild(delta);
      }
      result.appendChild(resultTop);
      const rating = card.querySelector('.meta-rating');
      if (rating) rating.before(result); else if (body) body.after(result); else card.appendChild(result);

      const box = document.createElement('div'); box.className = 'career-summary';
      const top = document.createElement('div'); top.className = 'career-summary-top';
      const week = document.createElement('div'); week.className = 'career-summary-week'; week.textContent = `W${summary.week.week}`; week.setAttribute('aria-label', `Week ${summary.week.week} Cup`);
      const score = document.createElement('div'); score.className = 'career-summary-cup'; score.textContent = `${summary.week.points}/24`;
      top.append(week, score); box.appendChild(top);
      if (summary.cupAward && summary.cupAward.awarded) {
        const award = document.createElement('div'); award.className = 'career-summary-award';
        award.textContent = `${summary.cupAward.tier.toUpperCase()} · +${summary.cupAward.reward.toLocaleString('en-US')}`; box.appendChild(award);
      }
      const continueBtn = card.querySelector('.continue');
      if (continueBtn) continueBtn.before(box); else card.appendChild(box);
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
