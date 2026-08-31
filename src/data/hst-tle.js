// Hubble Space Telescope orbit source: NORAD catalog 20580 general perturbations
// element set, propagated with SGP4 (satellite.js).
//
// SGP4 output is TEME, not J2000 -- see docs/COORDINATES.md. The renderer treats
// it as mean-equator-of-J2000; the difference is a rotation about the pole of at
// most the equation of the equinoxes and is invisible at this scale.
//
// Layer rule (AGENTS.md): data/propagation only. No Three.js.

const SATELLITE_MODULE_URL = 'https://cdn.jsdelivr.net/npm/satellite.js@6.0.2/+esm';

// HST / NORAD 20580. GP element set, epoch 2026-08-29T20:39:49.726Z UTC.
export const HST_TLE_LINE_1 = '1 20580U 90037B   26241.86099220  .00006182  00000-0  18992-3 0  9994';
export const HST_TLE_LINE_2 = '2 20580  28.4729 296.7524 0001603 231.7887 128.2565 15.31502187799872';

// Mean motion 15.31502187 rev/day from line 2 -> 94.03 min per revolution.
export const HST_PERIOD_SECONDS = 86_400 / 15.31502187;

const state = { ready: false, error: null, satrec: null };

export async function loadHstPropagator() {
  try {
    const satellite = await import(/* @vite-ignore */ SATELLITE_MODULE_URL);
    state.satrec = satellite.twoline2satrec(HST_TLE_LINE_1, HST_TLE_LINE_2);
    state.propagate = satellite.propagate;
    state.ready = true;
    return true;
  } catch (error) {
    state.error = error;
    return false;
  }
}

export const hstPropagator = {
  get ready() {
    return state.ready;
  },
  get error() {
    return state.error;
  },
};

/** TEME position in km, or null when the propagator is unavailable. */
export function hstTemeKm(unixMs) {
  if (!state.ready) return null;
  const result = state.propagate(state.satrec, new Date(unixMs));
  const position = result?.position;
  if (!position || typeof position === 'boolean') return null;
  if (![position.x, position.y, position.z].every(Number.isFinite)) return null;
  return { x: position.x, y: position.y, z: position.z };
}
