import * as THREE from 'three';

// Remove the obsolete translucent thermal cue planes while retaining the real L2 reference plane.
const originalAdd = THREE.Object3D.prototype.add;
THREE.Object3D.prototype.add = function (...objects) {
  return originalAdd.apply(this, objects.filter((obj) => {
    const p = obj?.geometry?.parameters;
    if (obj?.geometry?.type !== 'PlaneGeometry' || !p) return true;
    return !((Math.abs(p.width - 2) < 1e-6 && Math.abs(p.height - 1.15) < 1e-6)
      || (Math.abs(p.width - 1) < 1e-6 && Math.abs(p.height - 0.64) < 1e-6));
  }));
};

let lastScene = null;
const originalSceneAdd = THREE.Scene.prototype.add;
THREE.Scene.prototype.add = function (...objects) {
  lastScene = this;
  return originalSceneAdd.apply(this, objects);
};

await import('./main-core.js?v=20260830p');
// Freeze the Observatories scene before Roman's independent renderers can replace lastScene.
const observatoryScene = lastScene;

// main-core still knows how to build the old educational amber Webb wave. Refuse
// those fake tubes at the source; the real JPL/Horizons tube is created below.
const legacyWaveGroup = observatoryScene?.children.find((child) => child.isGroup && child.children.length === 0) || null;
if (legacyWaveGroup) {
  const legacyWaveAdd = legacyWaveGroup.add.bind(legacyWaveGroup);
  legacyWaveGroup.add = (...objects) => legacyWaveAdd(...objects.filter((obj) => {
    const color = obj?.material?.color?.getHex?.();
    return !(obj?.isMesh && obj?.geometry?.type === 'TubeGeometry' && color === 0xefb45d);
  }));
}

const satellite = await import('https://cdn.jsdelivr.net/npm/satellite.js@6.0.2/+esm');

// HST / NORAD 20580. Public GP/TLE epoch: 2026-08-29T20:39:49.726Z.
const HST_TLE1 = '1 20580U 90037B   26241.86099220  .00006182  00000-0  18992-3 0  9994';
const HST_TLE2 = '2 20580  28.4729 296.7524 0001603 231.7887 128.2565 15.31502187799872';
const hstSatrec = satellite.twoline2satrec(HST_TLE1, HST_TLE2);
const HST_READABLE_RADIUS = 1.05;
const KM_PER_LOCAL_UNIT = 100000;
const DAY_MS = 86400000;
const YEAR_S = 365.256363004 * 86400;
const AU_RENDER = 22;
const WAVE_LOCAL_SCALE = 0.24;
const eps = THREE.MathUtils.degToRad(23.44);
const CE = Math.cos(eps), SE = Math.sin(eps);
const truth = { jwst: [], sun: [], jwstReady: false, horizonsError: null };

function parseHorizonsVectors(text) {
  const a = text.indexOf('$$SOE'), b = text.indexOf('$$EOE');
  if (a < 0 || b < 0) throw new Error('Horizons response did not contain vector data');
  const rows = [];
  for (const raw of text.slice(a + 5, b).split(/\r?\n/)) {
    const p = raw.trim().split(',').map((v) => v.trim());
    if (p.length < 5) continue;
    const jd = Number(p[0]), x = Number(p[2]), y = Number(p[3]), z = Number(p[4]);
    if (![jd, x, y, z].every(Number.isFinite)) continue;
    rows.push({ ms: (jd - 2440587.5) * 86400000, v: new THREE.Vector3(x, y, z) });
  }
  if (rows.length < 10) throw new Error(`Horizons returned only ${rows.length} usable samples`);
  return rows;
}

function horizonsUrl(command) {
  const q = new URLSearchParams({
    format: 'text', COMMAND: `'${command}'`, OBJ_DATA: `'NO'`, MAKE_EPHEM: `'YES'`, EPHEM_TYPE: `'VECTORS'`,
    CENTER: `'500@399'`, START_TIME: `'2026-01-01'`, STOP_TIME: `'2027-12-31'`, STEP_SIZE: `'12 h'`,
    REF_PLANE: `'ECLIPTIC'`, VEC_TABLE: `'2'`, CSV_FORMAT: `'YES'`, OUT_UNITS: `'KM-S'`,
  });
  return `https://ssd.jpl.nasa.gov/api/horizons.api?${q}`;
}

async function loadHorizons() {
  try {
    const [j, s] = await Promise.all([fetch(horizonsUrl('-170')), fetch(horizonsUrl('10'))]);
    if (!j.ok || !s.ok) throw new Error(`Horizons HTTP ${j.status}/${s.status}`);
    truth.jwst = parseHorizonsVectors(await j.text());
    truth.sun = parseHorizonsVectors(await s.text());
    truth.jwstReady = true;
    refreshTruthTrails(true);
  } catch (error) {
    truth.horizonsError = error;
    console.warn('JWST Horizons ephemeris unavailable; no fake current Webb phase will be claimed.', error);
  }
}

function interpolate(samples, ms) {
  if (!samples.length || ms < samples[0].ms || ms > samples.at(-1).ms) return null;
  let lo = 0, hi = samples.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (samples[m].ms <= ms) lo = m; else hi = m; }
  const p = samples[lo], n = samples[hi];
  return p.v.clone().lerp(n.v, THREE.MathUtils.clamp((ms - p.ms) / (n.ms - p.ms), 0, 1));
}

function eqToEcl(v) { return new THREE.Vector3(v.x, CE * v.y + SE * v.z, -SE * v.y + CE * v.z); }
function basis(ms) {
  const sun = interpolate(truth.sun, ms); if (!sun) return null;
  const x = sun.clone().multiplyScalar(-1).normalize();
  const y = new THREE.Vector3(0, 0, 1);
  const z = new THREE.Vector3().crossVectors(y, x).normalize();
  return { x, y, z };
}
function toRotating(v, ms, scaled = true) {
  const b = basis(ms); if (!b) return null;
  const k = scaled ? 1 / KM_PER_LOCAL_UNIT : 1;
  return new THREE.Vector3(v.dot(b.x) * k, v.dot(b.y) * k, v.dot(b.z) * k);
}
function simMs() {
  const t = document.getElementById('utcReadout')?.textContent?.trim();
  const ms = t ? Date.parse(t.replace(' ', 'T')) : NaN;
  return Number.isFinite(ms) ? ms : Date.now();
}

function earthSystem() {
  return observatoryScene?.children.find((child) => {
    if (!child.isGroup) return false;
    let sprites = 0; child.traverse((o) => { if (o.isSprite) sprites++; });
    return sprites >= 3;
  }) || null;
}
function craftGroup(fragment) {
  const root = earthSystem(); if (!root) return null;
  let found = null;
  root.traverse((o) => {
    if (found || !o.isSprite) return;
    const src = o.material?.map?.image?.currentSrc || o.material?.map?.image?.src || '';
    if (src.includes(fragment)) found = o.parent;
  });
  return found;
}

let hstTrail = null, webbTrail = null, webbWaveTrail = null;
function ensureTrails() {
  const root = earthSystem(); if (!root) return false;
  if (!hstTrail) {
    hstTrail = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xdcecff, transparent: true, opacity: .72 }));
    hstTrail.userData.truthTrail = true; root.add(hstTrail);
  }
  if (!webbTrail) {
    webbTrail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xefb45d, transparent: true, opacity: .84 }));
    webbTrail.userData.truthTrail = true; root.add(webbTrail);
  }
  return true;
}
function hidePlaceholders() {
  observatoryScene?.traverse((o) => {
    if (o.userData?.truthTrail || !(o.isLineLoop || o.isLine || o.isMesh) || !o.material?.color) return;
    const c = o.material.color.getHex();
    if (c === 0xdcecff || c === 0xefb45d) o.visible = false;
  });
}

function hstPos(ms, readable) {
  const pv = satellite.propagate(hstSatrec, new Date(ms));
  if (!pv.position || typeof pv.position === 'boolean') return null;
  const ecl = eqToEcl(new THREE.Vector3(pv.position.x, pv.position.y, pv.position.z));
  let p = toRotating(ecl, ms, false);
  if (!p) p = new THREE.Vector3(ecl.x, ecl.z, ecl.y);
  p.multiplyScalar(readable ? HST_READABLE_RADIUS / p.length() : 1 / KM_PER_LOCAL_UNIT);
  return p;
}
function jwstPos(ms) {
  const v = truth.jwstReady ? interpolate(truth.jwst, ms) : null;
  return v ? toRotating(v, ms, true) : null;
}
function jwstWaveWorldPos(ms) {
  const local = jwstPos(ms);
  if (!local) return null;
  const theta = ((ms / 1000) / YEAR_S) * Math.PI * 2;
  const radial = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
  const tangent = new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta));
  const up = new THREE.Vector3(0, 1, 0);
  const centre = radial.clone().multiplyScalar(AU_RENDER);
  return centre
    .add(radial.clone().multiplyScalar(local.x * WAVE_LOCAL_SCALE))
    .add(up.multiplyScalar(local.y * WAVE_LOCAL_SCALE))
    .add(tangent.multiplyScalar(local.z * WAVE_LOCAL_SCALE));
}
function refreshHstTrail(ms, readable) {
  if (!ensureTrails()) return;
  const pts = [], period = 94.03 * 60 * 1000;
  for (let i = 0; i < 180; i++) { const p = hstPos(ms - period / 2 + i / 179 * period, readable); if (p) pts.push(p); }
  if (pts.length > 20) hstTrail.geometry.setFromPoints(pts);
}
function refreshWebbTrail(ms) {
  if (!truth.jwstReady || !ensureTrails()) return;
  const pts = [], half = 100 * DAY_MS;
  for (let i = 0; i < 260; i++) { const t = ms - half + i / 259 * half * 2; const p = jwstPos(t); if (p) pts.push(p); }
  if (pts.length > 20) webbTrail.geometry.setFromPoints(pts);
}
function refreshWebbWaveTrail(ms) {
  if (!truth.jwstReady || !observatoryScene) return;
  const pts = [], half = 182 * DAY_MS;
  for (let i = 0; i < 360; i++) {
    const t = ms - half + (i / 359) * half * 2;
    const p = jwstWaveWorldPos(t);
    if (p) pts.push(p);
  }
  if (pts.length <= 20) return;

  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const geometry = new THREE.TubeGeometry(curve, Math.max(360, pts.length * 2), 0.085, 7, false);
  if (!webbWaveTrail) {
    webbWaveTrail = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: 0xefb45d, transparent: true, opacity: 0.92, depthWrite: false }),
    );
    webbWaveTrail.userData.truthTrail = true;
    webbWaveTrail.renderOrder = 6;
    observatoryScene.add(webbWaveTrail);
  } else {
    webbWaveTrail.geometry.dispose();
    webbWaveTrail.geometry = geometry;
  }
}
function refreshTruthTrails(includeWave = false) {
  const ms = simMs(), readable = document.getElementById('scaleToggle')?.checked ?? true;
  refreshHstTrail(ms, readable);
  refreshWebbTrail(ms);
  if (includeWave) refreshWebbWaveTrail(ms);
}

let trailBucket = '', waveBucket = '';
function applyTruth() {
  const ms = simMs(), readable = document.getElementById('scaleToggle')?.checked ?? true;
  const view = document.querySelector('[data-view].active')?.dataset.view || 'system';
  const trails = document.getElementById('trailToggle')?.checked ?? true;
  const h = craftGroup('hubble.png'), w = craftGroup('jwst.png');
  if (h) { const p = hstPos(ms, readable); if (p) h.position.copy(p); }
  if (w && truth.jwstReady) { const p = jwstPos(ms); if (p) w.position.copy(p); }

  hidePlaceholders();
  ensureTrails();
  if (hstTrail) hstTrail.visible = trails && (view === 'earth' || view === 'system');
  if (webbTrail) webbTrail.visible = trails && (view === 'system' || view === 'l2') && truth.jwstReady;
  if (webbWaveTrail) webbWaveTrail.visible = trails && view === 'heliofollow' && truth.jwstReady;

  const bucket = `${Math.floor(ms / 3600000)}:${readable}:${truth.jwstReady}`;
  if (bucket !== trailBucket) {
    trailBucket = bucket;
    refreshHstTrail(ms, readable);
    refreshWebbTrail(ms);
  }
  const wb = `${Math.floor(ms / (7 * DAY_MS))}:${truth.jwstReady}`;
  if (view === 'heliofollow' && wb !== waveBucket) {
    waveBucket = wb;
    refreshWebbWaveTrail(ms);
  }
}

function sourceCopy() {
  document.querySelectorAll('[data-focus]').forEach((button) => button.addEventListener('click', () => queueMicrotask(() => {
    const info = document.getElementById('focusInfo'), mode = document.getElementById('focusMode');
    if (!info || !mode) return;
    if (button.dataset.focus === 'hubble') {
      mode.textContent = 'TLE / SGP4';
      info.textContent = 'Real orbital phase from NORAD 20580 TLE propagated with SGP4. TLE epoch: 2026-08-29 20:39:49Z; current GP orbit is about 470–472 km, 28.47°, 94.03 min.';
    } else if (button.dataset.focus === 'webb') {
      mode.textContent = truth.jwstReady ? 'JPL HORIZONS' : 'EPHEMERIS LOADING';
      info.textContent = truth.jwstReady
        ? 'Real position and local trajectory interpolated from JPL Horizons spacecraft -170, using Earth-centered ecliptic vectors and a same-epoch Sun vector to enter the rotating Sun–Earth frame.'
        : 'Loading JPL Horizons spacecraft -170. If Horizons is unreachable, this page does not label the old hand-drawn halo phase as current truth.';
    }
  })));
}

sourceCopy();
loadHorizons();
(function tickTruth() { applyTruth(); requestAnimationFrame(tickTruth); })();
