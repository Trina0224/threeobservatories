import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { equatorialToEcliptic, toSunEarthRotating } from './physics/frames.js';
import {
  jwstEclipticKm,
  jwstEphemeris,
  loadJwstHorizonsCache,
  sunEclipticKm,
} from './data/jwst-horizons.js';
import {
  HST_PERIOD_SECONDS,
  hstPropagator,
  hstTemeKm,
  loadHstPropagator,
} from './data/hst-tle.js';

const DAY = 86400;
const YEAR = 365.256363004 * DAY;
const DAY_MS = DAY * 1000;
const YEAR_MS = 365.256363004 * DAY_MS;
const MOON_PERIOD = 27.321661 * DAY;
// Hubble's period comes from the mean motion in the bundled TLE, so the
// fallback circle and the SGP4 trail window stay consistent.
const HUBBLE_PERIOD = HST_PERIOD_SECONDS;
const WEBB_PERIOD = 168 * DAY; // educational fallback only
const ROMAN_PERIOD = 180 * DAY; // educational placeholder
const EARTH_ORBIT_KM = 149_597_870.7;
const EARTH_RADIUS_KM = 6371;
const MOON_RADIUS_KM = 1737.4;
const HUBBLE_RADIUS_KM = EARTH_RADIUS_KM + 483;
const MOON_ORBIT_KM = 384_400;
const L2_KM = 1_500_000;
const KM_PER_LOCAL_UNIT = 100_000;
const HUBBLE_READABLE_RADIUS = 1.05;
const WEBB_COLOR = 0xefb45d;
const ROMAN_COLOR = 0xb88cff;
const HUBBLE_COLOR = 0xdcecff;
// Webb's drawn halo is one revolution centred on the simulation clock. The
// revolution is measured from the cache rather than hard-coded, because the real
// halo is quasi-periodic: its period drifts and station keeping changes it.
// These bounds bracket the ~178-183 day L2 halo period with room to spare.
const WEBB_LOOP_MIN_MS = 120 * DAY_MS;
const WEBB_LOOP_MAX_MS = 260 * DAY_MS;
const WEBB_LOOP_COARSE_STEP_MS = DAY_MS;
const WEBB_LOOP_FINE_STEP_MS = 3_600_000;
const L2_LOCAL_X = L2_KM / KM_PER_LOCAL_UNIT;
const AU_RENDER = 22;
const TRUE_HELIO_LOCAL_SCALE = (AU_RENDER / EARTH_ORBIT_KM) * KM_PER_LOCAL_UNIT;
const OVERVIEW_LOCAL_SCALE = 0.055;
const WAVE_LOCAL_SCALE = 0.24;
const HUBBLE_INC = THREE.MathUtils.degToRad(28.5);
const MOON_INC = THREE.MathUtils.degToRad(5.145);
const EARTH_OBLIQUITY = THREE.MathUtils.degToRad(23.44);
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

scene.add(new THREE.HemisphereLight(0x8ca6c9, 0x07090d, 0.72));
const sunLight = new THREE.DirectionalLight(0xffefd2, 5.2);
sunLight.position.set(-20, 2, 0);
scene.add(sunLight);

function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (1664525 * s + 1013904223) >>> 0) / 4294967296);
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

function glowTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 56, w / 2, h / 2, 126);
    g.addColorStop(0, 'rgba(255,220,145,0)');
    g.addColorStop(0.43, 'rgba(255,220,145,0)');
    g.addColorStop(0.62, 'rgba(255,210,116,.82)');
    g.addColorStop(0.79, 'rgba(255,164,60,.22)');
    g.addColorStop(1, 'rgba(255,145,35,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}
const SUN_GLOW_TEXTURE = glowTexture();

function planetTexture(kind) {
  const rnd = seeded(kind === 'earth' ? 73 : kind === 'moon' ? 116 : 23);
  return canvasTexture(kind === 'earth' ? 1024 : 768, kind === 'earth' ? 512 : 384, (ctx, w, h) => {
    if (kind === 'earth') {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#173d70');
      g.addColorStop(0.5, '#17638f');
      g.addColorStop(1, '#102e5c');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let n = 0; n < 28; n++) {
        const cx = rnd() * w;
        const cy = (0.14 + rnd() * 0.72) * h;
        const rx = 18 + rnd() * 72;
        const ry = 10 + rnd() * 38;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((rnd() - 0.5) * 1.2);
        ctx.beginPath();
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2;
          const r = 0.65 + rnd() * 0.55;
          const x = Math.cos(a) * rx * r;
          const y = Math.sin(a) * ry * (0.75 + rnd() * 0.4);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = n % 4 === 0 ? '#8a7950' : n % 3 === 0 ? '#587845' : '#426d48';
        ctx.fill();
        ctx.restore();
      }
    } else if (kind === 'moon') {
      ctx.fillStyle = '#aaa8a1';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 150; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const r = 2 + rnd() * 16;
        ctx.fillStyle = `rgba(45,47,48,${0.07 + rnd() * 0.18})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#ffd36a');
      g.addColorStop(0.45, '#ffad2f');
      g.addColorStop(1, '#e87517');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 1200; i++) {
        ctx.fillStyle = rnd() > 0.45
          ? `rgba(255,245,183,${0.05 + rnd() * 0.14})`
          : `rgba(151,66,8,${0.03 + rnd() * 0.09})`;
        ctx.beginPath();
        ctx.arc(rnd() * w, rnd() * h, 0.5 + rnd() * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

function makeStars(count = 2200) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const rnd = seeded(20260830);
  for (let i = 0; i < count; i++) {
    const r = 100 + rnd() * 180;
    const z = rnd() * 2 - 1;
    const p = rnd() * Math.PI * 2;
    const q = Math.sqrt(1 - z * z);
    positions[i * 3] = r * q * Math.cos(p);
    positions[i * 3 + 1] = r * z;
    positions[i * 3 + 2] = r * q * Math.sin(p);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0xaebed4,
    size: 0.075,
    transparent: true,
    opacity: 0.66,
  })));
}
makeStars();

function sphere(r, material) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 48, 30), material);
}

function circle(r, color, opacity = 0.3, n = 320) {
  const points = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
  });
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
}

function orbitLine(color, opacity = 0.35) {
  return new THREE.LineLoop(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
}

function trailLine(color, opacity = 0.35) {
  return new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
}

function tubeGeometry(points, radius = 0.06, closed = true) {
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points, closed, 'centripetal'),
    Math.max(96, points.length),
    radius,
    6,
    closed,
  );
}

function tubeFromPoints(points, color, radius = 0.06, opacity = 0.78, closed = true) {
  return new THREE.Mesh(
    tubeGeometry(points, radius, closed),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
}

const earthSystem = new THREE.Group();
scene.add(earthSystem);

const earthTilt = new THREE.Group();
earthSystem.add(earthTilt);
const earth = sphere(0.72, new THREE.MeshStandardMaterial({
  map: planetTexture('earth'),
  roughness: 0.82,
  color: 0xffffff,
}));
earthTilt.add(earth);
const moon = sphere(0.18, new THREE.MeshStandardMaterial({
  map: planetTexture('moon'),
  roughness: 0.94,
  color: 0xffffff,
}));
earthSystem.add(moon);

const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(0.748, 48, 30),
  new THREE.MeshBasicMaterial({
    color: 0x78c9ff,
    transparent: true,
    opacity: 0.13,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  }),
);
earth.add(atmosphere);

const earthAxis = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -1.05, 0),
    new THREE.Vector3(0, 1.05, 0),
  ]),
  new THREE.LineBasicMaterial({ color: 0xa6c9e8, transparent: true, opacity: 0.26 }),
);
earthTilt.add(earthAxis);
const tiltQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), EARTH_OBLIQUITY);

const moonTrail = orbitLine(0x718096, 0.16);
const hubbleTrail = orbitLine(HUBBLE_COLOR, 0.52);
// Webb's path comes from a real ephemeris window, which is an open arc rather
// than a closed loop, so it must not be a LineLoop.
const webbTrail = trailLine(WEBB_COLOR, 0.82);
const romanTrail = orbitLine(ROMAN_COLOR, 0.76);
earthSystem.add(moonTrail, hubbleTrail, webbTrail, romanTrail);

const geometryLayer = new THREE.Group();
earthSystem.add(geometryLayer);
geometryLayer.add(new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0.85, 0, 0),
    new THREE.Vector3(L2_KM / KM_PER_LOCAL_UNIT, 0, 0),
  ]),
  new THREE.LineBasicMaterial({ color: 0x7892a9, transparent: true, opacity: 0.28 }),
));
for (const x of [5, 10, 15]) {
  geometryLayer.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, -0.12, 0),
      new THREE.Vector3(x, 0.12, 0),
    ]),
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
  ]),
  l2Mat,
));
l2.add(circle(0.30, 0x86a6bd, 0.40, 80));
l2.children[1].rotation.z = Math.PI / 2;
l2.position.x = L2_KM / KM_PER_LOCAL_UNIT;
earthSystem.add(l2);

const haloPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(12, 10),
  new THREE.MeshBasicMaterial({
    color: 0x7899b4,
    transparent: true,
    opacity: 0.035,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
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

function spacecraft(url, fallbackColor, scale, eclipseGlow = false) {
  const group = new THREE.Group();
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 16, 10),
    new THREE.MeshBasicMaterial({ color: fallbackColor }),
  );
  group.add(marker);

  const material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, alphaTest: 0.04 });
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(scale);
  group.add(sprite);

  let glow = null;
  let glowMat = null;
  if (eclipseGlow) {
    glowMat = new THREE.SpriteMaterial({
      map: SUN_GLOW_TEXTURE,
      color: 0xffd07a,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(scale * 1.65);
    group.add(glow);
  }

  new THREE.TextureLoader().load(url, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    material.map = texture;
    material.needsUpdate = true;
    marker.visible = false;
  });

  earthSystem.add(group);
  return { group, sprite, marker, material, glow, glowMat, baseScale: scale, sunlit: true, pulse: 0 };
}

const craft = {
  hubble: spacecraft('./public/assets/spacecraft/hubble.png', 0xdcecff, 0.55, true),
  webb: spacecraft('./public/assets/spacecraft/jwst.png', 0xefb45d, 1.25, false),
  roman: spacecraft('./public/assets/spacecraft/roman.png', 0xb88cff, 1.15, false),
};

// Roman has no published operational ephemeris yet, so its L2 path stays an
// explicitly labelled EDUCATIONAL quasi-halo loop in the local rotating frame.
function loopPts(rx, ry, rz, phase = 0, n = 240) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + phase;
    return new THREE.Vector3(
      L2_LOCAL_X + rx * Math.sin(2 * a),
      ry * Math.cos(a),
      rz * Math.sin(a),
    );
  });
}

const romanLocalPts = loopPts(1.45, 4.6, 3.4, 1.15);
romanTrail.geometry.setFromPoints(romanLocalPts);
const webbTube = new THREE.Mesh(
  new THREE.BufferGeometry(),
  new THREE.MeshBasicMaterial({
    color: WEBB_COLOR,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  }),
);
const romanTube = tubeFromPoints(romanLocalPts, ROMAN_COLOR, 0.068, 0.67, true);
earthSystem.add(webbTube, romanTube);

function localCircle(radius, inc, n = 180) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius)
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), inc);
  });
}

const sun = sphere(1.15, new THREE.MeshStandardMaterial({
  map: planetTexture('sun'),
  emissiveMap: planetTexture('sun'),
  emissive: 0xff8b18,
  emissiveIntensity: 1.55,
  color: 0xffffff,
  roughness: 1,
}));
scene.add(sun);
const corona = new THREE.Sprite(new THREE.SpriteMaterial({
  map: canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 35, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,202,92,.22)');
    g.addColorStop(0.45, 'rgba(255,156,43,.08)');
    g.addColorStop(1, 'rgba(255,125,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }),
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
}));
corona.scale.set(4.2, 4.2, 1);
sun.add(corona);

const earthOrbit = circle(AU_RENDER, 0x38516f, 0.34, 360);
const l2GuideOrbit = circle(AU_RENDER + AU_RENDER * (L2_KM / EARTH_ORBIT_KM), 0x597086, 0.20, 360);
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

// Render-space heliocentric frame. The returned basis is the image of the ROT
// axes defined in src/physics/frames.js:
//   radial     <- ROT +X, anti-sunward from Earth toward L2
//   up         <- ROT +Y, ecliptic north
//   crossTrack <- ROT +Z, = X cross Y (Earth's retrograde direction)
// `earthSystem.rotation.set(0, -theta, 0)` maps local (1,0,0)/(0,1,0)/(0,0,1)
// onto exactly those three vectors, so the local frame stays right-handed and
// halo orbits are not mirrored. The render angle therefore runs *backwards*:
// Earth's real ecliptic longitude increases with time, which with +Y drawn as
// ecliptic north means the scene must turn the other way around +Y.
function earthHelioState(tSec) {
  const theta = -(tSec / YEAR) * Math.PI * 2;
  const radial = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
  const crossTrack = new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta));
  return {
    theta,
    radial,
    crossTrack,
    up: new THREE.Vector3(0, 1, 0),
    centre: radial.clone().multiplyScalar(AU_RENDER),
  };
}

// ROT kilometres -> renderer local units. The only thing that happens here is
// the display scale; the frame definition lives in src/physics/frames.js.
function rotatingKmToLocal(rotatingKm) {
  return new THREE.Vector3(rotatingKm.x, rotatingKm.y, rotatingKm.z)
    .divideScalar(KM_PER_LOCAL_UNIT);
}

// HISTORICAL: JWST from the bundled JPL Horizons cache, expressed in the
// Sun-Earth rotating frame using the same-epoch Horizons Sun vector.
function webbTruthLocal(ms) {
  const eclipticKm = jwstEclipticKm(ms);
  if (!eclipticKm) return null;
  const rotatingKm = toSunEarthRotating(eclipticKm, sunEclipticKm(ms));
  return rotatingKm ? rotatingKmToLocal(rotatingKm) : null;
}

// EDUCATIONAL: illustrative halo used only when the Horizons cache is missing or
// the clock leaves its coverage window. Amplitudes are chosen for legibility.
function webbFallbackLocal(ms) {
  const a = ((ms / 1000) / WEBB_PERIOD) * Math.PI * 2;
  return new THREE.Vector3(
    L2_LOCAL_X + 1.9 * Math.sin(2 * a),
    5.5 * Math.cos(a),
    4.2 * Math.sin(a),
  );
}

function webbLocalAt(ms) {
  return webbTruthLocal(ms) ?? webbFallbackLocal(ms);
}

// EDUCATIONAL: Roman's quasi-halo placeholder.
function romanLocalAt(ms) {
  const a = ((ms / 1000) / ROMAN_PERIOD) * Math.PI * 2 + 1.15;
  return new THREE.Vector3(
    L2_LOCAL_X + 1.45 * Math.sin(2 * a),
    4.6 * Math.cos(a),
    3.4 * Math.sin(a),
  );
}

// PROPAGATED: Hubble from SGP4 on the bundled TLE, rotated TEME -> ecliptic ->
// Sun-Earth rotating frame so it shares one frame with the rest of the scene.
function hubbleTruthRotatingKm(ms) {
  const temeKm = hstTemeKm(ms);
  if (!temeKm) return null;
  return toSunEarthRotating(equatorialToEcliptic(temeKm), sunEclipticKm(ms));
}

function hubbleLocalAt(ms, readable) {
  const rotatingKm = hubbleTruthRotatingKm(ms);
  if (rotatingKm) {
    const local = rotatingKmToLocal(rotatingKm);
    // EDUCATIONAL scale: a ~470 km orbit sits inside the exaggerated Earth
    // sphere, so readable mode keeps the true orientation and phase and only
    // inflates the radius.
    return readable ? local.setLength(HUBBLE_READABLE_RADIUS) : local;
  }
  const a = ((ms / 1000) / HUBBLE_PERIOD) * Math.PI * 2;
  const radius = readable ? HUBBLE_READABLE_RADIUS : HUBBLE_RADIUS_KM / KM_PER_LOCAL_UNIT;
  return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius)
    .applyAxisAngle(new THREE.Vector3(1, 0, 0), HUBBLE_INC);
}

/**
 * Length of the window whose two ends land closest together in the rotating
 * frame, i.e. one halo revolution about `centreMs`. Drawing any other span
 * leaves a loose end hanging off the loop: a 200-day window on a 178-day halo
 * overshoots by 22 days, and that overshoot reads as a broken orbit.
 *
 * The residual end-to-end distance is real. Webb's halo does not close on
 * itself, so the small step at the seam is the orbit's actual drift over one
 * revolution and is not bridged with invented trajectory.
 */
function webbRevolutionMs(centreMs) {
  const endpointGap = (windowMs) => {
    const start = webbTruthLocal(centreMs - windowMs / 2);
    const end = webbTruthLocal(centreMs + windowMs / 2);
    return start && end ? start.distanceTo(end) : null;
  };

  let best = null;
  let bestGap = Infinity;
  for (let w = WEBB_LOOP_MIN_MS; w <= WEBB_LOOP_MAX_MS; w += WEBB_LOOP_COARSE_STEP_MS) {
    const gap = endpointGap(w);
    if (gap !== null && gap < bestGap) {
      bestGap = gap;
      best = w;
    }
  }
  if (best === null) return null;

  for (let w = best - WEBB_LOOP_COARSE_STEP_MS; w <= best + WEBB_LOOP_COARSE_STEP_MS; w += WEBB_LOOP_FINE_STEP_MS) {
    const gap = endpointGap(w);
    if (gap !== null && gap < bestGap) {
      bestGap = gap;
      best = w;
    }
  }
  return best;
}

/**
 * Webb path samples in local units. Truth and fallback are never blended: if the
 * centre epoch is covered by the cache the path is drawn only from cached
 * samples, and epochs outside coverage are simply left out of the line.
 */
function webbPathPoints(centreMs, halfWindowMs, samples) {
  const useTruth = jwstEphemeris.ready && webbTruthLocal(centreMs) !== null;
  const points = [];
  for (let i = 0; i < samples; i += 1) {
    const ms = centreMs - halfWindowMs + (i / (samples - 1)) * halfWindowMs * 2;
    const point = useTruth ? webbTruthLocal(ms) : webbFallbackLocal(ms);
    if (point) points.push({ ms, point });
  }
  return points;
}

function localToHelio(local, tSec, scale) {
  const { radial, crossTrack, up, centre } = earthHelioState(tSec);
  return centre.clone()
    .add(radial.multiplyScalar(local.x * scale))
    .add(up.multiplyScalar(local.y * scale))
    .add(crossTrack.multiplyScalar(local.z * scale));
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
  followAnchor: null,
};

function currentHelioScale() {
  if (!sim.readable) return TRUE_HELIO_LOCAL_SCALE;
  return sim.view === 'heliofollow' ? WAVE_LOCAL_SCALE : OVERVIEW_LOCAL_SCALE;
}

// One year of Webb and Roman motion mapped into the heliocentric render frame.
// Both the wave and the spacecraft go through webbLocalAt/romanLocalAt and
// localToHelio, so a craft is on its own line by construction in every view.
function rebuildWavePaths() {
  const centreMs = sim.timeMs;
  const scale = currentHelioScale();
  const key = `${Math.floor(centreMs / (7 * DAY_MS))}:${sim.readable}:${sim.view}:${jwstEphemeris.ready}`;
  if (key === waveKey) return;
  waveKey = key;

  while (waveGroup.children.length) {
    const child = waveGroup.children.pop();
    child.geometry?.dispose();
    child.material?.dispose();
  }

  const samples = 480;
  const webbPts = webbPathPoints(centreMs, YEAR_MS / 2, samples)
    .map(({ ms, point }) => localToHelio(point, ms / 1000, scale));
  const romanPts = [];
  for (let i = 0; i < samples; i += 1) {
    const ms = centreMs - YEAR_MS / 2 + (i / (samples - 1)) * YEAR_MS;
    romanPts.push(localToHelio(romanLocalAt(ms), ms / 1000, scale));
  }

  const thick = sim.view === 'heliofollow';
  if (webbPts.length > 2) {
    waveGroup.add(tubeFromPoints(webbPts, WEBB_COLOR, thick ? 0.085 : 0.055, thick ? 0.86 : 0.62, false));
  }
  waveGroup.add(tubeFromPoints(romanPts, ROMAN_COLOR, thick ? 0.078 : 0.05, thick ? 0.82 : 0.58, false));
}

function refreshLocalGeometry() {
  const moonR = (MOON_ORBIT_KM / KM_PER_LOCAL_UNIT) * (sim.readable ? 1.45 : 1);
  moonTrail.geometry.dispose();
  moonTrail.geometry = new THREE.BufferGeometry().setFromPoints(localCircle(moonR, MOON_INC));
}
refreshLocalGeometry();

// Trails are sampled from the same position functions as the spacecraft, so a
// craft can never drift off its own drawn path.
function rebuildHubbleTrail() {
  const points = [];
  const samples = 180;
  for (let i = 0; i < samples; i += 1) {
    const ms = sim.timeMs + (i / samples) * HUBBLE_PERIOD * 1000;
    points.push(hubbleLocalAt(ms, sim.readable));
  }
  hubbleTrail.geometry.dispose();
  hubbleTrail.geometry = new THREE.BufferGeometry().setFromPoints(points);
}

let webbLoop = { spanDays: null, closureKm: null };

function rebuildWebbLocalPath() {
  // The educational fallback halo is exactly periodic, so one WEBB_PERIOD closes.
  const windowMs = webbRevolutionMs(sim.timeMs) ?? WEBB_PERIOD * 1000;
  const points = webbPathPoints(sim.timeMs, windowMs / 2, 280)
    .map(({ point }) => point);
  if (points.length < 3) return;
  webbLoop = {
    spanDays: windowMs / DAY_MS,
    closureKm: points[0].distanceTo(points[points.length - 1]) * KM_PER_LOCAL_UNIT,
  };
  webbTrail.geometry.dispose();
  webbTrail.geometry = new THREE.BufferGeometry().setFromPoints(points);
  webbTube.geometry.dispose();
  webbTube.geometry = tubeGeometry(points, 0.075, false);
}

let hubblePathKey = '';
let webbPathKey = '';

function refreshTrackedPaths(force = false) {
  const hubbleKey = `${Math.floor(sim.timeMs / 3_600_000)}:${sim.readable}:${hstPropagator.ready}`;
  if (force || hubbleKey !== hubblePathKey) {
    hubblePathKey = hubbleKey;
    rebuildHubbleTrail();
  }
  const webbKey = `${Math.floor(sim.timeMs / DAY_MS)}:${jwstEphemeris.ready}`;
  if (force || webbKey !== webbPathKey) {
    webbPathKey = webbKey;
    rebuildWebbLocalPath();
  }
}
refreshTrackedPaths(true);

function physicalStatesKm() {
  const t = sim.timeMs / 1000;
  const moonA = (t / MOON_PERIOD) * Math.PI * 2;
  const moonKm = new THREE.Vector3(Math.cos(moonA) * MOON_ORBIT_KM, 0, Math.sin(moonA) * MOON_ORBIT_KM)
    .applyAxisAngle(new THREE.Vector3(1, 0, 0), MOON_INC);
  const rotatingKm = hubbleTruthRotatingKm(sim.timeMs);
  const hubbleKm = rotatingKm
    ? new THREE.Vector3(rotatingKm.x, rotatingKm.y, rotatingKm.z)
    : hubbleLocalAt(sim.timeMs, false).multiplyScalar(KM_PER_LOCAL_UNIT);
  return { moonKm, hubbleKm };
}

function blockedBySphere(craftKm, bodyKm, radiusKm) {
  if (bodyKm.x >= craftKm.x) return false;
  const dy = craftKm.y - bodyKm.y;
  const dz = craftKm.z - bodyKm.z;
  return dy * dy + dz * dz < radiusKm * radiusKm;
}

function updateHubbleSunlight(dt) {
  const { moonKm, hubbleKm } = physicalStatesKm();
  const isSunlit = !(
    blockedBySphere(hubbleKm, new THREE.Vector3(), EARTH_RADIUS_KM)
    || blockedBySphere(hubbleKm, moonKm, MOON_RADIUS_KM)
  );
  const c = craft.hubble;
  if (isSunlit && !c.sunlit) c.pulse = 1;
  c.sunlit = isSunlit;
  c.pulse = Math.max(0, c.pulse - dt * 1.1);
  const pulse = Math.sin(c.pulse * Math.PI) * 0.72;
  c.material.opacity = isSunlit ? 1 : 0.48;
  if (c.glow) {
    c.glow.visible = true;
    c.glowMat.opacity = isSunlit ? 0.18 + pulse : 0.018;
    const base = c.sprite.scale.x || c.baseScale;
    c.glow.scale.setScalar(base * (isSunlit ? 1.65 + 0.85 * pulse : 1.45));
  }
}

function updateLocalState() {
  const t = sim.timeMs / 1000;
  const moonA = (t / MOON_PERIOD) * Math.PI * 2;
  const moonR = (MOON_ORBIT_KM / KM_PER_LOCAL_UNIT) * (sim.readable ? 1.45 : 1);
  moon.position.set(Math.cos(moonA) * moonR, 0, Math.sin(moonA) * moonR)
    .applyAxisAngle(new THREE.Vector3(1, 0, 0), MOON_INC);

  craft.hubble.group.position.copy(hubbleLocalAt(sim.timeMs, sim.readable));
  craft.webb.group.position.copy(webbLocalAt(sim.timeMs));
  craft.roman.group.position.copy(romanLocalAt(sim.timeMs));
}

function applyEarthTilt(parentTheta = 0) {
  earthTilt.quaternion.copy(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), parentTheta).multiply(tiltQ),
  );
}

function applyReferenceFrame() {
  const helio = sim.frame === 'heliocentric';
  const waveView = sim.view === 'heliofollow';
  sun.visible = helio;
  earthOrbit.visible = helio;
  l2GuideOrbit.visible = helio;
  waveGroup.visible = helio && $('trailToggle').checked;
  eclipticGrid.visible = waveView;
  $('solarWash').hidden = helio;
  $('geometryReadout').hidden = helio || sim.view === 'earth';
  $('l2InfoCard').hidden = sim.view !== 'l2';

  if (helio) {
    const t = sim.timeMs / 1000;
    const { theta, centre } = earthHelioState(t);
    earthSystem.position.copy(centre);
    earthSystem.rotation.set(0, -theta, 0);
    applyEarthTilt(theta);
    const scale = currentHelioScale();
    earthSystem.scale.setScalar(scale);
    earthTilt.scale.setScalar((waveView ? 0.24 : 0.14) / (0.72 * scale));
    craft.webb.sprite.scale.setScalar((waveView ? 0.48 : 0.30) / scale);
    craft.roman.sprite.scale.setScalar((waveView ? 0.44 : 0.28) / scale);
    craft.hubble.group.visible = false;
    moon.visible = false;
    moonTrail.visible = false;
    hubbleTrail.visible = false;
    l2.scale.setScalar((waveView ? 0.30 : 0.22) / scale);
    geometryLayer.visible = false;
    haloPlane.visible = false;
    haloGrid.visible = false;
    webbTrail.visible = false;
    romanTrail.visible = false;
    webbTube.visible = false;
    romanTube.visible = false;
    rebuildWavePaths();
  } else {
    earthSystem.position.set(0, 0, 0);
    earthSystem.rotation.set(0, 0, 0);
    earthSystem.scale.setScalar(1);
    earthTilt.scale.setScalar(1);
    applyEarthTilt(0);

    craft.hubble.group.visible = true;
    craft.hubble.sprite.scale.setScalar(craft.hubble.baseScale);
    craft.webb.sprite.scale.setScalar(craft.webb.baseScale);
    craft.roman.sprite.scale.setScalar(craft.roman.baseScale);
    l2.scale.setScalar(1);

    const local = sim.view === 'earth' || sim.view === 'system' || sim.focus === 'hubble';
    moon.visible = local;
    moonTrail.visible = local && $('trailToggle').checked;
    hubbleTrail.visible = local && $('trailToggle').checked;
    geometryLayer.visible = sim.view === 'system';
    haloPlane.visible = sim.view === 'l2';
    haloGrid.visible = sim.view === 'l2';
    webbTrail.visible = $('trailToggle').checked;
    romanTrail.visible = $('trailToggle').checked;
    webbTube.visible = $('trailToggle').checked;
    romanTube.visible = $('trailToggle').checked;
    waveGroup.visible = false;
    eclipticGrid.visible = false;
  }
}

const VIEWS = {
  system: {
    frame: 'rotating',
    pos: [2.8, 7.2, 31],
    target: [7.2, 0, 0],
    title: 'Earth–L2 rotating frame',
    blurb: 'Earth is fixed at the origin; +X points anti-sunward to L2. The warm light enters from the Sun-facing side.',
    readout: 'EARTH–L2 ROTATING',
  },
  earth: {
    frame: 'rotating',
    pos: [3.4, 2.4, 5.7],
    target: [0, 0, 0],
    title: 'Earth / Hubble',
    blurb: 'Earth’s spin axis is tilted 23.44° while Hubble repeatedly moves through sunlight and Earth shadow.',
    readout: 'EARTH-CENTRED · ROTATING DISPLAY',
  },
  l2: {
    frame: 'rotating',
    // Framed to contain Webb's real halo, which reaches about +/-800 000 km
    // out of the Sun-Earth line -- wider than the educational placeholder.
    pos: [30, 13, 24],
    target: [15, 0, 0],
    title: 'Sun–Earth L2 close-up',
    blurb: 'Webb and Roman are normally sunlit. L2 keeps Sun, Earth and Moon in roughly the same direction so the warm side can remain controlled.',
    readout: 'EARTH–L2 ROTATING · THERMAL GEOMETRY',
  },
  heliofollow: {
    frame: 'heliocentric',
    pos: null,
    target: null,
    title: 'L2 wave along the ecliptic',
    blurb: 'The camera travels with Earth while Webb and Roman remain in deliberate Sun-facing geometry around L2.',
    readout: 'HELIOCENTRIC · EARTH–L2 FOLLOW',
  },
  helio: {
    frame: 'heliocentric',
    pos: [0, 30, 36],
    target: [0, 0, 0],
    title: 'Heliocentric overview',
    blurb: 'The Sun is fixed while Earth keeps its 23.44° axial tilt and carries the L2 region around its orbit.',
    readout: 'HELIOCENTRIC INERTIAL DISPLAY',
  },
};

function setHelioFollowCamera() {
  const { radial, crossTrack, up, centre } = earthHelioState(sim.timeMs / 1000);
  const target = centre.clone().add(radial.clone().multiplyScalar(2.2));
  camera.position.copy(
    target.clone()
      .add(crossTrack.clone().multiplyScalar(-11))
      .add(up.clone().multiplyScalar(6.5))
      .add(radial.clone().multiplyScalar(-2.5)),
  );
  controls.target.copy(target);
  controls.update();
  sim.followAnchor = centre.clone();
}

function updateHelioFollowAnchor() {
  if (sim.view !== 'heliofollow') return;
  const centre = earthHelioState(sim.timeMs / 1000).centre;
  if (!sim.followAnchor) {
    sim.followAnchor = centre.clone();
    return;
  }
  const delta = centre.clone().sub(sim.followAnchor);
  camera.position.add(delta);
  controls.target.add(delta);
  sim.followAnchor.copy(centre);
}

function setView(name, focus = null) {
  const view = VIEWS[name];
  if (!view) return;
  sim.view = name;
  sim.frame = view.frame;
  sim.focus = focus;
  sim.followAnchor = null;
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  $('viewTitle').textContent = view.title;
  $('viewBlurb').textContent = view.blurb;
  $('frameReadout').textContent = view.readout;
  if (name === 'heliofollow') {
    setHelioFollowCamera();
  } else {
    camera.position.set(...view.pos);
    controls.target.set(...view.target);
    controls.update();
  }
  waveKey = '';
  applyReferenceFrame();
}

function focusCraft(name) {
  const coverage = jwstEphemeris.metadata;
  const info = {
    hubble: [
      'Hubble Space Telescope',
      hstPropagator.ready ? 'PROPAGATED · TLE / SGP4' : 'EDUCATIONAL FALLBACK',
      hstPropagator.ready
        ? 'Real orbital phase from the NORAD 20580 element set propagated with SGP4. TLE epoch 2026-08-29 20:39:49Z; 28.47° inclination, 94.03 min period. The warm rim disappears in Earth eclipse, so the effect represents changing illumination state.'
        : 'The SGP4 propagator did not load, so this is a labelled circular stand-in at Hubble’s altitude and inclination rather than a real orbital phase.',
    ],
    webb: [
      'James Webb Space Telescope',
      jwstEphemeris.ready ? 'HISTORICAL · JPL HORIZONS' : 'EDUCATIONAL FALLBACK',
      jwstEphemeris.ready
        ? `Real trajectory from the bundled JPL Horizons cache for target -170 (${coverage?.startTime ?? '2024'} to ${coverage?.stopTime ?? '2031'}, geocentric ecliptic), rotated into the Sun–Earth frame with same-epoch Horizons Sun vectors. Webb is not hiding in Earth’s shadow: the halo keeps it clear of prolonged Earth/Moon eclipses.`
        : 'The local JPL Horizons cache did not load, so the amber path is a clearly labelled educational halo rather than a claimed ephemeris.',
    ],
    roman: [
      'Nancy Grace Roman Space Telescope',
      'EDUCATIONAL',
      'Roman has no published operational ephemeris yet, so this quasi-halo is illustrative. It benefits from the same stable Sun–Earth L2 geometry and is normally sunlit.',
    ],
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
  const dist = sim.focus === 'hubble' ? 2.5 : 7.5;
  camera.position.lerp(p.clone().add(new THREE.Vector3(dist * 0.55, dist * 0.38, dist)), 0.055);
  controls.target.lerp(p, 0.085);
  if (sim.focus === 'hubble') craft.hubble.sprite.scale.setScalar(0.72);
}

function sliderToRate(v) {
  return 10 ** ((Number(v) / 1000) * LOG_RATE_MAX);
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
  refreshTrackedPaths();
  updateLocalState();
  updateHubbleSunlight(dt);
  updateHelioFollowAnchor();
  applyReferenceFrame();
  followTarget();
  controls.update();
  earth.rotation.y += dt * 0.018;
  moon.rotation.y += dt * 0.004;
  sun.rotation.y += dt * 0.006;
  renderer.render(scene, camera);
  $('utcReadout').textContent = new Date(sim.timeMs).toISOString().replace('T', ' ').replace('.000Z', 'Z');
  requestAnimationFrame(tick);
}

$('playBtn').addEventListener('click', () => {
  sim.playing = !sim.playing;
  $('playBtn').textContent = sim.playing ? 'Pause' : 'Play';
});
$('nowBtn').addEventListener('click', () => {
  sim.timeMs = Date.now();
  waveKey = '';
  refreshTrackedPaths(true);
});
$('rateSlider').addEventListener('input', setRateFromSlider);
$('scaleToggle').addEventListener('change', (e) => {
  sim.readable = e.target.checked;
  refreshLocalGeometry();
  refreshTrackedPaths(true);
  waveKey = '';
  applyReferenceFrame();
});
$('trailToggle').addEventListener('change', applyReferenceFrame);

document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
  sim.focus = null;
  $('focusCard').hidden = true;
  craft.hubble.sprite.scale.setScalar(craft.hubble.baseScale);
  setView(b.dataset.view);
}));

document.querySelectorAll('[data-focus]').forEach((b) => b.addEventListener('click', () => focusCraft(b.dataset.focus)));
$('closeFocus').addEventListener('click', () => {
  sim.focus = null;
  $('focusCard').hidden = true;
  craft.hubble.sprite.scale.setScalar(craft.hubble.baseScale);
});

$('rateSlider').value = String(rateToSlider(sim.rate));
setRateFromSlider();
setView('system');
requestAnimationFrame(tick);

// Real data sources load after the first frame so the scene never blocks on the
// network. Until they resolve, the labelled educational fallbacks are drawn.
document.documentElement.dataset.jwstEphemeris = 'loading';
loadJwstHorizonsCache().then((ok) => {
  document.documentElement.dataset.jwstEphemeris = ok ? 'ready' : 'fallback';
  if (!ok) {
    console.error('Bundled JWST Horizons cache unavailable; keeping the labelled educational halo.', jwstEphemeris.error);
  }
  waveKey = '';
  refreshTrackedPaths(true);
});
loadHstPropagator().then((ok) => {
  if (!ok) console.error('SGP4 propagator unavailable; keeping the labelled circular Hubble stand-in.', hstPropagator.error);
  refreshTrackedPaths(true);
});

// Read-only handle for the browser smoke test in scripts/smoke-jwst-wave.mjs.
window.__threeObservatories = {
  jwstEphemeris,
  hstPropagator,
  sim,
  webbLocalAt,
  hubbleLocalAt,
  /** Span and end-to-end closure of the drawn halo loop, for the smoke test. */
  webbLoop: () => ({ ...webbLoop }),
  /** Webb's Earth distance in km, from whichever source is currently drawn. */
  webbEarthDistanceKm: () => webbLocalAt(sim.timeMs).length() * KM_PER_LOCAL_UNIT,
  /** Webb's position in screenshot pixel coordinates, for on-path assertions. */
  webbScreenPixel: () => {
    const ndc = craft.webb.group.getWorldPosition(new THREE.Vector3()).project(camera);
    return {
      x: ((ndc.x + 1) / 2) * canvas.clientWidth,
      y: ((1 - ndc.y) / 2) * canvas.clientHeight,
      onScreen: Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && ndc.z < 1,
    };
  },
};
