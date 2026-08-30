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
const outputName = process.env.SMOKE_OUTPUT || 'jwst-wave-local.png';
const outputPath = `artifacts/${outputName}`;

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const fatalErrors = [];
page.on('pageerror', (error) => fatalErrors.push(`pageerror: ${error.message}`));
page.on('requestfailed', (request) => {
  const url = request.url();
  if (!url.endsWith('/favicon.ico')) {
    fatalErrors.push(`requestfailed: ${url} ${request.failure()?.errorText ?? ''}`);
  }
});

await page.goto(targetUrl, {
  waitUntil: 'networkidle',
  timeout: 60_000,
});
await page.waitForFunction(
  () => document.documentElement.dataset.jwstEphemeris === 'ready',
  null,
  { timeout: 30_000 },
);
await page.click('#modeObservatories');
await page.click('[data-view="heliofollow"]');
await page.waitForTimeout(2_000);

const state = await page.evaluate(() => ({
  ephemeris: document.documentElement.dataset.jwstEphemeris,
  activeView: document.querySelector('[data-view].active')?.dataset.view ?? null,
  utc: document.getElementById('utcReadout')?.textContent ?? null,
  canvas: {
    width: document.getElementById('scene')?.width ?? 0,
    height: document.getElementById('scene')?.height ?? 0,
  },
}));

const screenshot = await page.screenshot({ fullPage: true });
await writeFile(outputPath, screenshot);
await browser.close();

const image = PNG.sync.read(screenshot);
let amberPixels = 0;
for (let index = 0; index < image.data.length; index += 4) {
  const red = image.data[index];
  const green = image.data[index + 1];
  const blue = image.data[index + 2];
  const alpha = image.data[index + 3];
  // The real Webb tube is #ffc45f. Use a broad threshold that survives
  // antialiasing but excludes the purple Roman path and blue UI controls.
  if (alpha > 180 && red > 215 && green > 125 && green < 225 && blue < 155) {
    amberPixels += 1;
  }
}

const result = { ...state, targetUrl, outputPath, amberPixels };
console.log(JSON.stringify(result, null, 2));

if (state.ephemeris !== 'ready') throw new Error(`JWST ephemeris state is ${state.ephemeris}`);
if (state.activeView !== 'heliofollow') throw new Error(`Expected heliofollow, got ${state.activeView}`);
if (!state.canvas.width || !state.canvas.height) throw new Error('Observatory canvas did not render');
if (amberPixels < 1_000) {
  throw new Error(`Expected a visible amber Webb tube; detected only ${amberPixels} amber pixels`);
}
if (fatalErrors.length) {
  throw new Error(`Browser errors:\n${fatalErrors.join('\n')}`);
}
