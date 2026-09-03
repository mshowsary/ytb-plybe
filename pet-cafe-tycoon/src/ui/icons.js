// src/ui/icons.js — inline SVG product icons for the wish bubble (Task 5), written once each as
// a function returning a full <svg> string. viewBox 0 0 24 24 throughout so every icon drops into
// the same 38x38 .wishIcon box (see src/style.css) without further sizing.
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
// viewBox 0 0 24 24 convention, reusing the cookie/coffee silhouettes with a darker/lighter fill so
// they read as "the other thing this same station makes" rather than a wholly new shape.
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
