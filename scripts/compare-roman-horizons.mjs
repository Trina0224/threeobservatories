// Compares the computed Roman transfer against NASA's own predicted ephemeris.
//
// Horizons carries Roman as NAIF id -211 ("Nancy Grace Roman Space Telescope"),
// with a post-launch predicted trajectory file
// RST_EPH_PRED_NOMNVR_2026242_2026270_01 covering 2026-Aug-30 12:00 to
// 2026-Sep-27 11:57 TDB. That is the first 28 days of the transfer -- exactly
// the part this repository draws from a CR3BP manifold rather than from data.
//
// This runs in CI because the authoring session cannot reach ssd.jpl.nasa.gov.
//
//   node scripts/compare-roman-horizons.mjs
//
// It prints the two trajectories side by side in the ROT frame and the
// separation between them. It asserts nothing: the point is to measure how far
// the model is from the real flight path, not to make the model pass.

import { toSunEarthRotating } from '../src/physics/frames.js';
import { romanTransferRotKm } from '../src/missions/roman-transfer.js';
import { ROMAN_LAUNCH_UTC } from '../src/data/roman-mission.js';

const ENDPOINT = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const START = '2026-08-30 12:00';
const STOP = '2026-09-27 11:00';
const STEP = '1 h';

async function vectors(command, label) {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: `'${command}'`,
    OBJ_DATA: `'NO'`,
    MAKE_EPHEM: `'YES'`,
    EPHEM_TYPE: `'VECTORS'`,
    CENTER: `'500@399'`,
    START_TIME: `'${START}'`,
    STOP_TIME: `'${STOP}'`,
    STEP_SIZE: `'${STEP}'`,
    REF_PLANE: `'ECLIPTIC'`,
    VEC_TABLE: `'2'`,
    CSV_FORMAT: `'YES'`,
    OUT_UNITS: `'KM-S'`,
  });
  const response = await fetch(`${ENDPOINT}?${params}`, {
    headers: { 'User-Agent': 'threeobservatories-compare/1.0', Accept: 'application/json' },
  });
  const payload = await response.json();
  if (payload.error) throw new Error(`${label}: ${payload.error}`);
  const text = payload.result;
  const start = text.indexOf('$$SOE');
  const end = text.indexOf('$$EOE');
  if (start < 0 || end < 0) throw new Error(`${label}: no vector table\n${text.slice(0, 2000)}`);
  const rows = [];
  for (const line of text.slice(start + 5, end).split(/\r?\n/)) {
    const p = line.trim().split(',').map((v) => v.trim());
    if (p.length < 8) continue;
    const jd = Number(p[0]);
    const nums = [p[2], p[3], p[4], p[5], p[6], p[7]].map(Number);
    if (!Number.isFinite(jd) || !nums.every(Number.isFinite)) continue;
    rows.push({ unix: (jd - 2440587.5) * 86400, x: nums[0], y: nums[1], z: nums[2], vx: nums[3], vy: nums[4], vz: nums[5] });
  }
  console.log(`${label}: ${rows.length} samples`);
  return rows;
}

const EARTH_GM = 398_600.4418;
const fmt = (n, w = 12) => (Math.round(n)).toLocaleString('en-US').padStart(w);

async function main() {
  const roman = await vectors('-211', 'Roman (-211)');
  const sun = await vectors('10', 'Sun');
  const sunAt = new Map(sun.map((r) => [Math.round(r.unix), r]));

  const launchSeconds = ROMAN_LAUNCH_UTC / 1000;

  console.log('\n=== NASA predicted Roman trajectory, rotating frame (km) ===');
  console.log('   T+       range     anti-sun       north  cross-track    speed');
  const paired = [];
  for (const r of roman) {
    const s = sunAt.get(Math.round(r.unix));
    if (!s) continue;
    const rot = toSunEarthRotating(r, s);
    const elapsed = r.unix - launchSeconds;
    paired.push({ elapsed, rot, range: Math.hypot(r.x, r.y, r.z), speed: Math.hypot(r.vx, r.vy, r.vz) });
  }
  // Horizons samples land on the hour; launch was at 11:26, so no sample falls
  // on a whole mission day. Print every 24th row instead of matching on time.
  paired.forEach((p, i) => {
    if (i !== 0 && i !== paired.length - 1 && i % 24 !== 0) return;
    const days = p.elapsed / 86400;
    console.log(`${(days).toFixed(2).padStart(6)}d ${fmt(p.range)} ${fmt(p.rot.x)} ${fmt(p.rot.y)} ${fmt(p.rot.z)} ${p.speed.toFixed(3).padStart(8)}`);
  });

  const first = paired[0];
  const c3 = first.speed * first.speed - 2 * EARTH_GM / first.range;
  console.log(`\nfirst sample: T+${(first.elapsed / 3600).toFixed(2)} h, r=${fmt(first.range, 0)} km, v=${first.speed.toFixed(3)} km/s, C3=${c3.toFixed(3)} km^2/s^2`);
  const last = paired[paired.length - 1];
  console.log(`last  sample: T+${(last.elapsed / 86400).toFixed(2)} d, r=${fmt(last.range, 0)} km, v=${last.speed.toFixed(3)} km/s`);

  console.log('\n=== our CR3BP model vs NASA, same mission time ===');
  console.log('   T+   NASA range  model range      d(range)   NASA antiSun  model antiSun   separation');
  let worst = 0;
  let worstDay = 0;
  let sumRel = 0;
  paired.forEach((p, i) => {
    const days = p.elapsed / 86400;
    const ours = romanTransferRotKm(p.elapsed);
    const sep = Math.hypot(ours.x - p.rot.x, ours.y - p.rot.y, ours.z - p.rot.z);
    if (sep > worst) { worst = sep; worstDay = days; }
    sumRel += sep / Math.max(1, p.range);
    if (i !== 0 && i !== paired.length - 1 && i % 24 !== 0) return;
    const ourRange = Math.hypot(ours.x, ours.y, ours.z);
    console.log(`${days.toFixed(2).padStart(6)}d ${fmt(p.range)} ${fmt(ourRange)} ${fmt(ourRange - p.range)} ${fmt(p.rot.x)} ${fmt(ours.x)} ${fmt(sep)}`);
  });
  console.log(`\nmean separation as a fraction of NASA's range: ${(100 * sumRel / paired.length).toFixed(1)}%`);
  console.log(`worst separation at T+${worstDay.toFixed(2)} d`);
  console.log(`largest separation over the 28 days NASA publishes: ${fmt(worst, 0)} km`);

  // Where is NASA's Roman heading? Fit the growth of anti-sunward distance.
  const halfway = paired[Math.floor(paired.length / 2)];
  console.log(`\nNASA anti-sunward fraction of range: T+1d ${(paired.find((p) => p.elapsed > 86400).rot.x / paired.find((p) => p.elapsed > 86400).range).toFixed(3)}, T+14d ${(halfway.rot.x / halfway.range).toFixed(3)}, T+28d ${(last.rot.x / last.range).toFixed(3)}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
