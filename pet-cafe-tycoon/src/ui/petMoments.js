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
    .pet-identity.seated .detail{display:none}
    .pet-identity .paw{width:24px;height:24px;flex:none;border-radius:50%;display:grid;place-items:center;background:linear-gradient(145deg,#fffdf5,#f1dfc7);box-shadow:inset 0 0 0 1px var(--pet-accent,#b99576)}
    .pet-identity .paw svg{width:20px;height:20px;fill:none;stroke:#654735;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
    .pet-identity .paw svg circle{fill:#654735;stroke:none}
    @media(max-width:380px){.pet-identity{max-width:118px;font-size:10px;padding:4px 6px}.pet-identity .detail{display:none}}
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

  let timer = 0, seated = false, near = false, detailText = '';
  const projection = { sx: 0, sy: 0, visible: true };
  const P = { el };
  P.announce = (text = '', seconds = 2.2) => { detailText = text; detail.textContent = text; timer = Math.max(timer, seconds); };
  P.greetRegular = (text = '\u21BA', seconds = 1.05) => {
    el.classList.add('regular-greeting');
    detailText = text; detail.textContent = text; timer = Math.max(0, seconds);
  };
  // Sitting down no longer SHOWS the tag, it only changes how the tag looks when it is shown (the
  // .seated rule drops the detail slot). See the note on `near` below.
  P.setSeated = value => { seated = !!value; el.classList.toggle('seated', seated); };
  // Proximity is what shows an ordinary name tag now. Every seated guest used to keep one up for
  // their whole meal, which on a full day-18 café meant nine tags at once; ui/labelLayout.js then
  // did exactly what it is built to do with nine overlapping labels -- dimmed them to 45% and
  // nudged them up to 148 px looking for clear space. The owner read the result as "name labels
  // that stay after the customer has gone, floating far from anyone at reduced opacity". They were
  // live tags for real pets, displaced off their own pets and faded by the declutter solver. The
  // solver is right; giving it nine labels to solve was the mistake.
  //
  // A name is worth reading when you are standing next to the animal, so walking up to a pet is
  // what asks for it. Two or three tags on screen at once instead of nine also means the solver
  // never has to dim or displace one, so a tag is now always legible and always over its own pet.
  // The earned MOMENTS -- a returning regular's hello, a rare coat's spotlight, a treat's heart --
  // still show from any distance, exactly as before. (The play-break badge went with its rewarded
  // offer in Batch E2.)
  P.setNear = value => { near = !!value; };
  P.remove = () => el.remove();
  P.update = (dt, fx, x, y, z) => {
    // The moment's clock runs on the WORLD's time, not on whether the camera happens to be pointed
    // at it. It used to be decremented below the early return for an off-screen pet, so a rare-coat
    // spotlight announced while its pet was out of frame never expired — it was banked, and fired
    // the next time that animal wandered anywhere near the camera, minutes later.
    timer = Math.max(0, timer - dt);
    if (timer <= 0) el.classList.remove('regular-greeting');
    if (seated && timer <= 0 && detailText) { detailText = ''; detail.textContent = ''; }

    const wantsVisible = near || timer > 0;
    if (!wantsVisible) { el.classList.remove('show', 'regular-greeting'); return; }
    fx.project(x, y, z, projection);
    el.style.left = projection.sx + 'px'; el.style.top = projection.sy + 'px';
    el.classList.toggle('show', projection.visible);
  };

  // Task 34 deliberately does NOT announce every pet's trait on every spawn. Named moments are
  // now earned: the one regular greeting, rare/epic spotlight, treat delight, seating, etc. This
  // makes a returning face recognizable instead of burying it under constant badge noise.
  return P;
}
