// Checks Roman's drawn track: NASA's measured span, and this project's
// continuation of it.
//
// Runs in Node with no browser. `src/data/roman-horizons.js` fetches its cache,
// so fetch is pointed at the committed file -- the same bytes the page loads.
//
//   node scripts/check-roman-track.mjs

import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const cacheUrl = new URL('../public/data/roman-horizons.json', import.meta.url);
const cache = JSON.parse(await readFile(cacheUrl, 'utf8'));
globalThis.fetch = async (url) => {
  assert.ok(String(url).endsWith('roman-horizons.json'), `unexpected fetch: ${url}`);
  return { ok: true, status: 200, json: async () => cache };
};

const { loadRomanHorizonsCache, romanEphemeris } = await import('../src/data/roman-horizons.js');
const { buildRomanContinuation } = await import('../src/missions/roman-continuation.js');
const { SUN_EARTH_L2_KM } = await import('../src/missions/roman-halo.js');
const { ROMAN_LAUNCH_UTC } = await import('../src/data/roman-mission.js');
const track = await import('../src/missions/roman-track.js');

const DAY = 86400;
const loaded = await loadRomanHorizonsCache();
assert.ok(loaded, `Roman cache failed to load: ${romanEphemeris.error}`);

// 1. The measured span is NASA's, and it is where NASA says it is.
const startDays = track.measuredStartSeconds() / DAY;
const endDays = track.measuredEndSeconds() / DAY;
assert.ok(startDays > 0 && startDays < 0.1, `measured span starts at L+${startDays.toFixed(3)} d`);
assert.ok(endDays > 20 && endDays < 400, `measured span ends at L+${endDays.toFixed(2)} d`);
assert.equal(cache.source.romanCommand, '-211');
console.log(`measured span: L+${(startDays * 24).toFixed(2)} h .. L+${endDays.toFixed(2)} d `
  + `(${romanEphemeris.sampleCount} states, Horizons ${cache.source.romanCommand})`);

// 2. Roman's measured range must look like an Earth-to-L2 transfer.
const rangeAt = (days) => {
  const p = track.romanTrackRotKm(days * DAY);
  return { range: Math.hypot(p.x, p.y, p.z), source: p.source, p };
};
const atEnd = rangeAt(endDays);
assert.equal(atEnd.source, track.SOURCE.MEASURED);
assert.ok(atEnd.range > 1.2e6 && atEnd.range < 1.6e6,
  `measured range at end of coverage is ${Math.round(atEnd.range)} km`);

// 3. The continuation must start exactly where the measurements stop. This is
//    the check that matters: the earlier pure model met the measured data half
//    a million kilometres away, which is the whole reason it was replaced.
const continuation = buildRomanContinuation();
assert.ok(continuation, 'continuation could not be built');
track.setBridge(continuation);

const before = track.romanTrackRotKm(track.measuredEndSeconds() - 1);
const after = track.romanTrackRotKm(track.measuredEndSeconds() + 1);
const seam = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
assert.equal(after.source, track.SOURCE.BRIDGE);
assert.ok(seam < 50, `measured-to-computed seam is ${seam.toFixed(1)} km, expected under 50`);
console.log(`seam at the handover: ${seam.toFixed(2)} km`);

// 4. The continuation must actually reach L2, and be integrated well enough to
//    believe. Jacobi is the only integral of motion here, so its drift is the
//    honest measure of integration quality.
const arrivalDays = continuation.arrivalSeconds / DAY;
assert.ok(arrivalDays > endDays + 30 && arrivalDays < endDays + 150,
  `arrival at L+${arrivalDays.toFixed(1)} d is not a plausible continuation`);
assert.ok(continuation.closestApproachKm < 8e5,
  `closest approach to L2 is ${Math.round(continuation.closestApproachKm)} km`);
assert.ok(continuation.jacobiDrift < 1e-6,
  `Jacobi drift ${continuation.jacobiDrift.toExponential(2)} is too large`);
console.log(`continuation: L+${endDays.toFixed(1)} d -> L+${arrivalDays.toFixed(1)} d, `
  + `closest approach to L2 ${Math.round(continuation.closestApproachKm).toLocaleString()} km, `
  + `Jacobi drift ${continuation.jacobiDrift.toExponential(1)}`);

// 5. The path must be monotonic in time and free of jumps, or the tube geometry
//    built from it will fold back on itself.
let worstGap = 0;
for (let i = 1; i < continuation.path.length; i += 1) {
  const a = continuation.path[i - 1];
  const b = continuation.path[i];
  assert.ok(b.t > a.t, `path time went backwards at sample ${i}`);
  worstGap = Math.max(worstGap, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
}
assert.ok(worstGap < 3e4, `largest gap between path samples is ${Math.round(worstGap)} km`);
console.log(`path: ${continuation.path.length} samples, largest gap ${Math.round(worstGap).toLocaleString()} km`);

// 6. Before NASA's coverage begins the ascent is modelled, and it must meet the
//    first measured state rather than stepping onto it.
const preSeamBefore = track.romanTrackRotKm(track.measuredStartSeconds() - 1);
const preSeamAfter = track.romanTrackRotKm(track.measuredStartSeconds() + 1);
const preSeam = Math.hypot(
  preSeamAfter.x - preSeamBefore.x, preSeamAfter.y - preSeamBefore.y, preSeamAfter.z - preSeamBefore.z,
);
assert.ok(preSeam < 50, `ascent-to-measured seam is ${preSeam.toFixed(1)} km`);
console.log(`ascent handover seam: ${preSeam.toFixed(2)} km`);

console.log(`\nL2 at ${Math.round(SUN_EARTH_L2_KM).toLocaleString()} km; `
  + `launch ${new Date(ROMAN_LAUNCH_UTC).toISOString()}`);
console.log('roman track OK');
