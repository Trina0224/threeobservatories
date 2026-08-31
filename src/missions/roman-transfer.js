// Roman's launch-to-L2 transfer, integrated rather than drawn.
//
// It is the stable manifold *of the halo orbit*, not of the L2 point. That
// distinction is the whole reason this file was rewritten: the manifold of the
// point converges to the point, so a transfer built from it ended 288 000 km
// away from the drawn halo -- two different objects sharing a picture. The
// manifold of the halo converges onto the halo itself, so the transfer meets
// its destination by construction rather than by fitting.
//
// Construction:
//   1. Take the converged halo from roman-halo.js and its monodromy matrix.
//   2. Power-iterate the backward monodromy for the stable direction.
//   3. Displace the halo state along it and integrate backwards. That is the
//      manifold branch that falls toward Earth; the other branch goes outward.
//   4. Stop at perigee, and solve for the displacement that makes the whole
//      thing take the mission's 90 days.
//   5. Patch a Keplerian escape leg from separation up to that perigee. It uses
//      the perigee state's own two-body energy, so the join is exact -- unlike
//      the point-manifold version, where matching a direct escape needed a
//      fictitious 0.5-1.3 km/s.
//
// The resulting departure is anti-sunward from the first hours, with a perigee
// speed that works out to about 11 km/s at the separation altitude and a C3 of
// roughly -0.4 km^2/s^2. That is the real class of Earth-to-L2 injection.
//
// What it is NOT: Roman's flown trajectory. NASA has published no post-launch
// ephemeris for Roman (reference.md); SVS 5673 is a visual reference, not a
// data product. Accuracy label: CR3BP_EDUCATIONAL_MODEL.
//
// Frame: results are in the ROT frame of src/physics/frames.js -- origin Earth,
// +X anti-sunward, +Y ecliptic north, +Z = X cross Y -- in kilometres.

import { createCr3bp } from '../physics/cr3bp.js';
import { dominantEigenvector, monodromy } from '../physics/halo.js';
import { HALO_PERIOD, HALO_STATE, SUN_EARTH_L2_KM } from './roman-halo.js';
import { ROMAN_TRANSFER_SECONDS } from '../data/roman-mission.js';

const MU = 3.0034806e-6 * (1 + 0.0123000371);
const AU_KM = 149_597_870.7;
const TIME_UNIT_SECONDS = (365.256363004 * 86400) / (2 * Math.PI);
const EARTH_GM = 398_600.4418;                 // km^3/s^2
const SEPARATION_RADIUS_KM = 6371 + 200;       // ~200 km park orbit

// Stable eigenvector of the halo's monodromy, from the backward flow. Recorded
// rather than derived on load: the six finite-difference integrations cost about
// 80 ms and never change. scripts/check-roman-transfer.mjs re-derives it in CI.
const STABLE_DIRECTION = [0.257319, 0.239967, -0.025064, -0.777265, -0.487702, 0.183251];

// Displacement along the stable direction that puts separation-to-arrival at the
// mission's 90 days. Recorded rather than solved on load, like the halo state
// and the eigenvector above; scripts/check-roman-transfer.mjs re-solves it.
const EPSILON = -7.025400542427104e-4;
const SEARCH_STEPS = 6_000;
const ARC_STEPS = 64_000;   // the arc passes 30 000 km from Earth, where a coarse step costs accuracy
const SAMPLE_STRIDE = 20;   // integrate finely, store coarsely: the arc is smooth
// Drawn past arrival so the path visibly settles onto the halo. One period
// contracts the remaining offset by the unstable eigenvalue, about 1484x.
const SETTLE_PERIODS = 1;

export { SUN_EARTH_L2_KM };

const system = createCr3bp(MU);

function seedState(epsilon) {
  return HALO_STATE.map((value, i) => value + epsilon * STABLE_DIRECTION[i]);
}

const earthRangeAu = (state) => Math.hypot(state[0] - system.secondaryX, state[1], state[2]);

/** Integrate backwards off the halo and stop at the closest approach to Earth. */
function manifoldArc(epsilon, steps, collect = true) {
  const windowSeconds = 320 * 86400;
  const dt = -(windowSeconds / TIME_UNIT_SECONDS) / steps;
  let state = seedState(epsilon);
  const samples = collect ? [{ t: 0, state }] : null;
  let best = { range: earthRangeAu(state), state, seconds: 0, index: 0 };
  for (let i = 0; i < steps; i += 1) {
    state = system.step(state, dt);
    const seconds = -(i + 1) * dt * TIME_UNIT_SECONDS;
    if (collect) samples.push({ t: seconds, state });
    const range = earthRangeAu(state);
    if (range < best.range) best = { range, state, seconds, index: i + 1 };
    if (range * AU_KM > 4e6) break;
  }
  return {
    samples: collect ? samples.slice(0, best.index + 1) : null,
    rangeKm: best.range * AU_KM,
    endState: best.state,
    endSeconds: best.seconds,
  };
}

/**
 * Keplerian coast from the separation radius out to `rangeKm`, on the two-body
 * orbit that has `speedKmS` there. The manifold hands over at near-escape
 * energy, so this is the same conic the launch vehicle actually flies.
 */
function escapeCoastSeconds(rangeKm, speedKmS) {
  const energy = (speedKmS * speedKmS) / 2 - EARTH_GM / rangeKm;
  const steps = 4000;
  let seconds = 0;
  for (let i = 0; i < steps; i += 1) {
    const r = SEPARATION_RADIUS_KM + ((i + 0.5) / steps) * (rangeKm - SEPARATION_RADIUS_KM);
    const speed = Math.sqrt(Math.max(1e-6, 2 * (energy + EARTH_GM / r)));
    seconds += ((rangeKm - SEPARATION_RADIUS_KM) / steps) / speed;
  }
  return seconds;
}

const speedKmS = (state) => Math.hypot(state[3], state[4], state[5]) * (AU_KM / TIME_UNIT_SECONDS);

function totalSeconds(epsilon, steps) {
  const arc = manifoldArc(epsilon, steps, false);
  return arc.endSeconds + escapeCoastSeconds(arc.rangeKm, speedKmS(arc.endState));
}

/**
 * Solve for the displacement along the manifold that makes separation-to-halo
 * take the mission's transfer duration. Larger displacements start further off
 * the halo and so reach Earth sooner; monotonic, so bisection in log space works.
 */
function solveEpsilon() {
  let low = -3e-3;
  let high = -1e-6;
  for (let i = 0; i < 40; i += 1) {
    const mid = -Math.exp((Math.log(-low) + Math.log(-high)) / 2);
    if (totalSeconds(mid, SEARCH_STEPS) < ROMAN_TRANSFER_SECONDS) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

const toRot = (state) => ({
  // CR3BP (x toward Earth, y in-plane, z north) -> ROT (anti-sun, north, X cross Y)
  x: (state[0] - system.secondaryX) * AU_KM,
  y: state[2] * AU_KM,
  z: -state[1] * AU_KM,
});

export { solveEpsilon };

function build() {
  const epsilon = EPSILON;
  const arc = manifoldArc(epsilon, ARC_STEPS);
  const perigee = arc.samples[arc.samples.length - 1];
  const coastSeconds = escapeCoastSeconds(arc.rangeKm, speedKmS(perigee.state));

  // Manifold arc, ordered forward in mission time from the perigee. Stored at a
  // stride: 45 000 integration steps are about accuracy, not about how many
  // points a smooth curve needs.
  const ordered = arc.samples.slice().reverse();
  const samples = ordered
    .filter((_, i) => i % SAMPLE_STRIDE === 0 || i === ordered.length - 1)
    .map(({ t, state }) => ({ t: coastSeconds + (perigee.t - t), ...toRot(state) }));

  // Continue past arrival so the drawn path visibly merges into the halo
  // instead of stopping short of it.
  const settleSeconds = SETTLE_PERIODS * HALO_PERIOD * TIME_UNIT_SECONDS;
  const settleSteps = 900;
  const dt = (SETTLE_PERIODS * HALO_PERIOD) / settleSteps;
  let state = seedState(epsilon);
  const arrivalT = samples[samples.length - 1].t;
  const settle = [];
  for (let i = 1; i <= settleSteps; i += 1) {
    state = system.step(state, dt);
    settle.push({ t: arrivalT + (i / settleSteps) * settleSeconds, ...toRot(state) });
  }

  return {
    samples,
    settle,
    epsilon,
    coastSeconds,
    arcSeconds: perigee.t,
    perigeeKm: arc.rangeKm,
    perigeeSpeedKmS: speedKmS(perigee.state),
    haloOffsetKm: Math.abs(epsilon) * Math.hypot(...STABLE_DIRECTION.slice(0, 3)) * AU_KM,
    jacobiDrift: Math.abs(system.jacobi(perigee.state) - system.jacobi(seedState(epsilon)))
      / Math.abs(system.jacobi(seedState(epsilon))),
    settledOffsetKm: Math.hypot(
      state[0] - HALO_STATE[0], state[1] - HALO_STATE[1], state[2] - HALO_STATE[2],
    ) * AU_KM,
  };
}

export const romanTransfer = build();

/** The transfer plus its settling arc, for drawing one continuous path. */
export const romanTransferPath = [...romanTransfer.samples, ...romanTransfer.settle];

/**
 * Roman's ROT position in km at `elapsedSeconds` since liftoff. Before the
 * manifold arc begins the spacecraft is on the escape leg, interpolated along
 * the departure direction with the two-body radius profile.
 */
export function romanTransferRotKm(elapsedSeconds) {
  const { samples, coastSeconds, perigeeKm } = romanTransfer;
  const first = samples[0];
  if (elapsedSeconds <= coastSeconds) {
    const u = coastSeconds > 0 ? Math.max(0, elapsedSeconds) / coastSeconds : 1;
    const radius = SEPARATION_RADIUS_KM + (perigeeKm - SEPARATION_RADIUS_KM) * u ** (2 / 3);
    const scale = radius / perigeeKm;
    return { x: first.x * scale, y: first.y * scale, z: first.z * scale };
  }
  const path = romanTransferPath;
  const last = path[path.length - 1];
  if (elapsedSeconds >= last.t) return { x: last.x, y: last.y, z: last.z };

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
}

/**
 * EDUCATIONAL_SCALE helper. Both Roman scenes draw Earth far larger than scale,
 * which buries the near-Earth leg inside the sphere. Push the near field out by
 * an offset that decays to nothing by `fadeKm`. Render only; readouts use true
 * kilometres.
 */
export function educationalRangeKm(trueRangeKm, offsetKm, fadeKm) {
  if (trueRangeKm >= fadeKm) return trueRangeKm;
  return offsetKm + trueRangeKm * (1 - offsetKm / fadeKm);
}

/** `romanTransferRotKm` with the near-Earth exaggeration applied. */
export function romanTransferRenderKm(elapsedSeconds, offsetKm, fadeKm) {
  const p = romanTransferRotKm(elapsedSeconds);
  const range = Math.hypot(p.x, p.y, p.z);
  if (range <= 0) return p;
  const scale = educationalRangeKm(range, offsetKm, fadeKm) / range;
  return { x: p.x * scale, y: p.y * scale, z: p.z * scale };
}
