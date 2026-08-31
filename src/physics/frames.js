// Frame transforms for the Sun-Earth visualization.
//
// Layer rule (AGENTS.md): this module is pure orbital-mechanics support. It
// holds no Three.js objects and no mission constants. Vectors are plain
// `{ x, y, z }` objects in kilometers; callers convert at the render boundary.
//
// Frames used here:
//   EQ   - geocentric equatorial (mean equator and equinox of J2000). SGP4/TEME
//          output is treated as EQ; the TEME-to-J2000 rotation is a rotation
//          about the pole of at most the equation of the equinoxes (< 0.005 deg),
//          which is far below the visual resolution of this scene.
//   ECL  - geocentric ecliptic (mean ecliptic and equinox of J2000). This is the
//          frame JPL Horizons returns for `referencePlane=ECLIPTIC`.
//   ROT  - Sun-Earth rotating frame, right-handed, origin at Earth:
//            +X  anti-sunward (toward L1's opposite side, i.e. toward L2)
//            +Y  ecliptic north, orthogonalized against +X
//            +Z  = X cross Y  (points along Earth's *retrograde* direction)
//          ROT is the frame the observatory scene renders in, so it must be
//          right-handed like the Three.js scene it feeds. Using the prograde
//          direction as +Z would make (antiSun, north, prograde) left-handed and
//          silently mirror every halo orbit drawn from it.
//
// Reference for the obliquity value: IERS Conventions (2010), Table 1.1,
// mean obliquity of the ecliptic at J2000.0 = 84381.406 arcseconds.

const ARCSEC_TO_RAD = Math.PI / (180 * 3600);
export const OBLIQUITY_J2000_RAD = 84381.406 * ARCSEC_TO_RAD;

const COS_OBLIQUITY = Math.cos(OBLIQUITY_J2000_RAD);
const SIN_OBLIQUITY = Math.sin(OBLIQUITY_J2000_RAD);

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

function normalize(v) {
  const length = Math.hypot(v.x, v.y, v.z);
  if (!(length > 0)) return null;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/** EQ -> ECL. Rotation about the +X (equinox) axis by the mean obliquity. */
export function equatorialToEcliptic(vectorKm) {
  return {
    x: vectorKm.x,
    y: COS_OBLIQUITY * vectorKm.y + SIN_OBLIQUITY * vectorKm.z,
    z: -SIN_OBLIQUITY * vectorKm.y + COS_OBLIQUITY * vectorKm.z,
  };
}

/**
 * Build the ROT basis from the instantaneous geocentric Sun vector (ECL, km).
 * The Sun-Earth line has a small ecliptic latitude, so ecliptic north is
 * Gram-Schmidt orthogonalized against it instead of being used raw.
 * Returns unit basis vectors expressed in ECL, or null if the input is unusable.
 */
export function sunEarthRotatingBasis(sunFromEarthEclipticKm) {
  const sunDirection = normalize(sunFromEarthEclipticKm);
  if (!sunDirection) return null;
  const antiSun = { x: -sunDirection.x, y: -sunDirection.y, z: -sunDirection.z };
  const eclipticNorth = { x: 0, y: 0, z: 1 };
  const crossTrack = normalize(cross(antiSun, eclipticNorth));
  if (!crossTrack) return null;
  const north = cross(crossTrack, antiSun);
  return { antiSun, north, crossTrack };
}

/** ECL -> ROT. Both inputs are geocentric ECL vectors in kilometers. */
export function toSunEarthRotating(vectorEclipticKm, sunFromEarthEclipticKm) {
  const basis = sunEarthRotatingBasis(sunFromEarthEclipticKm);
  if (!basis) return null;
  return {
    x: dot(vectorEclipticKm, basis.antiSun),
    y: dot(vectorEclipticKm, basis.north),
    z: dot(vectorEclipticKm, basis.crossTrack),
  };
}
