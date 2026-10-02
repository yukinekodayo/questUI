import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Panel } from './panel.js';
import { panelDefs } from './panels.js';
import { createMockSource } from './source.js';
import { HandInput } from './hands.js';
import { C } from './theme.js';

const msg = document.getElementById('msg');
const enterBtn = document.getElementById('enter');

// ---- data + panels -------------------------------------------------------
const source = createMockSource();
const actions = { ...source.actions, recenter: () => place() };
const panels = panelDefs.map(d => new Panel(d));
const byId = Object.fromEntries(panels.map(p => [p.id, p]));
source.subscribe(() => panels.forEach(p => p.invalidate()));

// ---- three.js ------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.xr.enabled = true;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02060c);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.02, 50);
camera.position.set(0, 1.6, 0.35);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.6, -0.5); controls.enablePan = controls.enableZoom = false; controls.update();
panels.forEach(p => scene.add(p.mesh));

// Arc-reactor style decoration on the home panel
const reactor = new THREE.Group();
const add = (geo, color, opacity = 0.9) => {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  reactor.add(m); return m;
};
const ringA = add(new THREE.RingGeometry(0.095, 0.1, 64), C.cyan);
const ringB = add(new THREE.RingGeometry(0.075, 0.083, 48, 1, 0, Math.PI * 1.5), C.cyan, 0.8);
const ringC = add(new THREE.RingGeometry(0.052, 0.055, 48, 1, 0.4, Math.PI * 1.2), '#ffffff', 0.7);
const core = add(new THREE.CircleGeometry(0.03, 3), '#bff6ff', 0.9);
add(new THREE.CircleGeometry(0.018, 32), '#ffffff', 0.9);
reactor.position.copy(byId.home.pxToLocal(790, 300)).setZ(0.004);
byId.home.mesh.add(reactor);

// ---- head pose + layout --------------------------------------------------
const head = { pos: new THREE.Vector3(0, 1.6, 0.35), fwd: new THREE.Vector3(0, 0, -1) };
const ARC = { watch: [-72, 0.0, 0.8], phone: [-36, 0.0, 0.75], home: [0, 0.07, 0.8], messages: [38, 0.0, 0.75], incoming: [0, -0.2, 0.55] };

function place() {
  const fwd = head.fwd.clone().setY(0).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
  for (const [id, [deg, dy, R]] of Object.entries(ARC)) {
    const a = THREE.MathUtils.degToRad(deg), m = byId[id].mesh;
    m.position.copy(head.pos).addScaledVector(fwd, Math.cos(a) * R).addScaledVector(right, Math.sin(a) * R);
    m.position.y = head.pos.y - 0.05 + dy;
    m.lookAt(head.pos.x, m.position.y, head.pos.z);
  }
}
place();

// ---- feedback ------------------------------------------------------------
let audio;
function tick() {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 1400; g.gain.setValueAtTime(0.08, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.07);
    o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.08);
  } catch { /* audio is optional */ }
}
const press = (p, btn) => { tick(); p.press(btn); };

const hands = new HandInput(renderer, scene, () => panels, head, press);

// ---- desktop fallback (mouse) for development ----------------------------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pick(e) {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(panels.filter(p => p.mesh.visible).map(p => p.mesh))[0];
  if (!hit) return null;
  const p = hit.object.userData.panel, u = hit.uv.x * p.cw, v = (1 - hit.uv.y) * p.ch;
  return { p, btn: p.buttonAt(u, v) };
}
let down;
renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
  const h = pick(e); if (h?.btn) press(h.p, h.btn);
});
renderer.domElement.addEventListener('pointermove', e => {
  if (renderer.xr.isPresenting) return;
  const h = pick(e);
  panels.forEach(p => p.setHover(h && h.p === p && h.btn ? h.btn.id : null));
  renderer.domElement.style.cursor = h?.btn ? 'pointer' : '';
});
addEventListener('keydown', e => { if (e.key === 'c') actions.simulateCall(); if (e.key === 'm') actions.simulateMessage(); });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
});

// ---- XR session ----------------------------------------------------------
let framesInXR = 0;
renderer.xr.addEventListener('sessionend', () => { enterBtn.style.display = ''; scene.background = new THREE.Color(0x02060c); });
enterBtn.addEventListener('click', async () => {
  if (!navigator.xr) { msg.textContent = 'WebXR非対応です。デスクトップではマウスで操作できます（C:着信, M:メッセージ）。'; return; }
  const ar = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
  try {
    const session = await navigator.xr.requestSession(ar ? 'immersive-ar' : 'immersive-vr',
      { optionalFeatures: ['hand-tracking', 'local-floor'] });
    scene.background = ar ? null : new THREE.Color(0x02060c);
    await renderer.xr.setSession(session);
    framesInXR = 0; enterBtn.style.display = 'none';
  } catch (err) { msg.textContent = 'XRセッション開始に失敗: ' + err.message; }
});
navigator.xr?.isSessionSupported('immersive-vr').then(ok => {
  msg.textContent = ok ? 'Quest: ハンドトラッキングをONにして ENTER HUD → 指で押す／ヘッダーをつまんで移動' : 'デスクトップ: ドラッグで視点回転、クリックで操作（C:着信 / M:メッセージ）';
});

// ---- loop ----------------------------------------------------------------
const clock = new THREE.Clock();
renderer.setAnimationLoop((_, frame) => {
  const t = clock.getElapsedTime();
  if (frame) {
    const pose = frame.getViewerPose(renderer.xr.getReferenceSpace());
    if (pose) {
      const { position: p, orientation: o } = pose.transform;
      head.pos.set(p.x, p.y, p.z);
      head.fwd.set(0, 0, -1).applyQuaternion(new THREE.Quaternion(o.x, o.y, o.z, o.w));
      if (++framesInXR === 20) place();   // lay out around where the user is actually looking
    }
  } else {
    head.pos.copy(camera.position); camera.getWorldDirection(head.fwd);
    controls.update();
  }
  ringA.rotation.z = t * 0.3; ringB.rotation.z = -t * 0.9; ringC.rotation.z = t * 1.6; core.rotation.z = -t * 0.5;

  const inc = byId.incoming, want = !!source.state.phone.incoming;
  if (want !== inc.mesh.visible) { inc.mesh.visible = want; inc.mesh.scale.setScalar(0.6); }
  inc.mesh.scale.lerp(new THREE.Vector3(1, 1, 1), 0.2);

  hands.update();
  panels.forEach(p => p.render(source.state, actions));
  renderer.render(scene, camera);
});
byId.incoming.mesh.visible = false;
