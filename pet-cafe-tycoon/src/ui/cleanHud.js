// Global HUD declutter. Depth stays available behind taps; the playfield only shows information
// that changes the player's immediate decision.
const ID = 'pet-cafe-clean-hud-v3';
export function installCleanHud() {
  if (document.getElementById(ID)) return;
  const s = document.createElement('style'); s.id = ID;
  s.textContent = `
    /* The café is the interface. Persistent tutorial/report prose does not belong over gameplay. */
    body.playables-clean #hint,
    body.playables-clean #handsFull,
    body.playables-clean #goalPill{display:none!important}

    body.playables-clean .meta-reputation{width:54px!important;height:48px!important;min-width:54px!important;max-width:54px!important;box-sizing:border-box!important;padding:5px 7px!important;display:grid!important;place-items:center!important}
    body.playables-clean .meta-reputation .meta-rep-title,
    body.playables-clean .meta-reputation .meta-rep-value,
    body.playables-clean .meta-reputation .career-peek{display:none!important}
    body.playables-clean .meta-reputation .meta-rep-top{display:grid!important;place-items:center!important;gap:0!important}
    body.playables-clean .meta-reputation .meta-rep-star{font-size:21px!important}
    body.playables-clean .meta-reputation .meta-rep-bar{position:absolute!important;left:7px!important;right:7px!important;bottom:5px!important;margin:0!important;height:3px!important}
    body.playables-clean .meta-pawbook{width:70px!important;min-width:70px!important;max-width:70px!important;justify-content:center!important;padding:0 6px!important}
    body.playables-clean .party-order-btn{width:82px!important;max-width:82px!important;justify-content:center!important;padding:0 7px!important}
    body.playables-clean .party-order-label{display:none!important}
    body.playables-clean.meta-dense-cafe .chalk{display:none!important}
    body.playables-clean #banner{font-size:17px;padding:9px 18px}
    body.playables-clean .meta-streak{font-size:11px;padding:6px 9px}

    /* End-of-shift is a glance, not a report. Journey keeps the detailed numbers. */
    body.playables-clean .card .cbody>.srow-sub{font-size:12px!important;line-height:1.2!important}
    body.playables-clean .card .cbody>.srow-sub:nth-of-type(n+3),
    body.playables-clean .card .cbody>.srow-label{display:none!important}
    body.playables-clean .card .career-result-delta,
    body.playables-clean .card .career-next-chase,
    body.playables-clean .card .career-summary .career-muted,
    body.playables-clean .card .meta-rep-summary .meta-reward-sub,
    body.playables-clean .card .meta-rep-summary .meta-rep-bar{display:none!important}
    body.playables-clean .card .career-summary{padding:7px 9px!important}
    body.playables-clean .card .career-summary-award{margin:0!important;padding:7px!important}

    @media(min-width:601px) and (min-height:521px){
      body.playables-clean .meta-reputation{left:calc(12px + env(safe-area-inset-left,0px))!important;top:calc(184px + env(safe-area-inset-top,0px))!important}
      body.playables-clean .meta-pawbook{left:calc(12px + env(safe-area-inset-left,0px))!important;top:calc(238px + env(safe-area-inset-top,0px))!important}
      body.playables-clean .party-order-btn{left:calc(12px + env(safe-area-inset-left,0px))!important;top:calc(286px + env(safe-area-inset-top,0px))!important}
    }
  `;
  document.head.appendChild(s);
}
