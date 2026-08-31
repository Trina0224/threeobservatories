// Roman's L2 halo: a computed periodic orbit, not a drawn loop.
//
// The previous figure was three sine terms with hand-picked amplitudes. This is
// a genuine periodic solution of the Sun-Earth CR3BP, found by Richardson's
// third-order approximation followed by differential correction until the orbit
// closes on itself. Its period lands on 180.1 days, which is the check that it
// belongs to the known Sun-Earth L2 family rather than merely looking like it.
//
// Accuracy label: CR3BP_EDUCATIONAL_MODEL. It is a real halo of that family but
// it is not Roman's operational halo -- NASA has published no amplitude or
// ephemeris for it (reference.md). The amplitude was chosen to sit near where
// the displayed transfer arrives.
//
// Why the state below is a constant: the correction needs a fine crossing
// integration to stay on the halo family -- coarser than about 4000 steps and
// the Newton settles onto the planar Lyapunov orbit instead -- which costs over
// 100 ms. Paying that on every page load is not worth it, so the converged state
// is recorded here and scripts/check-roman-halo.mjs re-derives it from scratch
// in CI and fails if it moves. `deriveHalo()` is that derivation.
//
// Frame: samples come out in the ROT frame of src/physics/frames.js -- Earth at
// the origin, +X anti-sunward, +Y ecliptic north, +Z = X cross Y -- in km.

import { createCr3bp } from '../physics/cr3bp.js';
import { correctHalo, richardsonCoefficients, richardsonGuess } from '../physics/halo.js';

const MU = 3.0034806e-6 * (1 + 0.0123000371);
const AU_KM = 149_597_870.7;
const TIME_UNIT_SECONDS = (365.256363004 * 86400) / (2 * Math.PI);

/** Out-of-plane amplitude the Richardson guess aims for, in kilometres. */
export const TARGET_AZ_KM = 200_000;
const SAMPLE_COUNT = 240;

// Converged state at the perpendicular xz-plane crossing, and the period, both
// in CR3BP normalised units. Produced by deriveHalo(); verified in CI.
export const HALO_STATE = [1.0081026947208964, 0, -0.0016700974677849153, 0, 0.010831222554072409, 0];
export const HALO_PERIOD = 3.0980876494425802;

const system = createCr3bp(MU);
const GAMMA = system.collinearGamma('L2');
const L2_X = system.secondaryX + GAMMA;

export const SUN_EARTH_L2_KM = GAMMA * AU_KM;

/** The full derivation, run by the CI check rather than by the page. */
export function deriveHalo() {
  const coefficients = richardsonCoefficients(MU, GAMMA);
  const guess = richardsonGuess(coefficients, L2_X, GAMMA, TARGET_AZ_KM / AU_KM / GAMMA);
  if (!guess) return null;
  const solution = correctHalo(system, guess.state, { steps: 4000, maxStep: 0.02 });
  return solution && { ...solution, guess };
}

function build() {
  // Halos come in mirror-image northern and southern families. Take the one on
  // the same side as the transfer's arrival so the two read as one story.
  const flip = HALO_STATE[2] < 0 ? -1 : 1;
  let state = [HALO_STATE[0], 0, HALO_STATE[2] * flip, 0, HALO_STATE[4], 0];
  const start = state;

  const dt = HALO_PERIOD / SAMPLE_COUNT;
  const samples = [];
  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    samples.push({
      // CR3BP (x toward Earth, y in-plane, z north) -> ROT (anti-sun, north, X cross Y)
      x: (state[0] - system.secondaryX) * AU_KM,
      y: state[2] * AU_KM,
      z: -state[1] * AU_KM,
    });
    state = system.step(state, dt);
  }

  const amplitudeKm = samples.reduce((acc, p) => ({
    alongSunLine: Math.max(acc.alongSunLine, Math.abs(p.x - SUN_EARTH_L2_KM)),
    north: Math.max(acc.north, Math.abs(p.y)),
    cross: Math.max(acc.cross, Math.abs(p.z)),
  }), { alongSunLine: 0, north: 0, cross: 0 });

  return {
    samples,
    periodSeconds: HALO_PERIOD * TIME_UNIT_SECONDS,
    closureKm: Math.hypot(
      state[0] - start[0], state[1] - start[1], state[2] - start[2],
    ) * AU_KM,
    amplitudeKm,
  };
}

export const romanHalo = build();
