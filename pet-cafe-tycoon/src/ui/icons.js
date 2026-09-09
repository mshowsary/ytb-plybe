// src/ui/icons.js — inline SVG product icons for the wish bubble (Task 5), written once each as
// a function returning a full <svg> string. viewBox 0 0 24 24 throughout so every icon drops into
// the same UI boxes without further sizing.
export function cookieIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="#D9A066"/>' +
    '<circle cx="8.5" cy="9" r="1.3" fill="#6B4A2B"/><circle cx="14.7" cy="8.2" r="1.1" fill="#6B4A2B"/>' +
    '<circle cx="15.5" cy="14.2" r="1.3" fill="#6B4A2B"/><circle cx="9.3" cy="15.3" r="1" fill="#6B4A2B"/>' +
    '<circle cx="12.2" cy="11.5" r="1.1" fill="#6B4A2B"/></svg>';
}
export function cupcakeIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12l-1.4 8.3a1 1 0 0 1-1 .9H8.4a1 1 0 0 1-1-.9L6 12z" fill="#B9834A"/>' +
    '<path d="M5.3 12.3a6.7 6.7 0 0 1 13.4 0z" fill="#FF8A80"/>' +
    '<circle cx="12" cy="4" r="1.4" fill="#FF3B6B"/></svg>';
}
export function coffeeIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-5z" fill="#6B4A2B"/>' +
    '<path d="M16 11.3h1.4a2.2 2.2 0 0 1 0 4.4H16" fill="none" stroke="#6B4A2B" stroke-width="1.3"/>' +
    '<path d="M9 3.8c.7 1 -.7 1.5 0 2.5M13.2 3.8c.7 1 -.7 1.5 0 2.5" stroke="#B9834A" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>';
}
export function smoothieIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h8l-1.3 14.3a1.2 1.2 0 0 1-1.2 1.1h-3a1.2 1.2 0 0 1-1.2-1.1L8 5z" fill="#8B7CF6"/>' +
    '<path d="M8.3 5h7.4l-.3 3H8.6l-.3-3z" fill="#B7ACFB"/>' +
    '<path d="M15 2.2l2.6-1.7" stroke="#3B2E2A" stroke-width="1.3" stroke-linecap="round"/></svg>';
}
export function treatIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#C97A3A" d="M4.5 9.5a2.2 2.2 0 1 1 3.6-2.5l6.9 6.9a2.2 2.2 0 1 1-2.5 3.6l-.2-.2-6.9-6.9-.9-.9zM19.5 14.5a2.2 2.2 0 1 0-3.6 2.5l-.2.2a2.2 2.2 0 1 0 2.5 3.6l1.3-1.3a2.2 2.2 0 0 0 0-3.1l0-1.9z"/></svg>';
}
// Loop v2 Task 3: star-3 second recipes (Oven A's brownie, the coffee machine's latte) — same
// viewBox convention, reusing the cookie/coffee silhouettes with a darker/lighter fill.
export function brownieIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="2.5" fill="#6B4023"/>' +
    '<rect x="4" y="6" width="16" height="4" rx="2" fill="#8A5A34"/>' +
    '<circle cx="9" cy="14" r="1.1" fill="#3B2314"/><circle cx="15" cy="15.5" r="1.1" fill="#3B2314"/></svg>';
}
export function latteIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-5z" fill="#C9A877"/>' +
    '<path d="M5 10h11v2.2H5z" fill="#EFE0C4"/>' +
    '<path d="M16 11.3h1.4a2.2 2.2 0 0 1 0 4.4H16" fill="none" stroke="#C9A877" stroke-width="1.3"/></svg>';
}
// Batch 1 terrace (plan 3.1): the ice cream lane mirrors the coffee lane, so it gets the same
// icon/alt-recipe pairing -- icecreamIcon parallels coffeeIcon, sundaeIcon parallels latteIcon.
// pupcupIcon is the pet-wish variant dispensed at icecream1 (a whipped-cream treat with a paw
// print), distinct from both so a pet's wish bubble never reads as a human order.
export function icecreamIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 12h6l-2.2 8.2a1 1 0 0 1-1.9 0L9 12z" fill="#E8C58B"/>' +
    '<circle cx="9.4" cy="9.2" r="3.3" fill="#FFF0F5"/><circle cx="14.6" cy="9.2" r="3.3" fill="#FFD6E7"/><circle cx="12" cy="6.4" r="3" fill="#FFF8FB"/></svg>';
}
export function sundaeIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9h12l-1.6 8.6a3 3 0 0 1-2.95 2.4h-2.9a3 3 0 0 1-2.95-2.4L6 9z" fill="#FFD6E7"/>' +
    '<path d="M5.3 9.3a6.7 6.7 0 0 1 13.4 0z" fill="#FFF0F5"/><circle cx="12" cy="4.3" r="1.4" fill="#E5395C"/></svg>';
}
export function pupcupIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10h10l-1.1 7.4a2 2 0 0 1-2 1.7h-3.8a2 2 0 0 1-2-1.7L7 10z" fill="#FFE4C4"/>' +
    '<path d="M8 10a4 4 0 0 1 8 0z" fill="#FFFFFF"/>' +
    '<ellipse cx="12" cy="15" rx="2" ry="1.5" fill="#C97A3A"/><circle cx="10.2" cy="12.6" r="0.8" fill="#C97A3A"/><circle cx="13.8" cy="12.6" r="0.8" fill="#C97A3A"/></svg>';
}
export const PRODUCT_ICON = {
  cookie: cookieIcon, cupcake: cupcakeIcon, coffee: coffeeIcon, smoothie: smoothieIcon, treat: treatIcon,
  brownie: brownieIcon, latte: latteIcon, icecream: icecreamIcon, sundae: sundaeIcon, pupcup: pupcupIcon,
};
export function iconFor(key) { return (PRODUCT_ICON[key] || cookieIcon)(); }

// Shared supply pictograms. Task 31 deliberately uses the exact bean glyph both in Pantry and on a
// bean-blocked Coffee station so the cause and remedy are visually identical.
export function beanIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.8 4.6c3.2 3.2 1.3 9.3-2.5 13.1-3.2 3.2-8.1 2.8-10.2.7-2.1-2.1-2.5-7 .7-10.2 3.8-3.8 9.9-5.7 13.1-2.5z" fill="#6B4A2B"/><path d="M7 17c3.4-1.2 4-4.1 5.2-6.3 1.1-2 2.8-3.6 5.1-4.5" fill="none" stroke="#D9A066" stroke-width="1.45" stroke-linecap="round"/></svg>';
}
export function kibbleIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="9" r="3" fill="#C97A3A"/><circle cx="15.5" cy="8" r="2.6" fill="#B86D35"/><circle cx="12" cy="15.5" r="3.2" fill="#D28A49"/><circle cx="18" cy="15" r="2" fill="#A95F2E"/></svg>';
}
// Batch 1 terrace (plan 3.1/7.2, D3/D4): the cream sack, third pantry supply -- coldPantry1's
// bean-equivalent. Same "supply pictogram" convention as beanIcon/kibbleIcon above: a jug silhouette
// so the cause (empty cream) and remedy (this glyph, in the pantry) read as the same object.
// A single drop: the water sack for the spa's bath (waterTank1). Same 24-box and the same
// soft-fill-plus-one-highlight construction as creamIcon, so the two sit side by side in the
// pantry sheet as siblings.
export function waterIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8c3.2 4.2 6 7.6 6 11.2a6 6 0 0 1-12 0c0-3.6 2.8-7 6-11.2z" fill="#BFEFFA"/>' +
    '<path d="M12 2.8c3.2 4.2 6 7.6 6 11.2a6 6 0 0 1-12 0c0-3.6 2.8-7 6-11.2z" fill="none" stroke="#5FC4E0" stroke-width="1.2"/>' +
    '<path d="M9.2 13.6c.1 1.6 1 2.8 2.4 3.3" stroke="#FFFFFF" stroke-width="1.3" stroke-linecap="round" fill="none"/></svg>';
}
// A coat hanger: the boutique's floating action. The one play-field control that still spelled its
// verb out ("BOUTIQUE" / "SUPPLIES" / "UPGRADES" / "STAFF") after the text pass.
export function hangerIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.2a1.9 1.9 0 0 1 1.9 1.9c0 .9-.6 1.4-1.2 1.8-.4.3-.7.6-.7 1.1v.6" fill="none" stroke="#8B7CF6" stroke-width="1.6" stroke-linecap="round"/>' +
    '<path d="M12 9.6 3.6 15.4c-.9.6-.5 2 .6 2h15.6c1.1 0 1.5-1.4.6-2L12 9.6z" fill="#B7ACFB" stroke="#8B7CF6" stroke-width="1.4" stroke-linejoin="round"/></svg>';
}
export function creamIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 3h5l.8 3.4c2.1.6 3.7 2.5 3.7 4.8v6.3a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 4 17.5v-6.3c0-2.3 1.6-4.2 3.7-4.8L8.5 3z" fill="#FFF6FB"/>' +
    '<path d="M8.5 3h5l.5 2.2h-6l.5-2.2z" fill="#E9C9DC"/>' +
    '<path d="M7 13.5c1.8-.9 3.6-.9 5.4 0M7 16.5c1.8-.9 3.6-.9 5.4 0" stroke="#E9A9CB" stroke-width="1.1" stroke-linecap="round" fill="none"/></svg>';
}

// Loop v2 Task 2: chalkboard/pantry-popup icons — same viewBox 0 0 24 24 convention as the product
// icons above, sized by whatever CSS class wraps them (src/style.css's .chalkIcon/.sicon).
export function coinIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="#FFD84D" stroke="#C98A00" stroke-width="1.5"/>' +
    '<circle cx="12" cy="12" r="5.2" fill="none" stroke="#C98A00" stroke-width="1"/></svg>';
}
export function sackIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 9c0-2.5 1.8-4 4-4s4 1.5 4 4l1.6 8.2a2 2 0 0 1-2 2.4H8.4a2 2 0 0 1-2-2.4L8 9z" fill="#B9834A"/>' +
    '<path d="M9.4 8.6h5.2" stroke="#6B4A2B" stroke-width="1.2" stroke-linecap="round"/></svg>';
}
export function returnIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12" stroke="#FF8A80" stroke-width="2.6" stroke-linecap="round"/>' +
    '<path d="M6.5 12L12 17.5 17.5 12" fill="none" stroke="#FF8A80" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
export function leafIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19C5 10 12 4 19 4c0 7-6 14-15 15z" fill="#7BC47F"/>' +
    '<path d="M6.5 17.5C10 13 13 10 17 6.5" stroke="#4F9A56" stroke-width="1.2" stroke-linecap="round" fill="none"/></svg>';
}
export function gearIcon() {
  let teeth = '';
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const x1 = (12 + Math.cos(a) * 7).toFixed(2), y1 = (12 + Math.sin(a) * 7).toFixed(2);
    const x2 = (12 + Math.cos(a) * 9.3).toFixed(2), y2 = (12 + Math.sin(a) * 9.3).toFixed(2);
    teeth += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#8B7CF6" stroke-width="2.4" stroke-linecap="round"/>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="none" stroke="#8B7CF6" stroke-width="2.4"/>${teeth}</svg>`;
}
export function personIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="3.4" fill="#6B4A2B"/>' +
    '<path d="M5 20c0-3.9 3.1-6.4 7-6.4s7 2.5 7 6.4" fill="none" stroke="#6B4A2B" stroke-width="2.4" stroke-linecap="round"/></svg>';
}

export function giftIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11h16v10H4z" fill="#FF8A80"/><path d="M3 7h18v4H3z" fill="#FF5252"/><path d="M10 7v14h4V7z" fill="#FFD740"/><path d="M8.5 4.5c0-1.4 1.1-2.5 2.5-2.5 1.5 0 2 2 1 4-1.5 0-3.5-.5-3.5-1.5z" fill="#FFD740"/><path d="M15.5 4.5c0-1.4-1.1-2.5-2.5-2.5-1.5 0-2 2-1 4 1.5 0 3.5-.5 3.5-1.5z" fill="#FFD740"/></svg>';
}

export function calendarIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" fill="#FFF5EB" stroke="#7A583A" stroke-width="1.6"/><path d="M3 9h18" stroke="#7A583A" stroke-width="1.6"/><rect x="3" y="5" width="18" height="4" rx="2" fill="#E55353"/><circle cx="8" cy="13" r="1.3" fill="#C97A3A"/><circle cx="12" cy="13" r="1.3" fill="#C97A3A"/><circle cx="16" cy="13" r="1.3" fill="#C97A3A"/><circle cx="8" cy="17" r="1.3" fill="#C97A3A"/><circle cx="12" cy="17" r="1.3" fill="#C97A3A"/><circle cx="16" cy="17" r="1.3" fill="#C97A3A"/><rect x="7" y="2" width="2" height="4" rx="1" fill="#7A583A"/><rect x="15" y="2" width="2" height="4" rx="1" fill="#7A583A"/></svg>';
}

export function sunIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5.2" fill="#FFB300"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M4.9 19.1l2.2-2.2M16.9 7.1l2.2-2.2" stroke="#FFB300" stroke-width="2.2" stroke-linecap="round"/></svg>';
}

// Sunrise and sunset complete the day-phase set (sunIcon and moonIcon already exist), so the day
// pill can show WHEN it is instead of spelling it out.
export function sunriseIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18h16" stroke="#E9954A" stroke-width="2.2" stroke-linecap="round"/>' +
    '<path d="M12 5v3M5.5 8.5l2 2M18.5 8.5l-2 2" stroke="#FFB300" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M6.5 18a5.5 5.5 0 0 1 11 0z" fill="#FFC154"/></svg>';
}
export function sunsetIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18h16" stroke="#C4643C" stroke-width="2.2" stroke-linecap="round"/>' +
    '<path d="M12 11V8M5.5 13.5l2-2M18.5 13.5l-2-2" stroke="#E9954A" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M6.5 18a5.5 5.5 0 0 1 11 0z" fill="#F0925E"/></svg>';
}
// A rising bar-chart glyph for the service-streak contract, which has no natural object.
export function streakIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="14" width="4" height="6" rx="1.2" fill="#8B7CF6"/>' +
    '<rect x="10" y="10" width="4" height="10" rx="1.2" fill="#9C8FF0"/>' +
    '<rect x="16" y="5" width="4" height="15" rx="1.2" fill="#B7ACFB"/></svg>';
}

export function bellIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a4 4 0 0 0-4 4v5l-2 3h12l-2-3V7a4 4 0 0 0-4-4z" fill="#FFA000"/><path d="M10 19a2 2 0 0 0 4 0" fill="none" stroke="#FFA000" stroke-width="2" stroke-linecap="round"/><path d="M19 8a6 6 0 0 1 2 4M5 8a6 6 0 0 0-2 4" stroke="#FFB300" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>';
}

export function moonIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3a9 9 0 1 0 8 11.8A7 7 0 0 1 13 3z" fill="#7E57C2"/><circle cx="18" cy="5" r="1.1" fill="#FFE082"/><circle cx="21" cy="9" r="0.8" fill="#FFE082"/></svg>';
}

export function sparkleIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z" fill="#FFD700"/></svg>';
}

export function heartIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#FF5252"/></svg>';
}

export function pawIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="14.8" rx="4.8" ry="3.8" fill="#C97A3A"/><circle cx="7" cy="8.5" r="2.1" fill="#C97A3A"/><circle cx="10.4" cy="6.2" r="2.1" fill="#C97A3A"/><circle cx="13.6" cy="6.2" r="2.1" fill="#C97A3A"/><circle cx="17" cy="8.5" r="2.1" fill="#C97A3A"/></svg>';
}

export function catIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6l3 5h8l3-5v10a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V6z" fill="#E8A87C"/><circle cx="9" cy="14" r="1.3" fill="#422918"/><circle cx="15" cy="14" r="1.3" fill="#422918"/><path d="M12 16l-1 1h2z" fill="#E27D60"/></svg>';
}

export function dogIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10c0-3.5 2.7-6 6-6s6 2.5 6 6v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4v-5z" fill="#C38D9E"/><path d="M4 9c0 3 1.5 5 2.5 5V9H4zM20 9c0 3-1.5 5-2.5 5V9H20z" fill="#9F6B7C"/><circle cx="9.5" cy="12" r="1.3" fill="#412234"/><circle cx="14.5" cy="12" r="1.3" fill="#412234"/><ellipse cx="12" cy="14.8" rx="1.6" ry="1.2" fill="#412234"/></svg>';
}

export function bunnyIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="8" cy="6.5" rx="1.8" ry="5.5" fill="#E8B4B8"/><ellipse cx="16" cy="6.5" rx="1.8" ry="5.5" fill="#E8B4B8"/><circle cx="12" cy="15" r="6" fill="#F4EAE6"/><circle cx="9.5" cy="14.2" r="1.2" fill="#4A3B32"/><circle cx="14.5" cy="14.2" r="1.2" fill="#4A3B32"/><ellipse cx="12" cy="16.5" rx="1.1" ry="0.8" fill="#E8B4B8"/></svg>';
}

export function checkIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7" fill="none" stroke="#2ECC71" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}


// ---------------------------------------------------------------------------------------------
// Play-field cue glyphs (icon-first pass). Everything the game used to SAY over the 3D world now
// has to be DRAWN, so this block adds the missing nouns and the one piece of punctuation that
// carries meaning on its own. Same viewBox 0 0 24 24 convention as everything above, so they drop
// into the same boxes (src/style.css's .cueIco) as the product icons.
//
// The rule used when choosing each one: draw the OBJECT the player already sees in the world, not
// an abstraction of the action. A broom for cleaning (the owner holds one), a crate for the party
// order (the crate is physically in the room), bunting for a Pet Social (the world grows exactly
// that decor when one starts). Where no object exists, fall back to the most universal sign
// available -- a clock for time, a red cross for "no".

// The negative half of checkIcon above. Deliberately the same stroke weight and geometry so a
// check and a cross read as one yes/no pair rather than two unrelated marks.
export function crossIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="#E2483C" stroke-width="3" stroke-linecap="round"/></svg>';
}
// Waiting. Used for guest patience, shift countdowns and the service-policy rule, because in every
// one of those the thing being measured is elapsed time and nothing else.
export function clockIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#FFF4E6" stroke="#7A583A" stroke-width="1.8"/>'
    + '<path d="M12 6.6V12l3.6 2.4" fill="none" stroke="#7A583A" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
// A charge against the wallet: the wallet's own coin with a red minus badge. One glyph rather than
// a coin cell plus a minus cell, so a cost never has to be parsed as arithmetic.
export function coinMinusIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="11.5" r="8.5" fill="#FFD84D" stroke="#C98A00" stroke-width="1.5"/>'
    + '<circle cx="10.5" cy="11.5" r="4.4" fill="none" stroke="#C98A00" stroke-width="1"/>'
    + '<circle cx="18.2" cy="18" r="5.2" fill="#E2483C"/><path d="M15.9 18h4.6" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/></svg>';
}
// A seat nobody can use: the same table-with-an-X the guest holds up on the play field
// (src/systems/visuals.js) and the day summary's missed-seat chip (src/ui/serviceSummary.js), so
// the cause, the consequence and the report are all visibly the same object.
export function tableDirtyIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 13h18M6 13v7M18 13v7" stroke="#7A583A" stroke-width="2" stroke-linecap="round"/>'
    + '<path d="M8 3.5l8 7M16 3.5l-8 7" stroke="#E2483C" stroke-width="2" stroke-linecap="round"/></svg>';
}
// Cleaning. The owner literally holds this while wiping a seat, so the cue and the animation match.
export function broomIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 3.2l3.3 3.3-8 8-3.3-3.3z" fill="#B9834A"/>'
    + '<path d="M9.2 11.6l3.2 3.2-4.4 5.6a1.6 1.6 0 0 1-2.5.1l-2-2a1.6 1.6 0 0 1 .1-2.4z" fill="#E9C98F"/>'
    + '<path d="M4.6 16.1l3.3 3.3" stroke="#B9834A" stroke-width="1.2"/></svg>';
}
// Renovation: a paint roller, the one tool that means "the room itself changes" rather than
// "a machine got better" (which is gearIcon's job in the wallet ring).
export function brushIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3.2" width="13" height="5.2" rx="1.4" fill="#8B7CF6"/>'
    + '<path d="M17 5.8h2.6a1.4 1.4 0 0 1 1.4 1.4v3.4a1.4 1.4 0 0 1-1.4 1.4H12" fill="none" stroke="#8B7CF6" stroke-width="1.6"/>'
    + '<rect x="10.2" y="11" width="3.6" height="4" rx="1" fill="#B7ACFB"/><rect x="10.7" y="15" width="2.6" height="6" rx="1.3" fill="#8B7CF6"/></svg>';
}
// The cafe itself, awning and all -- the building the player has been assembling zone by zone.
export function cafeIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 9.5h17.2V20a1 1 0 0 1-1 1H4.4a1 1 0 0 1-1-1z" fill="#FFF4E6" stroke="#7A583A" stroke-width="1.3"/>'
    + '<path d="M2.6 9.5l1.6-4.4a1 1 0 0 1 .95-.66h13.7a1 1 0 0 1 .95.66l1.6 4.4z" fill="#E8896F"/>'
    + '<path d="M6.4 4.4L5.4 9.5M10.1 4.4l-.5 5.1M13.9 4.4l.5 5.1M17.6 4.4l1 5.1" stroke="#FFF4E6" stroke-width="1.1"/>'
    + '<rect x="9.4" y="13.4" width="5.2" height="7.6" rx="1" fill="#C97A3A"/></svg>';
}
// The Weekly Cup. A trophy is the one prize glyph nobody has to be taught.
export function trophyIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v6a5 5 0 0 1-10 0z" fill="#FFD84D" stroke="#C98A00" stroke-width="1.2"/>'
    + '<path d="M7 4.6H4.4v1.8A3.4 3.4 0 0 0 7.4 9.8M17 4.6h2.6v1.8a3.4 3.4 0 0 1-3 3.4" fill="none" stroke="#C98A00" stroke-width="1.4"/>'
    + '<path d="M10.4 13.6h3.2V17h-3.2z" fill="#C98A00"/><rect x="7.4" y="17" width="9.2" height="3.4" rx="1.2" fill="#C98A00"/></svg>';
}
// Weekend: a calendar whose last two cells are lit. Same calendar body as calendarIcon so the two
// read as the same object with different days marked, which is exactly what they are.
export function weekendIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" fill="#FFF5EB" stroke="#7A583A" stroke-width="1.6"/>'
    + '<path d="M3 9h18" stroke="#7A583A" stroke-width="1.6"/><rect x="3" y="5" width="18" height="4" rx="2" fill="#E8896F"/>'
    + '<rect x="7" y="2" width="2" height="4" rx="1" fill="#7A583A"/><rect x="15" y="2" width="2" height="4" rx="1" fill="#7A583A"/>'
    + '<rect x="12.4" y="11.4" width="6.2" height="8.2" rx="1.6" fill="#F5B93C"/></svg>';
}
// Holiday: a paper garland plus a star. Distinct from weekendIcon at a glance because it is a
// different shape entirely, not a differently-coloured calendar.
export function holidayIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1.5 5.2C7 9 17 9 22.5 5.2" fill="none" stroke="#B9834A" stroke-width="1.4" stroke-linecap="round"/>'
    + '<path d="M4 6.4l2.6.5-1 3.6z" fill="#E8896F"/><path d="M8.6 8.1l2.7.25-.7 3.7z" fill="#F5B93C"/>'
    + '<path d="M13.4 8.35l2.7-.25-.6 3.75z" fill="#75BDA0"/><path d="M17.9 6.9l2.6-.5-1 3.7z" fill="#8B7CF6"/>'
    + '<path d="M12 13.4l1.5 3.4 3.7.4-2.8 2.5.8 3.6L12 21.4l-3.2 1.9.8-3.6-2.8-2.5 3.7-.4z" fill="#FFD84D"/></svg>';
}
// The party-order crate, the physical box that fills up in the room.
export function crateIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7.4" width="18" height="13" rx="1.8" fill="#C89A63" stroke="#7A583A" stroke-width="1.3"/>'
    + '<path d="M3 12h18M9.6 7.4v13M14.4 7.4v13" stroke="#7A583A" stroke-width="1.1"/>'
    + '<path d="M2.2 4h19.6v3.4H2.2z" fill="#E8896F"/></svg>';
}
// Pet Social medals. Tier is a COLOUR, not a word: the same three metals every game on the store
// uses, so BRONZE/SILVER/GOLD never has to be spelled. Index 0 is "none yet".
const MEDAL_METAL = ['#C9C2B6', '#CE8B4E', '#C9CDD4', '#FFD84D'];
export function medalIcon(tier = 0) {
  const metal = MEDAL_METAL[Math.max(0, Math.min(3, tier | 0))];
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.6 2.4h3.1l3.2 7.4h-3.1z" fill="#8B7CF6"/><path d="M13.3 2.4h3.1l-3.2 7.4h-3.1z" fill="#E8896F"/>'
    + '<circle cx="12" cy="15.6" r="6.1" fill="' + metal + '" stroke="#7A583A" stroke-width="1.2"/>'
    + '<path d="M12 11.8l1.15 2.5 2.7.3-2.05 1.85.58 2.65L12 17.75 9.62 19.1l.58-2.65L8.15 14.6l2.7-.3z" fill="#FFF6E2"/></svg>';
}
// A Pet Social: the exact bunting src/systems/petSocials.js hangs over the terrace when one starts,
// so the button shows the thing pressing it builds.
export function buntingIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 6.5C7.5 11 16.5 11 22 6.5" fill="none" stroke="#C39861" stroke-width="1.5" stroke-linecap="round"/>'
    + '<path d="M4.6 7.9l2.9.9-1.2 3.6z" fill="#E8896F"/><path d="M9.4 9.4l3 .35-1 3.75z" fill="#FFE4BA"/>'
    + '<path d="M14.6 9.75l3-.35-1.8 4.6z" fill="#75BDA0"/>'
    + '<ellipse cx="12" cy="18.9" rx="3.4" ry="2.7" fill="#C97A3A"/><circle cx="8.4" cy="16.4" r="1.5" fill="#C97A3A"/><circle cx="15.6" cy="16.4" r="1.5" fill="#C97A3A"/></svg>';
}
// Hands full. A mitt gripping a box: the state, drawn, rather than the instruction to fix it.
export function handIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.6" y="3.2" width="11" height="8" rx="1.3" fill="#C89A63" stroke="#7A583A" stroke-width="1.2"/>'
    + '<path d="M6.6 7.2h11" stroke="#7A583A" stroke-width="1"/>'
    + '<path d="M4.2 12.6a1.7 1.7 0 0 1 1.7-1.7h8.6a3.6 3.6 0 0 1 0 7.2H9.9L6 20.8a1.6 1.6 0 0 1-2.4-1.9z" fill="#E8B48C" stroke="#7A583A" stroke-width="1.2" stroke-linejoin="round"/></svg>';
}
// A requirement not yet met. Paired with repIcon it says "reputation gate" without the sentence.
export function lockIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 10V7.6a4 4 0 0 1 8 0V10" fill="none" stroke="#7A583A" stroke-width="2"/>'
    + '<rect x="4.8" y="10" width="14.4" height="10.6" rx="2.4" fill="#C89A63" stroke="#7A583A" stroke-width="1.4"/>'
    + '<circle cx="12" cy="15.3" r="1.7" fill="#7A583A"/></svg>';
}
// Reputation. A five-point star, because the summary sheet already prints reputation as a run of
// stars; sparkleIcon's four points stay reserved for "something special is happening".
export function repIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6.2 6.7.8-5 4.6 1.35 6.6L12 17.5 6.05 20.8 7.4 14.2l-5-4.6 6.7-.8z" fill="#FFD84D" stroke="#C98A00" stroke-width="1.1" stroke-linejoin="round"/></svg>';
}
// The checkout. Distinct from coinIcon (which means "pick up the cash pile"): this one is the
// counter a guest is standing at, waiting to pay.
export function registerIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="12" width="18" height="8.4" rx="1.6" fill="#C89A63" stroke="#7A583A" stroke-width="1.3"/>'
    + '<rect x="6.4" y="4.6" width="9.2" height="7.4" rx="1.4" fill="#FFF4E6" stroke="#7A583A" stroke-width="1.3"/>'
    + '<path d="M8.6 7.4h4.8M8.6 9.6h3" stroke="#7A583A" stroke-width="1.2" stroke-linecap="round"/>'
    + '<circle cx="18" cy="16.2" r="1.6" fill="#FFD84D" stroke="#C98A00" stroke-width="1"/></svg>';
}
// The display case that runs empty. Restocking it is the one job with no product of its own --
// what is missing changes shelf to shelf -- so the cue is the fixture, not a pastry.
export function displayIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.6" y="6.4" width="18.8" height="12" rx="1.8" fill="#EAF4FF" stroke="#7A583A" stroke-width="1.4"/>'
    + '<path d="M2.6 12.4h18.8" stroke="#7A583A" stroke-width="1.2"/>'
    + '<rect x="2" y="18.4" width="20" height="2.6" rx="1.1" fill="#C89A63"/>'
    + '<circle cx="7.6" cy="9.4" r="1.7" fill="#D9A066"/><circle cx="12" cy="9.4" r="1.7" fill="#FF8A80"/></svg>';
}
// The oven, mid-bake. The tray and the glow are what the player watches on the machine itself.
export function bakeIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.4" y="3.4" width="17.2" height="17.2" rx="2.4" fill="#C89A63" stroke="#7A583A" stroke-width="1.4"/>'
    + '<rect x="6" y="9.4" width="12" height="8.4" rx="1.4" fill="#FFB300" stroke="#7A583A" stroke-width="1.2"/>'
    + '<circle cx="9.4" cy="14" r="1.5" fill="#8A5A34"/><circle cx="14.4" cy="14.6" r="1.5" fill="#8A5A34"/>'
    + '<path d="M6.4 6.4h6" stroke="#7A583A" stroke-width="1.5" stroke-linecap="round"/><circle cx="17" cy="6.4" r="1.2" fill="#7A583A"/></svg>';
}
