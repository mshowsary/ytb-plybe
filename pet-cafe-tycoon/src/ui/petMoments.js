const STYLE_ID = 'pet-cafe-pet-moments';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .pet-identity{position:absolute;transform:translate(-50%,-100%);z-index:2;pointer-events:none;
      display:flex;align-items:center;gap:5px;max-width:166px;padding:5px 9px;border-radius:999px;
      background:#fff9f0ee;color:#493b35;box-shadow:0 3px 10px #0002;border:1px solid #fff;
      font:900 12px/1.05 system-ui,sans-serif;white-space:nowrap;opacity:0;transition:opacity .18s ease,transform .18s ease,box-shadow .18s ease,border-color .18s ease}
    .pet-identity.show{opacity:1;transform:translate(-50%,-108%)}
    .pet-identity .paw{font-size:12px;color:#d97c70}.pet-identity .detail{font-size:9px;font-weight:800;opacity:.56;text-transform:uppercase;letter-spacing:.06em;max-width:88px;overflow:hidden;text-overflow:ellipsis}
    .pet-identity.rare{border-color:#9d87ed88}.pet-identity.epic{border-color:#df78b488;background:#fff4faee}
    .pet-identity.regular-greeting{border-color:#8b7cf6aa;background:#fffaf2f5;box-shadow:0 5px 16px #8b7cf633,0 0 0 2px #fff8}
    .pet-identity.play-break{border-color:#e58fa3cc;background:#fff6faee;box-shadow:0 4px 14px #d97c7040,0 0 0 2px #ffd9e080}
    .pet-identity.play-break .paw{animation:pet-break-paw .72s ease-in-out infinite alternate}.pet-identity.play-break .detail{opacity:.82;color:#a9516c}
    @keyframes pet-break-paw{from{transform:scale(.9)}to{transform:scale(1.2)}}
    body.ui-compact .pet-identity{font-size:10px;padding:4px 7px}.pet-identity.seated .detail{display:none}
    .pet-identity .paw{width:24px;height:24px;flex:none;border-radius:50%;display:grid;place-items:center;background:linear-gradient(145deg,#fffdf5,#f1dfc7);box-shadow:inset 0 0 0 1px var(--pet-accent,#b99576)}
    .pet-identity .paw svg{width:20px;height:20px;fill:none;stroke:#654735;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
    .pet-identity .paw svg circle{fill:#654735;stroke:none}
    @media(max-width:380px){.pet-identity{max-width:118px;font-size:10px;padding:4px 6px}.pet-identity .detail{display:none}}
    @media(prefers-reduced-motion:reduce){.pet-identity.play-break .paw{animation:none}}
  `;
  document.head.appendChild(style);
}

export function createPetMoment(els, profile, customerId = null, species = 'cat') {
  ensureStyle();
  const el = document.createElement('div');
  el.className = `pet-identity ${profile.rarity || 'common'}`;
  if (customerId != null) el.dataset.customerId = String(customerId);
  const paw = document.createElement('span'); paw.className = 'paw'; paw.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${species === 'bunny' ? 'M7 12C1-2 10-2 10 11M14 11C14-2 23-2 17 12M6 13a7 6 0 1 0 12 0' : species === 'dog' ? 'M6 8C-1 7 0 19 5 16M18 8c7-1 6 11 1 8M6 7q6-4 12 0v9a6 5 0 0 1-12 0Z' : 'M5 11V3l6 4h2l6-4v8a8 8 0 1 1-14 0Z'}"/><circle cx="9" cy="14" r=".8"/><circle cx="15" cy="14" r=".8"/><path d="m10 17 2 1 2-1"/></svg>`;
  paw.style.setProperty('--pet-accent', profile.accent || '#B99576');
  const name = document.createElement('span'); name.textContent = profile.name;
  const detail = document.createElement('span'); detail.className = 'detail'; detail.textContent = '';
  el.append(paw, name, detail); els.fx.appendChild(el);

  let timer = 0, seated = false, playBreak = false, detailText = '';
  const projection = { sx: 0, sy: 0, visible: true };
  const P = { el };
  P.announce = (text = '', seconds = 2.2) => { detailText = text; detail.textContent = text; timer = Math.max(timer, seconds); };
  P.greetRegular = (text = 'WELCOME BACK', seconds = 1.05) => {
    el.classList.add('regular-greeting');
    detailText = text; detail.textContent = text; timer = Math.max(0, seconds);
  };
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
    const wantsVisible = seated || playBreak || timer > 0;
    if (!wantsVisible) { el.classList.remove('show', 'regular-greeting'); return; }
    fx.project(x, y, z, projection);
    el.style.left = projection.sx + 'px'; el.style.top = projection.sy + 'px';
    el.classList.toggle('show', projection.visible);
    if (!projection.visible) return;

    timer = Math.max(0, timer - dt);
    if (timer <= 0) el.classList.remove('regular-greeting');
    if (!playBreak && seated && timer <= 0 && detailText) { detailText = ''; detail.textContent = ''; }
  };

  // Task 34 deliberately does NOT announce every pet's trait on every spawn. Named moments are
  // now earned: the one regular greeting, rare/epic spotlight, treat delight, seating, etc. This
  // makes a returning face recognizable instead of burying it under constant badge noise.
  return P;
}
