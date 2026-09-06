import * as THREE from 'three';
import {
  ovenMesh,
  counterMesh,
  checkoutMesh,
  tableMesh,
  hireDeskMesh,
  kioskMesh,
  bowlMesh,
  bushMesh,
  coffeeMesh,
  pantryMesh,
  crateMesh,
  blenderMesh,
  buildGhost,
} from './props.js';

const BUILDERS = {
  oven: ovenMesh,
  display: counterMesh,
  checkout: checkoutMesh,
  seat: tableMesh,
  hire: hireDeskMesh,
  kiosk: kioskMesh,
  bowl: bowlMesh,
  bush: bushMesh,
  coffee: coffeeMesh,
  pantry: pantryMesh,
  return: crateMesh,
  blender: blenderMesh,
};

const PREVIEW_COLOR = '#CFC5FF';

function disposeMaterial(material) {
  if (Array.isArray(material)) {
    for (const m of material) if (m && typeof m.dispose === 'function') m.dispose();
  } else if (material && typeof material.dispose === 'function') material.dispose();
}

/**
 * Task 32: turn the real authored station silhouette into a low-cost construction blueprint.
 *
 * This intentionally reuses geometry, not gameplay state. Every child material is replaced with a
 * translucent unlit lilac material so an empty spot communicates "an oven goes here" or "a table
 * goes here" at a glance without adding labels, tutorial prose, or another HUD layer.
 */
export function semanticBuildGhost(stDef, fw = 2.4, fd = 1) {
  const builder = stDef && BUILDERS[stDef.type];
  if (!builder) {
    const fallback = buildGhost(fw, fd);
    fallback.userData.buildPreview = 'footprint';
    return fallback;
  }

  const ghost = builder();
  const previewMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PREVIEW_COLOR),
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  let meshes = 0;
  ghost.traverse(node => {
    if (!node.isMesh) return;
    meshes++;
    disposeMaterial(node.material);
    node.material = previewMaterial;
    node.castShadow = false;
    node.receiveShadow = false;
    node.renderOrder = -1;
  });

  ghost.scale.setScalar(0.94);
  ghost.position.y = 0.025;
  ghost.userData.buildPreview = 'semantic';
  ghost.userData.stationType = stDef.type;
  ghost.userData.previewMeshes = meshes;
  return ghost;
}

export function buildPreviewKind(stDef) {
  return stDef && BUILDERS[stDef.type] ? 'semantic' : 'footprint';
}
