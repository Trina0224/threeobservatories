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
const STEP_SIZE = '1 h';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Ask Horizons what it actually covers, instead of guessing.
 *
 * Requesting a span that runs past the end of a spacecraft's trajectory file
 * does not return a truncated table -- it returns no table at all. So read the
 * "Trajectory files" block from the object header and take the span from there.
 * That also means this script keeps working as JPL extends Roman's coverage,
 * with no date edited by hand.
 */
async function coverage(command) {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: `'${command}'`,
    OBJ_DATA: `'YES'`,
    MAKE_EPHEM: `'NO'`,
  });
  const response = await fetch(`${HORIZONS_ENDPOINT}?${params}`, {
    headers: { 'User-Agent': 'threeobservatories-ephemeris-updater/1.0', Accept: 'application/json' },
  });
  const payload = await response.json();
  const text = payload.result ?? '';
  const span = /(\d{4})-([A-Z][a-z]{2})-(\d{2}) (\d{2}:\d{2})\s+(\d{4})-([A-Z][a-z]{2})-(\d{2}) (\d{2}:\d{2})/g;
  const rows = [...text.matchAll(span)];
  if (rows.length === 0) {
    throw new Error(`could not read a trajectory-file span for ${command}:\n${text.slice(0, 2000)}`);
  }
  const iso = (y, mon, d, hm) => `${y}-${String(MONTHS.indexOf(mon) + 1).padStart(2, '0')}-${d} ${hm}`;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const files = rows.length;
  // Step back an hour from the published end: the last sample sits a few
  // minutes inside it, and asking for the boundary itself can overshoot.
  const endMs = Date.parse(`${iso(last[5], last[6], last[7], last[8])}:00Z`) - 3600_000;
  return {
    start: iso(first[1], first[2], first[3], first[4]),
    stop: new Date(endMs).toISOString().slice(0, 16).replace('T', ' '),
    files,
    header: text,
  };
}

function horizonsUrl(command, startTime, stopTime) {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: `'${command}'`,
    OBJ_DATA: `'NO'`,
    MAKE_EPHEM: `'YES'`,
    EPHEM_TYPE: `'VECTORS'`,
    CENTER: `'500@399'`,
    START_TIME: `'${startTime}'`,
    STOP_TIME: `'${stopTime}'`,
    STEP_SIZE: `'${STEP_SIZE}'`,
    REF_PLANE: `'ECLIPTIC'`,
    VEC_TABLE: `'2'`,
    CSV_FORMAT: `'YES'`,
    OUT_UNITS: `'KM-S'`,
  });
  return `${HORIZONS_ENDPOINT}?${params}`;
}

async function requestHorizons(command, label, start, stop) {
  const response = await fetch(horizonsUrl(command, start, stop), {
    headers: {
      'User-Agent': 'threeobservatories-ephemeris-updater/1.0',
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`${label}: Horizons returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(`${label}: ${payload.error}`);
  if (typeof payload.result !== 'string') {
    throw new Error(`${label}: Horizons response did not contain a text result`);
  }
  return {
    apiVersion: payload.version ?? null,
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
  const span = await coverage(ROMAN_COMMAND);
  console.log(`Horizons covers Roman ${span.start} .. ${span.stop} across ${span.files} trajectory file(s)`);

  const roman = await requestHorizons(ROMAN_COMMAND, 'Roman', span.start, span.stop);
  const spanSeconds = roman.rows[roman.rows.length - 1][0] - roman.rows[0][0];
  const sun = await requestHorizons('10', 'Sun', span.start, span.stop);
  const sunRows = sun.rows;

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
      startTime: span.start,
      stopTime: span.stop,
      stepSize: STEP_SIZE,
      apiVersion: roman.apiVersion,
      // Which navigation products the samples came from, verbatim from the
      // Horizons object header. This is how a reader tells reconstructed
      // tracking from prediction.
      trajectoryFiles: span.header
        .split(/\r?\n/)
        .filter((line) => /\d{4}-[A-Z][a-z]{2}-\d{2} \d{2}:\d{2}\s+\d{4}-[A-Z][a-z]{2}-\d{2} \d{2}:\d{2}/.test(line))
        .map((line) => line.trim()),
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
  for (const file of document.source.trajectoryFiles) console.log(`  ${file}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
