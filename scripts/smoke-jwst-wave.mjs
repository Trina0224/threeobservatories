// Browser smoke test for the real JWST L2 path.
//
// The regression this guards against: the amber Webb path and the Webb sprite
// were once produced by two different code paths, so the telescope was drawn
// off its own trajectory and one view lost its amber line entirely. The checks
// below are therefore positional, not just "some amber pixels exist":
//
//   1. the bundled Horizons cache actually loads,
//   2. Webb's Earth distance is in the L2 range,
//   3. every view that draws an amber Webb path actually shows amber pixels, and
//      wherever the sprite is on screen some of them are right next to it.
//
// Usage: SMOKE_URL=... CHROME_BIN=... node scripts/smoke-jwst-wave.mjs

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

const targetUrl = process.env.SMOKE_URL || 'http://127.0.0.1:4173/?smoke=jwst-wave';
const outputPrefix = process.env.SMOKE_OUTPUT_PREFIX || 'jwst-wave-local';
const viewport = { width: 1366, height: 768 };

// Views that must show an amber Webb path. `requireOnScreen` marks the close
// views where Webb is always framed; the whole-orbit overview is checked for the
// amber line only, because Earth can sit outside the viewport at some epochs.
const CHECKED_VIEWS = [
  { view: 'l2', requireOnScreen: true },
  { view: 'heliofollow', requireOnScreen: true },
  { view: 'helio', requireOnScreen: false },
];
// Sun-Earth L2 is ~1.5 million km out; Webb's halo stays roughly within this band.
const MIN_EARTH_DISTANCE_KM = 1_000_000;
const MAX_EARTH_DISTANCE_KM = 2_000_000;
const ON_PATH_TOLERANCE_PX = 40;

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

await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60_000 });
await page.waitForFunction(
  () => document.documentElement.dataset.jwstEphemeris === 'ready',
  null,
  { timeout: 30_000 },
);
await page.click('#modeObservatories');
// Pause so the screenshot and the reported sprite position share one instant.
await page.click('#playBtn');

// The Webb tube is #efb45d. Keep a broad threshold that survives antialiasing
// and additive blending but excludes the purple Roman path and the blue UI.
function isAmber(red, green, blue, alpha) {
  return alpha > 180 && red > 190 && green > 110 && green < 225 && blue < 165 && red - blue > 60;
}

const results = [];
for (const { view, requireOnScreen } of CHECKED_VIEWS) {
  await page.click(`[data-view="${view}"]`);
  await page.waitForTimeout(2_000);

  const state = await page.evaluate(() => {
    const api = window.__threeObservatories;
    return {
      ephemeris: document.documentElement.dataset.jwstEphemeris,
      activeView: document.querySelector('[data-view].active')?.dataset.view ?? null,
      utc: document.getElementById('utcReadout')?.textContent ?? null,
      canvas: {
        width: document.getElementById('scene')?.width ?? 0,
        height: document.getElementById('scene')?.height ?? 0,
      },
      webbEarthDistanceKm: api?.webbEarthDistanceKm?.() ?? null,
      webbPixel: api?.webbScreenPixel?.() ?? null,
    };
  });

  const screenshot = await page.screenshot();
  const outputPath = `artifacts/${outputPrefix}-${view}.png`;
  await writeFile(outputPath, screenshot);

  const image = PNG.sync.read(screenshot);
  const scaleX = image.width / viewport.width;
  const scaleY = image.height / viewport.height;
  let amberPixels = 0;
  let nearestAmberPx = Infinity;
  const centreX = (state.webbPixel?.x ?? 0) * scaleX;
  const centreY = (state.webbPixel?.y ?? 0) * scaleY;
  for (let index = 0; index < image.data.length; index += 4) {
    if (!isAmber(image.data[index], image.data[index + 1], image.data[index + 2], image.data[index + 3])) {
      continue;
    }
    amberPixels += 1;
    const pixel = index / 4;
    const distance = Math.hypot((pixel % image.width) - centreX, Math.floor(pixel / image.width) - centreY);
    if (distance < nearestAmberPx) nearestAmberPx = distance;
  }

  results.push({ view, requireOnScreen, outputPath, amberPixels, nearestAmberPx, ...state });
}

await browser.close();
console.log(JSON.stringify({ targetUrl, results }, null, 2));

for (const result of results) {
  const where = `view ${result.view}`;
  if (result.ephemeris !== 'ready') throw new Error(`${where}: ephemeris state is ${result.ephemeris}`);
  if (result.activeView !== result.view) throw new Error(`${where}: active view is ${result.activeView}`);
  if (!result.canvas.width || !result.canvas.height) throw new Error(`${where}: canvas did not render`);

  const distance = result.webbEarthDistanceKm;
  if (!Number.isFinite(distance) || distance < MIN_EARTH_DISTANCE_KM || distance > MAX_EARTH_DISTANCE_KM) {
    throw new Error(`${where}: Webb is ${distance} km from Earth, outside the L2 band`);
  }
  if (result.amberPixels < 1_000) {
    throw new Error(`${where}: expected a visible amber Webb path; detected ${result.amberPixels} amber pixels`);
  }
  if (result.requireOnScreen && !result.webbPixel?.onScreen) {
    throw new Error(`${where}: Webb is off screen, so its path cannot be verified`);
  }
  if (result.webbPixel?.onScreen && !(result.nearestAmberPx <= ON_PATH_TOLERANCE_PX)) {
    throw new Error(
      `${where}: nearest amber pixel is ${result.nearestAmberPx.toFixed(1)}px from Webb; the sprite is off its own path`,
    );
  }
}

if (fatalErrors.length) throw new Error(`Browser errors:\n${fatalErrors.join('\n')}`);
console.log('JWST L2 path smoke test passed.');
