// Certification-oriented presentation shell. Keeps the playfield readable first and lets depth live
// behind deliberate taps. It also owns the extreme-viewport policy used by publisher QA.
const STYLE_ID = 'pet-cafe-playables-shell';

function installStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    /* Default play state: less dashboard, more café. */
    body.playables-clean #handsFull{display:none!important}
    body.playables-clean #crowd:not(.urgent){opacity:0;transform:translateX(-8px);transition:opacity .18s ease,transform .18s ease}
    body.playables-clean #crowd.urgent{opacity:1;transform:none}
    body.playables-clean .chalk{opacity:.58;transition:opacity .16s ease}
    body.playables-clean .chalk.tappable:hover{opacity:1}
    body.playables-clean .career-peek{display:none!important}
    body.playables-clean .meta-reputation{min-width:0;max-width:142px}
    body.playables-clean .meta-pawbook{min-width:48px}
    body.playables-clean .party-order-btn{max-width:122px}
    body.playables-clean .card .cbody{width:100%}
    body.playables-clean .card .cbody>.srow-sub:nth-of-type(n+3){display:none!important}
    body.playables-clean .card .career-result-delta,
    body.playables-clean .card .career-next-chase,
    body.playables-clean .card .career-summary .career-muted,
    body.playables-clean .card .meta-rep-summary .meta-reward-sub,
    body.playables-clean .card .meta-rep-summary .meta-rep-bar{display:none!important}
    body.playables-clean .card .career-result,
    body.playables-clean .card .career-summary,
    body.playables-clean .card .meta-rating,
    body.playables-clean .card .meta-rep-summary,
    body.playables-clean .card .meta-reward{padding:8px 10px;border-radius:14px}
    body.playables-clean .card .career-result{min-height:46px;display:flex;align-items:center}
    body.playables-clean .card .career-result-top{width:100%}
    body.playables-clean .card .career-summary-award{margin-top:0}

    /* Pausing must freeze CSS-driven motion too; JS/WebAudio are handled in main/audio. */
    body.game-paused *, body.game-paused *::before, body.game-paused *::after{animation-play-state:paused!important}

    @media (max-width:600px), (max-height:520px) {
      body.playables-compact .chalk{display:none!important}
      body.playables-compact #goalPill{display:none!important}
      body.playables-compact .demand{font-size:11px!important;padding:1px 5px!important;min-height:20px!important;transform:translate(-50%,-50%) scale(.82)!important;transform-origin:center}
      body.playables-compact .dpip{width:4px!important;height:4px!important}
      body.playables-compact .objCaption{font-size:11px!important;padding:4px 8px!important;max-width:128px!important;overflow:hidden!important;text-overflow:ellipsis!important}
      body.playables-compact #hint{font-size:12px!important;line-height:1.15!important;max-width:78vw!important;padding:7px 10px!important;min-height:40px!important;text-align:center}
      body.playables-compact .fbtn{min-height:48px!important;max-width:min(72vw,180px)!important;padding:0 14px!important;font-size:12px!important;overflow:hidden!important;text-overflow:ellipsis!important}
      body.playables-compact .toast,.meta-toast{font-size:11px!important;max-width:80vw!important;padding:7px 10px!important}
      body.playables-compact .sheet{max-width:none!important;width:100%!important;max-height:94svh!important;padding:10px calc(10px + var(--sar)) calc(10px + var(--sab)) calc(10px + var(--sal))!important;border-radius:18px 18px 0 0!important}
      body.playables-compact .card{width:calc(100% - 12px)!important;max-width:none!important;max-height:calc(100svh - 12px)!important;padding:16px 10px 10px!important;gap:8px!important;border-radius:18px!important}
      body.playables-compact .stitle,body.playables-compact .ctitle{font-size:17px!important;margin-bottom:6px!important}
      body.playables-compact .srows{gap:7px!important}
      body.playables-compact .srow{padding:8px 9px!important;gap:8px!important;border-radius:12px!important}
      body.playables-compact .srow-sub{font-size:11px!important;line-height:1.2!important}
      body.playables-compact .srow-label{font-size:13px!important}
      body.playables-compact .sclose{width:48px!important;height:48px!important;top:5px!important;right:5px!important}
      body.playables-compact .meta-reputation{max-width:116px!important;min-width:0!important;padding:6px 8px!important}
      body.playables-compact .meta-rep-title{max-width:68px!important;font-size:10px!important}
      body.playables-compact .meta-rep-value{display:none!important}
      body.playables-compact .meta-pawbook{min-height:40px!important;padding:0 9px!important}
      body.playables-compact .party-order-label{display:none!important}

      body.playables-compact .career-root,
      body.playables-compact .meta-book-root,
      body.playables-compact .party-root{padding:6px!important}
      body.playables-compact .career-card,
      body.playables-compact .meta-book,
      body.playables-compact .party-card{width:100%!important;max-width:none!important;max-height:calc(100svh - 12px)!important;padding:12px!important;border-radius:18px!important}
      body.playables-compact .career-sub,
      body.playables-compact .party-sub{display:none!important}
      body.playables-compact .career-title,body.playables-compact .meta-book-title,body.playables-compact .party-title{font-size:18px!important}
      body.playables-compact .career-section{margin-top:8px!important;padding:9px!important;border-radius:14px!important}
      body.playables-compact .career-week{gap:3px!important;margin-top:6px!important}
      body.playables-compact .career-day{height:32px!important;border-radius:8px!important;font-size:8px!important}
      body.playables-compact .career-day .stars{font-size:8px!important}
      body.playables-compact .career-master-row{grid-template-columns:1fr auto!important;gap:5px 8px!important}
      body.playables-compact .career-master-bar{grid-column:1/-1!important}
      body.playables-compact .career-trophies{gap:4px!important}
      body.playables-compact .career-trophy{padding:4px 6px!important;font-size:8px!important}
      body.playables-compact .meta-book-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:6px!important}
      body.playables-compact .meta-pet-card{min-height:84px!important;padding:6px!important}
      body.playables-compact .meta-pet-swatch{width:34px!important;height:34px!important}
      body.playables-compact .party-row{grid-template-columns:30px 1fr auto!important;gap:6px!important;padding:6px!important}
      body.playables-compact .party-icon{width:28px!important;height:28px!important}
      body.playables-compact .party-foot{gap:7px!important;margin-top:8px!important;padding-top:8px!important}
    }

    /* Publisher torture-test class: 218x418-class phones and 418x218 landscape. */
    body.playables-tiny #wallet{left:calc(5px + var(--sal))!important;top:calc(5px + var(--sat))!important;min-height:44px!important;padding:5px 9px!important;font-size:14px!important;gap:5px!important}
    body.playables-tiny #wallet .coin{width:17px!important;height:17px!important}
    body.playables-tiny .pause-btn{right:calc(5px + env(safe-area-inset-right,0px))!important;top:calc(5px + env(safe-area-inset-top,0px))!important;width:48px!important;height:48px!important;border-radius:14px!important}
    body.playables-tiny #dayPill{right:calc(5px + var(--sar))!important;top:calc(58px + var(--sat))!important;min-width:98px!important;min-height:40px!important;padding:6px 8px!important;font-size:10px!important;gap:3px!important}
    body.playables-tiny #crowd.urgent{left:calc(5px + var(--sal))!important;top:calc(58px + var(--sat))!important;min-height:40px!important;padding:5px 8px!important;font-size:11px!important}
    body.playables-tiny #crowd .picon{width:17px!important;height:17px!important}
    body.playables-tiny .meta-reputation{left:calc(5px + env(safe-area-inset-left,0px))!important;top:calc(106px + env(safe-area-inset-top,0px))!important;width:48px!important;height:44px!important;box-sizing:border-box!important;padding:5px!important;display:grid!important;place-items:center!important}
    body.playables-tiny .meta-reputation .meta-rep-title,
    body.playables-tiny .meta-reputation .meta-rep-value,
    body.playables-tiny .meta-reputation .career-peek{display:none!important}
    body.playables-tiny .meta-reputation .meta-rep-top{display:grid!important;place-items:center!important;gap:0!important}
    body.playables-tiny .meta-reputation .meta-rep-star{font-size:20px!important}
    body.playables-tiny .meta-reputation .meta-rep-bar{position:absolute!important;left:6px!important;right:6px!important;bottom:5px!important;margin:0!important;height:3px!important}
    body.playables-tiny .meta-pawbook{left:calc(58px + env(safe-area-inset-left,0px))!important;top:calc(106px + env(safe-area-inset-top,0px))!important;width:60px!important;height:44px!important;min-height:44px!important;padding:0 5px!important;justify-content:center!important;font-size:9px!important;gap:3px!important}
    body.playables-tiny .meta-paw{font-size:15px!important}
    body.playables-tiny .party-order-btn{left:calc(123px + env(safe-area-inset-left,0px))!important;top:calc(106px + env(safe-area-inset-top,0px))!important;width:70px!important;min-height:44px!important;max-width:70px!important;padding:0 5px!important;justify-content:center!important;font-size:9px!important;gap:3px!important}
    body.playables-tiny .party-order-box{font-size:14px!important}
    body.playables-tiny .meta-streak{right:calc(5px + env(safe-area-inset-right,0px))!important;top:calc(155px + env(safe-area-inset-top,0px))!important;padding:6px 8px!important;font-size:10px!important}
    body.playables-tiny .demand{transform:translate(-50%,-50%) scale(.7)!important}
    body.playables-tiny .wish{transform:translate(-50%,-100%) scale(.8)!important;transform-origin:center bottom!important}
    body.playables-tiny .objCaption{max-width:96px!important;font-size:9px!important;padding:3px 6px!important}
    body.playables-tiny #hint{bottom:calc(58px + var(--sab))!important;font-size:10px!important;max-width:calc(100vw - 18px)!important;padding:6px 8px!important;min-height:36px!important}
    body.playables-tiny .skipPill{bottom:calc(7px + var(--sab))!important;min-height:44px!important;padding:0 12px!important;font-size:10px!important}
    body.playables-tiny .fbtn{font-size:10px!important;max-width:150px!important;padding:0 10px!important}
    body.playables-tiny .card .cbody{font-size:11px!important;line-height:1.25!important}
    body.playables-tiny .card .meta-rating-stars{font-size:19px!important}
    body.playables-tiny .card .meta-reward{gap:7px!important}
    body.playables-tiny .card .meta-reward-title{font-size:11px!important}
    body.playables-tiny .card .meta-reward-sub{display:none!important}
    body.playables-tiny .card .meta-reward-btn{min-width:90px!important;min-height:48px!important;font-size:11px!important}
    body.playables-tiny .pause-root{padding:5px!important}
    body.playables-tiny .pause-card{width:100%!important;max-width:none!important;max-height:calc(100svh - 10px)!important;padding:11px!important;border-radius:17px!important}
    body.playables-tiny .pause-head{margin-bottom:8px!important;gap:7px!important}.playables-tiny .pause-title{font-size:18px!important}.playables-tiny .pause-sub,.playables-tiny .pause-desc,.playables-tiny .pause-note{display:none!important}
    body.playables-tiny .pause-row{min-height:52px!important;margin-bottom:6px!important;padding:5px 7px!important;border-radius:12px!important}.playables-tiny .pause-label{font-size:12px!important}.playables-tiny .pause-toggle{min-width:64px!important;min-height:48px!important;font-size:10px!important}.playables-tiny .pause-actions{margin-top:7px!important}.playables-tiny .pause-action{min-height:48px!important}

    /* Extra-short landscape: top-left progression chips would cover the room, so reduce to essentials. */
    body.playables-tiny.playables-landscape .meta-reputation,
    body.playables-tiny.playables-landscape .meta-pawbook,
    body.playables-tiny.playables-landscape .party-order-btn{top:auto!important;bottom:calc(5px + env(safe-area-inset-bottom,0px))!important}
    body.playables-tiny.playables-landscape .meta-streak{top:calc(5px + env(safe-area-inset-top,0px))!important;right:calc(60px + env(safe-area-inset-right,0px))!important}
    body.playables-tiny.playables-landscape #dayPill{top:calc(5px + var(--sat))!important;right:calc(60px + var(--sar))!important}
    body.playables-tiny.playables-landscape #crowd.urgent{top:calc(5px + var(--sat))!important;left:calc(70px + var(--sal))!important}
    body.playables-tiny.playables-landscape #hint{bottom:calc(5px + var(--sab))!important;max-width:44vw!important}
  `;
  document.head.appendChild(s);
}

function classify() {
  const w = Math.max(1, window.innerWidth || 1);
  const h = Math.max(1, window.innerHeight || 1);
  const compact = w <= 600 || h <= 520;
  const tiny = w <= 240 || h <= 240;
  document.body.classList.toggle('playables-compact', compact);
  document.body.classList.toggle('playables-tiny', tiny);
  document.body.classList.toggle('playables-landscape', w > h);
  document.body.dataset.viewport = `${w}x${h}`;
  return { w, h, compact, tiny };
}

export function createPlayablesShell() {
  installStyle();
  document.body.classList.add('playables-clean');
  let state = classify();
  const onResize = () => { state = classify(); };
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
  return {
    update() {},
    refresh: onResize,
    destroy() { window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onResize); },
    get state() { return state; },
  };
}
