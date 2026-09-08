// data/decor.js — the décor catalogue (plan §3.12).
//
// WHY THIS EXISTS
// The headless bot measured "affordable options at closing" for days 2-8 as [0,0,0,0,0,5,0]: five
// consecutive days where nothing in the shop is within reach, then the whole shelf at once. Every
// existing sink is a 300-1750 coin zone, a 150-2800 coin hire or a 240+ coin star, so an early
// café that has just paid for a build has literally nothing to want. Décor is the 60-900 coin
// filler that closes that gap: cheap, always visible, never required.
//
// Each item is purely cosmetic plus +1 reputation. Nothing here touches throughput, patience,
// spawn rates, prices or navigation, so adding items can never destabilise a balance pass.
//
// SLOTS are fixed world positions (metres, AREA1 space: x -10..10, z -7..7, +x east, +z toward
// camera) rather than free placement. Fixed slots mean the room stays readable, décor can never be
// dropped onto a station footprint or a walking lane, and the render layer is a pure function of
// the owned-id list.
//
// REGIONS: 'interior' items are live now. 'terrace' items are INERT this batch — the terrace does
// not exist until Batch 1, so every terrace row carries `requires: 'z_terrace'`, a zone id that is
// not in AREA1.zones. Nothing resolves it, so those rows never list, never render and never sell.
export const TERRACE_ZONE = 'z_terrace';

// --- icons -------------------------------------------------------------------------------------
// Inline SVG, viewBox 0 0 24 24 like src/ui/icons.js, so a row drops into the same UI boxes. They
// live here rather than in ui/icons.js because a catalogue row and its glyph are one authored fact.
const art = (frame, fill, glyph) => '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + `<rect x="3.5" y="4.5" width="17" height="15" rx="1.6" fill="${frame}"/>`
  + `<rect x="5.5" y="6.5" width="13" height="11" rx="1" fill="${fill}"/>${glyph}</svg>`;
const wallArtIcon = (frame, fill, dot) => art(frame, fill,
  `<circle cx="12" cy="11" r="3" fill="${dot}"/><path d="M7 16.5c1.6-2.2 3.2-3.2 5-3.2s3.4 1 5 3.2z" fill="${dot}" opacity="0.55"/>`);
const muralIcon = () => art('#B9834A', '#FFF1D8',
  '<path d="M6 16l3.2-4.6L12 15l2.4-3.2L18 16z" fill="#7BC47F"/><circle cx="15.6" cy="9" r="1.5" fill="#FFD84D"/>');
const hangingPlantIcon = pot => '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<path d="M6 3h12" stroke="#B9834A" stroke-width="1.6" stroke-linecap="round"/>'
  + '<path d="M8 3.5v3M16 3.5v3" stroke="#B9834A" stroke-width="1.2"/>'
  + `<path d="M7 7h10l-1.4 4.2a2 2 0 0 1-1.9 1.4h-3.4a2 2 0 0 1-1.9-1.4z" fill="${pot}"/>`
  + '<path d="M9.5 13c-.4 3.2-1.6 5.2-3.2 6.6M12 13c0 3.6.6 5.8 1.8 7.6M14.6 13c.6 2.8 1.8 4.6 3.4 5.8"'
  + ' stroke="#5EA463" stroke-width="1.7" stroke-linecap="round" fill="none"/></svg>';
const rugIcon = (a, b) => '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + `<ellipse cx="12" cy="13" rx="9.5" ry="6" fill="${a}"/>`
  + `<ellipse cx="12" cy="13" rx="6.2" ry="3.7" fill="${b}"/>`
  + `<ellipse cx="12" cy="13" rx="2.8" ry="1.6" fill="${a}"/></svg>`;
const lanternIcon = glow => '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<path d="M12 2v3" stroke="#B9834A" stroke-width="1.5" stroke-linecap="round"/>'
  + `<path d="M12 5c4 0 6 3 6 7s-2 7-6 7-6-3-6-7 2-7 6-7z" fill="${glow}"/>`
  + '<path d="M6.6 12h10.8" stroke="#C98A00" stroke-width="1.1"/>'
  + '<path d="M9.6 19h4.8" stroke="#B9834A" stroke-width="1.6" stroke-linecap="round"/></svg>';
const catTreeIcon = () => '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<rect x="10.6" y="5" width="2.8" height="15" fill="#B9834A"/>'
  + '<rect x="5" y="18.5" width="14" height="2.6" rx="1.2" fill="#8E6236"/>'
  + '<rect x="3.6" y="8.4" width="8" height="2.6" rx="1.2" fill="#FFB3C1"/>'
  + '<rect x="12.4" y="12.6" width="8" height="2.6" rx="1.2" fill="#FFB3C1"/>'
  + '<circle cx="16.4" cy="6.4" r="2.4" fill="#F5A25D"/></svg>';
const feederIcon = () => '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<path d="M12 2v4" stroke="#8E6236" stroke-width="1.5" stroke-linecap="round"/>'
  + '<path d="M4.5 10L12 5.4 19.5 10z" fill="#C0392B"/>'
  + '<rect x="7" y="10" width="10" height="6" rx="1.2" fill="#F0DCC0"/>'
  + '<rect x="6" y="15.6" width="12" height="1.8" rx="0.9" fill="#8E6236"/>'
  + '<circle cx="12" cy="13" r="1.5" fill="#6B4A2B"/></svg>';
const bicycleIcon = () => '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<circle cx="6" cy="16" r="4.2" fill="none" stroke="#3B2E2A" stroke-width="1.7"/>'
  + '<circle cx="18" cy="16" r="4.2" fill="none" stroke="#3B2E2A" stroke-width="1.7"/>'
  + '<path d="M6 16l4-7h5l3 7M10 9h5" fill="none" stroke="#FF8A80" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'
  + '<path d="M9 8.4h3" stroke="#3B2E2A" stroke-width="1.5" stroke-linecap="round"/></svg>';
const pawSignIcon = () => '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<rect x="3.5" y="4" width="17" height="14" rx="2" fill="#3F4A44"/>'
  + '<rect x="5.2" y="5.7" width="13.6" height="10.6" rx="1.2" fill="#2E3833"/>'
  + '<ellipse cx="12" cy="12.6" rx="3.1" ry="2.4" fill="#FFF4E6"/>'
  + '<circle cx="8.9" cy="8.9" r="1.25" fill="#FFF4E6"/><circle cx="11" cy="7.7" r="1.25" fill="#FFF4E6"/>'
  + '<circle cx="13" cy="7.7" r="1.25" fill="#FFF4E6"/><circle cx="15.1" cy="8.9" r="1.25" fill="#FFF4E6"/>'
  + '<path d="M8 18v2.4M16 18v2.4" stroke="#8E6236" stroke-width="1.6" stroke-linecap="round"/></svg>';
// The board itself carries PICTOGRAMS only — a cookie, a cup and a coin — never words, so it obeys
// the no-English-on-the-play-field rule at both mesh and icon scale.
const menuBoardIcon = () => '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<rect x="3.5" y="3" width="17" height="15" rx="1.8" fill="#8E6236"/>'
  + '<rect x="5.2" y="4.7" width="13.6" height="11.6" rx="1" fill="#2E3833"/>'
  + '<circle cx="8.6" cy="8.2" r="2" fill="#D9A066"/>'
  + '<path d="M12.6 6.6h4.2v3a2.1 2.1 0 0 1-2.1 2.1 2.1 2.1 0 0 1-2.1-2.1z" fill="#C9A877"/>'
  + '<circle cx="8.6" cy="13.4" r="1.9" fill="#FFD84D"/>'
  + '<path d="M12.6 12.6h4.4M12.6 14.6h3" stroke="#8FA79A" stroke-width="1.3" stroke-linecap="round"/>'
  + '<path d="M7.4 18v2.6M16.6 18v2.6" stroke="#8E6236" stroke-width="1.6" stroke-linecap="round"/></svg>';
const umbrellaIcon = canopy => '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + `<path d="M2.6 11.5a9.4 9.4 0 0 1 18.8 0z" fill="${canopy}"/>`
  + '<path d="M11.2 11.5v7.2a1.8 1.8 0 0 0 3.6 0" fill="none" stroke="#8E6236" stroke-width="1.6" stroke-linecap="round"/>'
  + '<path d="M2.6 11.5h18.8" stroke="#FFF4E6" stroke-width="1.1"/></svg>';
const stringLightIcon = () => '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<path d="M2 6c4 5 8 5 10 0s6-5 10 0" fill="none" stroke="#8E6236" stroke-width="1.4" stroke-linecap="round"/>'
  + '<circle cx="6" cy="9.4" r="1.7" fill="#FFD84D"/><circle cx="12" cy="7.4" r="1.7" fill="#FF8A80"/>'
  + '<circle cx="18" cy="9.4" r="1.7" fill="#8B7CF6"/><circle cx="9" cy="12.4" r="1.5" fill="#7BC47F"/>'
  + '<circle cx="15" cy="12.4" r="1.5" fill="#6EC6FF"/></svg>';

// --- catalogue ---------------------------------------------------------------------------------
// Prices are weighted toward the low end on purpose: 8 of the 20 interior items sit at or below
// 200 coins so days 2-6 always have a reachable want, and only the last few climb toward 900 so a
// developed café still has cosmetic road left. Every item is +1 reputation, so the catalogue is
// worth exactly 24 reputation in total — meaningful, but far below what shift ratings pay.
export const DECOR = Object.freeze([
  // -- interior, cheap tier (days 2-6 always have one of these in reach) --
  { id: 'd_paw_sign',    price: 60,  rep: 1, region: 'interior', kind: 'sign',    slot: { x: -9.7,  y: 1.55, z: 5.7,  rot: Math.PI / 2 },  icon: pawSignIcon() },
  { id: 'd_rug_door',    price: 70,  rep: 1, region: 'interior', kind: 'rug',     slot: { x: -7.4,  y: 0.02, z: 4.2,  rot: 0 },            icon: rugIcon('#E4694F', '#F5C784') },
  { id: 'd_art_cat',     price: 85,  rep: 1, region: 'interior', kind: 'art',     slot: { x: -2.5,  y: 2.05, z: -6.76, rot: 0 },           icon: wallArtIcon('#B9834A', '#FFF1D8', '#F5A25D') },
  { id: 'd_plant_hang_a',price: 100, rep: 1, region: 'interior', kind: 'hanging', slot: { x: -9.62, y: 2.15, z: 0.0,  rot: Math.PI / 2 },  icon: hangingPlantIcon('#E4694F') },
  { id: 'd_lantern_a',   price: 115, rep: 1, region: 'interior', kind: 'lantern', slot: { x: 9.25,  y: 0,    z: 1.2,  rot: 0 },            icon: lanternIcon('#FFD84D') },
  { id: 'd_art_dog',     price: 130, rep: 1, region: 'interior', kind: 'art',     slot: { x: 2.5,   y: 2.05, z: -6.76, rot: 0 },           icon: wallArtIcon('#8E6236', '#EAF4FF', '#C38D9E') },
  { id: 'd_rug_lounge',  price: 150, rep: 1, region: 'interior', kind: 'rug',     slot: { x: -3.6,  y: 0.02, z: 3.2,  rot: 0 },            icon: rugIcon('#8B7CF6', '#D5CDF7') },
  { id: 'd_plant_hang_b',price: 170, rep: 1, region: 'interior', kind: 'hanging', slot: { x: -9.62, y: 2.15, z: -2.6, rot: Math.PI / 2 },  icon: hangingPlantIcon('#FFB3C1') },
  // -- interior, mid tier --
  { id: 'd_lantern_b',   price: 190, rep: 1, region: 'interior', kind: 'lantern', slot: { x: -2.0,  y: 0,    z: 6.7,  rot: 0 },            icon: lanternIcon('#FF8A80') },
  { id: 'd_art_bunny',   price: 215, rep: 1, region: 'interior', kind: 'art',     slot: { x: -8.3,  y: 1.95, z: -6.76, rot: 0 },           icon: wallArtIcon('#B9834A', '#FFF4E6', '#E8B4B8') },
  { id: 'd_feeder_a',    price: 240, rep: 1, region: 'interior', kind: 'feeder',  slot: { x: -8.9,  y: 0,    z: -4.3, rot: 0 },            icon: feederIcon() },
  { id: 'd_rug_hearth',  price: 270, rep: 1, region: 'interior', kind: 'rug',     slot: { x: 3.2,   y: 0.02, z: 2.2,  rot: 0 },            icon: rugIcon('#7BC47F', '#DDF0CE') },
  { id: 'd_plant_hang_c',price: 300, rep: 1, region: 'interior', kind: 'hanging', slot: { x: -9.62, y: 2.15, z: 2.2,  rot: Math.PI / 2 },  icon: hangingPlantIcon('#6EC6FF') },
  { id: 'd_lantern_c',   price: 340, rep: 1, region: 'interior', kind: 'lantern', slot: { x: -4.4,  y: 0,    z: 6.75, rot: 0 },            icon: lanternIcon('#8B7CF6') },
  { id: 'd_menu_board',  price: 380, rep: 1, region: 'interior', kind: 'board',   slot: { x: -9.2,  y: 0,    z: -0.4, rot: -Math.PI / 2 }, icon: menuBoardIcon() },
  { id: 'd_cat_tree_a',  price: 430, rep: 1, region: 'interior', kind: 'cattree', slot: { x: 8.9,   y: 0,    z: -0.5, rot: 0 },            icon: catTreeIcon() },
  // -- interior, aspirational tier --
  { id: 'd_feeder_b',    price: 490, rep: 1, region: 'interior', kind: 'feeder',  slot: { x: -9.1,  y: 0,    z: -6.1, rot: 0 },            icon: feederIcon() },
  { id: 'd_art_mural',   price: 560, rep: 1, region: 'interior', kind: 'mural',   slot: { x: 7.6,   y: 1.95, z: -6.76, rot: 0 },           icon: muralIcon() },
  { id: 'd_bicycle',     price: 650, rep: 1, region: 'interior', kind: 'bicycle', slot: { x: -9.25, y: 0,    z: 2.6,  rot: 0 },            icon: bicycleIcon() },
  { id: 'd_cat_tree_b',  price: 780, rep: 1, region: 'interior', kind: 'cattree', slot: { x: 5.4,   y: 0,    z: 4.4,  rot: 0 },            icon: catTreeIcon() },

  // -- terrace: INERT until Batch 1 builds z_terrace (see TERRACE_ZONE above) --
  { id: 'd_umbrella_a',  price: 300, rep: 1, region: 'terrace', kind: 'umbrella', requires: TERRACE_ZONE, slot: { x: -4.5, y: 0, z: 10.4, rot: 0 }, icon: umbrellaIcon('#FF8A80') },
  { id: 'd_umbrella_b',  price: 420, rep: 1, region: 'terrace', kind: 'umbrella', requires: TERRACE_ZONE, slot: { x: 0.0,  y: 0, z: 10.4, rot: 0 }, icon: umbrellaIcon('#6EC6FF') },
  { id: 'd_umbrella_c',  price: 560, rep: 1, region: 'terrace', kind: 'umbrella', requires: TERRACE_ZONE, slot: { x: 4.5,  y: 0, z: 10.4, rot: 0 }, icon: umbrellaIcon('#7BC47F') },
  { id: 'd_terrace_lights', price: 900, rep: 1, region: 'terrace', kind: 'lights', requires: TERRACE_ZONE, slot: { x: 0.0, y: 2.6, z: 9.2, rot: 0 }, icon: stringLightIcon() },
]);

export const DECOR_BY_ID = new Map(DECOR.map(item => [item.id, item]));
export const DECOR_IDS = Object.freeze(DECOR.map(item => item.id));
export const DECOR_ID_SET = new Set(DECOR_IDS);

export function decorItem(id) {
  return (typeof id === 'string' && DECOR_BY_ID.get(id)) || null;
}

// A row is only reachable when its gating zone is built. Terrace rows name a zone that does not
// exist yet, so `false` here is what keeps them out of the shop, the world and the save.
export function decorUnlocked(item, builtSet = null) {
  if (!item) return false;
  if (!item.requires) return true;
  if (!builtSet) return false;
  return typeof builtSet.has === 'function' ? builtSet.has(item.requires) : !!builtSet[item.requires];
}

export function decorCatalogue(builtSet = null) {
  return DECOR.filter(item => decorUnlocked(item, builtSet));
}
