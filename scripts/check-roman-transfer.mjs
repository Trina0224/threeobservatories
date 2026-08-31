// Numerical checks on the integrated Roman transfer.
//
// docs/SPEC.md section 8: a code path is not complete because it builds a
// Three.js object. This asserts the physics behind the drawn path, in Node, with
// no browser: the CR3BP is only worth having if its answers are checkable.
//
//   node scripts/check-roman-transfer.mjs

import {
  SUN_EARTH_L2_KM,
  romanTransfer,
  romanTransferRotKm,
} from '../src/missions/roman-transfer.js';

const DAY = 86400;
const TRANSFER_DAYS = 90;
const failures = [];

function check(name, condition, detail) {
  console.log(`${condition ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!condition) failures.push(name);
}

// Sun-Earth L2 is a published ~1.5 million km from Earth. The quintic solve is
// independent of everything else here, so it is the first thing to be wrong.
check(
  'L2 distance matches the published value',
  Math.abs(SUN_EARTH_L2_KM - 1_500_000) / 1_500_000 < 0.01,
  `${Math.round(SUN_EARTH_L2_KM).toLocaleString()} km`,
);

// The Jacobi constant is the only integral of motion in the CR3BP, so its drift
// is the honest measure of the integration.
check(
  'Jacobi constant is conserved across the arc',
  romanTransfer.jacobiDrift < 1e-9,
  `relative drift ${romanTransfer.jacobiDrift.toExponential(2)}`,
);

const totalDays = (romanTransfer.coastSeconds + romanTransfer.arcSeconds) / DAY;
check(
  'transfer takes the mission duration',
  Math.abs(totalDays - TRANSFER_DAYS) < 1,
  `${totalDays.toFixed(2)} d against ${TRANSFER_DAYS}`,
);

check(
  'departure starts at the separation altitude',
  Math.abs(Math.hypot(...Object.values(romanTransferRotKm(0))) - 6571) < 50,
  `${Math.round(Math.hypot(...Object.values(romanTransferRotKm(0)))).toLocaleString()} km`,
);

const arrival = romanTransferRotKm(TRANSFER_DAYS * DAY);
const arrivalL2 = Math.hypot(arrival.x - SUN_EARTH_L2_KM, arrival.y, arrival.z);
check(
  'arrives inside the L2 region',
  arrivalL2 < 300_000,
  `${Math.round(arrivalL2).toLocaleString()} km from L2`,
);

// A transfer that doubles back on its Earth range is either a bug or a very
// different mission; either way the renderer should not show it silently.
let previous = -Infinity;
let monotonic = true;
let worst = 0;
for (let day = 0; day <= TRANSFER_DAYS; day += 0.05) {
  const p = romanTransferRotKm(day * DAY);
  const range = Math.hypot(p.x, p.y, p.z);
  if (range < previous) {
    monotonic = false;
    worst = Math.max(worst, previous - range);
  }
  previous = range;
}
check('Earth range increases throughout', monotonic, monotonic ? '' : `drops by ${Math.round(worst)} km`);

// The sunward loop is a documented property of a low-energy transfer, not an
// accident. Assert it so nobody "fixes" it into a different trajectory without
// also changing the label the UI shows.
const earlyX = romanTransferRotKm(2 * DAY).x;
check(
  'low-energy arc loops sunward early, as labelled',
  earlyX < 0,
  `x = ${Math.round(earlyX).toLocaleString()} km at L+2d`,
);

check(
  'samples are ordered in time',
  romanTransfer.samples.every((s, i, all) => i === 0 || s.t > all[i - 1].t),
  `${romanTransfer.samples.length} samples`,
);

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nRoman transfer checks passed.');
