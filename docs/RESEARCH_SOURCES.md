# Research Sources

This document is the starting reading list and provenance index for the Three Observatories simulation.

Use official mission data and technical documentation as truth sources. Public-facing pages are useful for sanity checks and educational copy, but they should not replace mission ephemerides or technical products when those exist.

## James Webb Space Telescope (JWST)

### Mission/orbit overview

- NASA Science — Webb Orbit
  - https://science.nasa.gov/mission/webb/orbit/
  - Use for: qualitative orbit geometry, rationale for L2, public-facing orbit description.
  - Important visualization point: NASA explicitly describes the L2 geometry as keeping the Sun/Earth/Moon in the same general direction so the sunshield can block them together.

- NASA Science — Webb orbit at Sun–Earth L2
  - https://science.nasa.gov/asset/webb/webbs-orbit-at-sun-earth-lagrange-point-2-l2/
  - Use for: sanity checks on halo-orbit scale and period.
  - Published public values include roughly 250,000–830,000 km distance from L2 and about 168 days per circuit.

- NASA Science — Webb Sunshield
  - https://science.nasa.gov/mission/webb/webbs-sunshield/
  - Use for: Sun/Earth/Moon warm-side geometry, sunshield orientation, and thermal explanation.
  - NASA states that Webb is oriented so the sunshield remains between the Sun/Earth/Moon and the telescope.

- NASA Science — Telescope Overview / How Webb Stays Cold
  - https://science.nasa.gov/mission/webb/science-overview/science-explainers/telescope-overview/
  - https://science.nasa.gov/mission/webb/science-overview/science-explainers/how-does-webb-stay-cold/
  - Use for: the crucial distinction that Webb's halo orbit keeps it out of Earth/Moon shadows, reducing temperature fluctuations while maintaining solar power.

### Operational / technical orbit documentation

- STScI JWST User Documentation — JWST Orbit
  - https://jwst-docs.stsci.edu/jwst-observatory-characteristics/jwst-orbit
  - Use for: actual-orbit plots based on JWST ephemeris, orbit rationale, station-keeping cadence/context.

- NASA/JPL Horizons
  - https://ssd.jpl.nasa.gov/horizons/
  - Use for: historical/current JWST ephemeris/state-vector queries when supported.
  - Horizons news records post-launch JWST trajectory updates beginning 2021-12-25.

- NASA NAIF SPICE astrophysics mission data
  - https://naif.jpl.nasa.gov/naif/data_astrophysics.html
  - Use for: SPICE mission kernels when JWST products are available and appropriate.

- NASA Meteoroid Engineering Model library — JWST trajectory
  - https://fireballs.ndc.nasa.gov/mem/library/jwst.html
  - Use for: downloadable trajectory product and independent trajectory visualization/reference.
  - Before importing, inspect file frame, epoch/time scale, units, and sampling cadence.

### L2 illumination interpretation for this project

Do **not** describe Webb as "hiding in Earth's shadow." For the educational UI, the better explanation is:

- L2 is on Earth's anti-solar side, but Webb occupies a large halo orbit around the L2 region.
- NASA explicitly notes that the halo orbit keeps Webb out of Earth and Moon shadows, helping avoid thermal cycling and loss of solar power.
- The Sun, Earth, and Moon remain in roughly the same part of Webb's sky.
- Webb's own sunshield, not Earth, creates the protected cold telescope side.

Renderer consequence: Hubble eclipse effects are informative; a permanent orange glow around Webb is not. Prefer sunshield attitude and warm-side/cold-side geometry.

### Mission history / deployment

- NASA Science — Webb mission
  - https://science.nasa.gov/mission/webb/
  - Use for: launch date, mission overview, deployment/background links.

### Research topics to collect next

Search NASA NTRS / ADS for mission-team papers on:
- JWST mission design and launch-window targeting
- transfer trajectory to Sun–Earth L2
- halo orbit design
- orbit determination and station keeping
- momentum unloading interactions with station keeping
- attitude/solar-angle constraints

Do not implement a station-keeping model from a generic halo-orbit paper and label it as JWST operational behavior unless mission-specific parameters are sourced.

---

## Nancy Grace Roman Space Telescope

### Current mission status

Roman launched on 2026-08-30 and entered its transfer toward Sun–Earth L2. The repository should treat Roman as an active spacecraft, not as a permanently pre-launch future mission.

- NASA Roman blog / NASA Science mission page
  - https://science.nasa.gov/mission/roman-space-telescope/
  - Use for: official current mission status and mission-event context.

### Orbit / transfer visualization

- NASA Scientific Visualization Studio — Roman Telescope Launch and Orbit at L2, SVS 5673
  - https://svs.gsfc.nasa.gov/5673
  - Released 2026-08-25.
  - Use for: authoritative visual reference for launch-to-L2 geometry, GSE frame interpretation, side/top/Sun-facing views, and timeline sanity checks.
  - Important: this is a visualization product; prefer numerical trajectory data when available for simulation truth.

### Observatory technical characteristics

- NASA GSFC Roman — Observatory Technical
  - https://roman.gsfc.nasa.gov/science/observatory_technical.html
  - Use for: observatory parameters, mission architecture, L2 orbit designation, instrument/spacecraft technical references.

- NASA Science — Roman Telescope
  - https://science.nasa.gov/mission/roman-space-telescope/telescope/
  - Use for: telescope configuration and observatory geometry/context.

- STScI Roman User Documentation — WFI Quick Reference
  - https://roman-docs.stsci.edu/roman-instruments/the-wide-field-instrument/observing-with-the-wfi/wfi-quick-reference
  - Use for: field-of-regard and pointing constraints when attitude/observing simulation is added.

### Roman thermal/illumination interpretation

Roman also benefits from the stable Sun–Earth L2 geometry, but the UI must not copy Webb's exact thermal architecture onto Roman. Until mission-specific post-launch attitude/thermal documentation is ingested:

- show Roman as normally sunlit rather than permanently hidden in Earth's shadow;
- use a simple Sun-facing orientation/thermal cue;
- do not draw a Webb-like five-layer sunshield on Roman;
- keep the copy clearly mission-specific when exact field-of-regard and thermal-angle limits are added later.

### Technical paper / proceedings starting point

- NASA NTRS — Roman Space Telescope Observatory Build, Test and related mission overview proceedings
  - https://ntrs.nasa.gov/api/citations/20240008727/downloads/Perkins%20SPIE%20proceeding%20paper.pdf
  - Use for: observatory design context and mission quasi-halo/L2 statements.

### Research topics to collect next

Search NTRS / ADS / GSFC mission publications for:
- final flight dynamics design
- launch/transfer targeting
- quasi-halo orbit dimensions and period
- orbit determination and station keeping
- pointing constraints and Sun/Earth/Moon avoidance
- actual post-launch trajectory / reconstructed ephemeris products

Because Roman is newly launched, prefer newer post-launch products over older pre-launch predicted trajectories when reconstructing what actually happened.

---

## Hubble Space Telescope (HST)

### Mission/orbit reference

- NASA Science — About Hubble
  - https://science.nasa.gov/mission/hubble/overview/about-hubble/
  - Use for: public sanity-check values.
  - Current public values around initial repo setup: altitude about 483 km, inclination 28.5 deg, orbital period about 95 minutes, speed about 27,000 km/h.

- NASA Science — Hubble mission
  - https://science.nasa.gov/mission/hubble/
  - Use for: mission history, observatory background, servicing timeline links.

- NASA Science — Hubble vs Roman / Hubble vs Webb
  - https://science.nasa.gov/mission/hubble/observatory/hubble-vs-roman/
  - https://science.nasa.gov/mission/hubble/observatory/hubble-vs-webb/
  - Use for: educational explanation of why Hubble is in LEO while Webb/Roman operate at L2.

### Orbit truth for first implementation

Use current/archived HST TLEs with a standards-compliant SGP4 implementation.

Preferred practical provider:
- CelesTrak
  - https://celestrak.org/

Rules:
- store the exact TLE epoch and retrieval time
- do not extrapolate a TLE far outside its validity window and call the result historical truth
- use archived TLEs for historical playback if needed
- label raw SGP4 output frame correctly (TEME)

### Eclipse visualization

Hubble's low-Earth orbit makes Earth-shadow transitions frequent enough to be meaningful in the renderer. Keep the illumination/dimming effect for Hubble, and later replace the current geometric shadow approximation with umbra/penumbra modeling tied to SGP4 state and Sun ephemeris.

### Higher-fidelity future path

Investigate mission ephemerides / tracking products where accessible before claiming meter- or kilometer-level historical reconstruction.

---

## Solar system ephemerides / frames

### NASA/JPL Horizons

- https://ssd.jpl.nasa.gov/horizons/
- Use for Sun/Earth/Moon ephemerides, spacecraft state vectors where supported, validation, and generation of browser-friendly cached datasets.

### Astronomical Almanac low-precision solar coordinates

- "Low precision formulae for the Sun's coordinates and the equation of time",
  The Astronomical Almanac, Section C.
- Implemented in `src/physics/sun-lowprecision.js`.
- Accuracy better than 0.01 degrees in ecliptic longitude for 1950-2050.
- Fallback only: it orients the Sun–Earth rotating frame when the bundled
  Horizons cache is unavailable or the clock leaves its coverage window. It is
  never used as a spacecraft trajectory, and it never overrides cached
  same-epoch Horizons Sun vectors.

### NASA NAIF SPICE

- https://naif.jpl.nasa.gov/naif/
- Use for high-fidelity geometry and frame/time handling in preprocessing tools.
- Browser runtime does not need to parse every binary SPICE kernel directly; an offline preprocessing pipeline may sample authoritative kernels into compact deterministic datasets.

### NASA Technical Reports Server

- https://ntrs.nasa.gov/
- Use for mission design, orbit design, navigation, station keeping, and attitude-control technical literature.

---

## Core orbital-mechanics reading

Agents working on CR3BP/halo behavior should understand these concepts before implementation:

1. Circular Restricted Three-Body Problem equations in the rotating frame.
2. Collinear Lagrange points L1/L2/L3.
3. Linearized dynamics near L1/L2.
4. Periodic halo-orbit families and Lissajous/quasi-periodic trajectories.
5. Differential correction / shooting methods for periodic-orbit generation.
6. State-transition matrices and unstable manifolds.
7. Station keeping near unstable libration-point trajectories.

Generic CR3BP literature is appropriate for the educational/free-propagation mode, but mission-specific historical playback must still use mission-specific data.

---

## Source ingestion checklist

Before adding any numerical data file, record:

- mission/object
- publisher
- exact source URL
- access/retrieval UTC time
- product creation/version date if available
- state-vector origin
- coordinate frame
- orientation/equinox convention if applicable
- units
- time scale
- epoch format
- sample cadence
- interpolation method used by this project
- whether values are predicted, reconstructed, or operational

If any of those are unknown, add an explicit `UNKNOWN/TODO` instead of guessing.

## Accuracy labels for UI/data metadata

Use one of:

- `AUTHORITATIVE_EPHEMERIS`
- `AUTHORITATIVE_TRAJECTORY`
- `TLE_SGP4`
- `MISSION_PREDICTION`
- `CR3BP_EDUCATIONAL_MODEL`
- `SCHEMATIC_ONLY`

The UI should eventually expose this provenance so users can see what kind of truth they are viewing.
