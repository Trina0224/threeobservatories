// Asks JPL Horizons whether it carries a Roman trajectory, and if so pulls one.
//
// This runs in CI, not locally: the session that wrote it cannot reach
// ssd.jpl.nasa.gov. The point is to answer a question the repository has so far
// only asserted -- reference.md says NASA has published no Roman ephemeris --
// against the service itself rather than against a memory of it.
//
//   node scripts/probe-roman-horizons.mjs

const ENDPOINT = 'https://ssd.jpl.nasa.gov/api/horizons.api';

async function ask(params, label) {
  const url = `${ENDPOINT}?${new URLSearchParams(params)}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'threeobservatories-probe/1.0', Accept: 'application/json' },
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { result: text }; }
  console.log(`\n===== ${label} =====`);
  console.log(`HTTP ${response.status}`);
  if (payload.error) console.log(`error: ${payload.error}`);
  const body = payload.result ?? '';
  console.log(body.slice(0, 3000));
  return { status: response.status, body, error: payload.error };
}

// 1. Does Horizons know anything called Roman?
await ask({ format: 'json', COMMAND: "'ROMAN'" }, 'name search: ROMAN');
await ask({ format: 'json', COMMAND: "'NANCY GRACE ROMAN'" }, 'name search: NANCY GRACE ROMAN');
await ask({ format: 'json', COMMAND: "'WFIRST'" }, 'name search: WFIRST');

// 2. Roman's NAIF ID is -244 in mission documentation. Ask for it directly, and
//    ask for a short vector table to see whether an ephemeris actually exists.
for (const id of ['-244', '-227', '-170']) {
  await ask({
    format: 'json',
    COMMAND: `'${id}'`,
    OBJ_DATA: "'YES'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'",
    CENTER: "'500@399'",
    START_TIME: "'2026-08-31'",
    STOP_TIME: "'2026-09-02'",
    STEP_SIZE: "'12 h'",
    REF_PLANE: "'ECLIPTIC'",
    VEC_TABLE: "'2'",
    CSV_FORMAT: "'YES'",
    OUT_UNITS: "'KM-S'",
  }, `vectors for COMMAND ${id}`);
}
