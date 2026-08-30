import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  ROMAN_EVENTS,
  ROMAN_LAUNCH_UTC,
  ROMAN_TRANSFER_SECONDS,
  eventAtOrBefore,
} from './data/roman-mission.js';

const DAY = 86400;
const L2_UNITS = 15;
const EARTH_DISPLAY_RADIUS = 0.58;
const LAUNCH_EXPANDED_END = 2 * 3600;
const $ = (id) => document.getElementById(id);

const canvas = $('romanScene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x02040a, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.005, 300);
const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;
orbit.dampingFactor = 0.065;
orbit.minDistance = 0.5;
orbit.maxDistance = 120;

scene.add(new THREE.HemisphereLight(0x7f9fc7, 0x06070c, 0.82));
const solarLight = new THREE.DirectionalLight(0xffedc8, 4.6);
solarLight.position.set(-30, 5, 2);
scene.add(solarLight);

function stars(count = 1600) {
  const positions = new Float32Array(count * 3);
  let seed = 260830;
  const rnd = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    const r = 60 + rnd() * 90;
    const z = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const q = Math.sqrt(1 - z * z);
    positions[i * 3] = r * q * Math.cos(a);
    positions[i * 3 + 1] = r * z;
    positions[i * 3 + 2] = r * q * Math.sin(a);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xb7c3d5, size: 0.055, transparent: true, opacity: 0.66 })));
}
stars();

function sphere(radius, color, roughness = 0.85) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 42, 26),
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 }),
  );
}

const earth = sphere(EARTH_DISPLAY_RADIUS, 0x246a9e, 0.82);
earth.rotation.z = THREE.MathUtils.degToRad(23.44);
scene.add(earth);
const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_DISPLAY_RADIUS * 1.035, 42, 26),
  new THREE.MeshBasicMaterial({ color: 0x77c8ff, transparent: true, opacity: 0.12, side: THREE.BackSide, blending: THREE.AdditiveBlending }),
);
earth.add(atmosphere);
const moon = sphere(0.14, 0xa5a5a0, 0.95);
scene.add(moon);

const l2 = new THREE.Group();
const l2Material = new THREE.LineBasicMaterial({ color: 0x83a6c3, transparent: true, opacity: 0.44 });
l2.add(new THREE.LineSegments(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.2, 0, 0), new THREE.Vector3(0.2, 0, 0),
    new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0, 0.2, 0),
    new THREE.Vector3(0, 0, -0.2), new THREE.Vector3(0, 0, 0.2),
  ]), l2Material,
));
l2.position.x = L2_UNITS;
scene.add(l2);

function tube(points, color, radius = 0.045, opacity = 0.72, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, Math.max(100, points.length * 2), radius, 6, closed),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
}

function transferPoint(t) {
  if (t <= 1860) {
    const u = Math.max(0, t / 1860);
    const r = 0.7 + 1.1 * Math.pow(u, 1.25);
    const a = -0.9 + u * 1.55;
    return new THREE.Vector3(Math.cos(a) * r, 0.38 * Math.sin(u * Math.PI), Math.sin(a) * r * 0.62);
  }
  const u = THREE.MathUtils.clamp((t - 1860) / (ROMAN_TRANSFER_SECONDS - 1860), 0, 1);
  const ease = 1 - Math.pow(1 - u, 2.1);
  const x = 0.8 + 14.2 * ease;
  const y = 3.2 * Math.sin(Math.PI * u) * (1 - 0.30 * u);
  const z = 1.8 * Math.sin(Math.PI * u) * Math.sin(Math.PI * (0.25 + 0.85 * u));
  if (u < 0.84) return new THREE.Vector3(x, y, z);
  const q = (u - 0.84) / 0.16;
  const haloA = q * Math.PI * 1.55 - 0.55;
  const halo = new THREE.Vector3(
    L2_UNITS + 0.75 * Math.sin(2 * haloA),
    2.35 * Math.cos(haloA),
    1.75 * Math.sin(haloA),
  );
  const base = new THREE.Vector3(x, y, z);
  const blend = q * q * (3 - 2 * q);
  return base.lerp(halo, blend);
}

const transferPts = Array.from({ length: 280 }, (_, i) => transferPoint(1860 + (i / 279) * (ROMAN_TRANSFER_SECONDS - 1860)));
const transferTube = tube(transferPts, 0x9d7cff, 0.055, 0.82, false);
scene.add(transferTube);

const haloPts = Array.from({ length: 220 }, (_, i) => {
  const a = (i / 220) * Math.PI * 2;
  return new THREE.Vector3(L2_UNITS + 0.75 * Math.sin(2 * a), 2.35 * Math.cos(a), 1.75 * Math.sin(a));
});
const haloTube = tube(haloPts, 0xb892ff, 0.043, 0.42, true);
scene.add(haloTube);

const ecliptic = new THREE.GridHelper(38, 38, 0x4d6680, 0x273849);
ecliptic.material.transparent = true;
ecliptic.material.opacity = 0.08;
scene.add(ecliptic);

function cylinder(radius, height, color) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 14),
    new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.18 }),
  );
  m.rotation.z = -Math.PI / 2;
  return m;
}

const rocket = new THREE.Group();
const core = cylinder(0.085, 0.78, 0xd6d9dc);
const booster1 = cylinder(0.075, 0.72, 0xdfe2e5);
const booster2 = cylinder(0.075, 0.72, 0xdfe2e5);
booster1.position.y = 0.13;
booster2.position.y = -0.13;
rocket.add(core, booster1, booster2);
const fairing = new THREE.Mesh(
  new THREE.ConeGeometry(0.11, 0.27, 18),
  new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.62 }),
);
fairing.rotation.z = -Math.PI / 2;
fairing.position.x = 0.52;
rocket.add(fairing);
scene.add(rocket);

const upperStage = new THREE.Group();
upperStage.add(cylinder(0.075, 0.48, 0xe7e9e9));
upperStage.visible = false;
scene.add(upperStage);

const roman = new THREE.Group();
const romanMat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, alphaTest: 0.03 });
const romanSprite = new THREE.Sprite(romanMat);
romanSprite.scale.setScalar(0.72);
roman.add(romanSprite);
const glowCanvas = document.createElement('canvas');
glowCanvas.width = glowCanvas.height = 256;
const gc = glowCanvas.getContext('2d');
const gg = gc.createRadialGradient(128, 128, 52, 128, 128, 126);
gg.addColorStop(0, 'rgba(255,214,125,0)');
gg.addColorStop(0.55, 'rgba(255,214,125,0)');
gg.addColorStop(0.72, 'rgba(255,199,95,.68)');
gg.addColorStop(1, 'rgba(255,160,55,0)');
gc.fillStyle = gg; gc.fillRect(0, 0, 256, 256);
const glowTex = new THREE.CanvasTexture(glowCanvas);
const romanGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending }));
romanGlow.scale.setScalar(1.45);
roman.add(romanGlow);
roman.visible = false;
scene.add(roman);
new THREE.TextureLoader().load('./public/assets/spacecraft/roman.png', (texture) => {
  texture.colorSpace = THREE.SRGBColorSpace;
  romanMat.map = texture;
  romanMat.needsUpdate = true;
});

// Schematic six-panel Solar Array Sun Shield. It becomes visible across NASA's
// post-separation deployment window; geometry is illustrative, chronology is sourced.
const sunshield = new THREE.Group();
for (let i = 0; i < 6; i++) {
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.018, 0.31),
    new THREE.MeshBasicMaterial({ color: 0x314f79, transparent: true, opacity: 0.86 }),
  );
  panel.position.z = (i - 2.5) * 0.13;
  sunshield.add(panel);
}
sunshield.position.x = -0.18;
roman.add(sunshield);
sunshield.scale.setScalar(0.01);

const state = {
  active: false,
  elapsed: 0,
  playing: true,
  rate: 600,
  last: performance.now(),
  view: 'launch',
};

function sliderToTime(v) {
  const x = Number(v) / 1000;
  if (x <= 0.30) return (x / 0.30) * LAUNCH_EXPANDED_END;
  const q = (x - 0.30) / 0.70;
  return LAUNCH_EXPANDED_END + Math.pow(q, 1.24) * (ROMAN_TRANSFER_SECONDS - LAUNCH_EXPANDED_END);
}

function timeToSlider(t) {
  if (t <= LAUNCH_EXPANDED_END) return Math.round((t / LAUNCH_EXPANDED_END) * 300);
  const q = (t - LAUNCH_EXPANDED_END) / (ROMAN_TRANSFER_SECONDS - LAUNCH_EXPANDED_END);
  return Math.round((0.30 + Math.pow(THREE.MathUtils.clamp(q, 0, 1), 1 / 1.24) * 0.70) * 1000);
}

function formatMET(t) {
  const s = Math.max(0, Math.round(t));
  const d = Math.floor(s / DAY);
  const h = Math.floor((s % DAY) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d) return `L+${d}d ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return `T+${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function formatRate(rate) {
  if (rate < 120) return `${Math.round(rate)}×`;
  if (rate < 3600) return `${(rate / 60).toFixed(rate < 600 ? 1 : 0)} min/s`;
  if (rate < DAY) return `${(rate / 3600).toFixed(1)} h/s`;
  return `${(rate / DAY).toFixed(rate < 4 * DAY ? 1 : 0)} d/s`;
}

function phaseFor(t) {
  if (t < 75) return 'LIFTOFF / ASCENT';
  if (t < 150) return 'MAX Q / ASCENT';
  if (t < 231) return 'BOOSTER SEPARATION';
  if (t < 420) return 'UPPER STAGE / SES-1';
  if (t < 1680) return 'COAST / COMMUNICATIONS';
  if (t < 1860) return 'FINAL UPPER-STAGE BURN';
  if (t < 3660) return 'SPACECRAFT SEPARATION / DEPLOYMENT';
  if (t < 30 * DAY) return 'COMMISSIONING CRUISE';
  if (t < 60 * DAY) return 'DEEP-SPACE TRANSFER';
  if (t < 82 * DAY) return 'L2 APPROACH';
  return 'HALO-ORBIT ACQUISITION';
}

function approxEarthDistanceKm(t) {
  if (t < 1860) return 200 + 34000 * Math.pow(t / 1860, 1.45);
  const p = transferPoint(t);
  return Math.max(34000, p.length() * 100000);
}

function setView(name) {
  state.view = name;
  document.querySelectorAll('[data-roman-view]').forEach((b) => b.classList.toggle('active', b.dataset.romanView === name));
  orbit.enabled = name === 'free';
  if (name === 'launch') {
    camera.position.set(4.6, 2.8, 6.2); orbit.target.set(0, 0, 0);
  } else if (name === 'gsetop') {
    camera.position.set(7.5, 19.5, 0.01); orbit.target.set(7.5, 0, 0);
  } else if (name === 'gseside') {
    camera.position.set(7.5, 1.8, 20); orbit.target.set(7.5, 0, 0);
  } else if (name === 'sunface') {
    camera.position.set(24, 1.0, 0.01); orbit.target.set(7.5, 0, 0);
  } else if (name === 'follow') {
    const p = transferPoint(state.elapsed);
    camera.position.copy(p).add(new THREE.Vector3(2.7, 1.7, 3.5)); orbit.target.copy(p);
  } else if (name === 'free') {
    camera.position.set(18, 8, 16); orbit.target.set(7.5, 0, 0);
  }
  orbit.update();
}

function updateMissionObjects(dt) {
  const t = state.elapsed;
  const p = transferPoint(t);
  const early = t < 1860;
  rocket.visible = t < 240;
  upperStage.visible = t >= 231 && t < 1860;
  roman.visible = t >= 1860;

  if (t < 240) {
    rocket.position.copy(p);
    const boostersAttached = t < 150;
    booster1.visible = boostersAttached;
    booster2.visible = boostersAttached;
    fairing.visible = t < 250;
  }
  if (upperStage.visible) upperStage.position.copy(p);
  if (roman.visible) roman.position.copy(p);

  const deploy = THREE.MathUtils.clamp((t - 1860) / (1800), 0, 1);
  const deployEase = deploy * deploy * (3 - 2 * deploy);
  sunshield.scale.setScalar(0.05 + deployEase * 0.95);
  romanGlow.material.opacity = 0.36 + 0.06 * Math.sin(performance.now() * 0.0015);

  const moonA = (t / (27.321661 * DAY)) * Math.PI * 2 + 0.8;
  moon.position.set(Math.cos(moonA) * 3.84, 0.12 * Math.sin(moonA), Math.sin(moonA) * 3.84);

  // Stage choreography is schematic: actual event timing, illustrative separation motion.
  if (t >= 150 && t < 240) {
    const q = (t - 150) / 90;
    booster1.visible = true; booster2.visible = true;
    booster1.position.y = 0.13 + q * 0.8;
    booster2.position.y = -0.13 - q * 0.8;
  } else {
    booster1.position.y = 0.13;
    booster2.position.y = -0.13;
  }

  transferTube.visible = !early || state.view !== 'launch';
  haloTube.visible = t > 30 * DAY || state.view !== 'launch';
  l2.visible = state.view !== 'launch';
  ecliptic.visible = state.view !== 'launch';
  moon.visible = state.view === 'launch' || state.view === 'gsetop';

  if (state.view === 'follow') {
    const desired = p.clone().add(new THREE.Vector3(2.7, 1.7, 3.5));
    camera.position.lerp(desired, 0.06);
    orbit.target.lerp(p, 0.09);
  }

  earth.rotation.y += dt * 0.07;
}

function updateReadouts() {
  const t = state.elapsed;
  const evt = eventAtOrBefore(t);
  const earthKm = approxEarthDistanceKm(t);
  const l2Km = Math.abs(1_500_000 - earthKm);
  $('romanMet').textContent = formatMET(t);
  $('romanUtc').textContent = new Date(ROMAN_LAUNCH_UTC + t * 1000).toISOString().replace('T', ' ').replace('.000Z', 'Z');
  $('romanPhase').textContent = phaseFor(t);
  $('romanEarthDistance').textContent = `${Math.round(earthKm).toLocaleString()} km`;
  $('romanL2Distance').textContent = `${Math.round(l2Km).toLocaleString()} km`;
  $('romanEventName').textContent = evt.label;
  $('romanEventDate').textContent = evt.date;
  $('romanEventDetail').textContent = evt.detail;
  $('romanEventStatus').textContent = evt.status === 'actual' ? 'ACTUAL' : evt.status === 'nasa-window' ? 'NASA WINDOW' : 'PROJECTED';
  $('romanEventStatus').className = `roman-status ${evt.status}`;
  $('romanTimeline').value = String(timeToSlider(t));
}

function resize() {
  const w = innerWidth, h = innerHeight;
  const pr = renderer.getPixelRatio();
  if (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(h * pr)) renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function tick(now) {
  const dt = Math.min(0.1, (now - state.last) / 1000);
  state.last = now;
  if (state.active && state.playing) {
    state.elapsed = Math.min(ROMAN_TRANSFER_SECONDS, state.elapsed + dt * state.rate);
    if (state.elapsed >= ROMAN_TRANSFER_SECONDS) state.playing = false;
  }
  if (state.active) {
    resize();
    updateMissionObjects(dt);
    orbit.update();
    renderer.render(scene, camera);
    updateReadouts();
  }
  requestAnimationFrame(tick);
}

function buildEvents() {
  const host = $('romanEvents');
  host.innerHTML = '';
  for (const event of ROMAN_EVENTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `roman-event ${event.status}`;
    b.innerHTML = `<span>${event.label}</span><small>${event.date}</small>`;
    b.addEventListener('click', () => {
      state.elapsed = event.t;
      state.playing = false;
      $('romanPlay').textContent = 'Play';
      if (event.t < LAUNCH_EXPANDED_END) setView('launch');
      else if (event.t < 30 * DAY) setView('gsetop');
      else setView('follow');
      updateReadouts();
    });
    host.appendChild(b);
  }
}

function activateRoman() {
  state.active = true;
  document.body.classList.add('roman-active');
  $('modeRoman').classList.add('active');
  $('modeObservatories').classList.remove('active');
  state.last = performance.now();
  resize();
  setView(state.elapsed < LAUNCH_EXPANDED_END ? 'launch' : 'gsetop');
  updateReadouts();
}

function activateObservatories() {
  state.active = false;
  document.body.classList.remove('roman-active');
  $('modeRoman').classList.remove('active');
  $('modeObservatories').classList.add('active');
}

$('modeRoman').addEventListener('click', activateRoman);
$('modeObservatories').addEventListener('click', activateObservatories);
$('romanPlay').addEventListener('click', () => {
  state.playing = !state.playing;
  $('romanPlay').textContent = state.playing ? 'Pause' : 'Play';
});
$('romanLaunchDay').addEventListener('click', () => {
  state.elapsed = 0;
  state.playing = false;
  $('romanPlay').textContent = 'Play';
  setView('launch');
});
$('romanNow').addEventListener('click', () => {
  state.elapsed = THREE.MathUtils.clamp((Date.now() - ROMAN_LAUNCH_UTC) / 1000, 0, ROMAN_TRANSFER_SECONDS);
  state.playing = false;
  $('romanPlay').textContent = 'Play';
  setView(state.elapsed < LAUNCH_EXPANDED_END ? 'launch' : 'gsetop');
});
$('romanTimeline').addEventListener('input', (e) => {
  state.elapsed = sliderToTime(e.target.value);
  state.playing = false;
  $('romanPlay').textContent = 'Play';
  updateReadouts();
});
$('romanRate').addEventListener('input', (e) => {
  const x = Number(e.target.value) / 1000;
  state.rate = 10 ** (x * Math.log10(7 * DAY));
  $('romanRateReadout').textContent = formatRate(state.rate);
});
document.querySelectorAll('[data-roman-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.romanView)));

buildEvents();
$('romanRate').value = '433';
$('romanRate').dispatchEvent(new Event('input'));
state.elapsed = THREE.MathUtils.clamp((Date.now() - ROMAN_LAUNCH_UTC) / 1000, 0, ROMAN_TRANSFER_SECONDS);
setView(state.elapsed < LAUNCH_EXPANDED_END ? 'launch' : 'gsetop');
updateReadouts();
requestAnimationFrame(tick);
