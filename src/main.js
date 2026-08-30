import * as THREE from 'three';

// Keep the renderer clean: suppress the obsolete translucent thermal cue planes
// while retaining the real L2 reference plane.
const originalAdd = THREE.Object3D.prototype.add;
THREE.Object3D.prototype.add = function (...objects) {
  const filtered = objects.filter((obj) => {
    const p = obj?.geometry?.parameters;
    if (obj?.geometry?.type !== 'PlaneGeometry' || !p) return true;
    const webbCue = Math.abs(p.width - 2.0) < 1e-6 && Math.abs(p.height - 1.15) < 1e-6;
    const romanCue = Math.abs(p.width - 1.0) < 1e-6 && Math.abs(p.height - 0.64) < 1e-6;
    return !(webbCue || romanCue);
  });
  return originalAdd.apply(this, filtered);
};

// Capture the Three.js scene created by the existing renderer so the truth-data
// layer can replace only spacecraft state/trails without rewriting the UI.
let capturedScene = null;
const originalSceneAdd = THREE.Scene.prototype.add;
THREE.Scene.prototype.add = function (...objects) {
  capturedScene = this;
  return originalSceneAdd.apply(this, objects);
};

await import('./main-core.js?v=20260830p');

const satellite = await import('https://cdn.jsdelivr.net/npm/satellite.js@6.0.2/+esm');

// HST: public GP/TLE for NORAD 20580, epoch 2026-08-29T20:39:49.726Z.
// Source provenance: CelesTrak current GP summary; TLE mirrored by Satcat.
const HST_TLE1 = '1 20580U 90037B   26241.86099220  .00006182  00000-0  18992-3 0  9994';
const HST_TLE2 = '2 20580  28.4729 296.7524 0001603 231.7887 128.2565 15.31502187799872';
const hstSatrec = satellite.twoline2satrec(HST_TLE1, HST_TLE2);
const EARTH_RADIUS_KM = 6371;
const HST_READABLE_RADIUS = 1.05;
const KM_PER_LOCAL_UNIT = 100000;
const OBLIQUITY = THREE.MathUtils.degToRad(23.44);
const C = Math.cos(OBLIQUITY);
const S = Math.sin(OBLIQUITY);

const truth = {
  jwst: [],
  sun: [],
  jwstReady: false,
  horizonsError: null,
};

function parseHorizonsVectors(text) {
  const start = text.indexOf('$$SOE');
  const stop = text.indexOf('$$EOE');
  if (start < 0 || stop < 0) throw new Error('Horizons response did not contain vector data');
  const rows = [];
  for (const raw of text.slice(start + 5, stop).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || !line.includes(',')) continue;
    const p = line.split(',').map((v) => v.trim());
    const jd = Number(p[0]);
    const x = Number(p[2]);
    const y = Number(p[3]);
    const z = Number(p[4]);
    if (![jd, x, y, z].every(Number.isFinite)) continue;
    rows.push({
      ms: (jd - 2440587.5) * 86400000,
      v: new THREE.Vector3(x, y, z),
    });
  }
  if (rows.length < 10) throw new Error(`Horizons returned only ${rows.length} usable samples`);
  return rows;
}

function horizonsUrl(command) {
  const params = new URLSearchParams({
    format: 'text',
    COMMAND: `'${command}'`,
    OBJ_DATA: `'NO'`,
    MAKE_EPHEM: `'YES'`,
    EPHEM_TYPE: `'VECTORS'`,
    CENTER: `'500@399'`,
    START_TIME: `'2026-01-01'`,
    STOP_TIME: `'2027-12-31'`,
    STEP_SIZE: `'12 h'`,
    REF_PLANE: `'ECLIPTIC'`,
    VEC_TABLE: `'2'`,
    CSV_FORMAT: `'YES'`,
    OUT_UNITS: `'KM-S'`,
  });
  return `https://ssd.jpl.nasa.gov/api/horizons.api?${params}`;
}

async function loadHorizons() {
  try {
    const [jwstRes, sunRes] = await Promise.all([
      fetch(horizonsUrl('-170'), { mode: 'cors' }),
      fetch(horizonsUrl('10'), { mode: 'cors' }),
    ]);
    if (!jwstRes.ok || !sunRes.ok) throw new Error(`Horizons HTTP ${jwstRes.status}/${sunRes.status}`);
    truth.jwst = parseHorizonsVectors(await jwstRes.text());
    truth.sun = parseHorizonsVectors(await sunRes.text());
    truth.jwstReady = true;
    refreshTruthTrails();
  } catch (error) {
    truth.horizonsError = error;
    console.warn('JWST Horizons ephemeris unavailable; leaving last renderer state visible.', error);
  }
}

function interpolate(samples, ms) {
  if (!samples.length || ms < samples[0].ms || ms > samples[samples.length - 1].ms) return null;
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].ms <= ms) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const q = THREE.MathUtils.clamp((ms - a.ms) / (b.ms - a.ms), 0, 1);
  return a.v.clone().lerp(b.v, q);
}

function equatorialToEcliptic(v) {
  return new THREE.Vector3(v.x, C * v.y + S * v.z, -S * v.y + C * v.z);
}

function rotatingBasis(ms) {
  const sun = interpolate(truth.sun, ms);
  if (!sun) return null;
  const antiSun = sun.clone().multiplyScalar(-1).normalize();
  const north = new THREE.Vector3(0, 0, 1);
  const tangent = new THREE.Vector3().crossVectors(north, antiSun).normalize();
  return { antiSun, north, tangent };
}

function eclipticKmToScene(v, ms, units = true) {
  const basis = rotatingBasis(ms);
  if (!basis) return null;
  const scale = units ? 1 / KM_PER_LOCAL_UNIT : 1;
  return new THREE.Vector3(
    v.dot(basis.antiSun) * scale,
    v.dot(basis.north) * scale,
    v.dot(basis.tangent) * scale,
  );
}

function simulatedMs() {
  const text = document.getElementById('utcReadout')?.textContent?.trim();
  const parsed = text ? Date.parse(text.replace(' ', 'T')) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function findEarthSystem() {
  if (!capturedScene) return null;
  return capturedScene.children.find((child) => {
    if (!child.isGroup) return false;
    let sprites = 0;
    child.traverse((o) => { if (o.isSprite) sprites += 1; });
    return sprites >= 3;
  }) || null;
}

function findCraftGroup(fragment) {
  const system = findEarthSystem();
  if (!system) return null;
  let found = null;
  system.traverse((o) => {
    if (found || !o.isSprite) return;
    const src = o.material?.map?.image?.currentSrc || o.material?.map?.image?.src || '';
    if (src.includes(fragment)) found = o.parent;
  });
  return found;
}

function hidePlaceholderTrails() {
  const system = findEarthSystem();
  if (!system) return;
  system.traverse((o) => {
    if (!(o.isLineLoop || o.isMesh) || !o.material?.color) return;
    const color = o.material.color.getHex();
    if (color === 0xdcecff || color === 0xefb45d) o.visible = false;
  });
}

let hstTrail = null;
let webbTruthTrail = null;

function ensureTruthTrails() {
  const system = findEarthSystem();
  if (!system) return false;
  if (!hstTrail) {
    hstTrail = new THREE.LineLoop(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xdcecff, transparent: true, opacity: 0.72 }),
    );
    hstTrail.userData.truthTrail = true;
    system.add(hstTrail);
  }
  if (!webbTruthTrail) {
    webbTruthTrail = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xefb45d, transparent: true, opacity: 0.84 }),
    );
    webbTruthTrail.userData.truthTrail = true;
    system.add(webbTruthTrail);
  }
  return true;
}

function hstScenePosition(ms, readable) {
  const pv = satellite.propagate(hstSatrec, new Date(ms));
  if (!pv.position || typeof pv.position === 'boolean') return null;
  const eq = new THREE.Vector3(pv.position.x, pv.position.y, pv.position.z);
  const ecl = equatorialToEcliptic(eq);
  const basis = rotatingBasis(ms);
  if (!basis) {
    const r = readable ? HST_READABLE_RADIUS / ecl.length() : 1 / KM_PER_LOCAL_UNIT;
    return new THREE.Vector3(ecl.x, ecl.z, ecl.y).multiplyScalar(r);
  }
  const local = eclipticKmToScene(ecl, ms, false);
  if (!local) return null;
  local.multiplyScalar(readable ? HST_READABLE_RADIUS / local.length() : 1 / KM_PER_LOCAL_UNIT);
  return local;
}

function jwstScenePosition(ms) {
  if (!truth.jwstReady) return null;
  const v = interpolate(truth.jwst, ms);
  return v ? eclipticKmToScene(v, ms, true) : null;
}

function refreshHstTrail(ms, readable) {
  if (!ensureTruthTrails()) return;
  const pts = [];
  const periodMs = 94.03 * 60 * 1000;
  for (let i = 0; i < 180; i++) {
    const p = hstScenePosition(ms - periodMs / 2 + (i / 179) * periodMs, readable);
    if (p) pts.push(p);
  }
  if (pts.length > 20) hstTrail.geometry.setFromPoints(pts);
}

function refreshWebbTrail(ms) {
  if (!truth.jwstReady || !ensureTruthTrails()) return;
  const pts = [];
  const half = 100 * 86400000;
  for (let i = 0; i < 260; i++) {
    const t = ms - half + (i / 259) * half * 2;
    const p = jwstScenePosition(t);
    if (p) pts.push(p);
  }
  if (pts.length > 20) webbTruthTrail.geometry.setFromPoints(pts);
}

let lastTrailBucket = '';
function refreshTruthTrails() {
  const ms = simulatedMs();
  const readable = document.getElementById('scaleToggle')?.checked ?? true;
  refreshHstTrail(ms, readable);
  refreshWebbTrail(ms);
}

function applyTruthState() {
  const ms = simulatedMs();
  const view = document.querySelector('[data-view].active')?.dataset.view || 'system';
  const readable = document.getElementById('scaleToggle')?.checked ?? true;
  const trailsOn = document.getElementById('trailToggle')?.checked ?? true;
  const hst = findCraftGroup('hubble.png');
  const webb = findCraftGroup('jwst.png');

  if (hst) {
    const p = hstScenePosition(ms, readable);
    if (p) hst.position.copy(p);
  }
  if (webb && truth.jwstReady) {
    const p = jwstScenePosition(ms);
    if (p) webb.position.copy(p);
  }

  hidePlaceholderTrails();
  ensureTruthTrails();
  if (hstTrail) hstTrail.visible = trailsOn && (view === 'earth' || view === 'system');
  if (webbTruthTrail) webbTruthTrail.visible = trailsOn && (view === 'system' || view === 'l2');

  const bucket = `${Math.floor(ms / 3600000)}:${readable}:${truth.jwstReady}`;
  if (bucket !== lastTrailBucket) {
    lastTrailBucket = bucket;
    refreshHstTrail(ms, readable);
    refreshWebbTrail(ms);
  }
}

function updateSourceCopy() {
  document.querySelectorAll('[data-focus]').forEach((button) => {
    button.addEventListener('click', () => {
      queueMicrotask(() => {
        const info = document.getElementById('focusInfo');
        const mode = document.getElementById('focusMode');
        if (!info || !mode) return;
        if (button.dataset.focus === 'hubble') {
          mode.textContent = 'TLE / SGP4';
          info.textContent = 'Live orbital phase from NORAD 20580 TLE propagated with SGP4. TLE epoch: 2026-08-29 20:39:49Z; current GP orbit is about 470–472 km, 28.47°, 94.03 min.';
        } else if (button.dataset.focus === 'webb') {
          mode.textContent = truth.jwstReady ? 'JPL HORIZONS' : 'EPHEMERIS LOADING';
          info.textContent = truth.jwstReady
            ? 'Position and local trajectory are interpolated from JPL Horizons spacecraft -170, Earth-centered ecliptic vectors. This replaces the previous hand-drawn halo phase.'
            : 'Loading JPL Horizons spacecraft -170 ephemeris. If the service is unavailable, the page keeps the last renderer state rather than claiming a fake current phase.';
        }
      });
    });
  });
}

updateSourceCopy();
loadHorizons();

function truthTick() {
  applyTruthState();
  requestAnimationFrame(truthTick);
}
requestAnimationFrame(truthTick);
