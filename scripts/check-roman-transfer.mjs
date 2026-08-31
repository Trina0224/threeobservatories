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
  solveEpsilon,
} from '../src/missions/roman-transfer.js';
import { romanHalo } from '../src/missions/roman-halo.js';

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

const arrivalL2 = Math.hypot(
  romanTransferRotKm(TRANSFER_DAYS * DAY).x - SUN_EARTH_L2_KM,
  romanTransferRotKm(TRANSFER_DAYS * DAY).y,
  romanTransferRotKm(TRANSFER_DAYS * DAY).z,
);
check(
  'arrives inside the L2 region',
  arrivalL2 < 800_000,
  `${Math.round(arrivalL2).toLocaleString()} km from L2`,
);

// A transfer that doubles back on its Earth range early is either a bug or a
// very different mission. Checked over the outbound leg only: once it reaches
// the halo the range oscillates, which is what a halo does.
let previous = -Infinity;
let monotonic = true;
let worst = 0;
for (let day = 0; day <= 30; day += 0.05) {
  const p = romanTransferRotKm(day * DAY);
  const range = Math.hypot(p.x, p.y, p.z);
  if (range < previous) {
    monotonic = false;
    worst = Math.max(worst, previous - range);
  }
  previous = range;
}
check('Earth range increases over the outbound leg', monotonic, monotonic ? '' : `drops by ${Math.round(worst)} km`);

// The whole point of building the transfer from the halo's manifold rather than
// the L2 point's: it has to end on the halo. With the point manifold this gap
// was 287 635 km, which is what the picture showed.
const arrival = romanTransferRotKm(TRANSFER_DAYS * DAY);
const gapToHalo = Math.min(...romanHalo.samples.map(
  (p) => Math.hypot(p.x - arrival.x, p.y - arrival.y, p.z - arrival.z),
));
check('arrival lands on the halo', gapToHalo < 80_000,
  `${Math.round(gapToHalo).toLocaleString()} km from the nearest halo point`);

// A direct Earth-to-L2 injection leaves anti-sunward and stays that way. The
// earlier construction, off the L2 point's manifold, looped sunward for days.
const earlyX = romanTransferRotKm(2 * DAY).x;
check('departs anti-sunward and stays there', earlyX > 0,
  `x = ${Math.round(earlyX).toLocaleString()} km at L+2d`);

// Perigee speed should correspond to a real launch injection, not an arbitrary
// state: slightly sub-escape, the C3 an L2 mission is launched on.
const c3 = romanTransfer.perigeeSpeedKmS ** 2 - (2 * 398_600.4418) / romanTransfer.perigeeKm;
check('perigee is a plausible L2 injection', c3 > -2 && c3 < 0.5,
  `C3 ${c3.toFixed(2)} km²/s² at ${Math.round(romanTransfer.perigeeKm).toLocaleString()} km`);

// The recorded displacement must be what the solver actually produces.
const solved = solveEpsilon();
check('recorded manifold displacement matches the re-solved one',
  Math.abs(solved - romanTransfer.epsilon) / Math.abs(romanTransfer.epsilon) < 5e-3,
  `${solved.toExponential(4)} re-solved`);

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
