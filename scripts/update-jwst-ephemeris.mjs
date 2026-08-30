import { mkdir, writeFile } from 'node:fs/promises';

const HORIZONS_ENDPOINT = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const OUTPUT_PATH = new URL('../public/data/jwst-horizons.json', import.meta.url);
const START_TIME = '2025-01-01';
const STOP_TIME = '2028-01-01';
const STEP_SIZE = '12 h';

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

async function requestHorizons(command, label) {
  const response = await fetch(horizonsUrl(command), {
    headers: {
      'User-Agent': 'threeobservatories-ephemeris-updater/1.0',
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`${label}: Horizons returned HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (payload.error) {
    throw new Error(`${label}: ${payload.error}`);
  }
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
    const parts = rawLine.trim().split(',').map((value) => value.trim());
    if (parts.length < 5) continue;

    const jdTdb = Number(parts[0]);
    const xKm = Number(parts[2]);
    const yKm = Number(parts[3]);
    const zKm = Number(parts[4]);
    if (![jdTdb, xKm, yKm, zKm].every(Number.isFinite)) continue;

    const unixSeconds = Math.round((jdTdb - 2440587.5) * 86400);
    rows.push([
      unixSeconds,
      Number(xKm.toFixed(3)),
      Number(yKm.toFixed(3)),
      Number(zKm.toFixed(3)),
    ]);
  }

  if (rows.length < 100) {
    throw new Error(`${label}: only ${rows.length} vector samples were parsed`);
  }
  return rows;
}

async function main() {
  // JPL's fair-use policy requests one API call at a time. Keep these sequential.
  const jwst = await requestHorizons('-170', 'JWST');
  const sun = await requestHorizons('10', 'Sun');

  if (Math.abs(jwst.rows.length - sun.rows.length) > 2) {
    throw new Error(`JWST/Sun sample-count mismatch: ${jwst.rows.length}/${sun.rows.length}`);
  }

  const document = {
    schemaVersion: 1,
    generatedAtUtc: new Date().toISOString(),
    source: {
      publisher: 'NASA/JPL Solar System Dynamics',
      service: 'JPL Horizons',
      endpoint: HORIZONS_ENDPOINT,
      jwstCommand: '-170',
      sunCommand: '10',
      center: '500@399 (Earth center)',
      referencePlane: 'ECLIPTIC',
      outputUnits: 'KM-S',
      timeScale: 'TDB',
      startTime: START_TIME,
      stopTime: STOP_TIME,
      stepSize: STEP_SIZE,
      apiVersion: jwst.apiVersion ?? sun.apiVersion,
    },
    columns: ['unixSeconds', 'xKm', 'yKm', 'zKm'],
    jwst: jwst.rows,
    sun: sun.rows,
  };

  await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(document)}\n`, 'utf8');
  console.log(`Wrote ${jwst.rows.length} JWST and ${sun.rows.length} Sun samples to ${OUTPUT_PATH.pathname}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
