// The Roman mission clock, owned by src/roman-mission.js and read by the
// heliocentric scene.
//
// The heliocentric scene used to derive its time by reading the timeline
// slider's value and converting it back to seconds. The slider has 1000 steps
// across 90 days, so in the cruise region one step is about two hours: during
// playback the heliocentric views advanced in ~2 hour jumps while the GSE views
// moved smoothly, from the same mission clock. Publish the seconds directly.

let elapsedSeconds = 0;

export const romanClock = {
  get elapsed() {
    return elapsedSeconds;
  },
  set(seconds) {
    elapsedSeconds = Number.isFinite(seconds) ? seconds : 0;
  },
};
