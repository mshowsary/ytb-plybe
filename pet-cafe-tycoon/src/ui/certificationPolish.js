// Last-mile publisher QA rules. Loaded after the rest of the UI so these minimum hit areas win
// without forcing desktop layouts to become oversized.
const ID = 'pet-cafe-certification-polish';

function compactContractTarget(label) {
  const full = String(label || '').trim();
  const target = full.replace(/^Rival\s*·\s*/i, '').trim();
  let m = target.match(/Reach\s+([\d,]+)x\s+service/i);
  if (m) return `${m[1]}x SERVICE`;
  m = target.match(/Serve\s+([\d,]+)/i);
  if (m) return `${m[1]} GUESTS`;
  m = target.match(/Earn\s+([\d,]+)/i);
  if (m) return `${m[1]} COINS`;
  return target.toUpperCase();
}

function polishDynamicLabels(root = document) {
  for (const el of root.querySelectorAll?.('.career-result-copy .career-muted') || []) {
    const full = el.dataset.fullContractLabel || el.textContent.trim();
    if (!full) continue;
    const compact = compactContractTarget(full);
    el.dataset.fullContractLabel = full;
    el.setAttribute('aria-label', `Contract target: ${full}`);
    el.title = full;
    if (el.textContent !== compact) el.textContent = compact;
  }
}

export function installCertificationPolish() {
  if (document.getElementById(ID)) return;
  const s = document.createElement('style'); s.id = ID;
  s.textContent = `
    /* Gameplay feedback must never cross a modal/sheet. A toast can still be announced again by
       the next gameplay event after the player closes the surface. */
    body:has(.career-root:not(.hidden)) .meta-toast,
    body:has(.meta-book-root:not(.hidden)) .meta-toast,
    body:has(.pause-root:not(.hidden)) .meta-toast,
    body:has(.sheet-root:not(.hidden)) .meta-toast{opacity:0!important;transform:translate(-50%,10px)!important}
    @media(max-width:600px),(max-height:520px){
      body.playables-compact button,
      body.playables-compact [role="button"]{touch-action:manipulation}
      body.playables-compact .pause-btn,
      body.playables-compact .fbtn,
      body.playables-compact .skipPill,
      body.playables-compact .sclose,
      body.playables-compact .sbtn,
      body.playables-compact .subbtn,
      body.playables-compact .stab,
      body.playables-compact .career-close,
      body.playables-compact .meta-book-close,
      body.playables-compact .party-close,
      body.playables-compact .party-claim,
      body.playables-compact .reno-buy,
      body.playables-compact .pause-toggle,
      body.playables-compact .pause-action{min-height:48px!important}
      body.playables-compact .career-close,
      body.playables-compact .meta-book-close,
      body.playables-compact .party-close{width:48px!important;height:48px!important;min-width:48px!important;padding:0!important}
      body.playables-compact .meta-reputation{height:48px!important;min-height:48px!important;cursor:pointer;pointer-events:auto!important}
      body.playables-compact .meta-pawbook,
      body.playables-compact .party-order-btn{height:48px!important;min-height:48px!important}
    }
    @media(max-width:240px),(max-height:240px){
      body.playables-tiny .meta-reputation{height:48px!important;min-height:48px!important}
      body.playables-tiny .meta-pawbook{height:48px!important;min-height:48px!important}
      body.playables-tiny .party-order-btn{height:48px!important;min-height:48px!important}
      body.playables-tiny .stabs{gap:3px!important}
      body.playables-tiny .stab{padding:0 4px!important;font-size:10px!important}
      /* At 218px wide the renovation title gets two honest lines instead of a mechanical ellipsis. */
      body.playables-tiny .career-renovation .reno-next{gap:4px!important}
      body.playables-tiny .career-renovation .reno-name{font-size:9px!important;line-height:1.05!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important}
      body.playables-tiny .career-renovation .reno-buy{min-width:72px!important;padding-left:6px!important;padding-right:6px!important}
    }
    /* Real-world ultra-narrow portrait stress: the three progression chips share the row using
       the available width instead of assuming the older 218px publisher fixture. At 183px this
       keeps honest gaps between reputation, Visitor Book and Party Order while preserving 48px
       touch height. The calculation also degrades gracefully a little below 183px. */
    @media(orientation:portrait) and (max-width:200px){
      body.playables-tiny .meta-reputation,
      body.playables-tiny .meta-pawbook,
      body.playables-tiny .party-order-btn{
        width:calc((100vw - 20px)/3)!important;
        min-width:0!important;
        max-width:none!important;
        height:48px!important;
        min-height:48px!important;
        padding-left:3px!important;
        padding-right:3px!important;
        gap:2px!important
      }
      body.playables-tiny .meta-reputation{left:calc(5px + env(safe-area-inset-left,0px))!important}
      body.playables-tiny .meta-pawbook{left:calc(10px + env(safe-area-inset-left,0px) + (100vw - 20px)/3)!important;font-size:8px!important}
      body.playables-tiny .party-order-btn{left:calc(15px + env(safe-area-inset-left,0px) + 2*(100vw - 20px)/3)!important;right:auto!important;font-size:8px!important}
      body.playables-tiny .meta-paw{font-size:13px!important}
      body.playables-tiny .party-order-box{font-size:12px!important}
    }
    /* 418x218 is a publisher stress viewport, not a normal phone layout. Keep every actionable
       Journey control visible at once: rank, current week and renovation are the three actionable
       summaries. Mastery/finish remain available in portrait and all normal landscape sizes. */
    @media(orientation:landscape) and (max-height:240px){
      body.playables-tiny .career-root{padding:4px!important;place-items:center!important}
      body.playables-tiny .career-card{
        width:calc(100vw - 8px)!important;max-width:calc(100vw - 8px)!important;
        height:calc(100vh - 8px)!important;max-height:calc(100vh - 8px)!important;
        overflow:hidden!important;padding:6px!important;border-radius:17px!important;
        display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;
        grid-template-rows:48px minmax(0,1fr)!important;gap:5px!important
      }
      body.playables-tiny .career-head{grid-column:1/-1!important;height:48px!important;min-height:48px!important;margin:0!important;align-items:center!important}
      body.playables-tiny .career-title{font-size:17px!important}
      body.playables-tiny .career-section{margin:0!important;padding:6px!important;border-radius:11px!important;min-width:0!important;min-height:0!important;overflow:hidden!important}
      body.playables-tiny .career-rank{grid-column:1!important;grid-row:2!important}
      body.playables-tiny .career-week-section{grid-column:2!important;grid-row:2!important}
      body.playables-tiny .career-renovation{grid-column:3!important;grid-row:2!important}
      body.playables-tiny .career-mastery-section,
      body.playables-tiny .career-finish{display:none!important}
      body.playables-tiny .career-section-head{margin-bottom:4px!important;gap:4px!important}
      body.playables-tiny .career-big{font-size:11px!important}
      body.playables-tiny .career-rank-value,
      body.playables-tiny .career-cup{font-size:10px!important}
      body.playables-tiny .career-rank-next{display:none!important}
      body.playables-tiny .career-bar{height:5px!important;margin-top:5px!important}
      body.playables-tiny .career-week{gap:2px!important;margin-top:5px!important}
      body.playables-tiny .career-day{height:31px!important;border-radius:6px!important;font-size:7px!important}
      body.playables-tiny .career-day .stars{font-size:6px!important;margin-top:2px!important;letter-spacing:-1px!important}
      body.playables-tiny .career-trophies{display:none!important}
      body.playables-tiny .reno-top{gap:4px!important}
      body.playables-tiny .reno-level{font-size:8px!important}
      body.playables-tiny .reno-next{margin-top:5px!important;display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:5px!important;align-content:start!important}
      body.playables-tiny .reno-name{font-size:9px!important;line-height:1!important}
      body.playables-tiny .reno-buy{width:100%!important;min-width:0!important;height:48px!important;min-height:48px!important;padding:0 5px!important;font-size:10px!important;border-radius:9px!important}
      body.playables-tiny .reno-done{font-size:9px!important}
    }
    @media(prefers-reduced-motion:reduce){
      *,*::before,*::after{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}
    }
  `;
  document.head.appendChild(s);

  const startDynamicPolish = () => {
    polishDynamicLabels();
    const observer = new MutationObserver(mutations => {
      if (mutations.some(m => m.addedNodes.length)) polishDynamicLabels();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) startDynamicPolish();
  else document.addEventListener('DOMContentLoaded', startDynamicPolish, { once: true });
}
