// Re-derives Roman's L2 halo from scratch and checks the recorded state.
//
// src/missions/roman-halo.js ships the converged initial state as a constant so
// the page does not pay 100 ms to rediscover it on every load. That is only
// acceptable if something re-runs the derivation, which is this.
//
//   node scripts/check-roman-halo.mjs

import {
  HALO_PERIOD,
  HALO_STATE,
  SUN_EARTH_L2_KM,
  TARGET_AZ_KM,
  deriveHalo,
  romanHalo,
} from '../src/missions/roman-halo.js';

const AU_KM = 149_597_870.7;
const TIME_UNIT_SECONDS = (365.256363004 * 86400) / (2 * Math.PI);
const failures = [];

function check(name, condition, detail) {
  console.log(`${condition ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!condition) failures.push(name);
}

const derived = deriveHalo();
check('differential correction converges', derived !== null,
  derived ? `${derived.iterations} Newton iterations` : 'no solution');

if (derived) {
  // The shipped constants must be exactly what the derivation produces.
  check(
    'recorded period matches the re-derived one',
    Math.abs(derived.period - HALO_PERIOD) / HALO_PERIOD < 1e-9,
    `${(derived.period * TIME_UNIT_SECONDS / 86400).toFixed(4)} d derived`,
  );
  const worstStateDrift = Math.max(
    ...[0, 2, 4].map((i) => Math.abs(derived.state[i] - HALO_STATE[i])),
  );
  check(
    'recorded crossing state matches the re-derived one',
    worstStateDrift < 1e-12,
    `worst component differs by ${(worstStateDrift * AU_KM).toExponential(2)} km`,
  );
  check(
    'Richardson guess lands in the right amplitude range',
    derived.guess.axGamma * 0.01007824 * AU_KM > 50_000
      && derived.guess.axGamma * 0.01007824 * AU_KM < 2_000_000,
    `Ax ${Math.round(derived.guess.axGamma * 0.01007824 * AU_KM).toLocaleString()} km`,
  );
}

// The Sun-Earth L2 halo family runs near 180 days. A solution far from that is
// a different orbit, most likely the planar Lyapunov one the corrector falls
// onto when its crossing integration is too coarse.
const periodDays = romanHalo.periodSeconds / 86400;
check('period belongs to the Sun-Earth L2 halo family', Math.abs(periodDays - 180) < 8,
  `${periodDays.toFixed(2)} days`);

check('orbit closes on itself', romanHalo.closureKm < 5,
  `${romanHalo.closureKm.toFixed(3)} km after one period`);

// A halo has out-of-plane motion; the planar Lyapunov orbit does not. This is
// the check that distinguishes them.
check('orbit is a halo, not the planar Lyapunov orbit',
  romanHalo.amplitudeKm.north > 50_000,
  `north amplitude ${Math.round(romanHalo.amplitudeKm.north).toLocaleString()} km`);

check('amplitude is near the target', Math.abs(romanHalo.amplitudeKm.north - TARGET_AZ_KM) < 250_000,
  `${Math.round(romanHalo.amplitudeKm.north).toLocaleString()} km against ${TARGET_AZ_KM.toLocaleString()} aimed for`);

// The whole orbit must stay in the L2 region, not wander to Earth or beyond.
const ranges = romanHalo.samples.map((p) => Math.hypot(p.x - SUN_EARTH_L2_KM, p.y, p.z));
check('stays in the L2 region', Math.max(...ranges) < 1_000_000,
  `furthest ${Math.round(Math.max(...ranges)).toLocaleString()} km from L2`);

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nRoman halo checks passed.');
