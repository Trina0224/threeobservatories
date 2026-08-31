// Fetches NASA's published Roman trajectory into public/data/roman-horizons.json.
//
// Roman launched 2026-08-30 11:26 UTC and JPL Horizons carries it as NAIF id
// -211. As of this writing the published file is
// RST_EPH_PRED_NOMNVR_2026242_2026270_01, a post-launch navigation prediction
// covering 2026-Aug-30 12:00 to 2026-Sep-27 11:57 TDB -- the first 28 days of
// the transfer. Everything after that is still a model in this repository.
//
// Sibling of scripts/update-jwst-ephemeris.mjs; same shape, same frame.
//
//   node scripts/update-roman-ephemeris.mjs

import { mkdir, writeFile } from 'node:fs/promises';

const HORIZONS_ENDPOINT = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const OUTPUT_PATH = new URL('../public/data/roman-horizons.json', import.meta.url);
const ROMAN_COMMAND = '-211';
const START_TIME = '2026-08-30 12:00';
// Ask past the end of the published file; Horizons truncates to what it has.
const STOP_TIME = '2027-03-01';
const STEP_SIZE = '1 h';

function horizonsUrl(command) {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: `'${command}'`,
    OBJ_DATA: `'NO'`,
    MAKE_EPHEM: `'YES'`,
    EPHEM_TYPE: `'VECTORS'`,
    CENTER: `'500@399'`,
    START_TIME: `'${START_TIME}'`,
    STOP_TIME: `'${STOP_TIME}'`,
    STEP_SIZE: `'${STEP_SIZE}'`,
    REF_PLANE: `'ECLIPTIC'`,
    VEC_TABLE: `'2'`,
    CSV_FORMAT: `'YES'`,
    OUT_UNITS: `'KM-S'`,
  });
  return `${HORIZONS_ENDPOINT}?${params}`;
}

async function requestHorizons(command, label, { tolerateShortSpan = false } = {}) {
  const response = await fetch(horizonsUrl(command), {
    headers: {
      'User-Agent': 'threeobservatories-ephemeris-updater/1.0',
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`${label}: Horizons returned HTTP ${response.status}`);
  const payload = await response.json();
  // Roman's coverage ends before STOP_TIME, and Horizons reports that as an
  // error alongside a table covering what it does have. That is the expected
  // case, not a failure -- the point of asking past the end is to find the end.
  if (payload.error && !tolerateShortSpan) throw new Error(`${label}: ${payload.error}`);
  if (typeof payload.result !== 'string') {
    throw new Error(`${label}: Horizons response did not contain a text result`);
  }
  return {
    apiVersion: payload.version ?? null,
    note: payload.error ?? null,
    rows: parseVectorTable(payload.result, label),
  };
}

function parseVectorTable(text, label) {
  const start = text.indexOf('$$SOE');
  const end = text.indexOf('$$EOE');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`${label}: vector table markers were not found`);
  }
  const rows = [];
  for (const rawLine of text.slice(start + 5, end).split(/\r?\n/)) {
    const parts = rawLine.trim().split(',').map((v) => v.trim());
    if (parts.length < 5) continue;
    const jdTdb = Number(parts[0]);
    const [xKm, yKm, zKm] = [parts[2], parts[3], parts[4]].map(Number);
    if (![jdTdb, xKm, yKm, zKm].every(Number.isFinite)) continue;
    rows.push([
      Math.round((jdTdb - 2440587.5) * 86400),
      Number(xKm.toFixed(3)),
      Number(yKm.toFixed(3)),
      Number(zKm.toFixed(3)),
    ]);
  }
  if (rows.length < 24) throw new Error(`${label}: only ${rows.length} vector samples were parsed`);
  return rows;
}

async function main() {
  // JPL's fair-use guidance requests one API call at a time. Keep these sequential.
  const roman = await requestHorizons(ROMAN_COMMAND, 'Roman', { tolerateShortSpan: true });
  const spanSeconds = roman.rows[roman.rows.length - 1][0] - roman.rows[0][0];

  // Match the Sun samples to Roman's actual coverage, not to STOP_TIME.
  const sunStop = new Date((roman.rows[roman.rows.length - 1][0] + 3600) * 1000)
    .toISOString().slice(0, 16).replace('T', ' ');
  const sunUrl = horizonsUrl('10').replace(
    encodeURIComponent(STOP_TIME), encodeURIComponent(sunStop),
  );
  const sunResponse = await fetch(sunUrl, {
    headers: { 'User-Agent': 'threeobservatories-ephemeris-updater/1.0', Accept: 'application/json' },
  });
  const sunPayload = await sunResponse.json();
  if (sunPayload.error) throw new Error(`Sun: ${sunPayload.error}`);
  const sunRows = parseVectorTable(sunPayload.result, 'Sun');

  if (Math.abs(roman.rows.length - sunRows.length) > 2) {
    throw new Error(`Roman/Sun sample-count mismatch: ${roman.rows.length}/${sunRows.length}`);
  }

  const document = {
    schemaVersion: 1,
    generatedAtUtc: new Date().toISOString(),
    source: {
      publisher: 'NASA/JPL Solar System Dynamics',
      service: 'JPL Horizons',
      endpoint: HORIZONS_ENDPOINT,
      romanCommand: ROMAN_COMMAND,
      sunCommand: '10',
      center: '500@399 (Earth center)',
      referencePlane: 'ECLIPTIC',
      outputUnits: 'KM-S',
      timeScale: 'TDB',
      startTime: START_TIME,
      requestedStopTime: STOP_TIME,
      stepSize: STEP_SIZE,
      apiVersion: roman.apiVersion,
      coverageNote: roman.note,
    },
    columns: ['unixSeconds', 'xKm', 'yKm', 'zKm'],
    roman: roman.rows,
    sun: sunRows,
  };

  await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(document)}\n`, 'utf8');
  console.log(
    `Wrote ${roman.rows.length} Roman and ${sunRows.length} Sun samples `
    + `covering ${(spanSeconds / 86400).toFixed(2)} days to ${OUTPUT_PATH.pathname}`,
  );
  if (roman.note) console.log(`Horizons coverage note: ${roman.note}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
