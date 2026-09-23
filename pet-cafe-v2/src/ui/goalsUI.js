// src/ui/goalsUI.js — the daily goals button and sheet, and the "while you were away" welcome back.
export function createGoalsUI(root, W, goals, audio, fx, platform, onPause) {
  root.insertAdjacentHTML('beforeend', `<button class="goalbtn ui" id="goalbtn" aria-label="Daily goals"><span>📋</span><i class="dot hidden"></i></button>`);
  document.body.insertAdjacentHTML('beforeend', `
    <div class="sheet hidden" id="goalsheet"><div class="sheet-card">
      <div class="sheet-head"><b>📋 Today's goals</b><button class="close" aria-label="Close">✕</button></div>
      <div class="goallist" id="goallist"></div>
      <div class="goalfoot">New goals every day 🌅</div>
    </div></div>
    <div class="sheet hidden" id="awaysheet"><div class="sheet-card awaycard">
      <div class="awayart">😺☕</div>
      <div class="awaytitle">Welcome back!</div>
      <div class="awaytext">While you were away, your staff kept the café running.</div>
      <div class="awaycoins"><i class="coin"></i><b id="awayamt">0</b></div>
      <button class="big" id="awaydouble"><i class="play"></i> Collect ×2</button>
      <button class="plain" id="awaytake">Collect</button>
    </div></div>`);
  const btn = root.querySelector('#goalbtn'), dot = btn.querySelector('.dot');
  const sheet = document.getElementById('goalsheet'), list = document.getElementById('goallist');
  const away = document.getElementById('awaysheet');
  let awayAmt = 0;

  function render() {
    list.innerHTML = goals.list.map((g, i) => {
      const done = g.got >= g.n, pct = Math.round(100 * g.got / g.n);
      const action = g.claimed ? `<span class="gdone">✅</span>`
        : done ? `<button class="gclaim" data-i="${i}"><i class="coin"></i>${g.reward}</button>${platform.rewardedAvailable() ? `<button class="gdouble" data-d="${i}"><i class="play"></i>×2</button>` : ''}`
        : `<span class="greward"><i class="coin"></i>${g.reward}</span>`;
      return `<div class="goal ${g.claimed ? 'claimed' : ''}"><div class="gicon">${goals.icon(g)}</div>
        <div class="gtxt"><b>${goals.text(g)}</b><div class="bar"><i style="width:${pct}%"></i></div><small>${g.got}/${g.n}</small></div>${action}</div>`;
    }).join('');
  }
  async function claim(i, double) {
    if (double) {
      const ok = await platform.rewarded('pet-cafe-goal-double');
      if (!ok) return;
    }
    const r = goals.claim(i); if (!r) return;
    W.earn(r * (double ? 2 : 1), W.stations.get('till1').x, W.stations.get('till1').z, true);
    audio.play(double ? 'fanfare' : 'chime'); render();
  }
  list.addEventListener('click', e => {
    const c = e.target.closest('[data-i]'), d = e.target.closest('[data-d]');
    if (c) claim(+c.dataset.i, false); else if (d) claim(+d.dataset.d, true);
  });
  btn.addEventListener('click', e => { e.stopPropagation(); goals.ensure(); render(); sheet.classList.remove('hidden'); onPause(true); audio.play('tap'); });
  sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('.close')) { sheet.classList.add('hidden'); onPause(false); } });

  const closeAway = (mult) => { if (awayAmt > 0) W.earn(awayAmt * mult, W.stations.get('till1').x, W.stations.get('till1').z, true); awayAmt = 0; away.classList.add('hidden'); onPause(false); audio.play(mult > 1 ? 'fanfare' : 'coin'); };
  document.getElementById('awaytake').addEventListener('click', () => closeAway(1));
  document.getElementById('awaydouble').addEventListener('click', async () => {
    const ok = await platform.rewarded('pet-cafe-away-double');
    closeAway(ok ? 2 : 1);
  });

  let t = 0;
  return {
    welcome(amount) {
      awayAmt = amount;
      document.getElementById('awayamt').textContent = amount.toLocaleString('en-US');
      document.getElementById('awaydouble').style.display = platform.rewardedAvailable() ? '' : 'none';
      away.classList.remove('hidden'); onPause(true);
    },
    update(dt) {
      t -= dt; if (t > 0) return; t = 0.5;
      goals.ensure();
      dot.classList.toggle('hidden', !goals.ready());
      btn.classList.toggle('glow', goals.ready() > 0);
    },
  };
}
