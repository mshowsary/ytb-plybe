const STYLE_ID = 'pet-cafe-pet-moments';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .pet-identity{position:absolute;transform:translate(-50%,-100%);z-index:2;pointer-events:none;
      display:flex;align-items:center;gap:5px;max-width:150px;padding:5px 9px;border-radius:999px;
      background:#fff9f0ee;color:#493b35;box-shadow:0 3px 10px #0002;border:1px solid #fff;
      font:900 11px/1.05 system-ui,sans-serif;white-space:nowrap;opacity:0;transition:opacity .18s ease,transform .18s ease}
    .pet-identity.show{opacity:1;transform:translate(-50%,-108%)}
    .pet-identity .paw{font-size:12px;color:#d97c70}.pet-identity .detail{font-size:9px;font-weight:800;opacity:.56;text-transform:uppercase;letter-spacing:.06em}
    .pet-identity.rare{border-color:#9d87ed88}.pet-identity.epic{border-color:#df78b488;background:#fff4faee}
    body.ui-compact .pet-identity{font-size:10px;padding:4px 7px}.pet-identity.seated .detail{display:none}
    @media(max-width:380px){.pet-identity{max-width:110px;font-size:9px;padding:4px 6px}.pet-identity .detail{display:none}}
  `;
  document.head.appendChild(style);
}

export function createPetMoment(els, profile) {
  ensureStyle();
  const el = document.createElement('div');
  el.className = `pet-identity ${profile.rarity || 'common'}`;
  const paw = document.createElement('span'); paw.className = 'paw'; paw.textContent = '♥';
  const name = document.createElement('span'); name.textContent = profile.name;
  const detail = document.createElement('span'); detail.className = 'detail'; detail.textContent = '';
  el.append(paw, name, detail); els.fx.appendChild(el);

  let timer = 0, seated = false, detailText = '';
  const P = {};
  P.announce = (text = '', seconds = 2.2) => { detailText = text; detail.textContent = text; timer = Math.max(timer, seconds); };
  P.setSeated = value => { seated = !!value; el.classList.toggle('seated', seated); };
  P.remove = () => el.remove();
  P.update = (dt, fx, x, y, z) => {
    timer = Math.max(0, timer - dt);
    const visible = seated || timer > 0;
    if (!visible) { el.classList.remove('show'); return; }
    if (seated && timer <= 0 && detailText) { detailText = ''; detail.textContent = ''; }
    const p = { sx: 0, sy: 0, visible: true };
    fx.project(x, y, z, p);
    el.style.left = p.sx + 'px'; el.style.top = p.sy + 'px';
    el.classList.toggle('show', p.visible);
  };
  return P;
}
