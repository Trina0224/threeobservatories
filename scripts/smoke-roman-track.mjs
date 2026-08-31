// Browser check for the Roman Mission views.
//
// The numerical side is covered by scripts/check-roman-track.mjs in plain Node.
// This one only answers questions a browser can: does the ephemeris actually
// load over HTTP, does every Roman view render without throwing, and does the
// measured span of the path reach the screen as its own colour rather than
// being drawn like the computed part.
//
// Usage: SMOKE_URL=... CHROME_BIN=... node scripts/smoke-roman-track.mjs

import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { access, mkdir, writeFile } from 'node:fs/promises';

const candidates = [
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

let executablePath = null;
for (const candidate of candidates) {
  try {
    await access(candidate);
    executablePath = candidate;
    break;
  } catch {
    // Continue looking.
  }
}
if (!executablePath) throw new Error('No system Chrome/Chromium executable was found');

const targetUrl = process.env.SMOKE_URL || 'http://127.0.0.1:4173/';
const outputPrefix = process.env.SMOKE_OUTPUT_PREFIX || 'roman-track-local';
const viewport = { width: 1366, height: 768 };

const VIEWS = [
  'gsetop', 'gseside', 'sunface', 'follow',
  'helio', 'helioTop', 'helioSide', 'helioL2', 'helioL2Side',
];

// The measured span is drawn in 0x8fe9ff. Detected as a cyan the rest of the
// palette does not use: the computed span is violet and Webb's amber is absent
// from these scenes.
function countMeasuredPixels(png) {
  let count = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    if (b > 120 && g > 100 && b >= g && g - r > 35 && b - r > 60) count += 1;
  }
  return count;
}

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport });
const fatalErrors = [];
page.on('pageerror', (error) => fatalErrors.push(`pageerror: ${error.message}`));
page.on('requestfailed', (request) => {
  const url = request.url();
  if (!url.endsWith('/favicon.ico')) {
    fatalErrors.push(`requestfailed: ${url} ${request.failure()?.errorText ?? ''}`);
  }
});

const failures = [];
const note = (ok, label, detail) => {
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(label);
};

await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60_000 });
await page.click('#modeRoman');
await page.waitForFunction(
  () => document.documentElement.dataset.romanEphemeris === 'ready',
  null,
  { timeout: 30_000 },
);
note(true, 'Roman Horizons cache loaded over HTTP');

// The provenance line must name the data, not the model, now that data exists.
const provenance = await page.evaluate(() => ({
  badge: document.getElementById('romanProvenance')?.textContent ?? '',
  line: document.getElementById('romanProvenanceLine')?.textContent ?? '',
}));
note(/NASA EPHEMERIS/.test(provenance.badge), 'provenance badge names the ephemeris', provenance.badge);
note(/Horizons target .?211/.test(provenance.line), 'provenance line cites Horizons target -211');
note(/no manoeuvre invented/.test(provenance.line), 'provenance line says no manoeuvre was invented');

// Park the clock inside the measured span so the spacecraft sits on NASA data.
await page.click('#romanPlay');
await page.evaluate(() => {
  const slider = document.getElementById('romanTimeline');
  slider.value = '120';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(400);

for (const view of VIEWS) {
  await page.click(`[data-roman-view="${view}"]`);
  await page.waitForTimeout(350);
  const buffer = await page.screenshot();
  const png = PNG.sync.read(buffer);
  const measured = countMeasuredPixels(png);
  note(measured > 40, `${view}: measured span is drawn in its own colour`, `${measured} px`);
  await writeFile(`artifacts/${outputPrefix}-${view}.png`, buffer);
}

note(fatalErrors.length === 0, 'no page errors across every Roman view',
  fatalErrors.slice(0, 3).join(' | ') || 'none');

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} Roman check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log('\nRoman track render checks passed.');
}
