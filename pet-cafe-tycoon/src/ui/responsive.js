// Responsive presentation policy: preserve tutorial clarity early, reduce label noise in a dense café.
const ID = 'pet-cafe-responsive-polish';

function installStyles() {
  if (document.getElementById(ID)) return;
  const s = document.createElement('style');
  s.id = ID;
  s.textContent = `
    @media (max-width:600px) and (orientation:portrait) {
      body.meta-dense-cafe .chalk{display:none!important}
      body.meta-dense-cafe .demand{font-size:11px!important;padding:1px 5px!important;min-height:20px!important;transform:translate(-50%,-50%) scale(.82)!important;transform-origin:center}
      body.meta-dense-cafe .dpip{width:4px!important;height:4px!important}
      .objCaption{font-size:12px!important;padding:4px 9px!important;max-width:145px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
      #hint{font-size:13px!important;max-width:76vw!important;padding:7px 12px!important;text-align:center}
      .meta-reputation{max-width:154px!important;min-width:132px!important}
      .meta-rep-title{max-width:94px!important}
      .meta-pawbook{min-height:38px!important;padding:0 10px!important}
    }
    @media (max-width:380px) and (orientation:portrait) {
      body.meta-dense-cafe .demand{transform:translate(-50%,-50%) scale(.74)!important}
      .objCaption{max-width:122px!important}
    }
  `;
  document.head.appendChild(s);
}

export function createResponsivePolish(G) {
  installStyles();
  const paw = document.querySelector('.meta-paw');
  if (paw) paw.textContent = '🐾';
  let lastDense = null;
  return {
    update() {
      const dense = ((G.meta && G.meta.reputation) | 0) >= 18 || (G.world && G.world.built && G.world.built.size >= 7);
      if (dense === lastDense) return;
      lastDense = dense;
      document.body.classList.toggle('meta-dense-cafe', dense);
    },
  };
}
