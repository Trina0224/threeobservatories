import * as THREE from 'three';

// Remove the obsolete translucent thermal cue planes while retaining the real
// L2 reference plane. Restore the shared add() implementation immediately after
// the observatory scene is constructed so Roman's independent scenes are not
// affected by this compatibility cleanup.
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

const satellite = await import('https://cdn.jsdelivr.net/npm/satellite.js@6.0.2/+esm');

// HST / NORAD 20580. Public GP/TLE epoch: 2026-08-29T20:39:49.726Z.
const HST_TLE1 = '1 20580U 90037B   26241.86099220  .00006182  00000-0  18992-3 0  9994';
const HST_TLE2 = '2 20580  28.4729 296.7524 0001603 231.7887 128.2565 15.31502187799872';
const hstSatrec = satellite.twoline2satrec(HST_TLE1, HST_TLE2);

const DAY_MS = 86_400_000;
const YEAR_SECONDS = 365.256363004 * 86_400;
const KM_PER_LOCAL_UNIT = 100_000;
const HST_READABLE_RADIUS = 1.05;
const AU_RENDER = 22;
const WAVE_LOCAL_SCALE = 0.24;
const OVERVIEW_LOCAL_SCALE = 0.055;
const AMBER_PLACEHOLDER = 0xefb45d;
const AMBER_TRUTH = 0xffc45f;
const HUBBLE_COLOR = 0xdcecff;
const OBLIQUITY = THREE.MathUtils.degToRad(23.44);
const COS_OBLIQUITY = Math.cos(OBLIQUITY);
const SIN_OBLIQUITY = Math.sin(OBLIQUITY);

const truth = {
  jwst: [],
  sun: [],
  jwstReady: false,
  cacheError: null,
  metadata: null,
};

let earthSystemCache = null;
const craftCache = new Map();
let hstTrail = null;
let webbLocalTube = null;
let webbWaveTube = null;
let webbOverviewTube = null;
let localTubePoints = [];
let waveTubePoints = [];
let overviewTubePoints = [];
let hstBucket = '';
let localBucket = '';
let heliocentricBucket = '';
let forceGeometryRefresh = true;

// main-core creates one direct scene group for the heliocentric Webb/Roman wave
// paths. It is empty before the first animation frame and is the only direct
// empty group in the observatory scene at this point.
const legacyWaveGroup = observatoryScene?.children.find(
  (child) => child.isGroup && child.children.length === 0,
) ?? null;

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
    const response = await fetch('./public/data/jwst-horizons.json?v=20260831a', {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`local ephemeris cache returned HTTP ${response.status}`);
    const document = await response.json();
    truth.jwst = rowsToSamples(document.jwst, 'JWST');
    truth.sun = rowsToSamples(document.sun, 'Sun');
    truth.metadata = document.source ?? null;
    truth.jwstReady = true;
    forceGeometryRefresh = true;
    document.documentElement.dataset.jwstEphemeris = 'ready';
    console.info(`Loaded ${truth.jwst.length} local JWST Horizons samples.`);
  } catch (error) {
    truth.cacheError = error;
    document.documentElement.dataset.jwstEphemeris = 'fallback';
    console.error('Bundled JWST ephemeris cache could not be loaded; retaining the educational fallback.', error);
  }
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

function hasJwstState(ms) {
  return truth.jwstReady
    && ms >= truth.jwst[0].ms
    && ms <= truth.jwst.at(-1).ms
    && ms >= truth.sun[0].ms
    && ms <= truth.sun.at(-1).ms;
}

function hasJwstWindow(startMs, endMs) {
  return truth.jwstReady
    && startMs >= truth.jwst[0].ms
    && endMs <= truth.jwst.at(-1).ms
    && startMs >= truth.sun[0].ms
    && endMs <= truth.sun.at(-1).ms;
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

function activeView() {
  return document.querySelector('[data-view].active')?.dataset.view || 'system';
}

function findEarthSystem() {
  if (earthSystemCache) return earthSystemCache;
  earthSystemCache = observatoryScene?.children.find((child) => {
    if (!child.isGroup) return false;
    let spriteCount = 0;
    child.traverse((object) => {
      if (object.isSprite) spriteCount += 1;
    });
    return spriteCount >= 3;
  }) ?? null;
  return earthSystemCache;
}

function findCraftGroup(filenameFragment) {
  if (craftCache.has(filenameFragment)) return craftCache.get(filenameFragment);
  const root = findEarthSystem();
  if (!root) return null;
  let found = null;
  root.traverse((object) => {
    if (found || !object.isSprite) return;
    const image = object.material?.map?.image;
    const source = image?.currentSrc || image?.src || '';
    if (source.includes(filenameFragment)) found = object.parent;
  });
  if (found) craftCache.set(filenameFragment, found);
  return found;
}

function isPathObject(object) {
  return Boolean(object?.isLine || object?.geometry?.type === 'TubeGeometry');
}

function setLegacyPathVisibility(jwstValid) {
  observatoryScene?.traverse((object) => {
    if (object.userData?.truthTrail || !isPathObject(object) || !object.material?.color) return;
    const color = object.material.color.getHex();

    if (color === HUBBLE_COLOR) {
      object.visible = false;
      return;
    }

    if (color !== AMBER_PLACEHOLDER) return;
    if (jwstValid) {
      object.visible = false;
    } else if (object.parent === legacyWaveGroup) {
      // Local placeholder visibility is reset by main-core every frame. The
      // legacy wave's child visibility is not, so explicitly restore it here.
      object.visible = true;
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
  if (!hasJwstState(ms)) return null;
  const vector = interpolate(truth.jwst, ms);
  return vector ? toRotatingFrame(vector, ms, true) : null;
}

function earthHeliocentricFrame(ms) {
  const theta = ((ms / 1000) / YEAR_SECONDS) * Math.PI * 2;
  return {
    radial: new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta)),
    tangent: new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta)),
  };
}

function jwstHeliocentricPosition(ms, localScale) {
  const local = jwstPosition(ms);
  if (!local) return null;
  const { radial, tangent } = earthHeliocentricFrame(ms);
  return radial.clone().multiplyScalar(AU_RENDER)
    .add(radial.clone().multiplyScalar(local.x * localScale))
    .add(new THREE.Vector3(0, local.y * localScale, 0))
    .add(tangent.multiplyScalar(local.z * localScale));
}

function makeSampleTimes(startMs, endMs, count, exactMs) {
  const values = Array.from({ length: count }, (_, index) => (
    startMs + (index / (count - 1)) * (endMs - startMs)
  ));
  if (exactMs > startMs && exactMs < endMs) values.push(exactMs);
  values.sort((a, b) => a - b);
  return values.filter((value, index) => index === 0 || value - values[index - 1] > 1);
}

function replaceTube(existing, points, {
  parent,
  radius,
  opacity,
  depthTest,
  renderOrder,
}) {
  if (points.length < 20) return existing;
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const geometry = new THREE.TubeGeometry(
    curve,
    Math.max(480, points.length * 2),
    radius,
    8,
    false,
  );

  if (!existing) {
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: AMBER_TRUTH,
        transparent: true,
        opacity,
        depthTest,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    mesh.userData.truthTrail = true;
    mesh.renderOrder = renderOrder;
    mesh.frustumCulled = false;
    parent.add(mesh);
    return mesh;
  }

  existing.geometry.dispose();
  existing.geometry = geometry;
  return existing;
}

function ensureHstTrail() {
  const root = findEarthSystem();
  if (!root || hstTrail) return;
  hstTrail = new THREE.LineLoop(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: HUBBLE_COLOR, transparent: true, opacity: 0.72 }),
  );
  hstTrail.userData.truthTrail = true;
  root.add(hstTrail);
}

function refreshHstTrail(ms, readable) {
  ensureHstTrail();
  if (!hstTrail) return;
  const points = [];
  const periodMs = 94.03 * 60 * 1000;
  for (let index = 0; index < 180; index += 1) {
    const sampleMs = ms - periodMs / 2 + (index / 179) * periodMs;
    const point = hstPosition(sampleMs, readable);
    if (point) points.push(point);
  }
  if (points.length > 20) hstTrail.geometry.setFromPoints(points);
}

function refreshWebbLocalTube(ms) {
  const root = findEarthSystem();
  if (!root) return false;
  const halfWindow = 110 * DAY_MS;
  const startMs = ms - halfWindow;
  const endMs = ms + halfWindow;
  if (!hasJwstWindow(startMs, endMs)) return false;

  const points = makeSampleTimes(startMs, endMs, 321, ms)
    .map((sampleMs) => jwstPosition(sampleMs))
    .filter(Boolean);
  if (points.length < 250) return false;

  localTubePoints = points;
  webbLocalTube = replaceTube(webbLocalTube, points, {
    parent: root,
    radius: 0.075,
    opacity: 0.92,
    depthTest: true,
    renderOrder: 5,
  });
  return true;
}

function currentYearWindow(ms) {
  const year = new Date(ms).getUTCFullYear();
  return {
    year,
    startMs: Date.UTC(year, 0, 1) - 5 * DAY_MS,
    endMs: Date.UTC(year + 1, 0, 1) + 5 * DAY_MS,
  };
}

function refreshWebbHeliocentricTubes(ms) {
  if (!observatoryScene) return false;
  const { startMs, endMs } = currentYearWindow(ms);
  if (!hasJwstWindow(startMs, endMs)) return false;

  const sampleTimes = makeSampleTimes(startMs, endMs, 421, ms);
  const wavePoints = [];
  const overviewPoints = [];
  for (const sampleMs of sampleTimes) {
    const wavePoint = jwstHeliocentricPosition(sampleMs, WAVE_LOCAL_SCALE);
    const overviewPoint = jwstHeliocentricPosition(sampleMs, OVERVIEW_LOCAL_SCALE);
    if (wavePoint && overviewPoint) {
      wavePoints.push(wavePoint);
      overviewPoints.push(overviewPoint);
    }
  }
  if (wavePoints.length < 350 || overviewPoints.length < 350) return false;

  waveTubePoints = wavePoints;
  overviewTubePoints = overviewPoints;
  webbWaveTube = replaceTube(webbWaveTube, wavePoints, {
    parent: observatoryScene,
    radius: 0.105,
    opacity: 0.98,
    depthTest: false,
    renderOrder: 100,
  });
  webbOverviewTube = replaceTube(webbOverviewTube, overviewPoints, {
    parent: observatoryScene,
    radius: 0.055,
    opacity: 0.94,
    depthTest: false,
    renderOrder: 100,
  });
  return true;
}

function closestPointDistance(point, points) {
  if (!point || !points.length) return null;
  let best = Infinity;
  for (const candidate of points) best = Math.min(best, point.distanceTo(candidate));
  return Number.isFinite(best) ? best : null;
}

function debugSnapshot() {
  const ms = simulatedMs();
  const view = activeView();
  const webb = findCraftGroup('jwst.png');
  let craftWorld = null;
  if (webb) {
    webb.updateWorldMatrix(true, false);
    craftWorld = webb.getWorldPosition(new THREE.Vector3());
  }

  let expectedWorld = null;
  let pathPoints = [];
  if (hasJwstState(ms)) {
    if (view === 'heliofollow') {
      expectedWorld = jwstHeliocentricPosition(ms, WAVE_LOCAL_SCALE);
      pathPoints = waveTubePoints;
    } else if (view === 'helio') {
      expectedWorld = jwstHeliocentricPosition(ms, OVERVIEW_LOCAL_SCALE);
      pathPoints = overviewTubePoints;
    } else {
      const local = jwstPosition(ms);
      const root = findEarthSystem();
      if (local && root) {
        root.updateWorldMatrix(true, false);
        expectedWorld = root.localToWorld(local.clone());
        pathPoints = localTubePoints.map((point) => root.localToWorld(point.clone()));
      }
    }
  }

  return {
    ms,
    view,
    valid: hasJwstState(ms),
    craftWorld: craftWorld?.toArray() ?? null,
    expectedWorld: expectedWorld?.toArray() ?? null,
    worldError: craftWorld && expectedWorld ? craftWorld.distanceTo(expectedWorld) : null,
    nearestPathControlPoint: craftWorld ? closestPointDistance(craftWorld, pathPoints) : null,
    visible: {
      local: Boolean(webbLocalTube?.visible),
      wave: Boolean(webbWaveTube?.visible),
      overview: Boolean(webbOverviewTube?.visible),
    },
  };
}

function applyTruthBeforeRender() {
  const ms = simulatedMs();
  const view = activeView();
  const readable = document.getElementById('scaleToggle')?.checked ?? true;
  const trailsEnabled = document.getElementById('trailToggle')?.checked ?? true;
  const jwstValid = hasJwstState(ms);

  const hst = findCraftGroup('hubble.png');
  if (hst) {
    const position = hstPosition(ms, readable);
    if (position) hst.position.copy(position);
  }

  const webb = findCraftGroup('jwst.png');
  if (webb && jwstValid) {
    const position = jwstPosition(ms);
    if (position) webb.position.copy(position);
  }

  setLegacyPathVisibility(jwstValid);
  ensureHstTrail();

  const nextHstBucket = `${Math.floor(ms / 3_600_000)}:${readable}`;
  if (forceGeometryRefresh || nextHstBucket !== hstBucket) {
    hstBucket = nextHstBucket;
    refreshHstTrail(ms, readable);
  }

  const nextLocalBucket = `${Math.floor(ms / (30 * DAY_MS))}:${jwstValid}`;
  if (forceGeometryRefresh || nextLocalBucket !== localBucket) {
    localBucket = nextLocalBucket;
    if (!refreshWebbLocalTube(ms) && webbLocalTube) webbLocalTube.visible = false;
  }

  const { year } = currentYearWindow(ms);
  const nextHeliocentricBucket = `${year}:${jwstValid}`;
  if (forceGeometryRefresh || nextHeliocentricBucket !== heliocentricBucket) {
    heliocentricBucket = nextHeliocentricBucket;
    if (!refreshWebbHeliocentricTubes(ms)) {
      if (webbWaveTube) webbWaveTube.visible = false;
      if (webbOverviewTube) webbOverviewTube.visible = false;
    }
  }
  forceGeometryRefresh = false;

  if (hstTrail) {
    hstTrail.visible = trailsEnabled && (view === 'earth' || view === 'system');
  }
  if (webbLocalTube) {
    webbLocalTube.visible = trailsEnabled
      && jwstValid
      && (view === 'system' || view === 'l2');
  }
  if (webbWaveTube) {
    webbWaveTube.visible = trailsEnabled && jwstValid && view === 'heliofollow';
  }
  if (webbOverviewTube) {
    webbOverviewTube.visible = trailsEnabled && jwstValid && view === 'helio';
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
        info.textContent = 'Real orbital phase from NORAD 20580 TLE propagated with SGP4. TLE epoch: 2026-08-29 20:39:49Z; integration-time orbit was about 470–472 km, 28.47°, 94.03 min.';
      } else if (button.dataset.focus === 'webb') {
        const ms = simulatedMs();
        const valid = hasJwstState(ms);
        mode.textContent = valid ? 'JPL HORIZONS CACHE' : 'EDUCATIONAL FALLBACK';
        info.textContent = valid
          ? `Real position and trajectory from the bundled JPL Horizons -170 cache (${truth.metadata?.startTime ?? '2024'} to ${truth.metadata?.stopTime ?? '2031'}), transformed with same-epoch Sun vectors into the rotating Sun–Earth frame.`
          : 'The selected date is outside the bundled Horizons validity range, so the old curve is shown only as an educational fallback rather than claimed current truth.';
      }
    }));
  });
}

// main-core renders before a separately scheduled requestAnimationFrame callback,
// which previously meant its placeholder spacecraft position won every visible
// frame. Apply truth state synchronously immediately before the observatory
// renderer draws instead.
const originalRender = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function (scene, camera) {
  if (scene === observatoryScene) applyTruthBeforeRender();
  return originalRender.call(this, scene, camera);
};

window.__threeObservatoriesTruth = {
  truth,
  debugSnapshot,
  forceRefresh() {
    forceGeometryRefresh = true;
  },
};

installSourceCopy();
loadEphemerisCache();
