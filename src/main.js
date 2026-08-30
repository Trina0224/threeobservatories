import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const KM_PER_RENDER_UNIT = 1_000_000;
const DAY = 86400;
const YEAR = 365.256363004 * DAY;
const EARTH_ORBIT_KM = 149_597_870.7;
const MOON_ORBIT_KM = 384_400;
const MOON_PERIOD = 27.321661 * DAY;
const EARTH_RADIUS_KM = 6371;
const HUBBLE_ALTITUDE_KM = 483;
const HUBBLE_RADIUS_KM = EARTH_RADIUS_KM + HUBBLE_ALTITUDE_KM;
const HUBBLE_PERIOD = 95 * 60;
const HUBBLE_INCLINATION = THREE.MathUtils.degToRad(28.5);
const L2_FROM_EARTH_KM = 1_500_000;
const WEBB_PERIOD = 168 * DAY;
const ROMAN_PERIOD = 180 * DAY; // educational placeholder only; not mission ephemeris
const BUILD = '20260830a';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x02040a, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x02040a, 0.0018);

const camera = new THREE.PerspectiveCamera(45, 1, 0.001, 1200);
camera.position.set(0, 105, 215);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0, 0, 0);
controls.minDistance = 0.03;
controls.maxDistance = 500;

scene.add(new THREE.AmbientLight(0x6f83a8, 1.25));
const sunLight = new THREE.PointLight(0xffffff, 5.5, 400, 1.4);
scene.add(sunLight);

function makeStars(count = 2200) {
  const positions = new Float32Array(count * 3);
  let seed = 0x30a2026;
  const rnd = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    const r = 250 + rnd() * 250;
    const z = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - z * z);
    positions[i * 3] = r * s * Math.cos(a);
    positions[i * 3 + 1] = r * z;
    positions[i * 3 + 2] = r * s * Math.sin(a);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xaab7d1, size: 0.34, sizeAttenuation: true, transparent: true, opacity: 0.72 });
  scene.add(new THREE.Points(geometry, material));
}
makeStars();

function sphere(radius, color, emissive = 0x000000) {
  const material = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: emissive ? 1.25 : 0, roughness: 0.72, metalness: 0.04 });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 28, 18), material);
}

const sun = sphere(1.6, 0xffb52e, 0xff8a14);
const earth = sphere(0.34, 0x3d86df);
const moon = sphere(0.105, 0xbfc5ce);
const l2Marker = sphere(0.075, 0x72d6ff, 0x245b7a);
scene.add(sun, earth, moon, l2Marker);
sunLight.position.copy(sun.position);

function line(color, opacity = 0.5) {
  return new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}
function lineLoop(color, opacity = 0.5) {
  return new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

const earthOrbit = lineLoop(0x345383, 0.35);
const moonOrbit = lineLoop(0x64718c, 0.26);
const hubbleOrbit = lineLoop(0xc9dbff, 0.52);
const webbOrbit = lineLoop(0xffa648, 0.64);
const romanOrbit = lineLoop(0xc47dff, 0.6);
scene.add(earthOrbit, moonOrbit, hubbleOrbit, webbOrbit, romanOrbit);

function circlePoints(radius, n = 256) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  return pts;
}
earthOrbit.geometry.setFromPoints(circlePoints(EARTH_ORBIT_KM / KM_PER_RENDER_UNIT));

function makeSpacecraft(name, url, color) {
  const group = new THREE.Group();
  const marker = sphere(0.035, color, color);
  group.add(marker);
  const material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, alphaTest: 0.03 });
  const sprite = new THREE.Sprite(material);
  sprite.center.set(0.5, 0.5);
  group.add(sprite);
  new THREE.TextureLoader().load(url, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    material.map = texture;
    material.needsUpdate = true;
  }, undefined, () => {
    console.warn(`${name} texture failed to load; marker remains visible.`);
  });
  scene.add(group);
  return { name, group, sprite, marker };
}

const spacecraft = {
  hubble: makeSpacecraft('Hubble', './public/assets/spacecraft/hubble.png', 0xe2ecff),
  webb: makeSpacecraft('Webb', './public/assets/spacecraft/jwst.png', 0xffa640),
  roman: makeSpacecraft('Roman', './public/assets/spacecraft/roman.png', 0xc77dff),
};

const labelLayer = document.getElementById('labels');
const labels = new Map();
function addLabel(key, text) {
  const el = document.createElement('div');
  el.className = 'world-label';
  el.textContent = text;
  labelLayer.appendChild(el);
  labels.set(key, el);
}
addLabel('sun', 'Sun');
addLabel('earth', 'Earth');
addLabel('moon', 'Moon');
addLabel('l2', 'Sun–Earth L2');
addLabel('hubble', 'Hubble');
addLabel('webb', 'Webb');
addLabel('roman', 'Roman');

const sim = {
  timeMs: Date.now(),
  playing: true,
  rate: 86400,
  scale: 'educational',
  view: 'solar',
  lastRealMs: performance.now(),
  lastTrackTarget: new THREE.Vector3(),
};

const tmp = {
  earthKm: new THREE.Vector3(), moonKm: new THREE.Vector3(), l2Km: new THREE.Vector3(),
  hubbleKm: new THREE.Vector3(), webbKm: new THREE.Vector3(), romanKm: new THREE.Vector3(),
  radial: new THREE.Vector3(), tangent: new THREE.Vector3(), z: new THREE.Vector3(0, 1, 0),
};

function earthStateKm(tSec) {
  const a = (tSec / YEAR) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(a) * EARTH_ORBIT_KM, 0, Math.sin(a) * EARTH_ORBIT_KM);
}

function earthBasis(earthKm) {
  const radial = earthKm.clone().normalize();
  const tangent = new THREE.Vector3(-radial.z, 0, radial.x).normalize();
  return { radial, tangent, normal: new THREE.Vector3(0, 1, 0) };
}

function moonStateKm(tSec, earthKm) {
  const a = (tSec / MOON_PERIOD) * Math.PI * 2;
  const rel = new THREE.Vector3(Math.cos(a) * MOON_ORBIT_KM, 0, Math.sin(a) * MOON_ORBIT_KM);
  rel.applyAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(5.145));
  return earthKm.clone().add(rel);
}

function hubbleStateKm(tSec, earthKm) {
  const a = (tSec / HUBBLE_PERIOD) * Math.PI * 2;
  const rel = new THREE.Vector3(Math.cos(a) * HUBBLE_RADIUS_KM, 0, Math.sin(a) * HUBBLE_RADIUS_KM);
  rel.applyAxisAngle(new THREE.Vector3(1, 0, 0), HUBBLE_INCLINATION);
  return earthKm.clone().add(rel);
}

function l2CenterKm(earthKm) {
  return earthKm.clone().add(earthKm.clone().normalize().multiplyScalar(L2_FROM_EARTH_KM));
}

function webbStateKm(tSec, earthKm) {
  const { radial, tangent, normal } = earthBasis(earthKm);
  const a = (tSec / WEBB_PERIOD) * Math.PI * 2;
  const center = l2CenterKm(earthKm);
  return center
    .add(radial.multiplyScalar(220_000 * Math.cos(a * 2)))
    .add(tangent.multiplyScalar(620_000 * Math.cos(a)))
    .add(normal.multiplyScalar(520_000 * Math.sin(a)));
}

function romanStateKm(tSec, earthKm) {
  const { radial, tangent, normal } = earthBasis(earthKm);
  const a = (tSec / ROMAN_PERIOD) * Math.PI * 2 + 1.25;
  const center = l2CenterKm(earthKm);
  return center
    .add(radial.multiplyScalar(170_000 * Math.sin(a * 2)))
    .add(tangent.multiplyScalar(500_000 * Math.cos(a)))
    .add(normal.multiplyScalar(400_000 * Math.sin(a)));
}

function renderEarthPosition(earthKm) {
  return earthKm.clone().multiplyScalar(1 / KM_PER_RENDER_UNIT);
}

function renderLocalPosition(bodyKm, earthKm, localScale) {
  const base = renderEarthPosition(earthKm);
  const rel = bodyKm.clone().sub(earthKm).multiplyScalar(localScale / KM_PER_RENDER_UNIT);
  return base.add(rel);
}

function renderPosition(bodyKm, earthKm, type) {
  if (sim.scale === 'true') return bodyKm.clone().multiplyScalar(1 / KM_PER_RENDER_UNIT);
  if (type === 'hubble') return renderLocalPosition(bodyKm, earthKm, 120);
  if (type === 'moon') return renderLocalPosition(bodyKm, earthKm, 2.6);
  return bodyKm.clone().multiplyScalar(1 / KM_PER_RENDER_UNIT);
}

function setOrbitGeometry(lineObj, points) {
  lineObj.geometry.dispose();
  lineObj.geometry = new THREE.BufferGeometry().setFromPoints(points);
}

function updateLocalOrbits(tSec, earthKm) {
  const earthR = renderEarthPosition(earthKm);
  const moonScale = sim.scale === 'educational' ? 2.6 : 1;
  const hubbleScale = sim.scale === 'educational' ? 120 : 1;
  const moonR = (MOON_ORBIT_KM / KM_PER_RENDER_UNIT) * moonScale;
  const hubbleR = (HUBBLE_RADIUS_KM / KM_PER_RENDER_UNIT) * hubbleScale;

  const moonPts = circlePoints(moonR, 128).map((p) => p.applyAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(5.145)).add(earthR));
  const hubblePts = circlePoints(hubbleR, 128).map((p) => p.applyAxisAngle(new THREE.Vector3(1, 0, 0), HUBBLE_INCLINATION).add(earthR));
  setOrbitGeometry(moonOrbit, moonPts);
  setOrbitGeometry(hubbleOrbit, hubblePts);

  const { radial, tangent, normal } = earthBasis(earthKm);
  const center = l2CenterKm(earthKm);
  const webbPts = [];
  const romanPts = [];
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    const w = center.clone()
      .add(radial.clone().multiplyScalar(220_000 * Math.cos(a * 2)))
      .add(tangent.clone().multiplyScalar(620_000 * Math.cos(a)))
      .add(normal.clone().multiplyScalar(520_000 * Math.sin(a)))
      .multiplyScalar(1 / KM_PER_RENDER_UNIT);
    const r = center.clone()
      .add(radial.clone().multiplyScalar(170_000 * Math.sin(a * 2)))
      .add(tangent.clone().multiplyScalar(500_000 * Math.cos(a)))
      .add(normal.clone().multiplyScalar(400_000 * Math.sin(a)))
      .multiplyScalar(1 / KM_PER_RENDER_UNIT);
    webbPts.push(w); romanPts.push(r);
  }
  setOrbitGeometry(webbOrbit, webbPts);
  setOrbitGeometry(romanOrbit, romanPts);
}

let orbitRefreshKey = '';
function refreshOrbitGeometry(tSec, earthKm) {
  const dayKey = `${Math.floor(tSec / DAY)}:${sim.scale}`;
  if (dayKey === orbitRefreshKey) return;
  orbitRefreshKey = dayKey;
  updateLocalOrbits(tSec, earthKm);
}

function updatePhysics() {
  const tSec = sim.timeMs / 1000;
  tmp.earthKm.copy(earthStateKm(tSec));
  tmp.moonKm.copy(moonStateKm(tSec, tmp.earthKm));
  tmp.l2Km.copy(l2CenterKm(tmp.earthKm));
  tmp.hubbleKm.copy(hubbleStateKm(tSec, tmp.earthKm));
  tmp.webbKm.copy(webbStateKm(tSec, tmp.earthKm));
  tmp.romanKm.copy(romanStateKm(tSec, tmp.earthKm));

  sun.position.set(0, 0, 0);
  earth.position.copy(renderEarthPosition(tmp.earthKm));
  moon.position.copy(renderPosition(tmp.moonKm, tmp.earthKm, 'moon'));
  l2Marker.position.copy(tmp.l2Km).multiplyScalar(1 / KM_PER_RENDER_UNIT);
  spacecraft.hubble.group.position.copy(renderPosition(tmp.hubbleKm, tmp.earthKm, 'hubble'));
  spacecraft.webb.group.position.copy(tmp.webbKm).multiplyScalar(1 / KM_PER_RENDER_UNIT);
  spacecraft.roman.group.position.copy(tmp.romanKm).multiplyScalar(1 / KM_PER_RENDER_UNIT);
  refreshOrbitGeometry(tSec, tmp.earthKm);
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const pixelWidth = Math.round(width * renderer.getPixelRatio());
  const pixelHeight = Math.round(height * renderer.getPixelRatio());
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function labelPosition(el, obj) {
  const p = obj.position.clone().project(camera);
  const rect = canvas.getBoundingClientRect();
  const visible = p.z > -1 && p.z < 1 && p.x > -1.15 && p.x < 1.15 && p.y > -1.15 && p.y < 1.15;
  el.style.display = visible ? 'block' : 'none';
  if (!visible) return;
  el.style.left = `${(p.x * 0.5 + 0.5) * rect.width}px`;
  el.style.top = `${(-p.y * 0.5 + 0.5) * rect.height}px`;
}

function updateLabels() {
  labelPosition(labels.get('sun'), sun);
  labelPosition(labels.get('earth'), earth);
  labelPosition(labels.get('moon'), moon);
  labelPosition(labels.get('l2'), l2Marker);
  labelPosition(labels.get('hubble'), spacecraft.hubble.group);
  labelPosition(labels.get('webb'), spacecraft.webb.group);
  labelPosition(labels.get('roman'), spacecraft.roman.group);
}

function updateSpriteScales() {
  for (const craft of Object.values(spacecraft)) {
    const distance = camera.position.distanceTo(craft.group.position);
    const size = THREE.MathUtils.clamp(distance * 0.045, 0.16, 3.2);
    craft.sprite.scale.set(size * 1.25, size, 1);
    craft.marker.scale.setScalar(THREE.MathUtils.clamp(size * 0.16, 0.45, 1.8));
  }
}

function viewTarget(name) {
  if (name === 'earth') return earth.position.clone();
  if (name === 'webb') return spacecraft.webb.group.position.clone();
  if (name === 'roman') return spacecraft.roman.group.position.clone();
  if (name === 'hubble') return spacecraft.hubble.group.position.clone();
  return new THREE.Vector3(0, 0, 0);
}

function activateView(name) {
  sim.view = name;
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  const target = viewTarget(name);
  controls.target.copy(target);
  if (name === 'solar') camera.position.copy(target).add(new THREE.Vector3(0, 105, 215));
  if (name === 'earth') camera.position.copy(target).add(new THREE.Vector3(0, 3.4, 7.2));
  if (name === 'webb' || name === 'roman') camera.position.copy(target).add(new THREE.Vector3(0.7, 1.4, 2.8));
  if (name === 'hubble') camera.position.copy(target).add(new THREE.Vector3(0.8, 1.5, 3.0));
  sim.lastTrackTarget.copy(target);
  controls.update();
}

function trackView() {
  if (sim.view === 'free' || sim.view === 'solar') return;
  const target = viewTarget(sim.view);
  const delta = target.clone().sub(sim.lastTrackTarget);
  camera.position.add(delta);
  controls.target.add(delta);
  sim.lastTrackTarget.copy(target);
}

document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => activateView(button.dataset.view)));

const playBtn = document.getElementById('playBtn');
const nowBtn = document.getElementById('nowBtn');
const rateSelect = document.getElementById('rateSelect');
const scaleSelect = document.getElementById('scaleSelect');
const utcReadout = document.getElementById('utcReadout');

playBtn.addEventListener('click', () => {
  sim.playing = !sim.playing;
  playBtn.textContent = sim.playing ? 'Pause' : 'Play';
});
nowBtn.addEventListener('click', () => {
  sim.timeMs = Date.now();
  sim.lastRealMs = performance.now();
});
rateSelect.addEventListener('change', () => { sim.rate = Number(rateSelect.value) || 1; });
scaleSelect.addEventListener('change', () => {
  sim.scale = scaleSelect.value;
  orbitRefreshKey = '';
  updatePhysics();
  if (sim.view === 'earth' || sim.view === 'hubble') activateView(sim.view);
});

function tick(now) {
  const dtReal = Math.min(0.2, Math.max(0, (now - sim.lastRealMs) / 1000));
  sim.lastRealMs = now;
  if (sim.playing) sim.timeMs += dtReal * sim.rate * 1000;
  updatePhysics();
  trackView();
  resize();
  updateSpriteScales();
  controls.update();
  renderer.render(scene, camera);
  updateLabels();
  utcReadout.textContent = `${new Date(sim.timeMs).toISOString().replace('.000Z', 'Z')}  ·  ${BUILD}`;
  requestAnimationFrame(tick);
}

updatePhysics();
activateView('solar');
requestAnimationFrame(tick);
