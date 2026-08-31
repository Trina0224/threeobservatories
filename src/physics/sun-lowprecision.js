// Low-precision geocentric Sun position, used only as a fallback frame source
// when the bundled JPL Horizons cache is unavailable or the simulation clock
// runs outside its coverage window.
//
// Source: The Astronomical Almanac, "Low precision formulae for the Sun's
// coordinates and the equation of time" (Section C). Stated accuracy is better
// than 0.01 degrees in ecliptic longitude and 0.0004 au in range for
// 1950-2050 -- ample for orienting a Sun-Earth rotating frame, and never used
// as a spacecraft trajectory.
//
// Returns the geocentric ecliptic (ECL) Sun vector in kilometers. No Three.js.

const DEG = Math.PI / 180;
const AU_KM = 149_597_870.7; // IAU 2012 astronomical unit
const UNIX_MS_AT_J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
const MS_PER_DAY = 86_400_000;

export function sunGeocentricEclipticKm(unixMs) {
  // n = days from J2000.0. UT1-UTC is below one second and irrelevant here.
  const n = (unixMs - UNIX_MS_AT_J2000) / MS_PER_DAY;
  const meanLongitude = (280.460 + 0.9856474 * n) * DEG;
  const meanAnomaly = (357.528 + 0.9856003 * n) * DEG;
  const eclipticLongitude = meanLongitude
    + (1.915 * Math.sin(meanAnomaly) + 0.020 * Math.sin(2 * meanAnomaly)) * DEG;
  const distanceKm = (1.00014
    - 0.01671 * Math.cos(meanAnomaly)
    - 0.00014 * Math.cos(2 * meanAnomaly)) * AU_KM;
  // Ecliptic latitude of the Sun is below 1.2 arcseconds; treat it as zero.
  return {
    x: distanceKm * Math.cos(eclipticLongitude),
    y: distanceKm * Math.sin(eclipticLongitude),
    z: 0,
  };
}
