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

**Hubble is now driven by real TLE/SGP4 state rather than a circular phase placeholder.** The browser propagates NORAD 20580 with `satellite.js`. The checked-in launch-day TLE has epoch `2026-08-29T20:39:49Z`; CelesTrak's current GP summary at integration time reported an orbit of roughly 470–472 km altitude, 28.47° inclination and 94.03 minutes period. The TLE should be refreshed when the project is revisited after its useful prediction window.

**Webb is now driven by JPL Horizons spacecraft `-170` ephemeris when the service is available.** The browser requests Earth-centered, ecliptic Cartesian vectors from Horizons and interpolates them onto the shared simulation clock. The Sun vector is requested from the same service so the Earth-centered vectors can be transformed into the project's Sun–Earth rotating display frame. The previous hand-drawn Webb halo phase/trail is hidden when real Horizons data are available. If Horizons cannot be reached, the UI does not claim a fake current phase.

STScI documents JWST's Horizons observer code as `500@-170`. NASA's Meteoroid Engineering Model library also publishes a real Earth-centered JWST trajectory file; it is retained as an independent historical/reference source, not silently extrapolated to current dates.

### L2 illumination and thermal geometry

A key educational point of this project is that **Webb and Roman do not normally hide in Earth's umbra at L2**. Sun–Earth L2 is on the anti-solar side of Earth, but the observatories occupy large halo/quasi-halo trajectories around the L2 region rather than sitting at the mathematical point. Their mission geometry is designed for long, stable periods of direct solar illumination and for keeping the Sun, Earth, and Moon in roughly the same general direction from the spacecraft.

That distinction drives the visualization policy:

- **Hubble:** keep the sunlight/eclipsing effect. In low-Earth orbit Hubble repeatedly enters and leaves Earth's shadow, so the illumination transition is meaningful state information.
- **Webb / Roman:** do **not** use a permanent orange glow as the primary explanation. They are normally sunlit, so a continuously glowing ring becomes decorative rather than informative.
- **L2 close-up:** explain the geometry instead — Sun/Earth/Moon on the warm side, protected telescope/cold side on the opposite side, and the relevant Sun-facing spacecraft attitude.
- **Webb:** emphasize the sunshield as the physical device that creates the cold observing side. The educational message is that Webb carries its own shade while operating in a location with deliberately stable illumination.
- **Roman:** show the analogous stable Sun-facing thermal/orientation geometry without implying that Roman uses Webb's exact thermal architecture.

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

Physical state and rendering scale are separate. Educational enlargement is allowed only in the display layer. Historical, propagated, and educational/projected states must remain distinguishable in the UI and data provenance.

Visual effects must communicate state or geometry. If an effect is effectively constant and therefore stops carrying information — for example a permanent sunlight halo around an L2 observatory — prefer a clearer geometric/attitude explanation instead.

## Reused engine work

`Trina0224/simplegames/threebody` is the upstream orbital-mechanics sandbox for this project. Validated generic components such as the adaptive Dormand–Prince integrator and playback rules are reused rather than rewritten. Sun–Earth CR3BP and halo-orbit work will be generalized from that upstream implementation while retaining regression coverage.

## Project rules

Read `AGENTS.md` before changing physics, coordinate conventions, mission data, or data provenance. See also:

- `docs/SPEC.md`
- `docs/COORDINATES.md`
- `docs/RESEARCH_SOURCES.md`
- `docs/UPSTREAM_REUSE.md`
