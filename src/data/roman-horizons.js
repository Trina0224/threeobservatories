// Loader for the bundled JPL Horizons ephemeris cache for Roman.
//
// Sibling of jwst-horizons.js. Produced by scripts/update-roman-ephemeris.mjs
// and committed so the page renders NASA's own trajectory without a live call.
//
//   target  -211 (Nancy Grace Roman Space Telescope) and 10 (Sun)
//   center  500@399 (Earth center)
//   plane   ECLIPTIC (mean ecliptic and equinox of J2000)
//   units   KM-S, timestamps stored as Unix seconds
//
// Coverage is short and will grow. Roman launched 2026-08-30 and JPL's first
// published product is a 28-day post-launch navigation prediction. The scene
// draws measured data where this cache reaches and the computed model beyond
// it, which is why `coverageMs` is part of the public surface rather than an
// internal detail: the render needs to know exactly where data stops.
//
// Layer rule (AGENTS.md): data loading and interpolation only. No Three.js.

import { toSunEarthRotating } from '../physics/frames.js';
import { sunGeocentricEclipticKm } from '../physics/sun-lowprecision.js';

const CACHE_URL = './public/data/roman-horizons.json';
const MINIMUM_SAMPLES = 24;

const state = {
  ready: false,
  error: null,
  metadata: null,
  roman: [],
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
 * Linear interpolation between adjacent samples. The cache steps every hour.
 * Roman is slowest far from Earth, where the chord error is negligible; the
 * fastest part is the first hour after separation, where the same hour of
 * chord spans a real curve. The scene compresses that hour anyway
 * (roman-timeline.js), so the error lands where nothing is being read off.
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

export async function loadRomanHorizonsCache() {
  try {
    const response = await fetch(CACHE_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`ephemeris cache returned HTTP ${response.status}`);
    const payload = await response.json();
    state.roman = parseSamples(payload.roman, 'Roman');
    state.sun = parseSamples(payload.sun, 'Sun');
    state.metadata = payload.source ?? null;
    state.ready = true;
    return true;
  } catch (error) {
    state.error = error;
    return false;
  }
}

export const romanEphemeris = {
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
    return { start: state.roman[0].ms, stop: state.roman[state.roman.length - 1].ms };
  },
  /** Sample count, for the on-screen provenance line. */
  get sampleCount() {
    return state.roman.length;
  },
};

/** Geocentric ecliptic Roman position in km, or null outside cache coverage. */
export function romanEclipticKm(unixMs) {
  return state.ready ? interpolate(state.roman, unixMs) : null;
}

/**
 * Roman's measured position in the ROT frame in km, or null outside coverage.
 * Uses the Sun samples from the same Horizons request so the spacecraft and the
 * frame it is expressed in come from one product; falls back to the documented
 * low-precision almanac only if the Sun rows run short of the Roman rows.
 */
export function romanMeasuredRotKm(unixMs) {
  const position = romanEclipticKm(unixMs);
  if (!position) return null;
  const sun = interpolate(state.sun, unixMs) ?? sunGeocentricEclipticKm(unixMs);
  return toSunEarthRotating(position, sun);
}
