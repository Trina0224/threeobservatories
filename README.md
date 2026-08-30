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
- Solar-illumination/eclipsing visualization

Hubble is currently a circular propagated approximation and does not yet claim the spacecraft's current orbital phase. The next Hubble data milestone is TLE + SGP4.

Webb's displayed L2 path remains educational until an authoritative mission ephemeris is connected.

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
- GSE top, GSE side, Sun-facing, Follow Roman, Launch, and Free camera views
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

## Reused engine work

`Trina0224/simplegames/threebody` is the upstream orbital-mechanics sandbox for this project. Validated generic components such as the adaptive Dormand–Prince integrator and playback rules are reused rather than rewritten. Sun–Earth CR3BP and halo-orbit work will be generalized from that upstream implementation while retaining regression coverage.

## Project rules

Read `AGENTS.md` before changing physics, coordinate conventions, mission data, or data provenance. See also:

- `docs/SPEC.md`
- `docs/COORDINATES.md`
- `docs/RESEARCH_SOURCES.md`
- `docs/UPSTREAM_REUSE.md`
