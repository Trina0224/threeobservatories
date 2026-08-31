// The Roman mission timeline scale, shared by both Roman scenes.
//
// Why a custom scale at all: the mission spans 90 days, but ten of the fifteen
// milestones happen in the first hour. A linear axis puts all of them inside
// the first 0.05% of the slider; the previous scale gave the first two hours a
// flat 30% of the axis, which left the 88 days of cruise -- the part anyone
// actually scrubs through -- squeezed into the remainder and made the launch
// end hypersensitive.
//
// So there are two tracks instead of one compromise:
//
//   main   T+0 -> L+90d. The launch hour is compressed into a short group at
//          the left; everything after it is linear, so cruise gets ~90% of the
//          axis and a day is always the same distance.
//   detail T+0 -> T+1h, logarithmic. The ascent milestones range from T+75s to
//          T+61m, so only a log axis spreads them; a linear one stacks the
//          first six on top of each other.
//
// Both scenes import this module. The mapping was previously duplicated in
// src/roman-mission.js and src/roman-heliocentric.js, where changing one and
// not the other would silently desynchronise the two scenes' clocks.

import { ROMAN_EVENTS, ROMAN_TRANSFER_SECONDS } from '../data/roman-mission.js';

/** End of the launch-day detail window: the Solar Array Sun Shield milestone. */
export const LAUNCH_DETAIL_SECONDS = 3660;

/** Share of the main track given to the whole launch hour. */
const LAUNCH_GROUP_FRACTION = 0.10;

/** Log offset, in seconds. Sets how much room the first minute gets. */
const LOG_PIVOT_SECONDS = 60;
const LOG_SPAN = Math.log10(1 + LAUNCH_DETAIL_SECONDS / LOG_PIVOT_SECONDS);

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Position of `t` within the launch hour, 0..1, logarithmic. */
export function detailFractionForTime(t) {
  const seconds = clamp(t, 0, LAUNCH_DETAIL_SECONDS);
  return Math.log10(1 + seconds / LOG_PIVOT_SECONDS) / LOG_SPAN;
}

/** Inverse of detailFractionForTime. */
export function timeForDetailFraction(fraction) {
  const f = clamp(fraction, 0, 1);
  return LOG_PIVOT_SECONDS * (10 ** (f * LOG_SPAN) - 1);
}

/** Position of `t` on the main track, 0..1. */
export function fractionForTime(t) {
  const seconds = clamp(t, 0, ROMAN_TRANSFER_SECONDS);
  if (seconds <= LAUNCH_DETAIL_SECONDS) {
    return detailFractionForTime(seconds) * LAUNCH_GROUP_FRACTION;
  }
  const cruise = (seconds - LAUNCH_DETAIL_SECONDS)
    / (ROMAN_TRANSFER_SECONDS - LAUNCH_DETAIL_SECONDS);
  return LAUNCH_GROUP_FRACTION + cruise * (1 - LAUNCH_GROUP_FRACTION);
}

/** Inverse of fractionForTime. */
export function timeForFraction(fraction) {
  const f = clamp(fraction, 0, 1);
  if (f <= LAUNCH_GROUP_FRACTION) return timeForDetailFraction(f / LAUNCH_GROUP_FRACTION);
  const cruise = (f - LAUNCH_GROUP_FRACTION) / (1 - LAUNCH_GROUP_FRACTION);
  return LAUNCH_DETAIL_SECONDS + cruise * (ROMAN_TRANSFER_SECONDS - LAUNCH_DETAIL_SECONDS);
}

/** Where the launch-hour group ends on the main track, for the bracket. */
export const LAUNCH_GROUP_END_FRACTION = LAUNCH_GROUP_FRACTION;

export const LAUNCH_EVENTS = ROMAN_EVENTS.filter((e) => e.t <= LAUNCH_DETAIL_SECONDS);
export const CRUISE_EVENTS = ROMAN_EVENTS.filter((e) => e.t > LAUNCH_DETAIL_SECONDS);

export function nextEventAfter(t) {
  return ROMAN_EVENTS.find((event) => event.t > t + 0.5) ?? null;
}

export function previousEventBefore(t) {
  let found = null;
  for (const event of ROMAN_EVENTS) {
    if (event.t < t - 0.5) found = event;
    else break;
  }
  return found;
}
