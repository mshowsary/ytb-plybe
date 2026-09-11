// The one owner of persistent gameplay HUD placement.
// Normal play deliberately exposes only the wallet and the Café menu button. Existing feature
// controls stay mounted as semantic entry points for their systems, but the menu owns discovery.
const ID = 'pet-cafe-hud-layout';

export function arrangeHud() {
  document.body.classList.add('calm-hud');
  return document.getElementById('hud');
}

export function installHudLayout() {
  if (document.getElementById(ID)) return;
  const s = document.createElement('style');
  s.id = ID;
  s.textContent = `
    :root{
      --ui-milk:#FFF9F1;
      --ui-espresso:#3E302B;
      --ui-sage:#80977C;
      --ui-biscuit:#DDB986;
      --ui-coral:#D98C82;
      --hud-edge:12px;
    }

    /* Secondary progress remains available from the Café menu. Keeping the original nodes mounted
       preserves their systems, models and accessibility routes without painting a dashboard. */
    body.calm-hud #resourceBar,
    body.calm-hud #followers,
    body.calm-hud #crowd,
    body.calm-hud #dayPill,
    body.calm-hud #goalPill,
    body.calm-hud #handsFull,
    body.calm-hud .meta-reputation,
    body.calm-hud .meta-pawbook,
    body.calm-hud .meta-streak,
    body.calm-hud .party-order-btn,
    body.calm-hud .rewards-cal-btn,
    body.calm-hud .mystery-float-chip,
    body.calm-hud .speed-build-chip,
    body.calm-hud .rare-visitor-chip,
    body.calm-hud .golden-shot-chip{display:none!important}

    /* Urgency uses stable color and shape. Repeating movement is reserved for characters. */
    body.calm-hud .wish.shake,
    body.calm-hud .demand.pulse,
    body.calm-hud .party-order-btn.bump{animation:none!important}
    body.calm-hud .wish.shake{outline:2px solid var(--ui-coral)}
    body.calm-hud .demand.pulse{background:var(--ui-coral)!important;color:#fff!important}
    body.reduced-motion *,body.reduced-motion *::before,body.reduced-motion *::after{
      scroll-behavior:auto!important;transition-duration:.01ms!important;
      animation-duration:.01ms!important;animation-iteration-count:1!important
    }

    body.calm-hud #wallet{
      position:fixed!important;
      left:calc(var(--hud-edge) + env(safe-area-inset-left,0px))!important;
      top:calc(var(--hud-edge) + env(safe-area-inset-top,0px))!important;
      right:auto!important;bottom:auto!important;
      min-width:94px!important;max-width:min(150px,calc(100vw - 76px))!important;
      height:48px!important;min-height:48px!important;
      padding:0 13px!important;box-sizing:border-box!important;
      gap:8px!important;border:1px solid #3e302b18!important;border-radius:15px!important;
      background:rgba(255,249,241,.94)!important;
      color:var(--ui-espresso)!important;box-shadow:0 4px 14px #271b1524!important;
      font:850 17px/1 ui-rounded,"Arial Rounded MT Bold",system-ui,sans-serif!important;
      font-variant-numeric:tabular-nums;transform:none!important;transition:background-color .15s ease!important;
      overflow:hidden;white-space:nowrap;
    }
    body.calm-hud #wallet .coin{width:20px!important;height:20px!important;flex:none}
    body.calm-hud #walletNum{display:block;min-width:4ch;overflow:hidden;text-overflow:clip}
    body.calm-hud #wallet .wallet-target{display:none!important}

    body.calm-hud .pause-btn{
      right:calc(var(--hud-edge) + env(safe-area-inset-right,0px))!important;
      top:calc(var(--hud-edge) + env(safe-area-inset-top,0px))!important;
      width:48px!important;height:48px!important;min-width:48px!important;min-height:48px!important;
      border:1px solid #3e302b18!important;border-radius:15px!important;
      background:rgba(255,249,241,.94)!important;
      color:var(--ui-espresso)!important;box-shadow:0 4px 14px #271b1524!important;
    }
    body.calm-hud .pause-btn svg{width:28px;height:28px;display:block}

    @media(max-width:359px){
      :root{--hud-edge:8px}
      body.calm-hud #wallet{min-width:82px!important;max-width:calc(100vw - 72px)!important;padding:0 10px!important;font-size:15px!important}
    }
    @media(max-width:259px),(max-height:259px){
      :root{--hud-edge:5px}
      body.calm-hud #wallet{min-width:74px!important;max-width:calc(100vw - 63px)!important;padding:0 8px!important;gap:5px!important;font-size:14px!important}
      body.calm-hud #wallet .coin{width:18px!important;height:18px!important}
      body.calm-hud .pause-btn{border-radius:13px!important}
    }
  `;
  document.head.appendChild(s);
  arrangeHud();
}
