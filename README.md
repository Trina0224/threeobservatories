# Three Observatories

A web-based 3D simulation of three major space observatories operating in their real orbital environments:

- James Webb Space Telescope (JWST) — Sun–Earth L2 halo orbit
- Nancy Grace Roman Space Telescope — launch-to-L2 mission playback and Sun–Earth L2 orbit
- Hubble Space Telescope (HST) — low-Earth orbit

Live site: https://trina0224.github.io/threeobservatories/

The project combines mission-history playback, physically grounded orbital motion, and an educational visualization layer.

## Two simulation modes

### Observatories

The shared observatory view includes:

- Earth–L2 rotating frame
- Earth/Hubble close-up
- L2 close-up for Webb + Roman
- Heliocentric L2-wave view
- Full Sun/Earth heliocentric overview
- Continuous time-compression slider
- Solar-illumination/eclipsing visualization where it carries physical information

### Current truth sources

**Hubble is driven by real TLE/SGP4 state rather than a circular phase placeholder.** The browser propagates NORAD 20580 with `satellite.js`. The checked-in TLE has epoch `2026-08-29T20:39:49Z`; CelesTrak's current GP summary at integration time reported an orbit of roughly 470–472 km altitude, 28.47° inclination and 94.03 minutes period. The TLE must be refreshed when the simulation is used well outside its useful prediction window.

**Webb is driven by a repository-local JPL Horizons ephemeris cache, not by browser-to-JPL requests.** JPL's public API is queried by `scripts/update-jwst-ephemeris.mjs` in GitHub Actions. The generated `public/data/jwst-horizons.json` contains Earth-centered ecliptic vectors for JWST spacecraft `-170` and same-epoch Sun vectors. The browser downloads that same-origin JSON file, interpolates both datasets on the shared simulation clock, and transforms Webb into the rotating Sun–Earth display frame.

The checked-in cache currently spans 2025-01-01 through 2028-01-01 at 12-hour cadence. `.github/workflows/update-jwst-ephemeris.yml` can refresh it manually and runs on a schedule. This architecture avoids depending on cross-origin browser access to the JPL service and makes the published visualization deterministic.

When the cache is ready:

- Webb's previous hand-drawn current phase and amber path are suppressed.
- Earth–L2 and L2 close-up use the cached Horizons state.
- L2 Wave renders a stable thick amber tube from the cached trajectory rather than rebuilding a competing placeholder every frame.

If the cache cannot load, the old curve remains only as an educational fallback and is not labeled current truth.

STScI documents JWST's Horizons observer code as `500@-170`. NASA's Meteoroid Engineering Model library also publishes a real Earth-centered JWST trajectory file; it is retained as an independent historical/reference source, not silently extrapolated beyond its supplied dates.

### Rendering verification

The repository includes a browser smoke test for the Webb L2 Wave:

- `scripts/smoke-jwst-wave.mjs`
- `.github/workflows/smoke-jwst-wave.yml`

It opens the local build and the published GitHub Pages site, selects `Observatories → L2 Wave`, waits for the local ephemeris cache to report ready, captures screenshots, and asserts that a substantial amber trajectory is actually present in the rendered pixels. This was added after a failure mode where the code path appeared valid but the published yellow Webb curve was absent.

### L2 illumination and thermal geometry

A key educational point of this project is that **Webb and Roman do not normally hide in Earth's umbra at L2**. Sun–Earth L2 is on the anti-solar side of Earth, but the observatories occupy large halo/quasi-halo trajectories around the L2 region rather than sitting at the mathematical point. Their mission geometry is designed for long, stable periods of direct solar illumination and for keeping the Sun, Earth, and Moon in roughly the same general direction from the spacecraft.

That distinction drives the visualization policy:

- **Hubble:** keep the sunlight/eclipsing effect. In low-Earth orbit Hubble repeatedly enters and leaves Earth's shadow, so the illumination transition is meaningful state information.
- **Webb / Roman:** do **not** use a permanent orange glow as the primary explanation. They are normally sunlit, so a continuously glowing ring becomes decorative rather than informative.
- **L2 close-up:** explain the geometry instead — Sun/Earth/Moon on the warm side and the protected observing side on the opposite side.
- **Webb:** emphasize the sunshield as the physical device that creates the cold observing side. Webb carries its own shade while operating in a location with deliberately stable illumination.
- **Roman:** explain the analogous stable Sun-facing thermal/orientation geometry without implying that Roman uses Webb's exact thermal architecture.

The renderer may exaggerate spacecraft size, halo-orbit thickness, and local spacing for readability, but it must not imply that L2 is literally inside a permanent Earth shadow.

### Roman Mission — Launch Day 2026-08-30

Roman Mission mode commemorates the mission beginning on August 30, 2026 and provides a complete launch-to-L2 playback experience.

It includes:

- Falcon Heavy ascent choreography
- Max Q
- side-booster separation
- MECO / stage separation / SES-1
- TDRS communications milestone
- SES-2 / SECO-2
- Roman spacecraft separation
- Solar Array Sun Shield deployment window
- simulated commissioning cruise to L2
- simulated L2 approach and halo-orbit acquisition
- mission-elapsed-time (MET) and UTC clocks
- a nonlinear timeline scrubber that preserves useful launch-day resolution while spanning the approximately three-month transfer
- GSE and heliocentric camera families, including close L2 arrival views
- clickable milestone cards with dates and provenance state

#### Roman data/provenance states

Roman Mission intentionally distinguishes three kinds of chronology:

- **ACTUAL** — launch milestones reported by NASA on August 30, 2026.
- **NASA WINDOW** — NASA-published timing window, currently used for Solar Array Sun Shield deployment after spacecraft separation.
- **PROJECTED** — future dates and cruise milestones generated for this simulation. These are not represented as NASA operational commitments.

The Earth-to-L2 transfer rendering is a planned educational trajectory inspired by NASA Scientific Visualization Studio asset **5673, Roman Telescope Launch and Orbit at L2**, which presents Roman's launch-to-L2 path in a Geocentric Solar Ecliptic (GSE) frame and identifies SPICE ephemerides as the underlying dataset. It is not presented as the current navigation solution.

Roman launch chronology is stored separately in `src/data/roman-mission.js`; the dedicated mission renderer is `src/roman-mission.js`.

## Scientific/rendering policy

Physical state and rendering scale are separate. Educational enlargement is allowed only in the display layer. Historical, propagated, authoritative, and educational/projected states must remain distinguishable in the UI and data provenance.

Visual effects must communicate state or geometry. If an effect is effectively constant and therefore stops carrying information — for example a permanent sunlight halo around an L2 observatory — prefer a clearer geometric or textual explanation instead.

## Reused engine work

`Trina0224/simplegames/threebody` is the upstream orbital-mechanics sandbox for this project. Validated generic components such as the adaptive Dormand–Prince integrator and playback rules are reused rather than rewritten. Sun–Earth CR3BP and halo-orbit work can be generalized from that upstream implementation while retaining regression coverage.

## Project rules

Read `AGENTS.md` before changing physics, coordinate conventions, mission data, or data provenance. See also:

- `docs/SPEC.md`
- `docs/COORDINATES.md`
- `docs/RESEARCH_SOURCES.md`
- `docs/UPSTREAM_REUSE.md`
