import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ROMAN_TRANSFER_SECONDS } from './data/roman-mission.js';
import { createL2Marker } from './render/l2-marker.js';
import { romanClock } from './missions/roman-clock.js';
import { romanTransferRotKm } from './missions/roman-transfer.js';
import { romanHalo } from './missions/roman-halo.js';

const DAY = 86400;
const YEAR = 365.256363004 * DAY;
const AU = 22;
const KM_PER_AU_RENDER = 149_597_870.7 / AU;
const L2_OFFSET = 1_500_000 / KM_PER_AU_RENDER;
// EDUCATIONAL_SCALE: at 1 AU = 22 render units the whole Earth-L2 system is
// smaller than the drawn Earth, so out-of-plane motion is exaggerated to read.
const OUT_OF_PLANE_EXAGGERATION = 3.2;
const $ = (id) => document.getElementById(id);

const canvas = $('romanHelioScene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x02040a, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.002, 400);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.minDistance = 0.05;
controls.maxDistance = 180;

scene.add(new THREE.HemisphereLight(0x8198b6, 0x05070b, 0.64));
const sunLight = new THREE.PointLight(0xffedc9, 45, 150, 1.4);
scene.add(sunLight);

function stars(count = 1800) {
  const a = new Float32Array(count * 3);
  let s = 8302026;
  const rnd = () => ((s = (1664525 * s + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    const r = 75 + rnd() * 120;
    const z = rnd() * 2 - 1;
    const p = rnd() * Math.PI * 2;
    const q = Math.sqrt(1 - z * z);
    a[i * 3] = r * q * Math.cos(p);
    a[i * 3 + 1] = r * z;
    a[i * 3 + 2] = r * q * Math.sin(p);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xb2bfd1, size: 0.055, transparent: true, opacity: 0.64 })));
}
stars();

function sphere(r, color, emissive = 0x000000) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(r, 42, 26),
    new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: emissive ? 1.4 : 0, roughness: 0.82 }),
  );
}

function circle(r, color, opacity, n = 360) {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = i / n * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
  });
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
}

function line(points, color, opacity = 0.8) {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
}

function tube(points, color, radius, opacity, closed = false) {
  return new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, closed, 'centripetal'), Math.max(120, points.length * 2), radius, 6, closed),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
}

const sun = sphere(1.2, 0xffb43c, 0xff7d15);
scene.add(sun);
sunLight.position.copy(sun.position);
const coronaCanvas = document.createElement('canvas');
coronaCanvas.width = coronaCanvas.height = 256;
const cc = coronaCanvas.getContext('2d');
const cg = cc.createRadialGradient(128, 128, 38, 128, 128, 126);
cg.addColorStop(0, 'rgba(255,205,105,.24)');
cg.addColorStop(.42, 'rgba(255,156,50,.09)');
cg.addColorStop(1, 'rgba(255,120,30,0)');
cc.fillStyle = cg; cc.fillRect(0, 0, 256, 256);
const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(coronaCanvas), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
corona.scale.set(4.8, 4.8, 1);
sun.add(corona);

// Reference geometry stays deliberately quiet. Roman's path is the only bold trajectory.
const earthOrbit = circle(AU, 0x49677f, 0.24);
const l2GuideOrbit = circle(AU + L2_OFFSET, 0x62798c, 0.10);
scene.add(earthOrbit, l2GuideOrbit);

const ecliptic = new THREE.GridHelper(64, 32, 0x425970, 0x243545);
ecliptic.material.transparent = true;
ecliptic.material.opacity = 0.055;
scene.add(ecliptic);

const earth = sphere(0.17, 0x2d79b6);
earth.rotation.z = THREE.MathUtils.degToRad(23.44);
scene.add(earth);
const earthGlow = new THREE.Mesh(
  new THREE.SphereGeometry(0.185, 32, 20),
  new THREE.MeshBasicMaterial({ color: 0x75c8ff, transparent: true, opacity: 0.10, side: THREE.BackSide }),
);
earth.add(earthGlow);

const l2 = createL2Marker({ armLength: 0.05, ringRadius: 0.08 });
const l2Marker = l2.group;
scene.add(l2Marker);

const roman = new THREE.Group();
const romanMat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, alphaTest: 0.03 });
const romanSprite = new THREE.Sprite(romanMat);
romanSprite.scale.setScalar(0.42);
roman.add(romanSprite);
scene.add(roman);
new THREE.TextureLoader().load('./public/assets/spacecraft/roman.png', (t) => {
  t.colorSpace = THREE.SRGBColorSpace;
  romanMat.map = t;
  romanMat.needsUpdate = true;
});

// The integrated CR3BP transfer, in the ROT axes this scene already uses:
// x anti-sunward, y ecliptic north, z completing the right-handed set.
function localTransferKm(t) {
  const p = romanTransferRotKm(t);
  return new THREE.Vector3(p.x, p.y, p.z);
}

function helioBasis(t) {
  // Mission elapsed time starts at launch. Over ~90 days Earth advances ~89
  // degrees. The angle runs negative for the same reason as the observatory
  // scene: with +Y drawn as ecliptic north, a scene that turns the other way
  // would mirror the trajectory. See docs/COORDINATES.md.
  const theta = -(t / YEAR) * Math.PI * 2;
  const radial = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
  const tangent = new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta));
  return { theta, radial, tangent, up: new THREE.Vector3(0, 1, 0), earth: radial.clone().multiplyScalar(AU) };
}

function localToHelio(localKm, t) {
  const b = helioBasis(t);
  return b.earth.clone()
    .add(b.radial.clone().multiplyScalar(localKm.x / KM_PER_AU_RENDER))
    // EDUCATIONAL_SCALE: out-of-plane motion is a few hundred thousand km against
    // a 150 million km orbit radius, so it is exaggerated to stay visible here.
    .add(b.up.clone().multiplyScalar((localKm.y / KM_PER_AU_RENDER) * OUT_OF_PLANE_EXAGGERATION))
    .add(b.tangent.clone().multiplyScalar((localKm.z / KM_PER_AU_RENDER) * OUT_OF_PLANE_EXAGGERATION));
}

function helioRoman(t) {
  return localToHelio(localTransferKm(t), t);
}

// Roman mission trajectory: launch -> L+90 days only. No fake one-year continuation.
const pathTimes = Array.from({ length: 320 }, (_, i) => 1860 + i / 319 * (ROMAN_TRANSFER_SECONDS - 1860));
const pathPts = pathTimes.map((t) => helioRoman(t));
const missionPath = tube(pathPts, 0xa986ff, 0.052, 0.88, false);
scene.add(missionPath);

// The final 12 days are also available as a quiet line for the dedicated L2 close-up.
const approachTimes = Array.from({ length: 120 }, (_, i) => ROMAN_TRANSFER_SECONDS - 12 * DAY + i / 119 * 12 * DAY);
const approachLine = line(approachTimes.map((t) => helioRoman(t)), 0xc0a6ff, 0.86);
scene.add(approachLine);
approachLine.visible = false;

// The computed periodic halo, placed at the arrival epoch's L2 and mapped
// through the same local-to-heliocentric transform as the transfer.
const haloPts = romanHalo.samples.map(
  (p) => localToHelio(new THREE.Vector3(p.x, p.y, p.z), ROMAN_TRANSFER_SECONDS),
);
const haloLoop = tube(haloPts, 0xc6a7ff, 0.018, 0.68, true);
scene.add(haloLoop);
haloLoop.visible = false;

const state = { active: false, view: 'helio', anchor: null };
const HELIO_VIEWS = new Set([
  'helio', 'helioTop', 'helioSide', 'earthFollow', 'romanOrbitFollow', 'helioFree',
  'helioL2', 'helioL2Side',
]);

function isHelioView(name) { return HELIO_VIEWS.has(name); }
// Mission time comes from the shared clock, not from re-reading the slider:
// the slider quantises the cruise to about two hours per step.
function currentElapsed() { return romanClock.elapsed; }
function isL2View() { return state.view === 'helioL2' || state.view === 'helioL2Side'; }

function setHelioView(name) {
  if (!isHelioView(name)) {
    state.active = false;
    document.body.classList.remove('roman-helio-active');
    return;
  }

  state.active = true;
  state.view = name;
  state.anchor = null;
  document.body.classList.add('roman-helio-active');
  controls.enabled = name === 'helioFree';

  const t = currentElapsed();
  const b = helioBasis(t);
  const rp = helioRoman(t);
  const currentL2 = b.radial.clone().multiplyScalar(AU + L2_OFFSET);

  if (name === 'helio') {
    camera.position.set(0, 31, 37);
    controls.target.set(0, 0, 0);
  } else if (name === 'helioTop') {
    camera.position.set(0, 54, 0.01);
    controls.target.set(0, 0, 0);
  } else if (name === 'helioSide') {
    camera.position.set(0, 2.5, 54);
    controls.target.set(0, 0, 0);
  } else if (name === 'earthFollow') {
    const target = b.earth.clone().add(b.radial.clone().multiplyScalar(0.18));
    camera.position.copy(target)
      .add(b.tangent.clone().multiplyScalar(-2.2))
      .add(b.up.clone().multiplyScalar(1.4))
      .add(b.radial.clone().multiplyScalar(-0.75));
    controls.target.copy(target);
    state.anchor = b.earth.clone();
  } else if (name === 'romanOrbitFollow') {
    camera.position.copy(rp)
      .add(b.tangent.clone().multiplyScalar(-1.2))
      .add(b.up.clone().multiplyScalar(0.75))
      .add(b.radial.clone().multiplyScalar(-0.55));
    controls.target.copy(rp);
    state.anchor = rp.clone();
  } else if (name === 'helioL2') {
    camera.position.copy(currentL2)
      .add(b.tangent.clone().multiplyScalar(-0.62))
      .add(b.up.clone().multiplyScalar(0.44))
      .add(b.radial.clone().multiplyScalar(0.30));
    controls.target.copy(currentL2);
  } else if (name === 'helioL2Side') {
    camera.position.copy(currentL2)
      .add(b.radial.clone().multiplyScalar(0.74))
      .add(b.up.clone().multiplyScalar(0.08));
    controls.target.copy(currentL2);
  } else if (name === 'helioFree') {
    camera.position.set(30, 15, 30);
    controls.target.set(0, 0, 0);
  }
  controls.update();
}

function updateObjects() {
  const t = currentElapsed();
  const b = helioBasis(t);
  const rp = helioRoman(t);
  const currentL2 = b.radial.clone().multiplyScalar(AU + L2_OFFSET);

  earth.position.copy(b.earth);
  l2Marker.position.copy(currentL2);
  roman.position.copy(rp);
  roman.visible = t >= 1860;

  const l2View = isL2View();
  sun.visible = !l2View;
  earthOrbit.visible = !l2View;
  l2GuideOrbit.visible = !l2View;
  ecliptic.visible = !l2View;
  missionPath.visible = !l2View;
  approachLine.visible = l2View;
  haloLoop.visible = l2View;

  // Minimum visual sizes in close-up; positions remain in the heliocentric frame.
  earth.scale.setScalar(l2View ? 0.42 : 1);
  // 2.2 was tuned for the old bare cross; the labelled marker needs far less
  // emphasis to read, and swamped Roman in the close-up at that size.
  l2Marker.scale.setScalar(l2View ? 1.15 : 1);
  romanSprite.scale.setScalar(l2View ? 0.20 : 0.42);

  if (state.view === 'earthFollow' && state.anchor) {
    const d = b.earth.clone().sub(state.anchor);
    camera.position.add(d);
    controls.target.add(d);
    state.anchor.copy(b.earth);
  }
  if (state.view === 'romanOrbitFollow' && state.anchor) {
    const d = rp.clone().sub(state.anchor);
    camera.position.add(d);
    controls.target.add(d);
    state.anchor.copy(rp);
  }

  // L2 close-up follows the moving Earth-L2 system without resetting user orientation.
  if (l2View) {
    const oldTarget = controls.target.clone();
    const d = currentL2.clone().sub(oldTarget);
    // Only translate the camera if time changed enough to move the L2 target.
    if (d.lengthSq() > 1e-10) {
      camera.position.add(d);
      controls.target.copy(currentL2);
    }
  }
}

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  const pr = renderer.getPixelRatio();
  if (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(h * pr)) renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function tick() {
  if (state.active && document.body.classList.contains('roman-active')) {
    resize();
    updateObjects();
    controls.update();
    // Keeps the L2 label a constant size on screen at any zoom.
    l2.update(camera);
    if (sun.visible) sun.rotation.y += 0.0012;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(tick);
}

document.querySelectorAll('[data-roman-view]').forEach((b) => b.addEventListener('click', () => setHelioView(b.dataset.romanView)));
$('modeObservatories').addEventListener('click', () => {
  state.active = false;
  document.body.classList.remove('roman-helio-active');
});
$('modeRoman').addEventListener('click', () => {
  const activeView = document.querySelector('[data-roman-view].active')?.dataset.romanView || '';
  if (isHelioView(activeView)) setHelioView(activeView);
});
requestAnimationFrame(tick);
