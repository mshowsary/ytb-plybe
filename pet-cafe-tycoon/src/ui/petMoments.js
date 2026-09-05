const STYLE_ID = 'pet-cafe-pet-moments';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .pet-identity{position:absolute;transform:translate(-50%,-100%);z-index:2;pointer-events:none;
      display:flex;align-items:center;gap:5px;max-width:150px;padding:5px 9px;border-radius:999px;
      background:#fff9f0ee;color:#493b35;box-shadow:0 3px 10px #0002;border:1px solid #fff;
      font:900 11px/1.05 system-ui,sans-serif;white-space:nowrap;opacity:0;transition:opacity .18s ease,transform .18s ease,box-shadow .18s ease,border-color .18s ease}
    .pet-identity.show{opacity:1;transform:translate(-50%,-108%)}
    .pet-identity .paw{font-size:12px;color:#d97c70}.pet-identity .detail{font-size:9px;font-weight:800;opacity:.56;text-transform:uppercase;letter-spacing:.06em;max-width:76px;overflow:hidden;text-overflow:ellipsis}
    .pet-identity.rare{border-color:#9d87ed88}.pet-identity.epic{border-color:#df78b488;background:#fff4faee}
    .pet-identity.play-break{border-color:#e58fa3cc;background:#fff6faee;box-shadow:0 4px 14px #d97c7040,0 0 0 2px #ffd9e080}
    .pet-identity.play-break .paw{animation:pet-break-paw .72s ease-in-out infinite alternate}.pet-identity.play-break .detail{opacity:.82;color:#a9516c}
    @keyframes pet-break-paw{from{transform:scale(.9)}to{transform:scale(1.2)}}
    body.ui-compact .pet-identity{font-size:10px;padding:4px 7px}.pet-identity.seated .detail{display:none}
    @media(max-width:380px){.pet-identity{max-width:110px;font-size:9px;padding:4px 6px}.pet-identity .detail{display:none}}
    @media(prefers-reduced-motion:reduce){.pet-identity.play-break .paw{animation:none}}
  `;
  document.head.appendChild(style);
}

export function createPetMoment(els, profile, customerId = null) {
  ensureStyle();
  const el = document.createElement('div');
  el.className = `pet-identity ${profile.rarity || 'common'}`;
  if (customerId != null) el.dataset.customerId = String(customerId);
  const paw = document.createElement('span'); paw.className = 'paw'; paw.textContent = '♥';
  const name = document.createElement('span'); name.textContent = profile.name;
  const detail = document.createElement('span'); detail.className = 'detail'; detail.textContent = '';
  el.append(paw, name, detail); els.fx.appendChild(el);

  let timer = 0, seated = false, playBreak = false, detailText = '';
  const projection = { sx: 0, sy: 0, visible: true };
  const P = { el };
  P.announce = (text = '', seconds = 2.2) => { detailText = text; detail.textContent = text; timer = Math.max(timer, seconds); };
  P.setSeated = value => { seated = !!value; el.classList.toggle('seated', seated); };
  P.setPlayBreak = value => {
    const next = !!value;
    if (next === playBreak) return;
    playBreak = next; el.classList.toggle('play-break', playBreak);
    if (playBreak) {
      detailText = 'PLAY BREAK ♥'; detail.textContent = detailText;
    } else if (detailText === 'PLAY BREAK ♥') {
      detailText = ''; detail.textContent = '';
    }
  };
  P.remove = () => el.remove();
  P.update = (dt, fx, x, y, z) => {
    timer = Math.max(0, timer - dt);
    const visible = seated || playBreak || timer > 0;
    if (!visible) { el.classList.remove('show'); return; }
    if (!playBreak && seated && timer <= 0 && detailText) { detailText = ''; detail.textContent = ''; }
    fx.project(x, y, z, projection);
    el.style.left = projection.sx + 'px'; el.style.top = projection.sy + 'px';
    el.classList.toggle('show', projection.visible);
  };

  // Common visitors get a tiny personality introduction; rare/epic callers can immediately
  // overwrite this with a higher-priority rarity announcement without creating another element.
  if (profile.trait) P.announce(profile.trait, 2.1);
  return P;
}
