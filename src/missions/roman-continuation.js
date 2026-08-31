// What Roman does after NASA's published trajectory ends.
//
// JPL's file for Roman is RST_EPH_PRED_NOMNVR_..., and NOMNVR is the important
// part: it contains no manoeuvres. It ends at 2026-Sep-27, about T+28 days,
// with Roman still on its way to L2. Something has to carry the drawn path from
// there to the L2 region.
//
// This module does the one thing that adds no invention: it takes NASA's own
// final state and integrates it forward in the Sun-Earth CR3BP with no burn at
// all. The result is continuous with the measured data by construction -- it
// starts from that data -- and every point after it satisfies the equations of
// motion and nothing else.
//
// What was tried instead, and rejected:
//
//   * The pure model transfer of roman-transfer.js. Compared against the 28
//     days NASA publishes it tracked the range to within 2-5% but was up to
//     516 000 km off in direction, and it starts from Earth rather than from
//     NASA's state, so joining the two left a half-million-kilometre step.
//   * Solving for a manoeuvre at the end of coverage that inserts onto the
//     computed halo. Targeting the halo's *position* converged at 15 m/s but
//     arrived with 379 m/s of velocity mismatch, which is not an insertion --
//     it crosses the halo and leaves. Targeting the halo's stable manifold,
//     the formulation that would coast on, did not converge at any amplitude
//     from 100 000 to 500 000 km. Publishing a fitted burn that NASA has not
//     announced would be inventing mission design, so none is drawn.
//
// The consequence, stated rather than hidden: with no insertion modelled, this
// arc reaches L2 and then departs along the unstable manifold, as any
// uninserted trajectory must. It is therefore drawn only as far as its closest
// approach to L2, near T+104 days, and the halo is drawn as a destination
// rather than as somewhere this path arrives.
//
// Frame: ROT of src/physics/frames.js, kilometres.

import { createCr3bp } from '../physics/cr3bp.js';
import { ROMAN_LAUNCH_UTC } from '../data/roman-mission.js';
import { romanEphemeris, romanMeasuredRotKm } from '../data/roman-horizons.js';
import { SUN_EARTH_L2_KM } from './roman-halo.js';

const MU = 3.0034806e-6 * (1 + 0.0123000371);
const AU_KM = 149_597_870.7;
const TIME_UNIT_SECONDS = (365.256363004 * 86400) / (2 * Math.PI);
const SEARCH_DAYS = 200;
const STEPS = 20_000;
const SAMPLE_STRIDE = 40;

const system = createCr3bp(MU);

const toRot = (state) => ({
  x: (state[0] - system.secondaryX) * AU_KM,
  y: state[2] * AU_KM,
  z: -state[1] * AU_KM,
});
const toCr3bp = (p) => [p.x / AU_KM + system.secondaryX, -p.z / AU_KM, p.y / AU_KM];

/**
 * NASA's final measured state as a CR3BP state vector.
 *
 * Velocity comes from a second-order one-sided difference of the *rotating
 * frame* positions rather than from Horizons' inertial velocities. The rotating
 * frame turns with Earth, and at 1.4 million km that rotation contributes about
 * 0.28 km/s against Roman's 0.24 km/s -- larger than the velocity itself. The
 * finite difference already contains it exactly, with no need to model the
 * frame's angular rate.
 */
function finalMeasuredState() {
  const coverage = romanEphemeris.coverageMs;
  if (!coverage) return null;
  const hour = 3_600_000;
  const at = (ms) => {
    const p = romanMeasuredRotKm(ms);
    return p && toCr3bp(p);
  };
  const b = at(coverage.stop);
  const a = at(coverage.stop - hour);
  const p = at(coverage.stop - 2 * hour);
  if (!b || !a || !p) return null;
  const dt = hour / 1000 / TIME_UNIT_SECONDS;
  return [...b, ...b.map((v, i) => (3 * v - 4 * a[i] + p[i]) / (2 * dt))];
}

/**
 * Integrate NASA's final state forward and stop at closest approach to L2.
 * Returns null when the ephemeris has not loaded, in which case callers fall
 * back to the pure model.
 */
export function buildRomanContinuation() {
  const state0 = finalMeasuredState();
  if (!state0) return null;
  const startSeconds = (romanEphemeris.coverageMs.stop - ROMAN_LAUNCH_UTC) / 1000;

  const dt = ((SEARCH_DAYS * 86400) / TIME_UNIT_SECONDS) / STEPS;
  let state = state0.slice();
  const samples = [{ t: startSeconds, ...toRot(state) }];
  let closest = { rangeKm: Infinity, index: 0, seconds: startSeconds, state: state0.slice() };

  for (let i = 1; i <= STEPS; i += 1) {
    state = system.step(state, dt);
    const rot = toRot(state);
    const seconds = startSeconds + i * dt * TIME_UNIT_SECONDS;
    samples.push({ t: seconds, ...rot });
    const toL2 = Math.hypot(rot.x - SUN_EARTH_L2_KM, rot.y, rot.z);
    if (toL2 < closest.rangeKm) closest = { rangeKm: toL2, index: i, seconds, state: state.slice() };
  }
  // Global minimum over the whole window, not the first turn. The arc moves
  // *away* from L2 for its first ten weeks -- out to about 870 000 km around
  // L+64 d -- before closing to its real approach near L+104 d. Stopping at the
  // first rise ends the path the moment it starts.

  const kept = samples.slice(0, closest.index + 1);
  const path = kept.filter((_, i) => i % SAMPLE_STRIDE === 0 || i === kept.length - 1);

  return {
    startSeconds,
    arrivalSeconds: closest.seconds,
    closestApproachKm: closest.rangeKm,
    path,
    // The Jacobi constant is the only integral of motion here, so its drift
    // across the arc is a direct measure of integration quality.
    jacobiDrift: Math.abs(system.jacobi(closest.state) - system.jacobi(state0))
      / Math.abs(system.jacobi(state0)),
    at(elapsedSeconds) {
      const last = path[path.length - 1];
      if (elapsedSeconds >= last.t) return { x: last.x, y: last.y, z: last.z };
      const first = path[0];
      if (elapsedSeconds <= first.t) return { x: first.x, y: first.y, z: first.z };
      let low = 0;
      let high = path.length - 1;
      while (high - low > 1) {
        const mid = (low + high) >> 1;
        if (path[mid].t <= elapsedSeconds) low = mid;
        else high = mid;
      }
      const a = path[low];
      const b = path[high];
      const span = b.t - a.t;
      const f = span > 0 ? (elapsedSeconds - a.t) / span : 0;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
    },
  };
}
