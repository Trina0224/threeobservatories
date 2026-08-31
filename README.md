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

The checked-in cache currently spans 2024-01-01 through 2031-01-01 at 12-hour cadence. `.github/workflows/update-jwst-ephemeris.yml` can refresh it manually and runs on a schedule. This architecture avoids depending on cross-origin browser access to the JPL service and makes the published visualization deterministic.

Webb's position and Webb's amber path both come from one function, `webbLocalAt()` in `src/main.js`, in every view. Trails, tubes and the heliocentric wave are sampled from that same function, so the telescope cannot drift off its own drawn trajectory and no view can lose its amber line while the others keep it.

In `Earth–L2` and `L2 close-up` the amber path is exactly **one halo revolution** centred on the simulation clock. The revolution length is measured from the cache each time the path is rebuilt — the window whose two ends land closest together in the rotating frame — rather than hard-coded, because the real halo is quasi-periodic and its period drifts (currently about 178–183 days). A fixed window is what produced the earlier broken-looking orbit: 200 days on a 178-day halo overshoots by 22 days, and that overshoot hangs off the loop as a loose end.

The seam never closes perfectly, and it should not. Webb's halo does not return to the same point: over one revolution it drifts roughly 40 000–50 000 km, so a small step remains where the ends meet. That step is the orbit's real drift and is not bridged with invented trajectory.

If the cache cannot load, or the clock leaves its coverage window, an educational halo is drawn instead and labeled `EDUCATIONAL FALLBACK` in the focus card. Cached and fallback samples are never blended into one path.

STScI documents JWST's Horizons observer code as `500@-170`. NASA's Meteoroid Engineering Model library also publishes a real Earth-centered JWST trajectory file; it is retained as an independent historical/reference source, not silently extrapolated beyond its supplied dates.

### Rendering verification

The repository includes a browser smoke test for the Webb L2 Wave:

- `scripts/smoke-jwst-wave.mjs`
- `.github/workflows/smoke-jwst-wave.yml`

It opens the local build and the published GitHub Pages site, waits for the local ephemeris cache to report ready, then walks `L2 close-up`, `L2 wave` and `Sun / Earth orbit`. For each it captures a screenshot and asserts that

- the amber Webb trajectory is actually present in the rendered pixels,
- Webb's Earth distance is inside the Sun–Earth L2 band, and
- wherever Webb is on screen, amber pixels are within 40 px of the projected sprite, and
- the drawn halo spans one revolution (150–220 days) whose ends land within 150 000 km of each other.

The last check exists because of a real regression: the amber path and the Webb sprite were once produced by two different code paths, so the telescope was rendered off its own trajectory, one view lost its amber line entirely, and a leftover placeholder path was drawn beside the real one. Pixel counting alone did not catch any of that.

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
