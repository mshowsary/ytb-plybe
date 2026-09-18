// Reconcile identity as well as count: simulation may unload/reload between frames.
//
// The layout is the shared carry tray (render/carryTray.js), not a column. A runner at the 16-item
// carry tier used to grow a 2.7 m tower of cupcakes above its own head — `position.set(0, i * .25, 0)`
// — which is in the owner's playtest screenshots. The tray is created lazily on the first item and
// simply hidden when the hands are empty, so an idle runner carries nothing visible.
import { itemFor } from './props.js';
import { makeTray, layoutTray } from './carryTray.js';

const _trays = new WeakMap();

function trayFor(stack) {
  let tray = _trays.get(stack);
  if (!tray) { tray = makeTray(); stack.add(tray); _trays.set(stack, tray); }
  return tray;
}

export function syncCarriedItems(stack, meshes, items) {
  while (meshes.length > items.length) stack.remove(meshes.pop());
  for (let i = 0; i < items.length; i++) {
    if (meshes[i]?.userData.product !== items[i]) {
      if (meshes[i]) stack.remove(meshes[i]);
      meshes[i] = itemFor(items[i]); stack.add(meshes[i]);
    }
  }
  trayFor(stack).visible = items.length > 0;
  layoutTray(meshes);
}
