// Last-mile publisher QA rules. Loaded after the rest of the UI so these minimum hit areas win
// without forcing desktop layouts to become oversized.
const ID = 'pet-cafe-certification-polish';
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
    }
    @media(prefers-reduced-motion:reduce){
      *,*::before,*::after{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}
    }
  `;
  document.head.appendChild(s);
}
