// Loader for the bundled JPL Horizons ephemeris cache.
//
// The cache is produced by scripts/update-jwst-ephemeris.mjs and committed so
// the page renders a real trajectory without a live network call. Its header
// records publisher, target, center, reference plane, units and time scale;
// see docs/RESEARCH_SOURCES.md.
//
//   target  -170 (JWST) and 10 (Sun)
//   center  500@399 (Earth center)
//   plane   ECLIPTIC (mean ecliptic and equinox of J2000)
//   units   KM-S, timestamps stored as Unix seconds
//
// Layer rule (AGENTS.md): data loading and interpolation only. No Three.js.

import { sunGeocentricEclipticKm } from '../physics/sun-lowprecision.js';

const CACHE_URL = './public/data/jwst-horizons.json';
const MINIMUM_SAMPLES = 100;

const state = {
  ready: false,
  error: null,
  metadata: null,
  jwst: [],
  sun: [],
};

function parseSamples(rows, label) {
  if (!Array.isArray(rows) || rows.length < MINIMUM_SAMPLES) {
    throw new Error(`${label} cache has too few samples`);
  }
  const samples = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 4) continue;
    const [seconds, x, y, z] = row.map(Number);
    if (![seconds, x, y, z].every(Number.isFinite)) continue;
    samples.push({ ms: seconds * 1000, x, y, z });
  }
  if (samples.length < MINIMUM_SAMPLES) {
    throw new Error(`${label} cache did not contain usable vectors`);
  }
  return samples;
}

/**
 * Linear interpolation between adjacent samples. The cache steps every 12 h;
 * across that step the chord error on JWST's ~6 month halo is under ~50 km on a
 * ~800 000 km radius, which is far below one rendered pixel.
 */
function interpolate(samples, ms) {
  if (!samples.length || ms < samples[0].ms || ms > samples[samples.length - 1].ms) return null;
  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (samples[middle].ms <= ms) low = middle;
    else high = middle;
  }
  const before = samples[low];
  const after = samples[high];
  const span = after.ms - before.ms;
  const fraction = span > 0 ? (ms - before.ms) / span : 0;
  return {
    x: before.x + (after.x - before.x) * fraction,
    y: before.y + (after.y - before.y) * fraction,
    z: before.z + (after.z - before.z) * fraction,
  };
}

export async function loadJwstHorizonsCache() {
  try {
    const response = await fetch(CACHE_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`ephemeris cache returned HTTP ${response.status}`);
    const payload = await response.json();
    state.jwst = parseSamples(payload.jwst, 'JWST');
    state.sun = parseSamples(payload.sun, 'Sun');
    state.metadata = payload.source ?? null;
    state.ready = true;
    return true;
  } catch (error) {
    state.error = error;
    return false;
  }
}

export const jwstEphemeris = {
  get ready() {
    return state.ready;
  },
  get error() {
    return state.error;
  },
  get metadata() {
    return state.metadata;
  },
  get coverageMs() {
    if (!state.ready) return null;
    return { start: state.jwst[0].ms, stop: state.jwst[state.jwst.length - 1].ms };
  },
};

/** Geocentric ecliptic JWST position in km, or null outside cache coverage. */
export function jwstEclipticKm(unixMs) {
  return state.ready ? interpolate(state.jwst, unixMs) : null;
}

/**
 * Geocentric ecliptic Sun position in km. Prefers the same-epoch Horizons
 * samples so JWST and its reference frame come from one product, and falls back
 * to the documented low-precision almanac series outside cache coverage.
 */
export function sunEclipticKm(unixMs) {
  const cached = state.ready ? interpolate(state.sun, unixMs) : null;
  return cached ?? sunGeocentricEclipticKm(unixMs);
}
