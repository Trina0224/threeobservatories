# Coordinate, Unit, and Time Conventions

This file defines the simulation conventions. Do not add implicit alternate conventions in code.

## Canonical units

Physics/data layer:
- position: kilometers
- velocity: kilometers per second
- angles: radians internally unless a source is explicitly degree-based
- time differences: seconds

Rendering units are a separate concern and are produced by a render-scale transform.

## Canonical physical state frame

For the first implementation, store imported/integrated inertial spacecraft states in a clearly labeled Earth/Solar-System inertial frame compatible with the source product, then transform through explicit functions before rendering.

Preferred long-term canonical frame: J2000/ICRF-compatible inertial Cartesian coordinates when mission ephemeris products allow it.

Never relabel GSE, ECI, TEME, GCRS, or J2000 vectors as interchangeable. They are not.

## Frames we expect to encounter

### J2000 / ICRF-style inertial

Common for planetary and spacecraft ephemerides. Preferred for cross-mission physical state storage where source data support it.

### GCRS / Earth-centered inertial

Useful for Earth/Moon/Hubble visualization and modern Earth-centered transformations.

### TEME

The native frame associated with conventional SGP4/TLE propagation. Treat TEME output explicitly as TEME. Convert before comparing it numerically with other inertial products.

### ITRF / Earth-fixed

Use for ground tracks, Earth surface longitude/latitude, and observer locations.

### GSE — Geocentric Solar Ecliptic

NASA Roman SVS materials use GSE for an intuitive Earth/L2 visualization.

Conceptually:
- origin at Earth
- +X points toward the Sun
- Z is related to the ecliptic north direction
- Y completes the right-handed frame

Because L2 is anti-Sunward from Earth, it lies primarily along the negative GSE X direction.

GSE is excellent for explanatory rendering, but it is not the default inertial propagation frame.

### Sun–Earth rotating CR3BP frame

Use for educational CR3BP and halo-orbit dynamics.

The frame rotates with the Sun–Earth line. It is not inertial. Keep normalized CR3BP variables isolated from physical ephemeris states and provide explicit conversion code.

#### The one implemented rotating frame: `ROT`

`src/physics/frames.js` defines exactly one Sun–Earth rotating frame. Every
observatory-scene position goes through it, and nothing else in the code base may
define a second one.

- origin: Earth
- +X: anti-sunward, so Sun–Earth L2 lies near +X
- +Y: ecliptic north, Gram-Schmidt orthogonalized against +X
- +Z: **X × Y** — which points along Earth's *retrograde* direction

The +Z choice is not cosmetic. `(antiSun, ecliptic north, prograde)` is a
**left-handed** triple. Feeding left-handed coordinates into the right-handed
Three.js scene graph mirrors every halo orbit: the trajectory keeps its shape and
its distances, so the result looks completely plausible while running backwards.
Define +Z as X × Y and the render mapping stays a pure rotation.

The renderer's local units are ROT kilometres divided by `KM_PER_LOCAL_UNIT`;
that division is the only thing that happens at the render boundary.

Because ROT's +Y is drawn as the scene's +Y, the heliocentric views must turn the
*opposite* way around +Y from the Earth's real increasing ecliptic longitude.
That single sign lives in `earthHelioState()` in `src/main.js`.

## Rendering frame

Three.js scene axes are a presentation choice. The renderer may map physical axes into Three.js axes for camera convenience, but the mapping must live in one documented transform.

Do not scatter axis swaps/sign flips through mission code.

Recommended pattern:

```text
source state
  -> source-frame parser
  -> canonical physical frame
  -> optional explanatory frame (GSE / rotating)
  -> display scale transform
  -> Three.js render coordinates
```

## True scale vs educational scale

`TRUE_SCALE` applies a single documented position scale factor to physical coordinates.

`EDUCATIONAL_SCALE` may exaggerate:
- body radius
- orbit trail thickness
- label offsets
- spacecraft sprite/model size
- selected Earth–Moon or Earth–L2 visual separation if necessary

Any nonphysical exaggeration must occur after the physics state and must be reversible/toggleable.

## Time

### UI

Display UTC ISO-8601 timestamps.

### Orbital calculations

Different sources/libraries may require:
- UTC
- TAI
- TT
- TDB
- SPICE ephemeris time (ET)

The importer owns the conversion from source time representation. Do not casually pass a JavaScript `Date` into high-fidelity ephemeris code and assume the time scale is correct.

### Determinism

The simulation clock stores a canonical instant and advances by explicit simulation delta time. Rendering frame rate must not change the physical timeline.

## Hubble / SGP4 note

TLE + SGP4 conventionally yields a TEME position/velocity. For initial rendering it is acceptable to maintain a TEME-aware Hubble pipeline, but conversions to Earth-fixed coordinates or comparison against other ephemerides must be explicit.

Do not call raw SGP4 output `J2000`.

## L2 note

Do not hardcode L2 as a visually fixed point in inertial space.

For explanatory geometry, calculate or derive the Sun–Earth L2 direction from the instantaneous Sun–Earth configuration. In a Sun–Earth rotating visualization, L2 appears approximately stationary by construction; in an inertial view, the Earth/L2 system proceeds around the Sun.

## Validation policy

Every transform should have at least one test using a known vector or external reference. Coordinate bugs are often visually plausible and therefore especially dangerous in this project.
