// Roman's position against mission elapsed time, from the best source available
// at each instant.
//
// Three regimes, in decreasing order of authority:
//
//   1. MEASURED   NASA's published trajectory (JPL Horizons target -211), from
//                 T+34 min to the end of whatever JPL has published. Loaded at
//                 runtime from public/data/roman-horizons.json.
//   2. BRIDGE     A free CR3BP continuation of NASA's final measured state, with
//                 no manoeuvre invented. See roman-continuation.js.
//   3. MODEL      The pure CR3BP transfer of roman-transfer.js, used only when
//                 the cache is unavailable.
//
// Why this module exists: before Roman launched there was no measured data and
// the scenes read roman-transfer.js directly. Both scenes now go through here
// instead, so measured and modelled segments can never disagree between views.
//
// The regime boundary is not cosmetic. Comparing the two over the 28 days NASA
// publishes, the pure model tracked Roman's *distance* from Earth to within
// 2-5% but was up to 516 000 km away in *direction* -- the orientation of a
// transfer is set by launch azimuth and target halo, which no amount of
// first-principles integration recovers. So where NASA has data, it wins.
//
// Frame: ROT of src/physics/frames.js, kilometres. Layer rule (AGENTS.md): no
// Three.js here.

import { romanEphemeris, romanMeasuredRotKm } from '../data/roman-horizons.js';
import { ROMAN_LAUNCH_UTC } from '../data/roman-mission.js';
import { educationalRangeKm, romanTransferRotKm } from './roman-transfer.js';

/** Which source produced a position: 'measured', 'bridge' or 'model'. */
export const SOURCE = { MEASURED: 'measured', BRIDGE: 'bridge', MODEL: 'model' };

const state = { bridge: null };
const listeners = new Set();

/**
 * Register a callback for when the track's data changes -- in practice, when
 * the Horizons cache resolves and the measured span appears. Both Roman scenes
 * build their geometry once at load, before the fetch can have finished, so
 * without this the heliocentric view would keep drawing the pure model while
 * the geocentric view drew NASA's data.
 */
export function onTrackChanged(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Install the computed continuation of NASA's last measured state. Kept
 * injectable rather than imported so this module stays usable when the
 * ephemeris is missing and there is nothing to continue from.
 *
 * @param {{ startSeconds: number, at: (elapsedSeconds: number) => {x,y,z} }} bridge
 */
export function setBridge(bridge) {
  state.bridge = bridge;
  for (const listener of listeners) listener();
}

/** Mission elapsed seconds at the end of NASA's published coverage, or null. */
export function measuredEndSeconds() {
  const coverage = romanEphemeris.coverageMs;
  return coverage ? (coverage.stop - ROMAN_LAUNCH_UTC) / 1000 : null;
}

/** Mission elapsed seconds at the start of NASA's published coverage, or null. */
export function measuredStartSeconds() {
  const coverage = romanEphemeris.coverageMs;
  return coverage ? (coverage.start - ROMAN_LAUNCH_UTC) / 1000 : null;
}

/**
 * Roman's ROT position in km at `elapsedSeconds` since liftoff, with the source
 * that produced it.
 *
 * Before NASA's coverage begins -- the ascent, which no ephemeris covers -- the
 * modelled escape leg is rescaled so it meets the first measured point exactly.
 * Without that the path would step by a few thousand km at T+34 min.
 */
export function romanTrackRotKm(elapsedSeconds) {
  const measured = romanMeasuredRotKm(ROMAN_LAUNCH_UTC + elapsedSeconds * 1000);
  if (measured) return { ...measured, source: SOURCE.MEASURED };

  const start = measuredStartSeconds();
  if (start !== null && elapsedSeconds < start) {
    const anchor = romanMeasuredRotKm(ROMAN_LAUNCH_UTC + start * 1000);
    const modelledAnchor = romanTransferRotKm(start);
    const here = romanTransferRotKm(elapsedSeconds);
    const anchorRange = Math.hypot(modelledAnchor.x, modelledAnchor.y, modelledAnchor.z);
    // Ride the model's radial profile, but along the measured departure
    // direction and ending on the measured point.
    const fraction = anchorRange > 0
      ? Math.hypot(here.x, here.y, here.z) / anchorRange
      : 1;
    return {
      x: anchor.x * fraction,
      y: anchor.y * fraction,
      z: anchor.z * fraction,
      source: SOURCE.MEASURED,
    };
  }

  const { bridge } = state;
  if (bridge && elapsedSeconds >= bridge.startSeconds) {
    return { ...bridge.at(elapsedSeconds), source: SOURCE.BRIDGE };
  }
  return { ...romanTransferRotKm(elapsedSeconds), source: SOURCE.MODEL };
}

/**
 * `romanTrackRotKm` with the near-Earth exaggeration the scenes draw Earth at.
 * Render only -- readouts must use `romanTrackRotKm` and true kilometres.
 */
export function romanTrackRenderKm(elapsedSeconds, offsetKm, fadeKm) {
  const p = romanTrackRotKm(elapsedSeconds);
  const range = Math.hypot(p.x, p.y, p.z);
  if (range <= 0) return p;
  const scale = educationalRangeKm(range, offsetKm, fadeKm) / range;
  return { x: p.x * scale, y: p.y * scale, z: p.z * scale, source: p.source };
}

/** Mission elapsed seconds at the end of the drawn path. */
export function trackEndSeconds(fallbackSeconds) {
  const { bridge } = state;
  return bridge ? bridge.arrivalSeconds : fallbackSeconds;
}
