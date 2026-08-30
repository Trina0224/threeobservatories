import { chromium } from 'playwright-core';
import { access, mkdir } from 'node:fs/promises';

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

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('requestfailed', (request) => errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`));

await page.goto('http://127.0.0.1:4173/?smoke=jwst-wave', {
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

await page.screenshot({ path: 'artifacts/jwst-wave.png', fullPage: true });
await browser.close();

console.log(JSON.stringify(state, null, 2));
if (state.ephemeris !== 'ready') throw new Error(`JWST ephemeris state is ${state.ephemeris}`);
if (state.activeView !== 'heliofollow') throw new Error(`Expected heliofollow, got ${state.activeView}`);
if (!state.canvas.width || !state.canvas.height) throw new Error('Observatory canvas did not render');
if (errors.length) {
  throw new Error(`Browser errors:\n${errors.join('\n')}`);
}
