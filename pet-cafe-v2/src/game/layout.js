// src/game/layout.js — the café, in one place. Every station, where people stand to use it, and
// the build pad that makes it (DESIGN.md rules 4 and 5). Nothing else hard-codes a position.
//
// Coordinates in metres: x to the right, z toward the camera. The room is x -7..3.6, z -5..5.
// Kitchen along the back wall: the pantry shelf, then each machine directly behind its own counter
// on the service line (z = -1.6). Staff work behind the counters, guests stand in front of them.
// The dining floor is in front of that, the door in the front wall on the right.

export const ROOM = { x0: -7, x1: 3.6, z0: -5, z1: 5, doorX0: 2.0, doorX1: 3.5 };
export const SERVICE_Z = -1.6;
export const STREET = { spawn: { x: 9, z: 7.2 }, door: { x: 2.75, z: 5.6 }, inside: { x: 2.75, z: 4.2 } };

// What the pantry shelf holds. Each sack refills `per` units of a machine; the band colour on the
// sack matches the band on the machine's hopper, so which sack goes where is visible, not told.
export const SUPPLIES = {
  flour:  { emoji: '🌾', band: '#6FA8DC', label: 'flour' },
  beans:  { emoji: '☕', band: '#C0504D', label: 'coffee beans' },
  kibble: { emoji: '🦴', band: '#F29A38', label: 'kibble' },
};
export const MACHINE_CAP = 12;          // units a full hopper holds
export const SACK = 6;                  // units one sack adds

export const PRODUCTS = {
  cookie:  { price: 7,  make: 2.4, emoji: '🍪', supply: 'flour',  accent: '#F2A65A' },
  cupcake: { price: 11, make: 3.2, emoji: '🧁', supply: 'flour',  accent: '#FF9EBB' },
  coffee:  { price: 9,  make: 2.0, emoji: '☕', supply: 'beans',  accent: '#B98A62' },
  treat:   { price: 8,  make: 2.6, emoji: '🦴', supply: 'kibble', accent: '#7FB8E8' },
};

// fw along x, fd along z. `built: true` = part of the café from the first second.
export const STATIONS = [
  // --- kitchen, against the back wall ------------------------------------------------------
  { id: 'pantry1',  type: 'pantry',  x: -6.0, z: -4.35, fw: 1.5, fd: 0.9, built: true },
  { id: 'oven1',    type: 'machine', model: 'oven',   x: -4.0, z: -4.3, fw: 1.5, fd: 1.1, product: 'cookie',  built: true },
  { id: 'oven2',    type: 'machine', model: 'oven',   x: -2.2, z: -4.3, fw: 1.5, fd: 1.1, product: 'cupcake' },
  { id: 'coffee1',  type: 'machine', model: 'coffee', x: -0.4, z: -4.3, fw: 1.5, fd: 1.1, product: 'coffee' },
  { id: 'treats1',  type: 'machine', model: 'treats', x:  1.4, z: -4.3, fw: 1.5, fd: 1.1, product: 'treat' },
  // --- the service line: each counter stands right in front of its own machine ---------------
  { id: 'till1',    type: 'till',    x: -5.6, z: SERVICE_Z, fw: 1.4, fd: 0.8, built: true },
  { id: 'counter1', type: 'counter', x: -4.0, z: SERVICE_Z, fw: 1.8, fd: 0.8, product: 'cookie', built: true },
  { id: 'counter2', type: 'counter', x: -2.2, z: SERVICE_Z, fw: 1.8, fd: 0.8, product: 'cupcake' },
  { id: 'counter3', type: 'counter', x: -0.4, z: SERVICE_Z, fw: 1.8, fd: 0.8, product: 'coffee' },
  { id: 'counter4', type: 'counter', x:  1.4, z: SERVICE_Z, fw: 1.8, fd: 0.8, product: 'treat' },
  // --- dining floor --------------------------------------------------------------------------
  { id: 'table1', type: 'table', x: -3.4, z: 1.6, fw: 1.0, fd: 1.0, built: true },
  { id: 'table2', type: 'table', x: -1.0, z: 1.6, fw: 1.0, fd: 1.0, built: true },
  { id: 'table3', type: 'table', x:  1.4, z: 1.6, fw: 1.0, fd: 1.0 },
  { id: 'table4', type: 'table', x: -3.4, z: 3.6, fw: 1.0, fd: 1.0 },
  { id: 'table5', type: 'table', x: -1.0, z: 3.6, fw: 1.0, fd: 1.0 },
  { id: 'table6', type: 'table', x:  1.4, z: 3.6, fw: 1.0, fd: 1.0 },
  // --- the jukebox on the left wall, facing the room (the Pet Party) --------------------------
  { id: 'jukebox1', type: 'jukebox', x: -6.6, z: 3.9, fw: 0.6, fd: 0.8, rot: Math.PI / 2, built: true },
];

// Staff. Each hire pad sits exactly where that person waits for work.
export const STAFF = {
  runner:  { home: { x: -1.3, z: -2.95 }, shirt: '#8FD3FF', speed: 2.6, carry: 4, look: 'runner' },
  runner2: { home: { x:  0.5, z: -2.95 }, shirt: '#FFD27F', speed: 2.6, carry: 4, look: 'runner' },
  cashier: { home: { x: -5.6, z: -2.55 }, shirt: '#FFB3C1', speed: 2.4, look: 'cashier' },
  cleaner: { home: { x:  2.95, z: 1.0 },  shirt: '#B5F2C8', speed: 2.5, look: 'runner' },
};

// Build pads, in the order they unlock. A pad appears once everything in `after` is built; at most
// two are on the floor at once, so the room never fills with prices.
export const PADS = [
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

export const OWNER = { start: { x: -3.2, z: -2.9 }, speed: 3.4, carry: 5 };
export const TRAY = 8;                  // finished goods a machine's tray holds
export const COUNTER_CAP = 8;
export const TABLE_TIP = [2, 5];

// Which pets visit, and from when: cats and dogs from the first day, hamsters once there is
// coffee, bunnies once there are pet treats, the legendary coats once the café is complete.
export const PET_UNLOCKS = { cat: null, dog: null, hamster: 'coffee1', bunny: 'treats1' };

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
