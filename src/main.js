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
const L2_HELIO_OFFSET = AU_RENDER * (L2_KM / EARTH_ORBIT_KM);
const TRUE_HELIO_LOCAL_SCALE = (AU_RENDER / EARTH_ORBIT_KM) * KM_PER_LOCAL_UNIT;
const OVERVIEW_LOCAL_SCALE = 0.055;
const WAVE_LOCAL_SCALE = 0.24;
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
const camera = new THREE.PerspectiveCamera(38, 1, 0.001, 900);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.minDistance = 0.06;
controls.maxDistance = 220;

scene.add(new THREE.HemisphereLight(0x8ca6c9, 0x07090d, 0.78));
const sunLight = new THREE.DirectionalLight(0xfff1d0, 4.6);
sunLight.position.set(-20, 4, 1);
scene.add(sunLight);

function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (1664525 * s + 1013904223) >>> 0) / 4294967296);
}

function makeStars(count = 2300) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const rnd = seeded(20260830);
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
    color: 0xaebed4, size: 0.075, transparent: true, opacity: 0.66,
  })));
}
makeStars();

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

function earthTexture() {
  return canvasTexture(1024, 512, (ctx, w, h) => {
    const ocean = ctx.createLinearGradient(0, 0, 0, h);
    ocean.addColorStop(0, '#183f73'); ocean.addColorStop(.5, '#17679a'); ocean.addColorStop(1, '#102f60');
    ctx.fillStyle = ocean; ctx.fillRect(0, 0, w, h);
    const rnd = seeded(73);
    for (let c = 0; c < 32; c++) {
      const cx = rnd() * w, cy = (0.16 + rnd() * .68) * h;
      const rx = 18 + rnd() * 75, ry = 10 + rnd() * 42;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate((rnd() - .5) * 1.2);
      ctx.beginPath();
      for (let i = 0; i < 22; i++) {
        const a = i / 22 * Math.PI * 2;
        const jitter = .65 + rnd() * .55;
        const x = Math.cos(a) * rx * jitter, y = Math.sin(a) * ry * (.75 + rnd() * .45);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = c % 4 === 0 ? '#8b7a4c' : c % 3 === 0 ? '#557742' : '#416c44';
      ctx.fill(); ctx.restore();
    }
    ctx.globalAlpha = .32;
    ctx.fillStyle = '#dce7df';
    for (let i = 0; i < 80; i++) {
      const x = rnd() * w, y = rnd() * h;
      ctx.beginPath(); ctx.ellipse(x, y, 8 + rnd() * 32, 2 + rnd() * 9, rnd() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(235,245,255,.92)';
    ctx.fillRect(0, 0, w, 14); ctx.fillRect(0, h - 14, w, 14);
  });
}

function moonTexture() {
  return canvasTexture(768, 384, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#999b9b'); g.addColorStop(.5, '#b5b2aa'); g.addColorStop(1, '#777b7d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const rnd = seeded(116);
    for (let i = 0; i < 150; i++) {
      const x = rnd() * w, y = rnd() * h, r = 2 + rnd() * 16;
      ctx.fillStyle = `rgba(35,38,40,${.07 + rnd() * .18})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(235,232,220,${.05 + rnd() * .12})`; ctx.lineWidth = Math.max(1, r * .12); ctx.stroke();
    }
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = `rgba(70,73,75,${.08 + rnd() * .12})`;
      ctx.beginPath(); ctx.ellipse(rnd() * w, rnd() * h, 20 + rnd() * 70, 8 + rnd() * 30, rnd() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
  });
}

function sunTexture() {
  return canvasTexture(768, 384, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ffd36a'); g.addColorStop(.45, '#ffad2f'); g.addColorStop(1, '#e87517');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const rnd = seeded(23);
    for (let i = 0; i < 1500; i++) {
      const x = rnd() * w, y = rnd() * h, r = .5 + rnd() * 2.5;
      ctx.fillStyle = rnd() > .45 ? `rgba(255,245,183,${.05 + rnd() * .15})` : `rgba(151,66,8,${.03 + rnd() * .10})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  });
}

function sphere(radius, material) {
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 30), material);
}

function circle(radius, color, opacity = 0.3, n = 320) {
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(Array.from({ length: n }, (_, i) => {
      const a = i / n * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    })),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
}

function orbitLine(color, opacity = 0.35) {
  return new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

function tubeFromPoints(points, color, radius = 0.06, opacity = 0.78, closed = true) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, Math.max(96, points.length), radius, 6, closed),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
}

const earthSystem = new THREE.Group();
scene.add(earthSystem);

const earth = sphere(0.72, new THREE.MeshStandardMaterial({
  map: earthTexture(), roughness: .82, metalness: 0.0, color: 0xffffff,
}));
const moon = sphere(0.18, new THREE.MeshStandardMaterial({
  map: moonTexture(), roughness: .94, metalness: 0.0, color: 0xffffff,
}));
earthSystem.add(earth, moon);

const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(0.748, 48, 30),
  new THREE.MeshBasicMaterial({ color: 0x78c9ff, transparent: true, opacity: 0.13, side: THREE.BackSide, blending: THREE.AdditiveBlending }),
);
earth.add(atmosphere);

const clouds = new THREE.Mesh(
  new THREE.SphereGeometry(0.735, 48, 30),
  new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: .08, roughness: 1, depthWrite: false }),
);
earth.add(clouds);

const moonTrail = orbitLine(0x718096, 0.16);
const hubbleTrail = orbitLine(0xdcecff, 0.52);
const webbTrail = orbitLine(0xefb45d, 0.82);
const romanTrail = orbitLine(0xb88cff, 0.76);
earthSystem.add(moonTrail, hubbleTrail, webbTrail, romanTrail);

const geometryLayer = new THREE.Group();
earthSystem.add(geometryLayer);
const axisMat = new THREE.LineBasicMaterial({ color: 0x7892a9, transparent: true, opacity: 0.28 });
geometryLayer.add(new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.85, 0, 0), new THREE.Vector3(L2_KM / KM_PER_LOCAL_UNIT, 0, 0)]), axisMat,
));
for (const x of [5, 10, 15]) {
  geometryLayer.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, -0.12, 0), new THREE.Vector3(x, 0.12, 0)]),
    new THREE.LineBasicMaterial({ color: 0x7892a9, transparent: true, opacity: x === 15 ? 0.38 : 0.20 }),
  ));
}

const l2 = new THREE.Group();
const l2Mat = new THREE.LineBasicMaterial({ color: 0x86a6bd, transparent: true, opacity: 0.40 });
l2.add(new THREE.LineSegments(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.18, 0, 0), new THREE.Vector3(0.18, 0, 0),
    new THREE.Vector3(0, -0.18, 0), new THREE.Vector3(0, 0.18, 0),
    new THREE.Vector3(0, 0, -0.18), new THREE.Vector3(0, 0, 0.18),
  ]), l2Mat,
));
l2.add(new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(Array.from({ length: 80 }, (_, i) => {
    const a = i / 80 * Math.PI * 2;
    return new THREE.Vector3(0, Math.cos(a) * 0.30, Math.sin(a) * 0.30);
  })), l2Mat,
));
l2.position.x = L2_KM / KM_PER_LOCAL_UNIT;
earthSystem.add(l2);

const haloPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(12, 10),
  new THREE.MeshBasicMaterial({ color: 0x7899b4, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false }),
);
haloPlane.rotation.y = Math.PI / 2;
haloPlane.position.x = L2_KM / KM_PER_LOCAL_UNIT;
earthSystem.add(haloPlane);
const haloGrid = new THREE.GridHelper(10, 10, 0x6f89a0, 0x526778);
haloGrid.rotation.z = Math.PI / 2;
haloGrid.position.x = L2_KM / KM_PER_LOCAL_UNIT;
haloGrid.material.transparent = true;
haloGrid.material.opacity = 0.08;
earthSystem.add(haloGrid);

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
  hubble: spacecraft('./public/assets/spacecraft/hubble.png', 0xdcecff, 0.55),
  webb: spacecraft('./public/assets/spacecraft/jwst.png', 0xefb45d, 1.25),
  roman: spacecraft('./public/assets/spacecraft/roman.png', 0xb88cff, 1.15),
};

function loopPts(rx, ry, rz, phase = 0, n = 240) {
  return Array.from({ length: n }, (_, i) => {
    const a = i / n * Math.PI * 2 + phase;
    return new THREE.Vector3(L2_KM / KM_PER_LOCAL_UNIT + rx * Math.sin(2 * a), ry * Math.cos(a), rz * Math.sin(a));
  });
}
const webbLocalPts = loopPts(1.9, 5.5, 4.2);
const romanLocalPts = loopPts(1.45, 4.6, 3.4, 1.15);
webbTrail.geometry.setFromPoints(webbLocalPts);
romanTrail.geometry.setFromPoints(romanLocalPts);
const webbTube = tubeFromPoints(webbLocalPts, 0xefb45d, 0.075, 0.72, true);
const romanTube = tubeFromPoints(romanLocalPts, 0xb88cff, 0.068, 0.67, true);
earthSystem.add(webbTube, romanTube);

function localCircle(radius, inc, n = 180) {
  return Array.from({ length: n }, (_, i) => {
    const a = i / n * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius)
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), inc);
  });
}

const sun = sphere(1.15, new THREE.MeshStandardMaterial({
  map: sunTexture(), emissiveMap: sunTexture(), emissive: 0xff8b18, emissiveIntensity: 1.55,
  color: 0xffffff, roughness: 1, metalness: 0,
}));
scene.add(sun);
const corona = new THREE.Sprite(new THREE.SpriteMaterial({
  map: canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w/2,h/2,35,w/2,h/2,w/2);
    g.addColorStop(0,'rgba(255,202,92,.22)'); g.addColorStop(.45,'rgba(255,156,43,.08)'); g.addColorStop(1,'rgba(255,125,20,0)');
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
  }),
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
}));
corona.scale.set(4.2, 4.2, 1);
sun.add(corona);

const earthOrbit = circle(AU_RENDER, 0x38516f, 0.34, 360);
const l2GuideOrbit = circle(AU_RENDER + L2_HELIO_OFFSET, 0x597086, 0.20, 360);
scene.add(earthOrbit, l2GuideOrbit);
sun.visible = false;
earthOrbit.visible = false;
l2GuideOrbit.visible = false;

const eclipticGrid = new THREE.GridHelper(64, 32, 0x526f8b, 0x33475c);
eclipticGrid.material.transparent = true;
eclipticGrid.material.opacity = 0.10;
eclipticGrid.visible = false;
scene.add(eclipticGrid);

const waveGroup = new THREE.Group();
scene.add(waveGroup);
let waveKey = '';

function earthHelioState(tSec) {
  const theta = tSec / YEAR * Math.PI * 2;
  const radial = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
  const tangent = new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta));
  return { theta, radial, tangent, up: new THREE.Vector3(0,1,0), centre: radial.clone().multiplyScalar(AU_RENDER) };
}

function haloLocalAt(tSec, which) {
  if (which === 'webb') {
    const a = tSec / WEBB_PERIOD * Math.PI * 2;
    return new THREE.Vector3(L2_KM / KM_PER_LOCAL_UNIT + 1.9*Math.sin(2*a), 5.5*Math.cos(a), 4.2*Math.sin(a));
  }
  const a = tSec / ROMAN_PERIOD * Math.PI * 2 + 1.15;
  return new THREE.Vector3(L2_KM / KM_PER_LOCAL_UNIT + 1.45*Math.sin(2*a), 4.6*Math.cos(a), 3.4*Math.sin(a));
}

function localToHelio(local, tSec, scale) {
  const { radial, tangent, up, centre } = earthHelioState(tSec);
  return centre.clone()
    .add(radial.multiplyScalar(local.x * scale))
    .add(up.multiplyScalar(local.y * scale))
    .add(tangent.multiplyScalar(local.z * scale));
}

const sim = {
  timeMs: Date.now(), playing: true, rate: 600,
  view: 'system', frame: 'rotating', readable: true,
  last: performance.now(), focus: null, followAnchor: null,
};

function currentHelioScale() {
  if (!sim.readable) return TRUE_HELIO_LOCAL_SCALE;
  return sim.view === 'heliofollow' ? WAVE_LOCAL_SCALE : OVERVIEW_LOCAL_SCALE;
}

function rebuildWavePaths(force = false) {
  const centreT = sim.timeMs / 1000;
  const scale = currentHelioScale();
  const key = `${Math.floor(centreT / (7 * DAY))}:${sim.readable}:${sim.view}`;
  if (!force && key === waveKey) return;
  waveKey = key;
  while (waveGroup.children.length) {
    const child = waveGroup.children.pop();
    child.geometry?.dispose(); child.material?.dispose();
  }
  const n = 360, webbPts = [], romanPts = [];
  for (let i = 0; i < n; i++) {
    const t = centreT - YEAR/2 + i/(n-1)*YEAR;
    webbPts.push(localToHelio(haloLocalAt(t,'webb'), t, scale));
    romanPts.push(localToHelio(haloLocalAt(t,'roman'), t, scale));
  }
  const thick = sim.view === 'heliofollow';
  waveGroup.add(tubeFromPoints(webbPts, 0xefb45d, thick ? .085 : .055, thick ? .86 : .62, false));
  waveGroup.add(tubeFromPoints(romanPts, 0xb88cff, thick ? .078 : .050, thick ? .82 : .58, false));
}

function refreshLocalGeometry() {
  const moonR = MOON_ORBIT_KM / KM_PER_LOCAL_UNIT * (sim.readable ? 1.45 : 1);
  const hubbleR = sim.readable ? 1.05 : HUBBLE_RADIUS_KM / KM_PER_LOCAL_UNIT;
  moonTrail.geometry.dispose(); moonTrail.geometry = new THREE.BufferGeometry().setFromPoints(localCircle(moonR, MOON_INC));
  hubbleTrail.geometry.dispose(); hubbleTrail.geometry = new THREE.BufferGeometry().setFromPoints(localCircle(hubbleR, HUBBLE_INC));
}
refreshLocalGeometry();

function updateLocalState() {
  const t = sim.timeMs / 1000;
  const moonA = t / MOON_PERIOD * Math.PI * 2;
  const moonR = MOON_ORBIT_KM / KM_PER_LOCAL_UNIT * (sim.readable ? 1.45 : 1);
  moon.position.set(Math.cos(moonA)*moonR,0,Math.sin(moonA)*moonR).applyAxisAngle(new THREE.Vector3(1,0,0),MOON_INC);

  const hA = t / HUBBLE_PERIOD * Math.PI * 2;
  const hR = sim.readable ? 1.05 : HUBBLE_RADIUS_KM / KM_PER_LOCAL_UNIT;
  craft.hubble.group.position.set(Math.cos(hA)*hR,0,Math.sin(hA)*hR).applyAxisAngle(new THREE.Vector3(1,0,0),HUBBLE_INC);
  craft.webb.group.position.copy(haloLocalAt(t,'webb'));
  craft.roman.group.position.copy(haloLocalAt(t,'roman'));
}

function applyReferenceFrame() {
  const helio = sim.frame === 'heliocentric';
  const waveView = sim.view === 'heliofollow';
  sun.visible = helio;
  earthOrbit.visible = helio;
  l2GuideOrbit.visible = helio;
  waveGroup.visible = helio && $('trailToggle').checked;
  eclipticGrid.visible = waveView;
  $('sunDirection').hidden = helio;
  $('geometryReadout').hidden = helio || sim.view === 'earth';

  if (helio) {
    const t = sim.timeMs / 1000;
    const { theta, centre } = earthHelioState(t);
    earthSystem.position.copy(centre);
    earthSystem.rotation.set(0, -theta, 0);
    const localScale = currentHelioScale();
    earthSystem.scale.setScalar(localScale);
    const earthVisual = waveView ? .24 : .14;
    earth.scale.setScalar(earthVisual / (.72 * localScale));
    craft.webb.sprite.scale.setScalar((waveView ? .48 : .30) / localScale);
    craft.roman.sprite.scale.setScalar((waveView ? .44 : .28) / localScale);
    craft.hubble.group.visible = false;
    moon.visible = false; moonTrail.visible = false; hubbleTrail.visible = false;
    l2.scale.setScalar((waveView ? .30 : .22) / localScale);
    geometryLayer.visible = false; haloPlane.visible = false; haloGrid.visible = false;
    webbTrail.visible = false; romanTrail.visible = false; webbTube.visible = false; romanTube.visible = false;
    rebuildWavePaths();
  } else {
    earthSystem.position.set(0,0,0); earthSystem.rotation.set(0,0,0); earthSystem.scale.setScalar(1);
    earth.scale.setScalar(1);
    craft.hubble.group.visible = true;
    craft.hubble.sprite.scale.setScalar(craft.hubble.baseScale);
    craft.webb.sprite.scale.setScalar(craft.webb.baseScale);
    craft.roman.sprite.scale.setScalar(craft.roman.baseScale);
    l2.scale.setScalar(1);
    const localVisible = sim.view === 'earth' || sim.view === 'system' || sim.focus === 'hubble';
    moon.visible = localVisible;
    moonTrail.visible = localVisible && $('trailToggle').checked;
    hubbleTrail.visible = localVisible && $('trailToggle').checked;
    geometryLayer.visible = sim.view === 'system' || sim.view === 'free';
    haloPlane.visible = sim.view === 'l2'; haloGrid.visible = sim.view === 'l2';
    webbTrail.visible = $('trailToggle').checked; romanTrail.visible = $('trailToggle').checked;
    webbTube.visible = $('trailToggle').checked; romanTube.visible = $('trailToggle').checked;
    waveGroup.visible = false; eclipticGrid.visible = false;
  }
}

const VIEWS = {
  system: { frame:'rotating', pos:[2.8,7.2,31], target:[7.2,0,0], title:'Earth–L2 rotating frame', blurb:'Earth is fixed at the origin; +X points anti-sunward to L2, about 1.5 million km away.', readout:'EARTH–L2 ROTATING' },
  earth: { frame:'rotating', pos:[3.4,2.4,5.7], target:[0,0,0], title:'Earth / Hubble', blurb:'A close Earth-centred view. Hubble is intentionally drawn small enough not to hide the planet or its orbit.', readout:'EARTH-CENTRED · ROTATING DISPLAY' },
  l2: { frame:'rotating', pos:[24,10,19], target:[15,0,0], title:'Sun–Earth L2 close-up', blurb:'The bold curves show the predicted halo-like paths; the faint plane makes their out-of-ecliptic extent visible.', readout:'EARTH–L2 ROTATING · CLOSE-UP' },
  heliofollow: { frame:'heliocentric', pos:null, target:null, title:'L2 wave along the ecliptic', blurb:'The camera travels with Earth while the bold Webb and Roman paths reveal their repeated motion above and below the ecliptic.', readout:'HELIOCENTRIC · EARTH–L2 FOLLOW' },
  helio: { frame:'heliocentric', pos:[0,30,36], target:[0,0,0], title:'Heliocentric overview', blurb:'The Sun is fixed. Earth and the L2 region travel together around the one-year orbit.', readout:'HELIOCENTRIC INERTIAL DISPLAY' },
  free: { frame:'rotating', pos:null, target:null, title:'Free camera', blurb:'Inspect the Earth–L2 rotating geometry directly.', readout:'EARTH–L2 ROTATING · FREE CAMERA' },
};

function setHelioFollowCamera() {
  const { radial, tangent, up, centre } = earthHelioState(sim.timeMs / 1000);
  const target = centre.clone().add(radial.clone().multiplyScalar(2.2));
  camera.position.copy(target.clone().add(tangent.clone().multiplyScalar(-11)).add(up.clone().multiplyScalar(6.5)).add(radial.clone().multiplyScalar(-2.5)));
  controls.target.copy(target); controls.update(); sim.followAnchor = centre.clone();
}

function updateHelioFollowAnchor() {
  if (sim.view !== 'heliofollow') return;
  const centre = earthHelioState(sim.timeMs/1000).centre;
  if (!sim.followAnchor) { sim.followAnchor = centre.clone(); return; }
  const delta = centre.clone().sub(sim.followAnchor);
  camera.position.add(delta); controls.target.add(delta); sim.followAnchor.copy(centre);
}

function setView(name, focus = null) {
  const v = VIEWS[name];
  sim.view = name; sim.frame = v.frame; sim.focus = focus; sim.followAnchor = null;
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  $('viewTitle').textContent = v.title; $('viewBlurb').textContent = v.blurb; $('frameReadout').textContent = v.readout;
  if (name === 'heliofollow') setHelioFollowCamera();
  else if (v.pos) { camera.position.set(...v.pos); controls.target.set(...v.target); controls.update(); }
  waveKey = ''; applyReferenceFrame();
}

function focusCraft(name) {
  const info = {
    hubble:['Hubble Space Telescope','PROPAGATED','LEO · ~483 km altitude · 28.5° inclination · ~95 min period. Phase remains illustrative until TLE/SGP4 is connected.'],
    webb:['James Webb Space Telescope','EDUCATIONAL','Sun–Earth L2 region. The bold curve is still a renderer placeholder until authoritative JWST ephemeris replaces it.'],
    roman:['Nancy Grace Roman Space Telescope','EDUCATIONAL','Sun–Earth L2 region. The bold curve remains a placeholder while official Roman trajectory products are integrated.'],
  }[name];
  $('focusName').textContent=info[0]; $('focusMode').textContent=info[1]; $('focusInfo').textContent=info[2]; $('focusCard').hidden=false;
  if (name==='hubble') setView('earth',name); else setView('l2',name);
}

function followTarget() {
  if (!sim.focus || sim.frame === 'heliocentric') return;
  const p = craft[sim.focus].group.position;
  const dist = sim.focus === 'hubble' ? 2.5 : 7.5;
  camera.position.lerp(p.clone().add(new THREE.Vector3(dist*.55,dist*.38,dist)),.055);
  controls.target.lerp(p,.085);
  if (sim.focus === 'hubble') craft.hubble.sprite.scale.setScalar(.72);
}

function sliderToRate(value) { return 10 ** ((Number(value)/1000) * LOG_RATE_MAX); }
function rateToSlider(rate) { return Math.round(Math.log10(Math.max(1,rate))/LOG_RATE_MAX*1000); }
function formatRate(rate) {
  if (rate < 120) return rate < 10 ? `${rate.toFixed(1)}×` : `${Math.round(rate)}×`;
  if (rate < 3600) return `${(rate/60).toFixed(rate<600?1:0)} min/s`;
  if (rate < DAY) return `${(rate/3600).toFixed(rate<18000?1:0)} h/s`;
  return `${(rate/DAY).toFixed(rate<5*DAY?1:0)} d/s`;
}
function setRateFromSlider() { sim.rate = sliderToRate($('rateSlider').value); $('rateReadout').textContent = formatRate(sim.rate); }

function resize() {
  const w=innerWidth,h=innerHeight,pr=renderer.getPixelRatio();
  if (canvas.width!==Math.round(w*pr)||canvas.height!==Math.round(h*pr)) renderer.setSize(w,h,false);
  camera.aspect=w/h; camera.updateProjectionMatrix();
}

function tick(now) {
  const dt=Math.min(.1,(now-sim.last)/1000); sim.last=now;
  if (sim.playing) sim.timeMs += dt*sim.rate*1000;
  resize(); updateLocalState(); updateHelioFollowAnchor(); applyReferenceFrame(); followTarget(); controls.update();
  earth.rotation.y += dt*.018; clouds.rotation.y += dt*.021; moon.rotation.y += dt*.004; sun.rotation.y += dt*.006;
  renderer.render(scene,camera);
  $('utcReadout').textContent = new Date(sim.timeMs).toISOString().replace('T',' ').replace('.000Z','Z');
  requestAnimationFrame(tick);
}

$('playBtn').addEventListener('click',()=>{sim.playing=!sim.playing;$('playBtn').textContent=sim.playing?'Pause':'Play';});
$('nowBtn').addEventListener('click',()=>{sim.timeMs=Date.now();waveKey='';});
$('rateSlider').addEventListener('input',setRateFromSlider);
$('scaleToggle').addEventListener('change',e=>{sim.readable=e.target.checked;refreshLocalGeometry();waveKey='';applyReferenceFrame();});
$('trailToggle').addEventListener('change',applyReferenceFrame);
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{sim.focus=null;$('focusCard').hidden=true;setView(b.dataset.view);}));
document.querySelectorAll('[data-focus]').forEach(b=>b.addEventListener('click',()=>focusCraft(b.dataset.focus)));
$('closeFocus').addEventListener('click',()=>{sim.focus=null;$('focusCard').hidden=true;craft.hubble.sprite.scale.setScalar(craft.hubble.baseScale);});

$('rateSlider').value=String(rateToSlider(sim.rate));
setRateFromSlider();
setView('system');
requestAnimationFrame(tick);