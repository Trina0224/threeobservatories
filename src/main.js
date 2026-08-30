import * as THREE from 'three';

// Remove the obsolete translucent thermal cue planes while retaining the real
// L2 reference plane. Restore the prototype immediately after the core scene is
// constructed so Roman's independent scenes are unaffected.
const originalObjectAdd = THREE.Object3D.prototype.add;
THREE.Object3D.prototype.add = function (...objects) {
  const filtered = objects.filter((object) => {
    const parameters = object?.geometry?.parameters;
    if (object?.geometry?.type !== 'PlaneGeometry' || !parameters) return true;
    const oldWebbCue = Math.abs(parameters.width - 2) < 1e-6
      && Math.abs(parameters.height - 1.15) < 1e-6;
    const oldRomanCue = Math.abs(parameters.width - 1) < 1e-6
      && Math.abs(parameters.height - 0.64) < 1e-6;
    return !(oldWebbCue || oldRomanCue);
  });
  return originalObjectAdd.apply(this, filtered);
};

let lastConstructedScene = null;
const originalSceneAdd = THREE.Scene.prototype.add;
THREE.Scene.prototype.add = function (...objects) {
  lastConstructedScene = this;
  return originalSceneAdd.apply(this, objects);
};

await import('./main-core.js?v=20260830p');
const observatoryScene = lastConstructedScene;
THREE.Object3D.prototype.add = originalObjectAdd;
THREE.Scene.prototype.add = originalSceneAdd;

// main-core owns one direct scene group for the heliocentric L2-wave paths. It
// is empty before that view is first opened. Keep it as an educational fallback
// until the bundled Horizons cache is ready, then reject only its old amber
// Webb tube while preserving Roman's projected purple path.
const legacyWaveGroup = observatoryScene?.children.find(
  (child) => child.isGroup && child.children.length === 0,
) ?? null;

const satellite = await import('https://cdn.jsdelivr.net/npm/satellite.js@6.0.2/+esm');

// HST / NORAD 20580. Public GP/TLE epoch: 2026-08-29T20:39:49.726Z.
const HST_TLE1 = '1 20580U 90037B   26241.86099220  .00006182  00000-0  18992-3 0  9994';
const HST_TLE2 = '2 20580  28.4729 296.7524 0001603 231.7887 128.2565 15.31502187799872';
const hstSatrec = satellite.twoline2satrec(HST_TLE1, HST_TLE2);

const HST_READABLE_RADIUS = 1.05;
const KM_PER_LOCAL_UNIT = 100_000;
const DAY_MS = 86_400_000;
const YEAR_SECONDS = 365.256363004 * 86_400;
const AU_RENDER = 22;
const WAVE_LOCAL_SCALE = 0.24;
const OBLIQUITY = THREE.MathUtils.degToRad(23.44);
const COS_OBLIQUITY = Math.cos(OBLIQUITY);
const SIN_OBLIQUITY = Math.sin(OBLIQUITY);
const AMBER_PLACEHOLDER = 0xefb45d;
const AMBER_TRUTH = 0xffc45f;

const truth = {
  jwst: [],
  sun: [],
  jwstReady: false,
  cacheError: null,
  metadata: null,
};

function rowsToSamples(rows, label) {
  if (!Array.isArray(rows) || rows.length < 100) {
    throw new Error(`${label} cache has too few samples`);
  }
  const samples = rows.map((row) => {
    if (!Array.isArray(row) || row.length < 4) return null;
    const [unixSeconds, x, y, z] = row.map(Number);
    if (![unixSeconds, x, y, z].every(Number.isFinite)) return null;
    return {
      ms: unixSeconds * 1000,
      vector: new THREE.Vector3(x, y, z),
    };
  }).filter(Boolean);
  if (samples.length < 100) throw new Error(`${label} cache did not contain usable vectors`);
  return samples;
}

async function loadEphemerisCache() {
  try {
    const response = await fetch('./public/data/jwst-horizons.json?v=20260830t', {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`local ephemeris cache returned HTTP ${response.status}`);
    const document = await response.json();
    truth.jwst = rowsToSamples(document.jwst, 'JWST');
    truth.sun = rowsToSamples(document.sun, 'Sun');
    truth.metadata = document.source ?? null;
    truth.jwstReady = true;
    disableLegacyWebbWave();
    refreshTruthTrails(true);
    documentElementState('ready');
    console.info(`Loaded ${truth.jwst.length} local JWST Horizons samples.`);
  } catch (error) {
    truth.cacheError = error;
    documentElementState('fallback');
    console.error('Bundled JWST ephemeris cache could not be loaded; retaining the labeled educational fallback.', error);
  }
}

function documentElementState(state) {
  document.documentElement.dataset.jwstEphemeris = state;
}

function isLegacyAmberTube(object) {
  return object?.isMesh
    && object?.geometry?.type === 'TubeGeometry'
    && object?.material?.color?.getHex?.() === AMBER_PLACEHOLDER;
}

function disableLegacyWebbWave() {
  if (!legacyWaveGroup || legacyWaveGroup.userData.webbTruthPatched) return;
  legacyWaveGroup.userData.webbTruthPatched = true;
  for (const child of legacyWaveGroup.children) {
    if (isLegacyAmberTube(child)) child.visible = false;
  }
  const originalWaveAdd = legacyWaveGroup.add.bind(legacyWaveGroup);
  legacyWaveGroup.add = (...objects) => originalWaveAdd(
    ...objects.filter((object) => !isLegacyAmberTube(object)),
  );
}

function interpolate(samples, ms) {
  if (!samples.length || ms < samples[0].ms || ms > samples.at(-1).ms) return null;
  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (samples[middle].ms <= ms) low = middle;
    else high = middle;
  }
  const before = samples[low];
  const after = samples[high];
  const fraction = THREE.MathUtils.clamp(
    (ms - before.ms) / (after.ms - before.ms),
    0,
    1,
  );
  return before.vector.clone().lerp(after.vector, fraction);
}

function equatorialToEcliptic(vector) {
  return new THREE.Vector3(
    vector.x,
    COS_OBLIQUITY * vector.y + SIN_OBLIQUITY * vector.z,
    -SIN_OBLIQUITY * vector.y + COS_OBLIQUITY * vector.z,
  );
}

function rotatingBasis(ms) {
  const sunVector = interpolate(truth.sun, ms);
  if (!sunVector) return null;
  const antiSun = sunVector.clone().multiplyScalar(-1).normalize();
  const eclipticNorth = new THREE.Vector3(0, 0, 1);
  const tangent = new THREE.Vector3().crossVectors(eclipticNorth, antiSun).normalize();
  return { antiSun, eclipticNorth, tangent };
}

function toRotatingFrame(vector, ms, scaled = true) {
  const basis = rotatingBasis(ms);
  if (!basis) return null;
  const scale = scaled ? 1 / KM_PER_LOCAL_UNIT : 1;
  return new THREE.Vector3(
    vector.dot(basis.antiSun) * scale,
    vector.dot(basis.eclipticNorth) * scale,
    vector.dot(basis.tangent) * scale,
  );
}

function simulatedMs() {
  const readout = document.getElementById('utcReadout')?.textContent?.trim();
  const parsed = readout ? Date.parse(readout.replace(' ', 'T')) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function findEarthSystem() {
  return observatoryScene?.children.find((child) => {
    if (!child.isGroup) return false;
    let spriteCount = 0;
    child.traverse((object) => {
      if (object.isSprite) spriteCount += 1;
    });
    return spriteCount >= 3;
  }) ?? null;
}

function findCraftGroup(filenameFragment) {
  const root = findEarthSystem();
  if (!root) return null;
  let found = null;
  root.traverse((object) => {
    if (found || !object.isSprite) return;
    const image = object.material?.map?.image;
    const source = image?.currentSrc || image?.src || '';
    if (source.includes(filenameFragment)) found = object.parent;
  });
  return found;
}

let hstTrail = null;
let webbLocalTrail = null;
let webbWaveTube = null;

function ensureLocalTruthTrails() {
  const root = findEarthSystem();
  if (!root) return false;

  if (!hstTrail) {
    hstTrail = new THREE.LineLoop(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xdcecff, transparent: true, opacity: 0.72 }),
    );
    hstTrail.userData.truthTrail = true;
    root.add(hstTrail);
  }

  if (!webbLocalTrail) {
    webbLocalTrail = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: AMBER_TRUTH, transparent: true, opacity: 0.9 }),
    );
    webbLocalTrail.userData.truthTrail = true;
    root.add(webbLocalTrail);
  }
  return true;
}

function hidePlaceholderTrails() {
  observatoryScene?.traverse((object) => {
    if (object.userData?.truthTrail || !object.material?.color) return;
    if (!(object.isLineLoop || object.isLine || object.isMesh)) return;
    const color = object.material.color.getHex();
    if (color === 0xdcecff || (truth.jwstReady && color === AMBER_PLACEHOLDER)) {
      object.visible = false;
    }
  });
}

function hstPosition(ms, readable) {
  const propagated = satellite.propagate(hstSatrec, new Date(ms));
  if (!propagated.position || typeof propagated.position === 'boolean') return null;
  const ecliptic = equatorialToEcliptic(new THREE.Vector3(
    propagated.position.x,
    propagated.position.y,
    propagated.position.z,
  ));
  let local = toRotatingFrame(ecliptic, ms, false);
  if (!local) local = new THREE.Vector3(ecliptic.x, ecliptic.z, ecliptic.y);
  local.multiplyScalar(readable ? HST_READABLE_RADIUS / local.length() : 1 / KM_PER_LOCAL_UNIT);
  return local;
}

function jwstPosition(ms) {
  if (!truth.jwstReady) return null;
  const vector = interpolate(truth.jwst, ms);
  return vector ? toRotatingFrame(vector, ms, true) : null;
}

function jwstWaveWorldPosition(ms) {
  const local = jwstPosition(ms);
  if (!local) return null;
  const theta = ((ms / 1000) / YEAR_SECONDS) * Math.PI * 2;
  const radial = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
  const tangent = new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta));
  const centre = radial.clone().multiplyScalar(AU_RENDER);
  return centre
    .add(radial.clone().multiplyScalar(local.x * WAVE_LOCAL_SCALE))
    .add(new THREE.Vector3(0, local.y * WAVE_LOCAL_SCALE, 0))
    .add(tangent.multiplyScalar(local.z * WAVE_LOCAL_SCALE));
}

function refreshHstTrail(ms, readable) {
  if (!ensureLocalTruthTrails()) return;
  const points = [];
  const periodMs = 94.03 * 60 * 1000;
  for (let i = 0; i < 180; i += 1) {
    const sampleMs = ms - periodMs / 2 + (i / 179) * periodMs;
    const point = hstPosition(sampleMs, readable);
    if (point) points.push(point);
  }
  if (points.length > 20) hstTrail.geometry.setFromPoints(points);
}

function refreshWebbLocalTrail(ms) {
  if (!truth.jwstReady || !ensureLocalTruthTrails()) return;
  const points = [];
  const halfWindow = 100 * DAY_MS;
  for (let i = 0; i < 260; i += 1) {
    const sampleMs = ms - halfWindow + (i / 259) * halfWindow * 2;
    const point = jwstPosition(sampleMs);
    if (point) points.push(point);
  }
  if (points.length > 20) webbLocalTrail.geometry.setFromPoints(points);
}

function refreshWebbWaveTube(ms) {
  if (!truth.jwstReady || !observatoryScene) return;
  const points = [];
  const halfWindow = 182 * DAY_MS;
  for (let i = 0; i < 420; i += 1) {
    const sampleMs = ms - halfWindow + (i / 419) * halfWindow * 2;
    const point = jwstWaveWorldPosition(sampleMs);
    if (point) points.push(point);
  }
  if (points.length < 100) return;

  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const geometry = new THREE.TubeGeometry(curve, 840, 0.105, 8, false);
  if (!webbWaveTube) {
    webbWaveTube = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: AMBER_TRUTH,
        transparent: true,
        opacity: 0.98,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    webbWaveTube.userData.truthTrail = true;
    webbWaveTube.renderOrder = 100;
    webbWaveTube.frustumCulled = false;
    observatoryScene.add(webbWaveTube);
  } else {
    webbWaveTube.geometry.dispose();
    webbWaveTube.geometry = geometry;
  }
}

function refreshTruthTrails(includeWave = false) {
  const ms = simulatedMs();
  const readable = document.getElementById('scaleToggle')?.checked ?? true;
  refreshHstTrail(ms, readable);
  refreshWebbLocalTrail(ms);
  if (includeWave) refreshWebbWaveTube(ms);
}

let localTrailBucket = '';
let waveTrailBucket = '';

function applyTruthState() {
  const ms = simulatedMs();
  const readable = document.getElementById('scaleToggle')?.checked ?? true;
  const activeView = document.querySelector('[data-view].active')?.dataset.view || 'system';
  const trailsEnabled = document.getElementById('trailToggle')?.checked ?? true;

  const hst = findCraftGroup('hubble.png');
  const webb = findCraftGroup('jwst.png');
  if (hst) {
    const position = hstPosition(ms, readable);
    if (position) hst.position.copy(position);
  }
  if (webb && truth.jwstReady) {
    const position = jwstPosition(ms);
    if (position) webb.position.copy(position);
  }

  hidePlaceholderTrails();
  ensureLocalTruthTrails();

  if (hstTrail) {
    hstTrail.visible = trailsEnabled && (activeView === 'earth' || activeView === 'system');
  }
  if (webbLocalTrail) {
    webbLocalTrail.visible = trailsEnabled
      && truth.jwstReady
      && (activeView === 'system' || activeView === 'l2');
  }
  if (webbWaveTube) {
    webbWaveTube.visible = trailsEnabled
      && truth.jwstReady
      && activeView === 'heliofollow';
  }

  const localBucket = `${Math.floor(ms / 3_600_000)}:${readable}:${truth.jwstReady}`;
  if (localBucket !== localTrailBucket) {
    localTrailBucket = localBucket;
    refreshHstTrail(ms, readable);
    refreshWebbLocalTrail(ms);
  }

  const waveBucket = `${Math.floor(ms / (7 * DAY_MS))}:${truth.jwstReady}`;
  if (activeView === 'heliofollow' && waveBucket !== waveTrailBucket) {
    waveTrailBucket = waveBucket;
    refreshWebbWaveTube(ms);
  }
}

function installSourceCopy() {
  document.querySelectorAll('[data-focus]').forEach((button) => {
    button.addEventListener('click', () => queueMicrotask(() => {
      const info = document.getElementById('focusInfo');
      const mode = document.getElementById('focusMode');
      if (!info || !mode) return;

      if (button.dataset.focus === 'hubble') {
        mode.textContent = 'TLE / SGP4';
        info.textContent = 'Real orbital phase from NORAD 20580 TLE propagated with SGP4. TLE epoch: 2026-08-29 20:39:49Z; current GP orbit is about 470–472 km, 28.47°, 94.03 min.';
      } else if (button.dataset.focus === 'webb') {
        mode.textContent = truth.jwstReady ? 'JPL HORIZONS CACHE' : 'EDUCATIONAL FALLBACK';
        info.textContent = truth.jwstReady
          ? `Real position and trajectory from the bundled JPL Horizons -170 cache (${truth.metadata?.startTime ?? '2025'} to ${truth.metadata?.stopTime ?? '2028'}), transformed with same-epoch Sun vectors into the rotating Sun–Earth frame.`
          : 'The local JPL Horizons cache did not load, so the amber path is the clearly labeled educational fallback rather than a claimed current ephemeris.';
      }
    }));
  });
}

window.__threeObservatoriesTruth = { truth, refreshTruthTrails };
installSourceCopy();
loadEphemerisCache();

(function truthAnimationFrame() {
  applyTruthState();
  requestAnimationFrame(truthAnimationFrame);
}());
