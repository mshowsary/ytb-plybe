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
export const PRODUCT_ICON = {
  cookie: cookieIcon, cupcake: cupcakeIcon, coffee: coffeeIcon, smoothie: smoothieIcon, treat: treatIcon,
  brownie: brownieIcon, latte: latteIcon,
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

