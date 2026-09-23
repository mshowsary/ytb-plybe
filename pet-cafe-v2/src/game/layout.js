// src/game/layout.js — the cafés, in one place. Every station, where people stand to use it, and
// the build pad that makes it (DESIGN.md rules 4 and 5). Nothing else hard-codes a position.
//
// Every café shares one proven floor plan, so every rule (pantry → machine → counter → guest → till,
// reservations, staff, guests) works the same everywhere. What changes per café is everything you see
// and sell: the menu, the machines, the room, the pets. `setLocation()` swaps the live bindings below.
//
// Coordinates in metres: x to the right, z toward the camera. The room is x -7..3.6, z -5..5.
// Kitchen along the back wall: the pantry shelf, then each machine directly behind its own counter
// on the service line (z = -1.6). Staff work behind the counters, guests stand in front of them.

// What pantries hold. The band colour on a sack matches the band on the hopper it fills.
export const SUPPLIES = {
  flour:  { emoji: '🌾', band: '#6FA8DC' },
  beans:  { emoji: '☕', band: '#C0504D' },
  kibble: { emoji: '🦴', band: '#F29A38' },
  lemons: { emoji: '🍋', band: '#F2D13A' },
  fruit:  { emoji: '🍓', band: '#E8546B' },
  cream:  { emoji: '🥛', band: '#9ED8F2' },
  fishbox: { emoji: '🐟', band: '#5B8FD6' },
  // the Mall Café's stockroom: cardboard boxes, banded like their machines
  dough:  { emoji: '🥯', band: '#F28FB8' },
  tea:    { emoji: '🍵', band: '#6CC08A' },
  batter: { emoji: '🥚', band: '#F2C14E' },
  meat:   { emoji: '🥩', band: '#D95B4F' },
};
export const MACHINE_CAP = 12;          // units a full hopper holds
export const SACK = 6;                  // units one sack adds

export const PRODUCTS = {
  cookie:   { price: 7,  make: 2.4, emoji: '🍪', supply: 'flour',  accent: '#F2A65A', model: 'oven' },
  cupcake:  { price: 11, make: 3.2, emoji: '🧁', supply: 'flour',  accent: '#FF9EBB', model: 'oven' },
  coffee:   { price: 9,  make: 2.0, emoji: '☕', supply: 'beans',  accent: '#B98A62', model: 'coffee' },
  treat:    { price: 8,  make: 2.6, emoji: '🦴', supply: 'kibble', accent: '#7FB8E8', model: 'treats' },
  lemonade: { price: 16, make: 2.2, emoji: '🍋', supply: 'lemons', accent: '#F7D94C', model: 'juicer' },
  smoothie: { price: 24, make: 3.0, emoji: '🥤', supply: 'fruit',  accent: '#FF7FA8', model: 'blender' },
  icecream: { price: 20, make: 2.4, emoji: '🍦', supply: 'cream',  accent: '#8FD8F0', model: 'icecream' },
  fish:     { price: 18, make: 2.8, emoji: '🐟', supply: 'fishbox', accent: '#6FA0E0', model: 'grill' },
  donut:    { price: 34, make: 2.4, emoji: '🍩', supply: 'dough',  accent: '#FF8FB8', model: 'fryer' },
  bubbletea:{ price: 48, make: 3.0, emoji: '🧋', supply: 'tea',    accent: '#C8A07A', model: 'teabar' },
  waffle:   { price: 42, make: 2.8, emoji: '🧇', supply: 'batter', accent: '#F2B94E', model: 'waffle' },
  jerky:    { price: 38, make: 2.6, emoji: '🍖', supply: 'meat',   accent: '#E07A5F', model: 'smoker' },
};

export const LOCATIONS = {
  town: {
    id: 'town', name: 'Town Café', emoji: '🏡', theme: 'town',
    menu: ['cookie', 'cupcake', 'coffee', 'treat'], priceScale: 1,
    variants: [0, 1, 2, 3], unlock: { hamster: 'coffee1', bunny: 'treats1' },
  },
  beach: {
    id: 'beach', name: 'Beach Café', emoji: '🏖️', theme: 'beach',
    menu: ['lemonade', 'smoothie', 'icecream', 'fish'], priceScale: 2.4,
    variants: [5, 6, 7, 8], unlock: { hamster: 'coffee1', bunny: 'treats1' }, cost: 3000,
  },
  mall: {
    id: 'mall', name: 'Mall Café', emoji: '🛍️', theme: 'mall',
    menu: ['donut', 'bubbletea', 'waffle', 'jerky'], priceScale: 5.5,
    variants: [9, 10, 11, 12], unlock: { hamster: 'coffee1', bunny: 'treats1' }, cost: 9000,
  },
};
export const LOCATION_ORDER = ['town', 'beach', 'mall'];
export const COMING_SOON = [];

// ---- the shared floor plan --------------------------------------------------------------------
// Machine / counter slots A-D hold the café's four products, in menu order.
function stationsFor(menu) {
  const [a, b, c, d] = menu;
  return [
    { id: 'pantry1',  type: 'pantry',  x: -6.0, z: -4.35, fw: 1.5, fd: 0.9, built: true },
    { id: 'oven1',    type: 'machine', x: -4.0, z: -4.3, fw: 1.5, fd: 1.1, product: a, built: true },
    { id: 'oven2',    type: 'machine', x: -2.2, z: -4.3, fw: 1.5, fd: 1.1, product: b },
    { id: 'coffee1',  type: 'machine', x: -0.4, z: -4.3, fw: 1.5, fd: 1.1, product: c },
    { id: 'treats1',  type: 'machine', x:  1.4, z: -4.3, fw: 1.5, fd: 1.1, product: d },
    { id: 'till1',    type: 'till',    x: -5.6, z: -1.6, fw: 1.4, fd: 0.8, built: true },
    { id: 'counter1', type: 'counter', x: -4.0, z: -1.6, fw: 1.8, fd: 0.8, product: a, built: true },
    { id: 'counter2', type: 'counter', x: -2.2, z: -1.6, fw: 1.8, fd: 0.8, product: b },
    { id: 'counter3', type: 'counter', x: -0.4, z: -1.6, fw: 1.8, fd: 0.8, product: c },
    { id: 'counter4', type: 'counter', x:  1.4, z: -1.6, fw: 1.8, fd: 0.8, product: d },
    { id: 'table1', type: 'table', x: -3.4, z: 1.6, fw: 1.0, fd: 1.0, built: true },
    { id: 'table2', type: 'table', x: -1.0, z: 1.6, fw: 1.0, fd: 1.0, built: true },
    { id: 'table3', type: 'table', x:  1.4, z: 1.6, fw: 1.0, fd: 1.0 },
    { id: 'table4', type: 'table', x: -3.4, z: 3.6, fw: 1.0, fd: 1.0 },
    { id: 'table5', type: 'table', x: -1.0, z: 3.6, fw: 1.0, fd: 1.0 },
    { id: 'table6', type: 'table', x:  1.4, z: 3.6, fw: 1.0, fd: 1.0 },
    { id: 'jukebox1', type: 'jukebox', x: -6.6, z: 3.9, fw: 0.6, fd: 0.8, rot: Math.PI / 2, built: true },
  ];
}
const PAD_PLAN = [
  { id: 'p_table3',   builds: 'table3',        price: 40,  after: [] },
  { id: 'p_runner',   builds: 'staff:runner',  price: 90,  after: ['table3'] },
  { id: 'p_oven2',    builds: 'oven2',         price: 220, after: ['staff:runner'] },
  { id: 'p_counter2', builds: 'counter2',      price: 160, after: ['oven2'] },
  { id: 'p_cashier',  builds: 'staff:cashier', price: 300, after: ['counter2'] },
  { id: 'p_table4',   builds: 'table4',        price: 180, after: ['table3'] },
  { id: 'p_coffee1',  builds: 'coffee1',       price: 420, after: ['staff:cashier'] },
  { id: 'p_counter3', builds: 'counter3',      price: 280, after: ['coffee1'] },
  { id: 'p_table5',   builds: 'table5',        price: 340, after: ['table4', 'counter3'] },
  { id: 'p_treats1',  builds: 'treats1',       price: 700, after: ['counter3'] },
  { id: 'p_counter4', builds: 'counter4',      price: 450, after: ['treats1'] },
  { id: 'p_cleaner',  builds: 'staff:cleaner', price: 560, after: ['counter4'] },
  { id: 'p_table6',   builds: 'table6',        price: 620, after: ['table5', 'staff:cleaner'] },
  { id: 'p_runner2',  builds: 'staff:runner2', price: 800, after: ['staff:cleaner'] },
];

export const ROOM = { x0: -7, x1: 3.6, z0: -5, z1: 5, doorX0: 2.0, doorX1: 3.5 };
export const SERVICE_Z = -1.6;
export const STREET = { spawn: { x: 9, z: 7.2 }, door: { x: 2.75, z: 5.6 }, inside: { x: 2.75, z: 4.2 } };
export const STAFF = {
  runner:  { home: { x: -1.3, z: -2.95 }, shirt: '#8FD3FF', speed: 2.6, carry: 4, look: 'runner' },
  runner2: { home: { x:  0.5, z: -2.95 }, shirt: '#FFD27F', speed: 2.6, carry: 4, look: 'runner' },
  cashier: { home: { x: -5.6, z: -2.55 }, shirt: '#FFB3C1', speed: 2.4, look: 'cashier' },
  cleaner: { home: { x:  2.95, z: 1.0 },  shirt: '#B5F2C8', speed: 2.5, look: 'runner' },
};
export const OWNER = { start: { x: -3.2, z: -2.9 }, speed: 3.4, carry: 5 };
export const TRAY = 8;                  // finished goods a machine's tray holds
export const COUNTER_CAP = 8;
export const TABLE_TIP = [2, 5];

// ---- the live bindings for the café being played --------------------------------------------
export let LOC = LOCATIONS.town;
export let STATIONS = stationsFor(LOC.menu);
export let PADS = PAD_PLAN;
export let PET_UNLOCKS = { cat: null, dog: null, ...LOC.unlock };
export function setLocation(id) {
  LOC = LOCATIONS[id] || LOCATIONS.town;
  STATIONS = stationsFor(LOC.menu);
  PADS = PAD_PLAN.map(p => ({ ...p, price: Math.round(p.price * LOC.priceScale / 10) * 10 }));
  PET_UNLOCKS = { cat: null, dog: null, ...LOC.unlock };
}

// ---- derived spots: where people stand to use each station ----------------------------------
const FRONT_GAP = 0.55;
export function spotsFor(st) {
  const s = {};
  if (st.type === 'machine' || st.type === 'pantry') {
    s.work = { x: st.x, z: st.z + st.fd / 2 + FRONT_GAP };
  } else if (st.type === 'counter') {
    s.staff = { x: st.x, z: st.z - st.fd / 2 - FRONT_GAP + 0.05 };
    s.guests = [{ x: st.x - 0.45, z: st.z + st.fd / 2 + FRONT_GAP }, { x: st.x + 0.45, z: st.z + st.fd / 2 + FRONT_GAP }];
  } else if (st.type === 'till') {
    s.staff = { x: st.x, z: st.z - st.fd / 2 - FRONT_GAP + 0.05 };
    s.queue = [0, 1, 2, 3, 4].map(i => ({ x: st.x, z: st.z + st.fd / 2 + FRONT_GAP + i * 0.85 }));
  } else if (st.type === 'table') {
    s.chairs = [{ x: st.x - 0.78, z: st.z, face: Math.PI / 2 }, { x: st.x + 0.78, z: st.z, face: -Math.PI / 2 }];
  }
  return s;
}

// ---- upgrades: the long coin sink. Each level costs base * mult^level. -------------------------
export const UPGRADES = [
  { id: 'speed',    icon: '👟', name: 'Quick feet',      what: 'Everyone walks faster',     max: 5, base: 150, mult: 1.9 },
  { id: 'carry',    icon: '🧺', name: 'Bigger trays',    what: 'Carry one more item',        max: 4, base: 200, mult: 2.0 },
  { id: 'machines', icon: '⚙️', name: 'Faster machines', what: 'Goods are made quicker',     max: 5, base: 250, mult: 1.9 },
  { id: 'counters', icon: '🗄️', name: 'Bigger counters', what: 'Two more on every counter',  max: 3, base: 300, mult: 2.1 },
  { id: 'prices',   icon: '💰', name: 'Premium menu',    what: 'Everything sells for more',  max: 5, base: 400, mult: 1.9 },
  { id: 'tips',     icon: '💝', name: 'Cosy tables',     what: 'Bigger tips at the tables',  max: 4, base: 250, mult: 1.9 },
];
export const upgradeCost = (u, lvl) => Math.round(u.base * Math.pow(u.mult, lvl) / 10) * 10;
