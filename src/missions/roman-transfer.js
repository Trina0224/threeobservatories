// Roman's launch-to-L2 transfer, integrated rather than drawn.
//
// What this is: a Sun-Earth CR3BP trajectory on the stable manifold of the L2
// point, integrated backwards from L2 until it reaches its closest approach to
// Earth, with a Keplerian escape arc patched on for the leg from separation out
// to that point. Standard patched-conic practice, and every sample satisfies
// the equations of motion.
//
// What this is NOT: Roman's operational trajectory, and not even the same class
// of trajectory. A stable-manifold arc is a *low-energy* transfer: it arrives at
// L2 asymptotically with almost no relative velocity, and the price is that it
// loops sunward for the first days instead of heading straight out. Roman was
// injected directly by Falcon Heavy, which is a higher-energy design. Patching a
// direct Keplerian escape onto this arc was measured and rejected: the join needs
// 0.5-1.3 km/s, and a real mid-course correction is metres per second, so calling
// that a correction would be a fiction.
//
// NASA has published no post-launch ephemeris for Roman (see reference.md); SVS
// 5673 is a visual reference, not a data product. The accuracy label is
// LOW_ENERGY_CR3BP and the UI carries it, including the sunward loop caveat.
// This replaces a hand-tuned easing curve that satisfied no equations at all.
//
// Frame: results are returned in the ROT frame of src/physics/frames.js --
// origin Earth, +X anti-sunward toward L2, +Y ecliptic north, +Z = X cross Y --
// in kilometres, so the Roman scenes and the observatory scene share one
// convention. CR3BP's own axes are (x toward the secondary, y in-plane, z
// north), hence the (x, z, -y) shuffle at the boundary.

import { createCr3bp } from '../physics/cr3bp.js';
import { ROMAN_TRANSFER_SECONDS } from '../data/roman-mission.js';

// Sun-(Earth+Moon) mass parameter. The Moon is included with the Earth because
// the L2 point being targeted is the Sun-Earth/Moon-barycentre one.
const MU = 3.0034806e-6 * (1 + 0.0123000371);
const AU_KM = 149_597_870.7;
const SIDEREAL_YEAR_SECONDS = 365.256363004 * 86400;
const TIME_UNIT_SECONDS = SIDEREAL_YEAR_SECONDS / (2 * Math.PI);

// Earth gravitational parameter, km^3/s^2 (IAU/DE430 value) for the escape leg.
const EARTH_GM = 398_600.4418;
// Separation altitude: Falcon Heavy released Roman from a ~200 km park orbit.
const SEPARATION_RADIUS_KM = 6371 + 200;

// Out-of-plane offset at the L2 end. Sets the arrival's excursion from the
// ecliptic; Roman's operational quasi-halo is of this order.
const L2_OUT_OF_PLANE = 0.0010;      // AU
const INTEGRATION_STEPS = 4000;      // Jacobi drift ~1e-11 over the arc
const SEARCH_STEPS = 800;            // only used to time the arc, not to draw it
const SEARCH_ITERATIONS = 34;

const system = createCr3bp(MU);
const GAMMA = system.collinearGamma('L2');
const L2_X = system.secondaryX + GAMMA;
const LINEAR = system.collinearLinearisation(L2_X, GAMMA);

export const SUN_EARTH_L2_KM = GAMMA * AU_KM;

// Stable eigenvector of the linearised saddle: eigenvalue -lambda.
const STABLE_EIGENVECTOR = [1, -LINEAR.beta, 0, -LINEAR.lambda, LINEAR.beta * LINEAR.lambda, 0];

function seedState(epsilon) {
  return [
    L2_X + epsilon * STABLE_EIGENVECTOR[0],
    epsilon * STABLE_EIGENVECTOR[1],
    L2_OUT_OF_PLANE,
    epsilon * STABLE_EIGENVECTOR[3],
    epsilon * STABLE_EIGENVECTOR[4],
    0,
  ];
}

const earthRangeAu = (state) => Math.hypot(state[0] - system.secondaryX, state[1], state[2]);

/**
 * Integrate backwards from L2 and stop at the closest approach to Earth.
 * `collect` is off during the offset search, which runs this a few dozen times
 * and only needs the endpoint.
 */
function manifoldArc(epsilon, steps, collect = true) {
  const windowSeconds = 200 * 86400;
  const dt = -(windowSeconds / TIME_UNIT_SECONDS) / steps;
  let state = seedState(epsilon);
  const samples = collect ? [{ t: 0, state }] : null;
  let best = { range: earthRangeAu(state), index: 0, state };
  for (let i = 0; i < steps; i += 1) {
    state = system.step(state, dt);
    if (collect) samples.push({ t: -(i + 1) * dt * TIME_UNIT_SECONDS, state });
    const range = earthRangeAu(state);
    if (range < best.range) {
      best = { range, index: i + 1, state, t: -(i + 1) * dt * TIME_UNIT_SECONDS };
    }
  }
  return {
    samples: collect ? samples.slice(0, best.index + 1) : null,
    rangeKm: best.range * AU_KM,
    endState: best.state,
    endSeconds: best.t ?? 0,
  };
}

/**
 * Keplerian coast time from the separation radius out to `rangeKm`, on the
 * two-body orbit that has `speedKmS` at `rangeKm`. Radial approximation: the
 * escape leg is very nearly radial at this scale and this is only used to place
 * the CR3BP arc on the mission clock.
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

function arcSeconds(epsilon, steps) {
  const arc = manifoldArc(epsilon, steps, false);
  const speed = Math.hypot(arc.endState[3], arc.endState[4], arc.endState[5])
    * (AU_KM / TIME_UNIT_SECONDS);
  return arc.endSeconds + escapeCoastSeconds(arc.rangeKm, speed);
}

/**
 * Solve for the manifold offset that makes separation-to-L2 take exactly the
 * mission's transfer duration. More negative offsets start further along the
 * manifold and so arrive sooner; the relation is monotonic, so bisection in log
 * space converges in a few dozen cheap integrations.
 */
function solveEpsilon() {
  let low = -1e-3;
  let high = -1e-5;
  for (let i = 0; i < SEARCH_ITERATIONS; i += 1) {
    const mid = -Math.exp((Math.log(-low) + Math.log(-high)) / 2);
    if (arcSeconds(mid, SEARCH_STEPS) < ROMAN_TRANSFER_SECONDS) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function build() {
  const epsilon = solveEpsilon();
  const arc = manifoldArc(epsilon, INTEGRATION_STEPS);
  const last = arc.samples[arc.samples.length - 1];
  const departureSpeedKmS = Math.hypot(last.state[3], last.state[4], last.state[5])
    * (AU_KM / TIME_UNIT_SECONDS);
  const coastSeconds = escapeCoastSeconds(arc.rangeKm, departureSpeedKmS);

  // Samples ordered forward in mission time. `t` is seconds since liftoff.
  const samples = arc.samples
    .slice()
    .reverse()
    .map(({ t, state }) => ({
      t: coastSeconds + (last.t - t),
      // CR3BP (x toward Earth, y in-plane, z north) -> ROT (anti-sun, north, X cross Y)
      x: (state[0] - system.secondaryX) * AU_KM,
      y: state[2] * AU_KM,
      z: -state[1] * AU_KM,
    }));

  const jacobiStart = system.jacobi(arc.samples[0].state);
  const jacobiEnd = system.jacobi(last.state);

  return {
    samples,
    epsilon,
    coastSeconds,
    departureRangeKm: arc.rangeKm,
    departureSpeedKmS,
    arcSeconds: last.t,
    jacobiDrift: Math.abs(jacobiEnd - jacobiStart) / Math.abs(jacobiStart),
  };
}

export const romanTransfer = build();

/**
 * EDUCATIONAL_SCALE helper. Both Roman scenes draw Earth far larger than scale
 * so it reads at all -- 58 000 km of radius in the GSE view against Earth's real
 * 6371 km -- which buries the entire near-Earth leg inside the sphere. Push the
 * near field out by a fixed offset that decays to nothing by `fadeKm`, so the
 * departure clears the drawn Earth while the rest of the transfer keeps its true
 * proportions. The mapping is continuous and monotonic, it only touches the
 * render, and every distance readout still reports the true value.
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

/**
 * Roman's ROT position in km at `elapsedSeconds` since liftoff. Before the CR3BP
 * arc begins, the spacecraft is on the escape leg: interpolated along the
 * departure direction with the two-body speed profile, which is what the leg is.
 */
export function romanTransferRotKm(elapsedSeconds) {
  const { samples, coastSeconds, departureRangeKm } = romanTransfer;
  const first = samples[0];
  if (elapsedSeconds <= coastSeconds) {
    const u = coastSeconds > 0 ? Math.max(0, elapsedSeconds) / coastSeconds : 1;
    // Radius grows as the two-body coast does: near-parabolic, r ~ u^(2/3).
    const radius = SEPARATION_RADIUS_KM
      + (departureRangeKm - SEPARATION_RADIUS_KM) * u ** (2 / 3);
    const scale = radius / departureRangeKm;
    return { x: first.x * scale, y: first.y * scale, z: first.z * scale };
  }
  const last = samples[samples.length - 1];
  if (elapsedSeconds >= last.t) return { x: last.x, y: last.y, z: last.z };

  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (samples[mid].t <= elapsedSeconds) low = mid;
    else high = mid;
  }
  const a = samples[low];
  const b = samples[high];
  const span = b.t - a.t;
  const f = span > 0 ? (elapsedSeconds - a.t) / span : 0;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
}
