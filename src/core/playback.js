// Reused from Trina0224/simplegames/threebody/src/playback.js
// See docs/UPSTREAM_REUSE.md.
//
// playback.js — how the playback clock advances, and when it stops.
//
// One rule:
//   A trajectory that came back round may be played round again. One that ended
//   did not, and must not be.

/**
 * Advance a playback clock by dt and say whether playback continues.
 *
 * @param {number} clock current playback time
 * @param {number} dt elapsed simulation time to add
 * @param {{ts: Float64Array|number[], n: number, status: string}} run
 * @param {boolean} loop whether this view repeats a completed run
 * @returns {{t: number, playing: boolean}}
 */
export function advance(clock, dt, run, loop = false) {
  const end = run.ts[run.n - 1];
  const t = clock + dt;
  if (t < end) return { t, playing: true };
  if (loop && run.status === 'ok') return { t: 0, playing: true };
  return { t: end, playing: false };
}

/** Where Play should resume from. */
export function resumeFrom(clock, run) {
  return clock >= run.ts[run.n - 1] ? 0 : clock;
}
