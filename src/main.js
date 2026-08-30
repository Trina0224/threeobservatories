import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DAY = 86400;
const YEAR = 365.256363004 * DAY;
const MOON_PERIOD = 27.321661 * DAY;
const HUBBLE_PERIOD = 95 * 60;
const WEBB_PERIOD = 168 * DAY;
const ROMAN_PERIOD = 180 * DAY; // educational renderer placeholder only
const EARTH_ORBIT_KM = 149_597_870.7;
const EARTH_RADIUS_KM = 6371;
const HUBBLE_RADIUS_KM = EARTH_RADIUS_KM + 483;
const MOON_ORBIT_KM = 384_400;
const L2_KM = 1_500_000;
const KM_PER_LOCAL_UNIT = 100_000;
const AU_RENDER = 22;
const TRUE_HELIO_LOCAL_SCALE = (AU_RENDER / EARTH_ORBIT_KM) * KM_PER_LOCAL_UNIT;
const READABLE_HELIO_LOCAL_SCALE = 0.055;
const HUBBLE_INC = THREE.MathUtils.degToRad(28.5);
const MOON_INC = THREE.MathUtils.degToRad(5.145);
const MAX_RATE = 30 * DAY;
const LOG_RATE_MAX = Math.log10(MAX_RATE);

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x03050a, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.001, 800);
camera.position.set(3, 7, 31);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.target.set(7, 0, 0);
controls.minDistance = 0.06;
controls.maxDistance = 180;

scene.add(new THREE.HemisphereLight(0x8ca6c9, 0x080a10, 1.1));
const sunLight = new THREE.DirectionalLight(0xfff1d0, 4.0);
sunLight.position.set(-20, 4, 1);
scene.add(sunLight);

function makeStars(count = 2200) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  let seed = 20260830;
  const rnd = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    const r = 100 + rnd() * 180;
    const z = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const q = Math.sqrt(1 - z * z);
    positions[i * 3] = r * q * Math.cos(a);
    positions[i * 3 + 1] = r * z;
    positions[i * 3 + 2] = r * q * Math.sin(a);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0xaebed4, size: 0.075, transparent: true, opacity: 0.68,
  })));
}
makeStars();

function sphere(radius, color, roughness = 0.72, emissive = 0x000000) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 40, 24),
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.03, emissive, emissiveIntensity: emissive ? 1.2 : 0 }),
  );
}

// Everything tied to Earth lives in one local frame whose +X direction is anti-sunward.
// In the Earth–L2 view the group is fixed. In heliocentric view this SAME state is
// translated and rotated around the Sun; no second trajectory is integrated.
const earthSystem = new THREE.Group();
scene.add(earthSystem);

const earth = sphere(0.72, 0x2e6ca8, 0.78);
const moon = sphere(0.18, 0x9ca4ae, 0.90);
earthSystem.add(earth, moon);

const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(0.745, 40, 24),
  new THREE.MeshBasicMaterial({ color: 0x6fb6e8, transparent: true, opacity: 0.10, side: THREE.BackSide }),
);
earth.add(atmosphere);

const equator = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(Array.from({ length: 160 }, (_, i) => {
    const a = (i / 160) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * 0.755, 0, Math.sin(a) * 0.755);
  })),
  new THREE.LineBasicMaterial({ color: 0x6e8aa6, transparent: true, opacity: 0.13 }),
);
earth.add(equator);

function orbitLine(color, opacity = 0.35) {
  return new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}
const moonTrail = orbitLine(0x718096, 0.16);
const hubbleTrail = orbitLine(0xdcecff, 0.48);
const webbTrail = orbitLine(0xefb45d, 0.48);
const romanTrail = orbitLine(0xb88cff, 0.42);
earthSystem.add(moonTrail, hubbleTrail, webbTrail, romanTrail);

// L2 is a reference marker, not a body.
const l2 = new THREE.Group();
const l2Mat = new THREE.LineBasicMaterial({ color: 0x86a6bd, transparent: true, opacity: 0.36 });
const l2Cross = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-0.18, 0, 0), new THREE.Vector3(0.18, 0, 0),
  new THREE.Vector3(0, -0.18, 0), new THREE.Vector3(0, 0.18, 0),
  new THREE.Vector3(0, 0, -0.18), new THREE.Vector3(0, 0, 0.18),
]);
l2.add(new THREE.LineSegments(l2Cross, l2Mat));
const ringPts = Array.from({ length: 80 }, (_, i) => {
  const a = (i / 80) * Math.PI * 2;
  return new THREE.Vector3(0, Math.cos(a) * 0.30, Math.sin(a) * 0.30);
});
l2.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPts), l2Mat));
l2.position.x = L2_KM / KM_PER_LOCAL_UNIT;
earthSystem.add(l2);

function spacecraft(url, fallbackColor, scale) {
  const group = new THREE.Group();
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 10), new THREE.MeshBasicMaterial({ color: fallbackColor }));
  group.add(marker);
  const material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, alphaTest: 0.04 });
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(scale);
  group.add(sprite);
  new THREE.TextureLoader().load(url, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    material.map = texture;
    material.needsUpdate = true;
    marker.visible = false;
  });
  earthSystem.add(group);
  return { group, sprite, marker, baseScale: scale };
}

const craft = {
  hubble: spacecraft('./public/assets/spacecraft/hubble.png', 0xdcecff, 0.95),
  webb: spacecraft('./public/assets/spacecraft/jwst.png', 0xefb45d, 1.25),
  roman: spacecraft('./public/assets/spacecraft/roman.png', 0xb88cff, 1.15),
};

// Heliocentric reference objects.
const sun = sphere(1.15, 0xffbf47, 0.82, 0xff8f1f);
scene.add(sun);
const earthOrbit = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(Array.from({ length: 360 }, (_, i) => {
    const a = (i / 360) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * AU_RENDER, 0, Math.sin(a) * AU_RENDER);
  })),
  new THREE.LineBasicMaterial({ color: 0x38516f, transparent: true, opacity: 0.30 }),
);
scene.add(earthOrbit);
sun.visible = false;
earthOrbit.visible = false;

function loopPts(rx, ry, rz, phase = 0, n = 220) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + phase;
    pts.push(new THREE.Vector3(L2_KM / KM_PER_LOCAL_UNIT + rx * Math.sin(2 * a), ry * Math.cos(a), rz * Math.sin(a)));
  }
  return pts;
}
webbTrail.geometry.setFromPoints(loopPts(1.9, 5.5, 4.2));
romanTrail.geometry.setFromPoints(loopPts(1.45, 4.6, 3.4, 1.15));

function localCircle(radius, inc, n = 180) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const p = new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    p.applyAxisAngle(new THREE.Vector3(1, 0, 0), inc);
    pts.push(p);
  }
  return pts;
}

const sim = {
  timeMs: Date.now(),
  playing: true,
  rate: 600,
  view: 'system',
  frame: 'rotating',
  readable: true,
  last: performance.now(),
  focus: null,
};

function refreshLocalGeometry() {
  const moonR = (MOON_ORBIT_KM / KM_PER_LOCAL_UNIT) * (sim.readable ? 1.45 : 1);
  const hubblePhysical = HUBBLE_RADIUS_KM / KM_PER_LOCAL_UNIT;
  const hubbleR = sim.readable ? 1.05 : hubblePhysical;
  moonTrail.geometry.dispose();
  moonTrail.geometry = new THREE.BufferGeometry().setFromPoints(localCircle(moonR, MOON_INC));
  hubbleTrail.geometry.dispose();
  hubbleTrail.geometry = new THREE.BufferGeometry().setFromPoints(localCircle(hubbleR, HUBBLE_INC));
}
refreshLocalGeometry();

function updateLocalState() {
  const t = sim.timeMs / 1000;
  const moonA = (t / MOON_PERIOD) * Math.PI * 2;
  const moonR = (MOON_ORBIT_KM / KM_PER_LOCAL_UNIT) * (sim.readable ? 1.45 : 1);
  moon.position.set(Math.cos(moonA) * moonR, 0, Math.sin(moonA) * moonR)
    .applyAxisAngle(new THREE.Vector3(1, 0, 0), MOON_INC);

  const hubbleA = (t / HUBBLE_PERIOD) * Math.PI * 2;
  const hubbleR = sim.readable ? 1.05 : HUBBLE_RADIUS_KM / KM_PER_LOCAL_UNIT;
  craft.hubble.group.position.set(Math.cos(hubbleA) * hubbleR, 0, Math.sin(hubbleA) * hubbleR)
    .applyAxisAngle(new THREE.Vector3(1, 0, 0), HUBBLE_INC);

  const webbA = (t / WEBB_PERIOD) * Math.PI * 2;
  craft.webb.group.position.set(
    L2_KM / KM_PER_LOCAL_UNIT + 1.9 * Math.sin(2 * webbA),
    5.5 * Math.cos(webbA),
    4.2 * Math.sin(webbA),
  );

  const romanA = (t / ROMAN_PERIOD) * Math.PI * 2 + 1.15;
  craft.roman.group.position.set(
    L2_KM / KM_PER_LOCAL_UNIT + 1.45 * Math.sin(2 * romanA),
    4.6 * Math.cos(romanA),
    3.4 * Math.sin(romanA),
  );
}

function applyReferenceFrame() {
  const helio = sim.frame === 'heliocentric';
  sun.visible = helio;
  earthOrbit.visible = helio;
  $('sunDirection').hidden = helio;

  if (helio) {
    const t = sim.timeMs / 1000;
    const theta = (t / YEAR) * Math.PI * 2;
    earthSystem.position.set(Math.cos(theta) * AU_RENDER, 0, Math.sin(theta) * AU_RENDER);
    earthSystem.rotation.set(0, -theta, 0);
    const localScale = sim.readable ? READABLE_HELIO_LOCAL_SCALE : TRUE_HELIO_LOCAL_SCALE;
    earthSystem.scale.setScalar(localScale);

    // Minimum visual sizes only. Positions remain in the shared frame above.
    earth.scale.setScalar(0.14 / (0.72 * localScale));
    craft.webb.sprite.scale.setScalar(0.30 / localScale);
    craft.roman.sprite.scale.setScalar(0.28 / localScale);
    craft.hubble.group.visible = false;
    hubbleTrail.visible = false;
    moon.visible = false;
    moonTrail.visible = false;
    l2.scale.setScalar(0.22 / localScale);
  } else {
    earthSystem.position.set(0, 0, 0);
    earthSystem.rotation.set(0, 0, 0);
    earthSystem.scale.setScalar(1);
    earth.scale.setScalar(1);
    craft.webb.sprite.scale.setScalar(craft.webb.baseScale);
    craft.roman.sprite.scale.setScalar(craft.roman.baseScale);
    craft.hubble.sprite.scale.setScalar(craft.hubble.baseScale);
    craft.hubble.group.visible = true;
    l2.scale.setScalar(1);

    const localVisible = sim.view === 'earth' || sim.view === 'system' || sim.focus === 'hubble';
    moon.visible = localVisible;
    moonTrail.visible = localVisible && $('trailToggle').checked;
    hubbleTrail.visible = localVisible && $('trailToggle').checked;
  }

  webbTrail.visible = $('trailToggle').checked;
  romanTrail.visible = $('trailToggle').checked;
}

const VIEWS = {
  system: {
    frame: 'rotating', pos: [2.8, 7.2, 31], target: [7.2, 0, 0],
    title: 'Earth–L2 rotating frame',
    blurb: 'Earth and the Sun–Earth L2 direction remain fixed while the observatories move around them.',
    readout: 'EARTH–L2 ROTATING',
  },
  earth: {
    frame: 'rotating', pos: [3.4, 2.4, 5.7], target: [0, 0, 0],
    title: 'Earth / Hubble',
    blurb: 'A close Earth-centred view for Hubble. Readable scale enlarges the few-hundred-kilometre orbital separation.',
    readout: 'EARTH-CENTRED · ROTATING DISPLAY',
  },
  l2: {
    frame: 'rotating', pos: [24, 10, 19], target: [15, 0, 0],
    title: 'Sun–Earth L2 close-up',
    blurb: 'A rotating-frame close-up of the large three-dimensional Webb and Roman paths around the L2 region.',
    readout: 'EARTH–L2 ROTATING · CLOSE-UP',
  },
  helio: {
    frame: 'heliocentric', pos: [0, 29, 35], target: [0, 0, 0],
    title: 'Heliocentric view',
    blurb: 'The Sun is fixed while Earth carries the L2 region, Webb and Roman around its annual orbit.',
    readout: 'HELIOCENTRIC INERTIAL DISPLAY',
  },
  free: {
    frame: 'rotating', pos: null, target: null,
    title: 'Free camera',
    blurb: 'Inspect the Earth–L2 rotating geometry directly. Drag to orbit; pinch or scroll to zoom.',
    readout: 'EARTH–L2 ROTATING · FREE CAMERA',
  },
};

function setView(name, focus = null) {
  const v = VIEWS[name];
  sim.view = name;
  sim.frame = v.frame;
  sim.focus = focus;
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  $('viewTitle').textContent = v.title;
  $('viewBlurb').textContent = v.blurb;
  $('frameReadout').textContent = v.readout;
  if (v.pos) {
    camera.position.set(...v.pos);
    controls.target.set(...v.target);
    controls.update();
  }
  applyReferenceFrame();
}

function focusCraft(name) {
  const info = {
    hubble: ['Hubble Space Telescope', 'PROPAGATED', 'LEO · ~483 km altitude · 28.5° inclination · ~95 min period. Current phase remains illustrative until TLE/SGP4 is connected.'],
    webb: ['James Webb Space Telescope', 'EDUCATIONAL', 'Sun–Earth L2 region. The displayed loop is a renderer placeholder until authoritative JWST ephemeris replaces it.'],
    roman: ['Nancy Grace Roman Space Telescope', 'EDUCATIONAL', 'Sun–Earth L2 region. The displayed loop remains a placeholder while official Roman trajectory products are integrated.'],
  }[name];
  $('focusName').textContent = info[0];
  $('focusMode').textContent = info[1];
  $('focusInfo').textContent = info[2];
  $('focusCard').hidden = false;
  if (name === 'hubble') setView('earth', name);
  else setView('l2', name);
}

function followTarget() {
  if (!sim.focus || sim.frame === 'heliocentric') return;
  const p = craft[sim.focus].group.position;
  const dist = sim.focus === 'hubble' ? 2.8 : 7.5;
  const desired = p.clone().add(new THREE.Vector3(dist * 0.55, dist * 0.38, dist));
  camera.position.lerp(desired, 0.055);
  controls.target.lerp(p, 0.085);
}

function sliderToRate(value) {
  return 10 ** ((Number(value) / 1000) * LOG_RATE_MAX);
}

function rateToSlider(rate) {
  return Math.round((Math.log10(Math.max(1, rate)) / LOG_RATE_MAX) * 1000);
}

function formatRate(rate) {
  if (rate < 120) return rate < 10 ? `${rate.toFixed(1)}×` : `${Math.round(rate)}×`;
  if (rate < 3600) return `${(rate / 60).toFixed(rate < 600 ? 1 : 0)} min/s`;
  if (rate < DAY) return `${(rate / 3600).toFixed(rate < 18000 ? 1 : 0)} h/s`;
  return `${(rate / DAY).toFixed(rate < 5 * DAY ? 1 : 0)} d/s`;
}

function setRateFromSlider() {
  sim.rate = sliderToRate($('rateSlider').value);
  $('rateReadout').textContent = formatRate(sim.rate);
}

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  const pr = renderer.getPixelRatio();
  if (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(h * pr)) renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function tick(now) {
  const dt = Math.min(0.1, (now - sim.last) / 1000);
  sim.last = now;
  if (sim.playing) sim.timeMs += dt * sim.rate * 1000;

  resize();
  updateLocalState();
  applyReferenceFrame();
  followTarget();
  controls.update();
  earth.rotation.y += dt * 0.018;
  renderer.render(scene, camera);
  $('utcReadout').textContent = new Date(sim.timeMs).toISOString().replace('T', ' ').replace('.000Z', 'Z');
  requestAnimationFrame(tick);
}

$('playBtn').addEventListener('click', () => {
  sim.playing = !sim.playing;
  $('playBtn').textContent = sim.playing ? 'Pause' : 'Play';
});
$('nowBtn').addEventListener('click', () => { sim.timeMs = Date.now(); });
$('rateSlider').addEventListener('input', setRateFromSlider);
$('scaleToggle').addEventListener('change', (e) => {
  sim.readable = e.target.checked;
  refreshLocalGeometry();
  applyReferenceFrame();
});
$('trailToggle').addEventListener('change', applyReferenceFrame);
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
  sim.focus = null;
  $('focusCard').hidden = true;
  setView(b.dataset.view);
}));
document.querySelectorAll('[data-focus]').forEach((b) => b.addEventListener('click', () => focusCraft(b.dataset.focus)));
$('closeFocus').addEventListener('click', () => {
  sim.focus = null;
  $('focusCard').hidden = true;
});

$('rateSlider').value = String(rateToSlider(sim.rate));
setRateFromSlider();
setView('system');
requestAnimationFrame(tick);
