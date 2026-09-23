// src/render/scene.js — renderer, warm café lighting, a camera that frames the room on any screen,
// and the finishing pass that makes a small phone readable: a cartoon outline around everything that
// stands in front of something else, plus a colour grade (saturation and contrast) so nothing is washed out.
import * as THREE from 'three';
import { damp, lerp } from '../core/tween.js';

const YAW = 0.36, PITCH = 0.9, FOV = 35;    // camera comes from the front-right, looking down ~52°

const POST_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FRAG = `
  uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 texel; uniform float near; uniform float far;
  uniform float outline; uniform float saturation; uniform float contrast; uniform float aoRadius;
  varying vec2 vUv;
  float lin(float d){ return (near * far) / (far - d * (far - near)); }
  void main(){
    vec3 c = texture2D(tColor, vUv).rgb;
    float d0 = lin(texture2D(tDepth, vUv).r);
    float e = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 o = i == 0 ? vec2(texel.x, 0.0) : i == 1 ? vec2(-texel.x, 0.0) : i == 2 ? vec2(0.0, texel.y) : vec2(0.0, -texel.y);
      float dn = lin(texture2D(tDepth, vUv + o * outline).r);
      e = max(e, (dn - d0) / d0);      // only the nearer side draws the line: a crisp single outline
    }
    float edge = smoothstep(0.018, 0.05, e);
    // ambient occlusion from depth alone: where the neighbours are nearer than this pixel (the floor
    // at the foot of a counter, a corner, under a table), darken softly. Big jumps (a character against
    // the far floor) are ignored so silhouettes do not get haloes.
    float occ = 0.0;
    for (int k = 0; k < 8; k++) {
      float a = float(k) * 0.785398 + 0.39;
      vec2 o = vec2(cos(a), sin(a)) * texel * aoRadius * (k % 2 == 0 ? 1.0 : 0.55);
      float dn = lin(texture2D(tDepth, vUv + o).r);
      float diff = d0 - dn;
      occ += clamp(diff / (0.035 * d0), 0.0, 1.0) * (1.0 - smoothstep(0.08 * d0, 0.25 * d0, diff));
    }
    c *= 1.0 - 0.42 * (occ / 8.0);
    vec3 ink = vec3(0.13, 0.08, 0.06) * c * 0.6;
    c = mix(c, ink, edge * 0.78);
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, saturation);
    c = (c - 0.18) * contrast + 0.18;
    gl_FragColor = vec4(max(c, 0.0), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8FCBE6');
  scene.fog = new THREE.Fog('#AED9EE', 34, 64);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 120);
  const hemi = new THREE.HemisphereLight('#FFF1DC', '#8C7358', 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#FFE2B8', 1.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 50 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#DDEBFF', 0.45); fill.position.set(-10, 8, 6); scene.add(fill);

  // ---- the finishing pass ------------------------------------------------------------------
  const webgl2 = renderer.capabilities.isWebGL2;
  const rt = new THREE.WebGLRenderTarget(4, 4, { samples: webgl2 ? 4 : 0, type: THREE.HalfFloatType });
  rt.depthTexture = new THREE.DepthTexture(4, 4); rt.depthTexture.type = THREE.UnsignedIntType;
  const post = new THREE.ShaderMaterial({
    vertexShader: POST_VERT, fragmentShader: POST_FRAG, toneMapped: true, depthTest: false, depthWrite: false,
    uniforms: { tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture }, texel: { value: new THREE.Vector2() },
      near: { value: camera.near }, far: { value: camera.far }, outline: { value: 1.2 }, saturation: { value: 1.22 }, contrast: { value: 1.08 }, aoRadius: { value: 14 } },
  });
  const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));

  const target = new THREE.Vector3(), goal = new THREE.Vector3();
  let dist = 18, shake = 0, override = null, overrideT = 0;
  const S = { renderer, scene, camera, sun, hemi, fill };
  let MID = { x: -1.7, z: 0 };
  S.setMid = m => { MID = m; };
  // each café has its own light: the town is a warm afternoon, the beach a bright noon by the sea
  S.setTheme = theme => {
    // the beach used to be graded flatter and lit brighter than the town, and on its pale sand and
    // boards that washed everything out; it now gets the town's grade and a softer bounce off the sand
    post.uniforms.saturation.value = theme === 'beach' ? 1.18 : 1.16;
    post.uniforms.contrast.value = theme === 'beach' ? 1.12 : 1.08;
    if (theme === 'beach') {
      scene.background.set('#5DBCEB'); scene.fog.color.set('#9ED8F2'); scene.fog.near = 40; scene.fog.far = 80;
      hemi.color.set('#FFF3E0'); hemi.groundColor.set('#9C7E58'); hemi.intensity = 0.8; sun.color.set('#FFE9C8'); sun.intensity = 1.75;
    } else if (theme === 'mall') {
      // indoors: a bright, even skylight, warm cream in the distance instead of sky
      scene.background.set('#F1E6D8'); scene.fog.color.set('#F1E6D8'); scene.fog.near = 36; scene.fog.far = 70;
      hemi.color.set('#FFFFFF'); hemi.groundColor.set('#8C7F8E'); hemi.intensity = 0.95; sun.color.set('#FFF3E2'); sun.intensity = 1.55;
    } else {
      scene.background.set('#8FCBE6'); scene.fog.color.set('#AED9EE'); scene.fog.near = 34; scene.fog.far = 64;
      hemi.color.set('#FFF1DC'); hemi.groundColor.set('#8C7358'); hemi.intensity = 0.9; sun.color.set('#FFE2B8'); sun.intensity = 1.7;
    }
  };

  S.resize = () => {
    const w = innerWidth, h = innerHeight;
    // Small canvases are drawn at up to twice their pixel size (supersampling) so edges stay clean
    // on low-density screens; big canvases use the screen's own density.
    const dpr = devicePixelRatio || 1;
    const pr = Math.min(2, Math.max(dpr, w * h < 900000 ? 2 : 1.25));
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    rt.setSize(Math.round(w * pr), Math.round(h * pr));
    post.uniforms.texel.value.set(1 / (w * pr), 1 / (h * pr));
    post.uniforms.outline.value = Math.max(1, pr * 0.75);
    post.uniforms.aoRadius.value = 9 * pr;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    // Phones held upright frame ~10.8 m across so characters stay big; wide screens ~17 m.
    const t = Math.tan(FOV * Math.PI / 360);
    const across = camera.aspect < 1 ? 10.8 : 17;
    dist = Math.max(across / (2 * t * camera.aspect), 11.5 / (2 * t));
    if (camera.aspect < 0.62) dist = Math.min(dist, 24);
  };

  // Portrait looks a little ahead of the owner (toward the kitchen); wide screens centre them.
  const lead = () => camera.aspect < 1 ? 1.0 : 0.4;
  const pull = () => camera.aspect < 1 ? 0.4 : 0.3;   // lean toward the middle of the room
  S.follow = (x, z, dt) => {
    goal.set(lerp(x, MID.x, pull()), 0, lerp(z, MID.z, pull()) - lead());
    const k = dt > 0 ? 1 - Math.exp(-6 * dt) : 1;
    target.lerp(goal, k);
    place(dt);
  };
  S.snap = (x, z) => { target.set(lerp(x, MID.x, pull()), 0, lerp(z, MID.z, pull()) - lead()); place(0); };
  S.shake = a => { shake = Math.max(shake, a); };
  // A held shot (the grand opening): look at `p` from `d` for `t` seconds, then glide home.
  S.look = (p, d, t) => { override = { x: p.x, z: p.z, d }; overrideT = t; };

  let blend = 0;
  function place(dt) {
    if (overrideT > 0) overrideT -= dt;
    blend = damp(blend, overrideT > 0 ? 1 : 0, 2.2, dt || 1);
    const vx = override ? lerp(target.x, override.x, blend) : target.x;
    const vz = override ? lerp(target.z, override.z, blend) : target.z;
    const d = override ? lerp(dist, override.d, blend) : dist;
    const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    camera.position.set(vx + Math.sin(YAW) * cp * d, sp * d, vz + Math.cos(YAW) * cp * d);
    if (shake > 0) {
      shake *= Math.exp(-10 * (dt || 0.016));
      camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake;
    }
    camera.lookAt(vx, 0.3, vz);
    sun.position.set(vx + 7, 14, vz + 9); sun.target.position.set(vx, 0, vz);
  }

  const v3 = new THREE.Vector3();
  S.worldToScreen = (x, y, z, out) => {
    v3.set(x, y, z).project(camera);
    out.x = (v3.x * 0.5 + 0.5) * innerWidth; out.y = (-v3.y * 0.5 + 0.5) * innerHeight;
    out.on = v3.z < 1 && Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05;
    return out;
  };
  // any other scene (the journey map) through the same finishing pass
  S.renderWith = (scn, cam) => {
    post.uniforms.near.value = cam.near; post.uniforms.far.value = cam.far;
    renderer.setRenderTarget(rt); renderer.render(scn, cam);
    renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  };
  // a finished picture with live things on top (the café city map): no outline and no AO — the
  // picture has its own light — only the multisampled target and the output colour conversion
  const copy = new THREE.ShaderMaterial({ vertexShader: POST_VERT, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D tColor; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tColor, vUv); 
#include <colorspace_fragment>
 }`,
    uniforms: { tColor: { value: rt.texture } } });
  const copyScene = new THREE.Scene(); copyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copy));
  S.renderPlain = (scn, cam) => {
    renderer.setRenderTarget(rt); renderer.render(scn, cam);
    renderer.setRenderTarget(null); renderer.render(copyScene, postCam);
  };
  S.render = () => {
    post.uniforms.near.value = camera.near; post.uniforms.far.value = camera.far;
    renderer.setRenderTarget(rt); renderer.render(scene, camera);
    S.stats = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
    renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  };
  addEventListener('resize', S.resize); S.resize();
  return S;
}
