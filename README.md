# Three Observatories

A web-based 3D simulation of three major space observatories operating in their real orbital environments:

- James Webb Space Telescope (JWST) — Sun–Earth L2 halo orbit
- Nancy Grace Roman Space Telescope — Sun–Earth L2 orbit
- Hubble Space Telescope (HST) — low-Earth orbit

Live site: https://trina0224.github.io/threeobservatories/

The project combines mission-history playback, physically grounded orbital motion, and an educational visualization layer in one synchronized simulation clock.

## Current milestone

The first interactive Three.js renderer is published from `main` and includes:

1. Sun, Earth, Moon, and Sun–Earth L2 reference geometry
2. Shared UTC simulation clock and time scaling
3. Hubble first-pass propagated LEO approximation from NASA-published altitude/inclination/period values
4. Webb representative 3D L2 loop
5. Roman representative 3D L2 loop
6. Orbit trails and labels
7. Solar/L2, Earth-system, free, and spacecraft-follow camera modes
8. True orbital-position scale and an educational scale for otherwise invisible Earth-local motion
9. Original project spacecraft artwork from `public/assets/spacecraft/`

### Accuracy status

The current Webb and Roman L2 loops are deliberately marked **EDUCATIONAL** in the UI. They are renderer/architecture placeholders and must not be described as mission ephemerides. The next data milestone replaces those paths with authoritative NASA/JPL/STScI trajectory products.

Hubble is currently a circular propagated approximation and does not yet claim the spacecraft's current orbital phase. The next Hubble milestone is TLE + SGP4.

## Reused engine work

`Trina0224/simplegames/threebody` is the upstream orbital-mechanics sandbox for this project. Validated generic components such as the adaptive Dormand–Prince integrator and playback rules are reused rather than rewritten. Sun–Earth CR3BP and halo-orbit work will be generalized from that upstream implementation while retaining regression coverage.

## Project rules

Read `AGENTS.md` before changing physics, coordinate conventions, mission data, or data provenance. See also:

- `docs/SPEC.md`
- `docs/COORDINATES.md`
- `docs/RESEARCH_SOURCES.md`
- `docs/UPSTREAM_REUSE.md`
