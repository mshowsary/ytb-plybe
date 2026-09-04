// Area 1 — Café. Meters, origin at floor centre; +x east, +z toward the camera.
export const AREA1 = {
  id: 'a1', size: { w: 20, d: 14 },
  door: { x: -9.6, z: 4.2 }, exit: { x: -9.6, z: 4.2 }, spawnStart: { x: -11.5, z: 4.2 },
  stations: [
    { id: 'oven1',    type: 'oven',    x: 6.5,  z: -5.2, rot: 0, fw: 1.6, fd: 1.2, product: 'cookie',  buffer: 12 },
    { id: 'oven2',    type: 'oven',    x: 3.5,  z: -5.2, rot: 0, fw: 1.6, fd: 1.2, product: 'cupcake', buffer: 12, builtBy: 'z_oven2' },
    { id: 'coffee1',  type: 'coffee',  x: 0.5,  z: -5.2, rot: 0, fw: 1.2, fd: 1.2, builtBy: 'z_coffee' },
    { id: 'pantry1',  type: 'pantry',  x: -2.2, z: -5.2, rot: 0, fw: 1.2, fd: 1.2, builtBy: 'z_coffee' },
    { id: 'return1',  type: 'return',  x: -3.8, z: -5.2, rot: 0, fw: 0.8, fd: 0.9 },
    { id: 'blender1', type: 'blender', x: -5.5, z: -5.2, rot: 0, fw: 1.2, fd: 1.2, builtBy: 'z_blender' },

    { id: 'dispCookie',  type: 'display', product: 'cookie',   x: 2.0,  z: -2.0, rot: 0, fw: 2.4, fd: 1.0, capacity: 8 },
    { id: 'dispCupcake', type: 'display', product: 'cupcake',  x: 5.0,  z: -2.0, rot: 0, fw: 2.4, fd: 1.0, capacity: 8, builtBy: 'z_oven2' },
    { id: 'barCoffee',   type: 'display', product: 'coffee',   x: -1.0, z: -2.0, rot: 0, fw: 2.4, fd: 1.0, capacity: 8, builtBy: 'z_coffee' },
    { id: 'barSmoothie', type: 'display', product: 'smoothie', x: 8.6,  z: -2.0, rot: 0, fw: 2.4, fd: 1.0, capacity: 8, builtBy: 'z_blender' },

    { id: 'register1', type: 'checkout', x: -5.5, z: -2.0, rot: 0, fw: 1.6, fd: 0.9 },
    { id: 'register2', type: 'checkout', x: -8.0, z: -2.0, rot: 0, fw: 1.6, fd: 0.9, builtBy: 'z_register2', queueRight: 0.5 },

    // One starter plant arrives with the blender so the smoothie loop works immediately. The two
    // remaining plants are a later throughput/beauty expansion, not a resource with no destination.
    { id: 'bowl1', type: 'bowl', x: 6.8, z: 2.5, rot: -Math.PI / 2, fw: 0.8, fd: 0.8, builtBy: 'z_bowl' },
    { id: 'bush1', type: 'bush', x: 8.6, z: 3.6, rot: Math.PI, fw: 0.9, fd: 0.9, builtBy: 'z_blender' },
    { id: 'bush2', type: 'bush', x: 8.6, z: 4.7, rot: -Math.PI / 2, fw: 0.9, fd: 0.9, builtBy: 'z_garden' },
    { id: 'bush3', type: 'bush', x: 7.2, z: 5.9, rot: Math.PI, fw: 0.9, fd: 0.9, builtBy: 'z_garden' },

    { id: 'seat1', type: 'seat', x: -8.0, z: 6.0, rot: Math.PI, fw: 1.4, fd: 1.4, builtBy: 'z_seats1' },
    { id: 'seat2', type: 'seat', x: -5.5, z: 6.0, rot: Math.PI, fw: 1.4, fd: 1.4, builtBy: 'z_seats1' },
    // The first lounge table faces sideways so its service/cleaning spot does not sit directly on
    // the westbound exit stream. This gives guests right-of-way through the doorway approach while
    // keeping the table in the same visual row and footprint.
    { id: 'seat3', type: 'seat', x: -3.0, z: 6.0, rot: Math.PI / 2, fw: 1.4, fd: 1.4, builtBy: 'z_seats2' },
    { id: 'seat4', type: 'seat', x: -0.5, z: 6.0, rot: Math.PI, fw: 1.4, fd: 1.4, builtBy: 'z_seats2' },
    { id: 'seat5', type: 'seat', x: 2.0,  z: 6.0, rot: Math.PI, fw: 1.4, fd: 1.4, builtBy: 'z_seats2' },
    { id: 'seat6', type: 'seat', x: 4.5,  z: 6.0, rot: Math.PI, fw: 1.4, fd: 1.4, builtBy: 'z_seats2' },

    { id: 'hire1',  type: 'hire',  x: -8.6, z: 1.0, rot: Math.PI / 2, fw: 1.0, fd: 1.6, builtBy: 'z_hire' },
    { id: 'kiosk1', type: 'kiosk', x: 9.0, z: -3.5, rot: -Math.PI / 2, fw: 1.0, fd: 1.6 },
  ],

  zones: [
    { id: 'z_seats1',    x: -6.75, z: 4.3,  price: 90,   adds: ['seat1', 'seat2'],                       label: 'Tables' },
    { id: 'z_oven2',     x: 3.5,   z: -3.6, price: 220,  adds: ['oven2', 'dispCupcake'],                 requires: 'z_seats1',    label: 'Cupcake oven' },
    { id: 'z_register2', x: -8.0,  z: -0.6, price: 340,  adds: ['register2'],                            requires: 'z_oven2',     label: 'Second register' },
    { id: 'z_hire',      x: -7.2,  z: 1.0,  price: 480,  adds: ['hire1'],                                requires: 'z_register2', label: 'Staff desk' },
    { id: 'z_coffee',    x: 0.5,   z: -3.6, price: 700,  adds: ['coffee1', 'barCoffee', 'pantry1'],       requires: 'z_hire',      label: 'Coffee bar' },
    { id: 'z_bowl',      x: 5.3,   z: 2.5,  price: 900,  adds: ['bowl1'],                                 requires: 'z_coffee',    label: 'Pet treat bar' },
    { id: 'z_blender',   x: -3.5,  z: -3.6, price: 1150, adds: ['blender1', 'barSmoothie', 'bush1'],      requires: 'z_bowl',      label: 'Smoothie bar' },
    { id: 'z_garden',    x: 6.0,   z: 4.2,  price: 1400, adds: ['bush2', 'bush3'],                        requires: 'z_blender',   label: 'Garden expansion' },
    { id: 'z_seats2',    x: 0.8,   z: 4.3,  price: 1750, adds: ['seat3', 'seat4', 'seat5', 'seat6'],      requires: 'z_garden',    label: 'Pet lounge' },
  ],
};

function rotateOffset(rot, right, forward) {
  const s = Math.sin(rot), c = Math.cos(rot);
  return { x: right * c + forward * s, z: -right * s + forward * c };
}

export function queueSlots(st, n = 5) {
  const rot = st.rot || 0;
  return Array.from({ length: n }, (_, i) => {
    const d = rotateOffset(rot, 0, 0.9 * i);
    return { x: st.front.x + d.x, z: st.front.z + d.z };
  });
}
export function checkoutSpot(st) { return { x: st.front.x, z: st.front.z }; }
export function cashSpot(st) {
  const rot = st.rot || 0;
  // Cashier/collection point stays immediately beside the till instead of 1.2m left of the
  // customer queue. It is still outside the register collision shell, so touch collection remains
  // easy in a crowd, but visually reads as part of the register rather than a separate floor zone.
  const off = rotateOffset(rot, -0.78, -0.30);
  return { x: st.front.x + off.x, z: st.front.z + off.z };
}
