// Reconcile identity as well as count: simulation may unload/reload between frames.
import { itemFor } from './props.js';
export function syncCarriedItems(stack, meshes, items) {
  while (meshes.length > items.length) stack.remove(meshes.pop());
  for (let i = 0; i < items.length; i++) {
    if (meshes[i]?.userData.product !== items[i]) {
      if (meshes[i]) stack.remove(meshes[i]);
      meshes[i] = itemFor(items[i]); stack.add(meshes[i]);
    }
    meshes[i].position.set(0, i * .25, 0);
  }
}
