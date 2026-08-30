// Roman mission chronology and visualization provenance.
// Actual launch milestones are from NASA launch-day posts on 2026-08-30.
// Future cruise milestones are intentionally marked projected/simulated.
// Transfer geometry is visualized in src/roman-mission.js using NASA SVS 5673
// (GSE presentation, SPICE ephemerides provenance) as the reference shape.

export const ROMAN_LAUNCH_UTC = Date.parse('2026-08-30T11:26:00Z');
export const ROMAN_TRANSFER_DAYS = 90;
export const ROMAN_TRANSFER_SECONDS = ROMAN_TRANSFER_DAYS * 86400;

export const ROMAN_SOURCES = {
  launch: 'https://science.nasa.gov/blogs/roman/2026/08/30/nasas-roman-space-telescope-launches/',
  maxQ: 'https://science.nasa.gov/blogs/roman/2026/08/30/nasas-roman-space-telescope-falcon-heavy-passes-max-q/',
  boosters: 'https://science.nasa.gov/blogs/roman/2026/08/30/nasas-roman-space-telescope-falcon-heavy-side-boosters-begin-return/',
  upperStage: 'https://science.nasa.gov/blogs/roman/2026/08/30/nasas-roman-space-telescope-falcon-heavy-upper-stage-takes-over/',
  finalBurn: 'https://science.nasa.gov/blogs/roman/2026/08/30/nasas-roman-space-telescope-final-upper-stage-burn-complete/',
  separation: 'https://science.nasa.gov/blogs/roman/2026/08/30/nasas-roman-space-telescope-flying-on-its-own/',
  trajectory: 'https://svs.gsfc.nasa.gov/5673',
};

export const ROMAN_EVENTS = [
  { id: 'launch', t: 0, label: 'Liftoff', date: '2026-08-30 11:26 UTC', status: 'actual', detail: 'Falcon Heavy lifted off from LC-39A at Kennedy Space Center at 7:26 a.m. EDT.', source: ROMAN_SOURCES.launch },
  { id: 'maxq', t: 75, label: 'Max Q', date: '2026-08-30 ~11:27 UTC', status: 'actual', precision: 'approx', detail: 'Falcon Heavy passed maximum aerodynamic pressure.', source: ROMAN_SOURCES.maxQ },
  { id: 'boosters', t: 150, label: 'Side boosters separate', date: 'T+ ~2m30s', status: 'actual', precision: 'approx', detail: 'Side booster engine cutoff occurred near T+2m24s, followed seconds later by separation.', source: ROMAN_SOURCES.boosters },
  { id: 'meco', t: 231, label: 'MECO / stage separation', date: 'T+ ~3m51s', status: 'actual', precision: 'approx', detail: 'Center core main engine cutoff; second stage separated seconds later.', source: ROMAN_SOURCES.upperStage },
  { id: 'ses1', t: 240, label: 'SES-1 / fairing away', date: 'T+ ~4m', status: 'actual', precision: 'approx', detail: 'Second-stage Merlin Vacuum engine ignited; fairing separation followed in thinner atmosphere.', source: ROMAN_SOURCES.upperStage },
  { id: 'signal', t: 420, label: 'TDRS communications', date: '2026-08-30 ~11:33 UTC', status: 'actual', precision: 'approx', detail: 'Roman established communications through NASA Tracking and Data Relay Satellite support.', source: ROMAN_SOURCES.separation },
  { id: 'ses2', t: 1680, label: 'SES-2', date: '2026-08-30 ~11:54 UTC', status: 'actual', precision: 'approx', detail: 'Second-stage engine restarted for the final planned upper-stage burn.', source: ROMAN_SOURCES.finalBurn },
  { id: 'seco2', t: 1740, label: 'SECO-2', date: '2026-08-30 ~11:55 UTC', status: 'actual', precision: 'approx', detail: 'Final planned upper-stage burn completed after roughly two minutes.', source: ROMAN_SOURCES.finalBurn },
  { id: 'separation', t: 1860, label: 'Roman flying free', date: '2026-08-30 11:57 UTC', status: 'actual', detail: 'Roman separated from Falcon Heavy second stage and began its solo journey to L2.', source: ROMAN_SOURCES.separation },
  { id: 'sunshield', t: 3660, label: 'Solar Array Sun Shield', date: 'By ~12:27 UTC', status: 'nasa-window', detail: 'NASA stated the four outer panels would swing into place within the next 30 minutes after separation, forming the full six-panel array.', source: ROMAN_SOURCES.separation },
  { id: 'l1d', t: 86400, label: 'L+1 day · commissioning cruise', date: '2026-08-31', status: 'projected', detail: 'Simulated cruise milestone: initial spacecraft activation and checkout period while departing the Earth system.' },
  { id: 'l7d', t: 7 * 86400, label: 'L+7 days · trajectory checkout', date: '2026-09-06', status: 'projected', detail: 'Simulation milestone for navigation/trajectory checkouts. Exact operations will follow mission-team planning.' },
  { id: 'l30d', t: 30 * 86400, label: 'L+30 days · deep-space cruise', date: '2026-09-29', status: 'projected', detail: 'Roman is simulated well along the million-mile transfer while commissioning continues.' },
  { id: 'l60d', t: 60 * 86400, label: 'L+60 days · L2 approach', date: '2026-10-29', status: 'projected', detail: 'Simulation milestone: approach geometry increasingly resembles the operational L2 halo region.' },
  { id: 'l90d', t: 90 * 86400, label: 'L+90 days · halo acquisition', date: '2026-11-28', status: 'projected', detail: 'Projected visualization milestone near the end of NASA’s approximately three-month transfer/commissioning period.' },
];

export function eventAtOrBefore(t) {
  let best = ROMAN_EVENTS[0];
  for (const event of ROMAN_EVENTS) {
    if (event.t <= t) best = event;
    else break;
  }
  return best;
}
