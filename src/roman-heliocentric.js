import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ROMAN_TRANSFER_SECONDS } from './data/roman-mission.js';

const DAY = 86400;
const YEAR = 365.256363004 * DAY;
const AU = 22;
const L2_OFFSET = AU * (1_500_000 / 149_597_870.7);
const LAUNCH_EXPANDED_END = 2 * 3600;
const $ = (id) => document.getElementById(id);

const canvas = $('romanHelioScene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x02040a, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.005, 400);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.minDistance = 0.5;
controls.maxDistance = 180;

scene.add(new THREE.HemisphereLight(0x8198b6, 0x05070b, 0.66));
const sunLight = new THREE.PointLight(0xffedc9, 45, 150, 1.4);
scene.add(sunLight);

function stars(count = 1800) {
  const a = new Float32Array(count * 3);
  let s = 8302026;
  const rnd = () => ((s = (1664525 * s + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    const r = 75 + rnd() * 120, z = rnd() * 2 - 1, p = rnd() * Math.PI * 2, q = Math.sqrt(1 - z * z);
    a[i * 3] = r * q * Math.cos(p); a[i * 3 + 1] = r * z; a[i * 3 + 2] = r * q * Math.sin(p);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xb2bfd1, size: 0.055, transparent: true, opacity: 0.65 })));
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
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}
function tube(points, color, radius, opacity, closed = false) {
  return new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, closed, 'centripetal'), Math.max(160, points.length * 2), radius, 6, closed),
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
cg.addColorStop(0, 'rgba(255,205,105,.24)'); cg.addColorStop(.42, 'rgba(255,156,50,.09)'); cg.addColorStop(1, 'rgba(255,120,30,0)');
cc.fillStyle = cg; cc.fillRect(0, 0, 256, 256);
const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(coronaCanvas), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
corona.scale.set(4.8, 4.8, 1); sun.add(corona);

const earthOrbit = circle(AU, 0x355675, 0.36);
const l2Orbit = circle(AU + L2_OFFSET, 0x5b7185, 0.20);
scene.add(earthOrbit, l2Orbit);

const ecliptic = new THREE.GridHelper(64, 32, 0x4a627b, 0x27394b);
ecliptic.material.transparent = true;
ecliptic.material.opacity = 0.075;
scene.add(ecliptic);

const earth = sphere(0.19, 0x2d79b6);
earth.rotation.z = THREE.MathUtils.degToRad(23.44);
scene.add(earth);
const earthGlow = new THREE.Mesh(
  new THREE.SphereGeometry(0.205, 32, 20),
  new THREE.MeshBasicMaterial({ color: 0x75c8ff, transparent: true, opacity: 0.10, side: THREE.BackSide }),
);
earth.add(earthGlow);

const l2Marker = new THREE.Group();
const lm = new THREE.LineBasicMaterial({ color: 0x8da9be, transparent: true, opacity: 0.48 });
l2Marker.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-0.16, 0, 0), new THREE.Vector3(0.16, 0, 0),
  new THREE.Vector3(0, -0.16, 0), new THREE.Vector3(0, 0.16, 0),
  new THREE.Vector3(0, 0, -0.16), new THREE.Vector3(0, 0, 0.16),
]), lm));
scene.add(l2Marker);

const roman = new THREE.Group();
const romanMat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, alphaTest: 0.03 });
const romanSprite = new THREE.Sprite(romanMat); romanSprite.scale.setScalar(0.46); roman.add(romanSprite);
const glow = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffc96f, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
glow.scale.setScalar(0.68); roman.add(glow);
scene.add(roman);
new THREE.TextureLoader().load('./public/assets/spacecraft/roman.png', (t) => { t.colorSpace = THREE.SRGBColorSpace; romanMat.map = t; romanMat.needsUpdate = true; });

function sliderToTime(v) {
  const x = Number(v) / 1000;
  if (x <= 0.30) return (x / 0.30) * LAUNCH_EXPANDED_END;
  const q = (x - 0.30) / 0.70;
  return LAUNCH_EXPANDED_END + Math.pow(q, 1.24) * (ROMAN_TRANSFER_SECONDS - LAUNCH_EXPANDED_END);
}

function localTransfer(t) {
  if (t <= 1860) return new THREE.Vector3(0.002, 0, 0);
  const u = THREE.MathUtils.clamp((t - 1860) / (ROMAN_TRANSFER_SECONDS - 1860), 0, 1);
  const ease = 1 - Math.pow(1 - u, 2.1);
  const radialKm = 80_000 + 1_420_000 * ease;
  const verticalKm = 320_000 * Math.sin(Math.PI * u) * (1 - 0.30 * u);
  const tangentialKm = 180_000 * Math.sin(Math.PI * u) * Math.sin(Math.PI * (0.25 + 0.85 * u));
  return new THREE.Vector3(radialKm, verticalKm, tangentialKm);
}

function helioBasis(t) {
  const theta = (t / YEAR) * Math.PI * 2;
  const radial = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
  const tangent = new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta));
  return { theta, radial, tangent, up: new THREE.Vector3(0, 1, 0), earth: radial.clone().multiplyScalar(AU) };
}

function helioRoman(t) {
  const b = helioBasis(t);
  const local = localTransfer(t);
  const scale = AU / 149_597_870.7;
  return b.earth.clone()
    .add(b.radial.clone().multiplyScalar(local.x * scale))
    .add(b.up.clone().multiplyScalar(local.y * scale * 3.2))
    .add(b.tangent.clone().multiplyScalar(local.z * scale * 3.2));
}

const pathPts = Array.from({ length: 420 }, (_, i) => helioRoman(1860 + i / 419 * (ROMAN_TRANSFER_SECONDS - 1860)));
const path = tube(pathPts, 0xa482ff, 0.065, 0.88, false);
scene.add(path);

const haloWavePts = [];
for (let i = 0; i < 320; i++) {
  const t = ROMAN_TRANSFER_SECONDS + (i / 319) * 180 * DAY;
  const b = helioBasis(t);
  const a = i / 319 * Math.PI * 2.1;
  const centre = b.radial.clone().multiplyScalar(AU + L2_OFFSET);
  centre.add(b.up.clone().multiplyScalar(0.58 * Math.sin(a)));
  centre.add(b.tangent.clone().multiplyScalar(0.48 * Math.cos(a)));
  centre.add(b.radial.clone().multiplyScalar(0.18 * Math.sin(2 * a)));
  haloWavePts.push(centre);
}
const haloWave = tube(haloWavePts, 0xc194ff, 0.05, 0.52, false);
scene.add(haloWave);

const state = { active: false, view: 'helio', anchor: null };
const HELIO_VIEWS = new Set(['helio', 'helioTop', 'helioSide', 'earthFollow', 'romanOrbitFollow', 'helioFree']);

function isHelioView(name) { return HELIO_VIEWS.has(name); }
function currentElapsed() { return sliderToTime($('romanTimeline').value); }

function setHelioView(name) {
  if (!isHelioView(name)) {
    state.active = false;
    document.body.classList.remove('roman-helio-active');
    return;
  }
  state.active = true; state.view = name; state.anchor = null;
  document.body.classList.add('roman-helio-active');
  controls.enabled = name === 'helioFree';
  const t = currentElapsed();
  const b = helioBasis(t); const rp = helioRoman(t);
  if (name === 'helio') { camera.position.set(0, 31, 37); controls.target.set(0, 0, 0); }
  else if (name === 'helioTop') { camera.position.set(0, 54, 0.01); controls.target.set(0, 0, 0); }
  else if (name === 'helioSide') { camera.position.set(0, 2.5, 54); controls.target.set(0, 0, 0); }
  else if (name === 'earthFollow') {
    const target = b.earth.clone().add(b.radial.clone().multiplyScalar(0.45));
    camera.position.copy(target).add(b.tangent.clone().multiplyScalar(-7.5)).add(b.up.clone().multiplyScalar(4.5)).add(b.radial.clone().multiplyScalar(-2.2));
    controls.target.copy(target); state.anchor = b.earth.clone();
  } else if (name === 'romanOrbitFollow') {
    camera.position.copy(rp).add(b.tangent.clone().multiplyScalar(-3.4)).add(b.up.clone().multiplyScalar(2.0)).add(b.radial.clone().multiplyScalar(-1.4));
    controls.target.copy(rp); state.anchor = rp.clone();
  } else if (name === 'helioFree') { camera.position.set(30, 15, 30); controls.target.set(0, 0, 0); }
  controls.update();
}

function updateObjects() {
  const t = currentElapsed();
  const b = helioBasis(t);
  const rp = helioRoman(t);
  earth.position.copy(b.earth);
  l2Marker.position.copy(b.radial).multiplyScalar(AU + L2_OFFSET);
  roman.position.copy(rp);
  roman.visible = t >= 1860;
  const launchFraction = THREE.MathUtils.clamp(t / (2 * 3600), 0, 1);
  romanSprite.scale.setScalar(0.36 + 0.12 * launchFraction);
  glow.scale.setScalar(romanSprite.scale.x * 1.6);
  glow.material.opacity = 0.22 + 0.045 * Math.sin(performance.now() * 0.0015);

  if (state.view === 'earthFollow' && state.anchor) {
    const d = b.earth.clone().sub(state.anchor); camera.position.add(d); controls.target.add(d); state.anchor.copy(b.earth);
  }
  if (state.view === 'romanOrbitFollow' && state.anchor) {
    const d = rp.clone().sub(state.anchor); camera.position.add(d); controls.target.add(d); state.anchor.copy(rp);
  }
}

function resize() {
  const w = innerWidth, h = innerHeight, pr = renderer.getPixelRatio();
  if (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(h * pr)) renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}

function tick() {
  if (state.active && document.body.classList.contains('roman-active')) {
    resize(); updateObjects(); controls.update(); sun.rotation.y += 0.0012; renderer.render(scene, camera);
  }
  requestAnimationFrame(tick);
}

document.querySelectorAll('[data-roman-view]').forEach((b) => b.addEventListener('click', () => setHelioView(b.dataset.romanView)));
$('modeObservatories').addEventListener('click', () => { state.active = false; document.body.classList.remove('roman-helio-active'); });
$('modeRoman').addEventListener('click', () => {
  if (isHelioView(document.querySelector('[data-roman-view].active')?.dataset.romanView || '')) setHelioView(document.querySelector('[data-roman-view].active').dataset.romanView);
});
requestAnimationFrame(tick);
