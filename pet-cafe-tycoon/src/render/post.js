// src/render/post.js — hand-rolled post chain: outlines, bloom, tone mapping, grade, vignette.
//
// WHY HAND-ROLLED
// three's EffectComposer instantiates its Timer, which registers a `visibilitychange` listener.
// tools/postbuild.js forbids that string outright (the host owns pause), so the whole addon tree is
// unusable here. Everything below is core three only — WebGLRenderTarget, ShaderMaterial, a quad —
// so no addon can drag a forbidden listener into the bundle.
//
// PIPELINE
//   scene ──► sceneRT (LINEAR, tone mapping OFF, depth texture attached)
//                │
//                ├─ bright pass ──► blur X ──► blur Y   (quarter res, bloom tier only)
//                │
//                └─ composite ──► screen
//                     depth-discontinuity outline · bloom add · ACES · grade · vignette
//
// Tone mapping deliberately happens LAST, in the composite. Bloom must operate on pre-tonemap
// values or highlights bloom against an already-compressed range and the glow reads as grey haze.

import * as THREE from 'three';

const QUAD = new THREE.PlaneGeometry(2, 2);

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// The full ACES filmic fit, input/output matrices included — the same transform three's
// ACESFilmicToneMapping applies. Narkowicz's cheaper approximation drops these matrices and the
// result reads visibly flatter and less saturated, which is a regression against what shipped.
const ACES = /* glsl */`
const mat3 ACES_IN = mat3(
  0.59719, 0.07600, 0.02840,
  0.35458, 0.90834, 0.13383,
  0.04823, 0.01566, 0.83777);
const mat3 ACES_OUT = mat3(
   1.60475, -0.10208, -0.00327,
  -0.53108,  1.10813, -0.07276,
  -0.07367, -0.00605,  1.07602);
vec3 rrtOdtFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 x) {
  return clamp(ACES_OUT * rrtOdtFit(ACES_IN * x), 0.0, 1.0);
}
`;

const COMPOSITE_FRAG = /* glsl */`
#include <packing>
${ACES}
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform sampler2D tBloom;
uniform vec2  texel;
uniform float cameraNear;
uniform float cameraFar;
uniform float outlineStrength;
uniform float outlineWidth;
uniform vec3  outlineColor;
uniform float bloomAmount;
uniform float exposure;
uniform float saturation;
uniform float vignetteAmount;
uniform vec3  shadowTint;
uniform vec3  highlightTint;
uniform float edgeLo;
uniform float edgeHi;
uniform float debugMode;
varying vec2 vUv;

float linDepth(vec2 uv) {
  float z = texture2D(tDepth, uv).x;
  return viewZToOrthographicDepth(perspectiveDepthToViewZ(z, cameraNear, cameraFar), cameraNear, cameraFar);
}

void main() {
  vec3 col = texture2D(tDiffuse, vUv).rgb;

  // ---- Outline from depth discontinuity -------------------------------------------------------
  // An inverted-hull outline is the usual trick, but geo.js merges primitives into one buffer with
  // hard normals, so pushing along them tears the silhouette open at every box corner. Sampling
  // depth has no such problem and costs one extra texture fetch per neighbour.
  vec2 o = texel * outlineWidth;
  float dc = linDepth(vUv);
  float d1 = linDepth(vUv + vec2( o.x, 0.0));
  float d2 = linDepth(vUv + vec2(-o.x, 0.0));
  float d3 = linDepth(vUv + vec2(0.0,  o.y));
  float d4 = linDepth(vUv + vec2(0.0, -o.y));
  // A LAPLACIAN, not a first difference. The floor is a large plane raking away from the camera, so
  // its depth changes smoothly everywhere; a first difference reads that slope as edge and veils the
  // whole frame in grey. The second derivative cancels any linear gradient and leaves only genuine
  // depth discontinuities — which is exactly what a silhouette is.
  float lap = abs(4.0 * dc - d1 - d2 - d3 - d4);
  // Relative to centre depth so a distant silhouette carries the same weight as a near one.
  float edge = smoothstep(edgeLo, edgeHi, lap / max(dc, 0.0015));
  if (debugMode > 1.5) { gl_FragColor = vec4(vec3(edge), 1.0); return; }
  if (debugMode > 0.5) { gl_FragColor = vec4(vec3(fract(dc * 40.0)), 1.0); return; }
  col = mix(col, outlineColor, edge * outlineStrength);

  // ---- Bloom ----------------------------------------------------------------------------------
  col += texture2D(tBloom, vUv).rgb * bloomAmount;

  // ---- Tone map, then grade in display space --------------------------------------------------
  col = aces(col * exposure);
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, saturation);
  // Warm the shadows and cream the highlights: the café's whole identity is "afternoon sun".
  col = mix(col * shadowTint, col * highlightTint, smoothstep(0.15, 0.95, luma));

  float d = distance(vUv, vec2(0.5)) * 1.414;
  col *= 1.0 - smoothstep(0.55, 1.25, d) * vignetteAmount;

  // sRGB encode — the renderer applies no conversion to a raw ShaderMaterial output.
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  gl_FragColor = vec4(col, 1.0);
}
`;

const BRIGHT_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform float threshold;
uniform float softKnee;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float w = smoothstep(threshold, threshold + softKnee, l);
  gl_FragColor = vec4(c * w, 1.0);
}
`;

// Separable 9-tap gaussian. Two passes at quarter resolution is the cheapest blur that still looks
// like light rather than a box filter.
const BLUR_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 dir;
varying vec2 vUv;
void main() {
  vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.227027;
  sum += (texture2D(tDiffuse, vUv + dir * 1.3846).rgb + texture2D(tDiffuse, vUv - dir * 1.3846).rgb) * 0.316216;
  sum += (texture2D(tDiffuse, vUv + dir * 3.2308).rgb + texture2D(tDiffuse, vUv - dir * 3.2308).rgb) * 0.070270;
  gl_FragColor = vec4(sum, 1.0);
}
`;

export function createPostFX(renderer, scene, camera) {
  const cam2D = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadScene = new THREE.Scene();
  const quad = new THREE.Mesh(QUAD, null);
  quad.frustumCulled = false;
  quadScene.add(quad);

  const caps = renderer.capabilities;
  const hdrType = (caps.isWebGL2 || renderer.extensions.has('EXT_color_buffer_half_float'))
    ? THREE.HalfFloatType : THREE.UnsignedByteType;

  const rtOpts = {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    type: hdrType, depthBuffer: true, stencilBuffer: false,
  };
  const sceneRT = new THREE.WebGLRenderTarget(1, 1, rtOpts);
  sceneRT.texture.colorSpace = THREE.NoColorSpace; // stay linear until the composite tone-maps
  sceneRT.depthTexture = new THREE.DepthTexture(1, 1);
  sceneRT.depthTexture.type = THREE.UnsignedShortType;

  const bloomOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type: hdrType, depthBuffer: false, stencilBuffer: false };
  const brightRT = new THREE.WebGLRenderTarget(1, 1, bloomOpts);
  const blurRTA = new THREE.WebGLRenderTarget(1, 1, bloomOpts);
  const blurRTB = new THREE.WebGLRenderTarget(1, 1, bloomOpts);
  for (const rt of [brightRT, blurRTA, blurRTB]) rt.texture.colorSpace = THREE.NoColorSpace;

  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  black.needsUpdate = true;

  const compositeMat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: COMPOSITE_FRAG, depthTest: false, depthWrite: false,
    uniforms: {
      tDiffuse: { value: sceneRT.texture },
      tDepth: { value: sceneRT.depthTexture },
      tBloom: { value: black },
      texel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
      cameraNear: { value: camera.near },
      cameraFar: { value: camera.far },
      outlineStrength: { value: 0.95 },
      outlineWidth: { value: 1.35 },
      outlineColor: { value: new THREE.Color('#43302B') }, // warm ink, never pure black
      bloomAmount: { value: 0.5 },
      exposure: { value: 1.06 },
      saturation: { value: 1.09 },
      vignetteAmount: { value: 0.20 },
      shadowTint: { value: new THREE.Color('#FFE9D2') },
      highlightTint: { value: new THREE.Color('#FFFBF2') },
      edgeLo: { value: 0.013 },
      edgeHi: { value: 0.048 },
      debugMode: { value: 0 },
    },
  });
  const brightMat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: BRIGHT_FRAG, depthTest: false, depthWrite: false,
    uniforms: { tDiffuse: { value: sceneRT.texture }, threshold: { value: 0.72 }, softKnee: { value: 0.45 } },
  });
  const blurMat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false,
    uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } },
  });

  let width = 1, height = 1, pixelRatio = 1;
  let bloomEnabled = true;
  let enabled = true;

  function setSize(w, h, ratio) {
    width = Math.max(1, Math.floor(w * ratio));
    height = Math.max(1, Math.floor(h * ratio));
    pixelRatio = ratio;
    sceneRT.setSize(width, height);
    const bw = Math.max(1, width >> 2), bh = Math.max(1, height >> 2);
    brightRT.setSize(bw, bh); blurRTA.setSize(bw, bh); blurRTB.setSize(bw, bh);
    compositeMat.uniforms.texel.value.set(1 / width, 1 / height);
  }

  function blit(material, target) {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, cam2D);
  }

  function render() {
    if (!enabled) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }

    // Scene stays linear and untonemapped; the composite owns both.
    const prevTone = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setRenderTarget(sceneRT);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.toneMapping = prevTone;

    if (bloomEnabled) {
      brightMat.uniforms.tDiffuse.value = sceneRT.texture;
      blit(brightMat, brightRT);
      const bw = brightRT.width, bh = brightRT.height;
      blurMat.uniforms.tDiffuse.value = brightRT.texture;
      blurMat.uniforms.dir.value.set(1 / bw, 0);
      blit(blurMat, blurRTA);
      blurMat.uniforms.tDiffuse.value = blurRTA.texture;
      blurMat.uniforms.dir.value.set(0, 1 / bh);
      blit(blurMat, blurRTB);
      compositeMat.uniforms.tBloom.value = blurRTB.texture;
    } else {
      compositeMat.uniforms.tBloom.value = black;
    }

    compositeMat.uniforms.cameraNear.value = camera.near;
    compositeMat.uniforms.cameraFar.value = camera.far;
    blit(compositeMat, null);
  }

  return {
    render,
    setSize,
    get uniforms() { return compositeMat.uniforms; },
    // The quality ladder sheds the most expensive effect first and never touches correctness.
    setBloom(on) { bloomEnabled = !!on; },
    setEnabled(on) { enabled = !!on; },
    get bloomEnabled() { return bloomEnabled; },
    dispose() {
      for (const rt of [sceneRT, brightRT, blurRTA, blurRTB]) rt.dispose();
      compositeMat.dispose(); brightMat.dispose(); blurMat.dispose(); black.dispose();
    },
  };
}
