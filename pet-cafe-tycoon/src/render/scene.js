// src/render/scene.js — premium lighting + slow adaptive resolution for Playables hardware.
// No EffectComposer: it instantiates three's Timer, whose visibilitychange listener the build guard forbids.
import * as THREE from 'three';
import { damp, lerp } from '../core/tween.js';
import { presentationScheduler } from '../core/presentationScheduler.js';
import { createPostFX } from './post.js';

const YAW = 35 * Math.PI / 180, PITCH = 52 * Math.PI / 180, FOV = 40;

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  let basePixelRatio = Math.min(devicePixelRatio || 1, 1.75), renderScale = 1;
  renderer.setPixelRatio(basePixelRatio * renderScale);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  // Every colour below is the MORNING keyframe of render/daylight.js. Nothing here is a permanent
  // look any more: daylight.update() owns sun/hemi/fog/sky/grade from the first frame of a shift.
  // These values only decide what one pre-game render (the renderer smoke test in main.js) shows.
  scene.fog = new THREE.Fog('#F2F6F9', 42, 88);
  // Near plane 2.5, not 0.5: depth precision goes with near / z², so this alone buys 5x. The camera
  // only ever looks down at the owner from S.dist (8.7 m at the widest phone, 844x390, even inside
  // the 0.84 build punch), and the nearest thing it can frame is the awning's front edge, ~2.9 m out
  // at a 3:1 ultra-wide during the punch — 2.5 keeps that in frame with margin.
  const camera = new THREE.PerspectiveCamera(FOV, 1, 2.5, 200);

  // The sky is a two-colour vertex gradient on a back-faced sphere. It used to be baked once; the
  // colour attribute is now repainted on demand so time of day can move it (325 verts, ~4 KB).
  const repaintSky = (() => {
    const g = new THREE.SphereGeometry(90, 24, 12), n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3), pos = g.getAttribute('position'), c = new THREE.Color();
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const attr = g.getAttribute('color');
    const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false }));
    sky.renderOrder = -1; scene.add(sky);
    return (top, hor) => {
      for (let i = 0; i < n; i++) {
        const y = pos.getY(i) / 90;
        c.copy(hor).lerp(top, Math.max(0, Math.min(1, y * 1.6 + 0.1)));
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      attr.needsUpdate = true;
    };
  })();
  repaintSky(new THREE.Color('#9FCBFF'), new THREE.Color('#E8F2FF'));

  const hemi = new THREE.HemisphereLight('#EAF3FF', '#D6E2CC', 0.82); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#FFFFFF', 2.3); sun.castShadow = true;
  sun.shadow.camera.left = -14; sun.shadow.camera.right = 14; sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 60; sun.shadow.bias = -0.00035; sun.shadow.normalBias = 0.025;
  scene.add(sun); scene.add(sun.target);
  const fill = new THREE.DirectionalLight('#D9E8FF', 0.32); fill.position.set(-8, 7, -10); scene.add(fill);

  const target = new THREE.Vector3(0, 0, 0), goal = new THREE.Vector3();
  // The sun's offset from the camera target. daylight.js rewrites it so the shadow direction
  // travels east → west across the shift instead of being pinned to one afternoon angle.
  const sunOffset = new THREE.Vector3();
  const S = { renderer, scene, camera, sun, hemi, fill, target, dist: 20, goldenHour: 0 };
  S.setSunAngles = (elevationDeg, azimuthDeg, dist = 16) => {
    const el = elevationDeg * Math.PI / 180, az = azimuthDeg * Math.PI / 180, ch = Math.cos(el);
    sunOffset.set(Math.sin(az) * ch * dist, Math.sin(el) * dist, Math.cos(az) * ch * dist);
    sun.position.copy(target).add(sunOffset);
  };
  S.setSky = (top, hor) => repaintSky(top, hor);
  S.setSunAngles(40, 78);
  let shakeAmt = 0;
  S.shake = amount => { shakeAmt = Math.max(shakeAmt, amount); };

  function applyRenderScale(next) {
    next = Math.max(0.68, Math.min(1, next));
    if (Math.abs(next - renderScale) < 0.03) return;
    renderScale = next;
    renderer.setPixelRatio(basePixelRatio * renderScale);
    renderer.setSize(innerWidth, innerHeight, false);
    if (S.post) S.post.setSize(innerWidth, innerHeight, basePixelRatio * renderScale);
  }

  S.resize = () => {
    const w = innerWidth, h = innerHeight;
    basePixelRatio = Math.min(devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(basePixelRatio * renderScale); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const a = camera.aspect;
    // Portrait needs room for touch UI; landscape benefits from a closer, more premium read.
    const want = a <= 0.8 ? 10 : a >= 1.25 ? 16.25 : a <= 1 ? lerp(10, 13, (a - 0.8) / 0.2) : lerp(13, 16.25, (a - 1) / 0.25);
    // Width alone left a 16:9 screen seeing ~9 m of height — a rug and a counter, never the café.
    // Landscape also keeps at least 12.5 m of floor top-to-bottom so the room reads as a place.
    S.dist = Math.max(want / (2 * Math.tan(FOV * Math.PI / 360) * camera.aspect), 12.5 / (2 * Math.tan(FOV * Math.PI / 360)));
    const size = innerWidth < 700 ? 1024 : 2048;
    if (sun.shadow.mapSize.width !== size) { sun.shadow.mapSize.set(size, size); sun.shadow.map = null; sun.shadow.needsUpdate = true; }
    if (S.post) S.post.setSize(w, h, basePixelRatio * renderScale);
    // An opening shot in flight is re-solved for the new aspect: a phone rotated during the first
    // two seconds must still have the whole work row in frame, not the landscape solution cropped.
    if (estT > 0 && estPoints) fitFraming(estPoints);
    place();
  };

  // A short dolly-in and back — the "moment" a build or an unlock deserves. Not a takeover: the
  // camera keeps following the owner throughout, it just leans in for `hold` seconds and eases
  // back out. Any joystick input releases it early, so a player who is already walking on is never
  // held. Disabled entirely under prefers-reduced-motion.
  let punchZoom = 1, punchGoal = 1, punchT = 0;
  S.punch = (zoom = 0.84, hold = 1.1) => {
    try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (_) { /* no matchMedia */ }
    punchGoal = zoom; punchT = hold;
  };
  S.releasePunch = () => { punchT = 0; punchGoal = 1; };

  // ---- the opening frame (ship plan §1.6/§1.9) --------------------------------------------------
  // The publisher's rule for a Playable is that t = 0 already shows the fantasy working. It did not:
  // on a 380x670 phone the owner starts at (0, 2.5) and the camera frames 10 m across them, which put
  // the oven 9.7 m to screen-right of centre — off the frame entirely (measured NDC x 1.88), with the
  // opening guidance chevrons running off the right edge toward it.
  //
  // Widening portrait until the whole work row fits would have needed ~19 m across (the owner is not
  // between the register and the oven, they are behind both) and shrunk every character by half for
  // the rest of the game. So the opening is FRAMED instead: for the first couple of seconds the
  // camera holds a composed shot of the stations the café actually starts with, then glides to the
  // ordinary owner-follow framing. Pitch, yaw and FOV never change — only where the camera looks and
  // how far back it stands, which is the same pair `punch` already moves.
  //
  // Who asks for it: systems/visuals.js, at build time, with the stations that are active on a fresh
  // save. It never hard-codes a position — the other lane is moving stations — and it fits whatever
  // it is handed, so the shot stays correct when the blender moves or the kiosk goes.
  const fitCam = new THREE.PerspectiveCamera(FOV, 1, 2.5, 200);
  const fitV = new THREE.Vector3();
  let estPoints = null, estMargin = 0.12, estHold = 0, estGlide = 1.4, estT = 0;
  const estTarget = new THREE.Vector3();
  let estDist = 0, estFromX = 0, estFromZ = 0;

  // Solve for the camera target and distance that put every point inside the frame. Iterative rather
  // than analytic because the camera is pitched: a metre of ground moves a different number of pixels
  // along the screen's two axes, and the answer changes as the distance does.
  function fitFraming(points) {
    if (!points || !points.length) return false;
    const cp = Math.cos(PITCH), sp = Math.sin(PITCH), tanH = Math.tan(FOV * Math.PI / 360);
    let tx = 0, tz = 0;
    for (const p of points) { tx += p.x; tz += p.z; }
    tx /= points.length; tz /= points.length;
    let d = S.dist;
    fitCam.aspect = camera.aspect;
    // The camera's own ground axes: screen-right, and the direction the ground runs away up-screen.
    const rx = Math.cos(YAW), rz = -Math.sin(YAW);
    const fx = -Math.sin(YAW), fz = -Math.cos(YAW);
    for (let iter = 0; iter < 10; iter++) {
      fitCam.position.set(tx + Math.sin(YAW) * cp * d, sp * d, tz + Math.cos(YAW) * cp * d);
      fitCam.lookAt(tx, 0.4, tz);
      fitCam.updateMatrixWorld(true);
      fitCam.updateProjectionMatrix();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of points) {
        fitV.set(p.x, p.y || 0, p.z).project(fitCam);
        if (fitV.x < minX) minX = fitV.x; if (fitV.x > maxX) maxX = fitV.x;
        if (fitV.y < minY) minY = fitV.y; if (fitV.y > maxY) maxY = fitV.y;
      }
      const wHalf = d * tanH * fitCam.aspect, vHalf = d * tanH;
      const ox = (minX + maxX) / 2, oy = (minY + maxY) / 2;
      // Re-centre: an NDC offset is metres along screen-right, and metres along the ground-forward
      // axis divided by sin(pitch) — a pitched camera compresses ground distance up the screen.
      tx += ox * wHalf * rx + oy * (vHalf / sp) * fx;
      tz += ox * wHalf * rz + oy * (vHalf / sp) * fz;
      // Then re-fit: how far past the safe area the widest point still is.
      const need = Math.max(maxX - ox, ox - minX, maxY - oy, oy - minY) / (1 - estMargin);
      if (need > 0.001) d *= Math.max(0.55, Math.min(2.2, need));
      if (Math.abs(need - 1) < 0.01 && Math.abs(ox) < 0.01 && Math.abs(oy) < 0.01) break;
    }
    estTarget.set(tx, 0, tz);
    // Never closer than the ordinary framing: an opening shot may pull back to show the café, it may
    // not shove the camera into it.
    estDist = Math.max(S.dist, Math.min(S.dist * 2.6, d));
    return true;
  }

  /**
   * Hold a composed shot of `points` (world positions), then glide to the ordinary follow framing.
   * Called once, at boot. Cancelled by S.snap() (a restore is not an opening) and released early
   * once the player has actually walked away from where they started.
   */
  S.establish = (points, opts = {}) => {
    try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) estGlide = 2.2; } catch (_) { /* no matchMedia */ }
    estPoints = points && points.length ? points.map(p => ({ x: p.x, y: p.y || 0, z: p.z })) : null;
    estMargin = opts.margin != null ? opts.margin : 0.12;
    estHold = opts.hold != null ? opts.hold : 2.2;
    if (opts.glide != null) estGlide = opts.glide;
    if (!estPoints || !fitFraming(estPoints)) { estPoints = null; return false; }
    estT = estHold + estGlide;
    estFromX = target.x; estFromZ = target.z;
    place();
    return true;
  };
  S.releaseEstablish = () => { estT = 0; estPoints = null; };
  // 1 while the opening shot is held, easing to 0 across the glide. Smoothstep, so the camera leaves
  // and arrives at rest instead of starting with a jerk.
  function establishWeight() {
    if (estT <= 0) return 0;
    if (estT >= estGlide) return 1;
    const k = estT / estGlide;
    return k * k * (3 - 2 * k);
  }

  function place(dt = 0) {
    if (shakeAmt > 0) { shakeAmt *= Math.exp(-9 * dt); if (shakeAmt < 0.0005) shakeAmt = 0; }
    if (punchT > 0) { punchT -= dt; if (punchT <= 0) punchGoal = 1; }
    punchZoom = damp(punchZoom, punchGoal, punchGoal < 1 ? 5 : 3, dt);
    if (estT > 0) estT = Math.max(0, estT - dt);
    let dist = S.dist * punchZoom;
    // The opening shot is layered ON TOP of `target`, never written into it: `target` stays the
    // owner-follow point the rest of the frame reasons about, so when the weight reaches 0 the camera
    // is already exactly where a normal frame would have put it and there is nothing to catch up on.
    const est = establishWeight();
    const vx = est > 0 ? lerp(target.x, estTarget.x, est) : target.x;
    const vz = est > 0 ? lerp(target.z, estTarget.z, est) : target.z;
    if (est > 0) dist = lerp(dist, estDist, est);
    const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    camera.position.set(vx + Math.sin(YAW) * cp * dist, target.y + sp * dist, vz + Math.cos(YAW) * cp * dist);
    if (shakeAmt > 0) {
      const ang = Math.random() * Math.PI * 2;
      camera.position.x += Math.cos(ang) * shakeAmt;
      camera.position.y += Math.sin(ang * 1.3) * shakeAmt * 0.6;
      camera.position.z += Math.sin(ang) * shakeAmt;
    }
    camera.lookAt(vx, target.y + 0.4, vz);
    sun.position.copy(target).add(sunOffset); sun.target.position.copy(target);
  }

  // Portrait looks a little AHEAD of the owner (toward screen-up, where the counters and the kitchen
  // are) instead of centring them: centred, the bottom third of a phone was lawn outside the fence.
  const lead = () => (camera.aspect <= 0.8 ? 1.4 : 0);
  S.follow = (x, z, dt) => {
    const k = lead();
    goal.set(x - Math.sin(YAW) * k, 0, z - Math.cos(YAW) * k); target.x = damp(target.x, goal.x, 6, dt); target.z = damp(target.z, goal.z, 6, dt);
    // A player who starts walking has stopped looking at the opening shot. Measured from where the
    // camera was established rather than from an input event, so this needs nothing plumbed in from
    // the input layer and works for a tap-to-move as well as the stick.
    if (estT > estGlide && Math.hypot(goal.x - estFromX, goal.z - estFromZ) > 0.6) estT = estGlide;
    place(dt);
  };
  S.snap = (x, z) => { S.releaseEstablish(); const k = lead(); target.set(x - Math.sin(YAW) * k, 0, z - Math.cos(YAW) * k); place(); };

  // Metres of world covered by one CSS pixel of viewport height, at the camera target's depth.
  // S.dist is owned here (S.resize sets it) and FOV lives here too, so this is the only place that
  // can answer it. src/ui/labelLayout.js uses it to keep world labels in proportion: portrait fits
  // 10 m across where landscape fits 16.25 m, which puts the portrait camera ~24 m out against
  // ~12.6 m, so a label drawn at a fixed pixel size covers twice as much café.
  S.worldPerPixel = () => 2 * S.dist * Math.tan(FOV * Math.PI / 360) / Math.max(1, innerHeight);

  // The post chain tone-maps in its composite, so the renderer must not also do it on the way
  // into the render target — that would compress highlights twice and flatten every bloom.
  const post = createPostFX(renderer, scene, camera);
  S.post = post;

  let avgDt = 1 / 60, sampleFrames = 0, cooldownFrames = 0;
  S.noteFrame = dt => {
    avgDt += (dt - avgDt) * 0.035;
    if (cooldownFrames > 0) { cooldownFrames--; return; }
    if (++sampleFrames < 120) return;
    sampleFrames = 0;
    if (avgDt > 1 / 48) {
      // Shed resolution first (least visible), then bloom. Outlines and grade are the identity of
      // the look and stay on at every tier: a cheap-looking game is worse than a slightly soft one.
      if (renderScale > 0.7) { applyRenderScale(renderScale - 0.1); cooldownFrames = 180; }
      else if (post.bloomEnabled) { post.setBloom(false); cooldownFrames = 300; }
    } else if (avgDt < 1 / 58) {
      if (renderScale < 0.99) { applyRenderScale(renderScale + 0.05); cooldownFrames = 240; }
      else if (!post.bloomEnabled) { post.setBloom(true); cooldownFrames = 420; }
    }
  };

  S.render = () => post.render();
  S.setQuality = q => {
    renderer.shadowMap.enabled = q !== 'low';
    post.setBloom(q !== 'low');
    if (q === 'low') applyRenderScale(0.72); else if (q === 'high') applyRenderScale(1);
  };

  // Golden Hour is no longer its own palette — it would have overwritten whatever the clock said
  // and pinned the room to one orange. It now only records how strong the boost should be;
  // daylight.js layers it on top of the current keyframe on the next update.
  S.setGoldenHour = k => { S.goldenHour = Math.max(0, Math.min(1, Number(k) || 0)); };

  // Resize can fire while YouTube is host-paused (orientation/window chrome changes are common on
  // mobile). Do not mutate renderer/camera/shadow resources during that paused interval. Coalesce
  // any number of resize events into one resize using the latest viewport immediately after resume.
  let resizeQueued = false;
  const onResize = () => {
    if (!presentationScheduler.paused) { S.resize(); return; }
    if (resizeQueued) return;
    resizeQueued = true;
    presentationScheduler.whenResumed().then(() => {
      resizeQueued = false;
      S.resize();
    });
  };
  addEventListener('resize', onResize); S.resize();
  return S;
}
