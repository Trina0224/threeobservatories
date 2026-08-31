# References, Data Sources, and Attribution

This project is an independent educational visualization. It does **not** claim ownership of NASA, JPL, STScI, CelesTrak, or other third-party mission data, documentation, scientific results, imagery, or orbital products referenced below.

The simulation code, UI, rendering logic, coordinate transforms, and educational presentation in this repository are project work. The underlying mission facts, orbital data, ephemerides, launch chronology, and technical reference material come from the original publishers listed here.

Where this project uses a simulated or educational trajectory rather than authoritative flight data, that distinction is noted explicitly.

---

## James Webb Space Telescope (JWST)

### NASA mission and L2-orbit references

**NASA Science — Webb mission**  
https://science.nasa.gov/mission/webb/

Used for mission background, launch history, and general observatory information.

**NASA Science — Webb Orbit**  
https://science.nasa.gov/mission/webb/orbit/

Used for the qualitative Sun–Earth L2 geometry, the reason Webb operates around L2, and the relationship among the Sun, Earth, Moon, and Webb sunshield.

**NASA Science — Webb orbit at Sun–Earth Lagrange Point 2 (L2)**  
https://science.nasa.gov/asset/webb/webbs-orbit-at-sun-earth-lagrange-point-2-l2/

Used as a public reference for halo-orbit scale and period. NASA public material gives roughly a 168-day circuit and a large orbit around, rather than directly on, the mathematical L2 point.

**NASA Science — Webb Sunshield**  
https://science.nasa.gov/mission/webb/webbs-sunshield/

Used for the warm-side / cold-side thermal explanation and the fact that Webb's own sunshield, rather than Earth itself, protects the telescope from direct Sun/Earth/Moon thermal radiation.

**NASA Science — Telescope Overview**  
https://science.nasa.gov/mission/webb/science-overview/science-explainers/telescope-overview/

**NASA Science — How Does Webb Stay Cold?**  
https://science.nasa.gov/mission/webb/science-overview/science-explainers/how-does-webb-stay-cold/

Used for the educational explanation that Webb's L2 halo-orbit geometry avoids prolonged Earth/Moon eclipses, reduces thermal cycling, and keeps the major warm sources in approximately the same direction.

### JWST operational orbit / ephemeris sources

**STScI JWST User Documentation — JWST Orbit**  
https://jwst-docs.stsci.edu/jwst-observatory-characteristics/jwst-orbit

Used for mission-specific orbit context and actual-orbit reference plots.

**JPL Horizons**  
https://ssd.jpl.nasa.gov/horizons/

**JPL Horizons API documentation**  
https://ssd-api.jpl.nasa.gov/doc/horizons.html

This is the primary numerical source currently used for Webb in the simulation.

The project queries:

- JWST spacecraft ID: `-170`
- center/origin: Earth center, `500@399`
- reference plane: ecliptic
- vector output: Cartesian state vectors
- output units: km / km-s product convention
- time scale: TDB

The browser does not claim these numbers as project-generated orbital data. A GitHub Actions preprocessing step queries JPL Horizons and stores a browser-friendly cache in:

`public/data/jwst-horizons.json`

The cache also includes same-epoch Sun vectors used to transform the Earth-centered Webb state into the project's Sun–Earth rotating display frame.

**STScI — JWST Moving Target Supporting Technical Information**  
https://jwst-docs.stsci.edu/methods-and-roadmaps/jwst-moving-target-observations/jwst-moving-target-supporting-technical-information/moving-target-ephemerides

Used as a reference confirming JWST's JPL Horizons observer/location code (`500@-170`).

**NASA Meteoroid Engineering Model library — JWST trajectory**  
https://fireballs.ndc.nasa.gov/mem/library/jwst.html

Used as an independent NASA trajectory reference. This project's current Webb display does not silently extrapolate that older trajectory product beyond its documented time range.

**NASA NAIF / SPICE — Astrophysics mission data**  
https://naif.jpl.nasa.gov/naif/data_astrophysics.html

Used as a reference for higher-fidelity mission geometry / SPICE data that may be incorporated in future versions.

---

## Hubble Space Telescope (HST)

### NASA mission/orbit references

**NASA Science — Hubble mission**  
https://science.nasa.gov/mission/hubble/

**NASA Science — About Hubble**  
https://science.nasa.gov/mission/hubble/overview/about-hubble/

Used for mission background and public sanity-check values such as low-Earth-orbit altitude, inclination, orbital speed, and roughly 95-minute orbital period.

**NASA Science — Hubble vs. Webb**  
https://science.nasa.gov/mission/hubble/observatory/hubble-vs-webb/

**NASA Science — Hubble vs. Roman**  
https://science.nasa.gov/mission/hubble/observatory/hubble-vs-roman/

Used for the educational comparison between Hubble's low-Earth orbit and the Sun–Earth L2 operating environment of Webb and Roman.

### Hubble orbital data

**CelesTrak**  
https://celestrak.org/

CelesTrak is the practical source used for Hubble two-line-element (TLE) orbital data.

A direct GP/TLE query for Hubble (NORAD catalog number `20580`) can be made at:

https://celestrak.org/NORAD/elements/gp.php?CATNR=20580&FORMAT=TLE

The project propagates Hubble from TLE data with the standard SGP4 model. TLE data are time-sensitive; a TLE should not be extrapolated far outside its useful validity window and represented as historical or current truth.

### SGP4 implementation

**satellite.js**  
https://github.com/shashwatak/satellite-js

Used as the JavaScript SGP4/TLE propagation implementation. This is software, not an orbital-data publisher.

---

## Nancy Grace Roman Space Telescope

### NASA mission references

**NASA Science — Nancy Grace Roman Space Telescope**  
https://science.nasa.gov/mission/roman-space-telescope/

Used for official mission status, mission overview, launch information, and current mission context.

**NASA Science — Roman telescope / observatory**  
https://science.nasa.gov/mission/roman-space-telescope/telescope/

Used for observatory configuration and spacecraft/telescope context.

**NASA GSFC Roman — Observatory Technical**  
https://roman.gsfc.nasa.gov/science/observatory_technical.html

Used for mission architecture and technical observatory information.

**STScI Roman User Documentation — WFI Quick Reference**  
https://roman-docs.stsci.edu/roman-instruments/the-wide-field-instrument/observing-with-the-wfi/wfi-quick-reference

Used as a future reference for pointing / field-of-regard constraints.

### Roman launch chronology — 2026-08-30

The launch-day timeline in this project is based on NASA's Roman launch coverage and mission updates. Key NASA pages used during construction include:

**NASA — Roman launch announcement**  
https://www.nasa.gov/news-release/nasas-dark-universe-seeking-nancy-grace-roman-space-telescope-launches/

**NASA Science Roman launch blog — launch**  
https://science.nasa.gov/blogs/roman/2026/08/30/nasas-roman-space-telescope-launches/

**NASA Science Roman launch blog — Max Q**  
https://science.nasa.gov/blogs/roman/2026/08/30/nasas-roman-space-telescope-falcon-heavy-passes-max-q/

**NASA Science Roman launch blog — side boosters begin return**  
https://science.nasa.gov/blogs/roman/2026/08/30/nasas-roman-space-telescope-falcon-heavy-side-boosters-begin-return/

**NASA Science Roman launch blog — upper stage takes over**  
https://science.nasa.gov/blogs/roman/2026/08/30/nasas-roman-space-telescope-falcon-heavy-upper-stage-takes-over/

**NASA Science Roman launch blog — final upper-stage burn complete**  
https://science.nasa.gov/blogs/roman/2026/08/30/nasas-roman-space-telescope-final-upper-stage-burn-complete/

**NASA Science Roman launch blog — Roman flying on its own**  
https://science.nasa.gov/blogs/roman/2026/08/30/nasas-roman-space-telescope-flying-on-its-own/

These NASA posts are the source for the launch-day event chronology represented as `ACTUAL` or `NASA WINDOW` in the simulation.

### Roman launch-to-L2 trajectory reference

**NASA Scientific Visualization Studio — Roman Telescope Launch and Orbit at L2, SVS 5673**  
https://svs.gsfc.nasa.gov/5673

This is the primary visual / trajectory-geometry reference for the Roman Mission mode. NASA SVS presents Roman's launch-to-L2 trajectory in Geocentric Solar Ecliptic (GSE) views and identifies SPICE ephemerides as the underlying dataset for the visualization.

Important distinction: the current project uses this NASA product as the basis for an educational planned/simulated Roman transfer visualization. Unless a future Roman state is explicitly marked as authoritative post-launch ephemeris, projected future points in this repository should **not** be interpreted as NASA operational navigation products.

### Roman technical paper

**NASA Technical Reports Server — Roman Space Telescope Observatory Build, Test, and related mission material**  
https://ntrs.nasa.gov/api/citations/20240008727/downloads/Perkins%20SPIE%20proceeding%20paper.pdf

Used for observatory design context and Sun–Earth L2 / quasi-halo mission information.

---

## Solar-system geometry, coordinate frames, and future high-fidelity data

**JPL Horizons**  
https://ssd.jpl.nasa.gov/horizons/

Used for solar-system ephemerides, state-vector validation, and spacecraft / Sun vector preprocessing.

**NASA NAIF / SPICE**  
https://naif.jpl.nasa.gov/naif/

Used as the main reference for rigorous geometry, frames, time systems, and future SPICE-based preprocessing.

**NASA Technical Reports Server (NTRS)**  
https://ntrs.nasa.gov/

Used for mission-design, orbit-design, navigation, station-keeping, and attitude-control technical literature.

---

## Halo-orbit / CR3BP literature

The educational halo-orbit / Circular Restricted Three-Body Problem work in this project is informed by standard astrodynamics literature. Generic CR3BP results are used only for educational modeling unless mission-specific numerical data are supplied.

**D. L. Richardson (1980)**  
“Analytic construction of periodic orbits about the collinear points”  
*Celestial Mechanics*, 22, 241–253.  
DOI: https://doi.org/10.1007/BF01229511

Used as a classical reference for analytical halo-orbit initial approximations.

**K. C. Howell (1984)**  
“Three-dimensional, periodic, ‘halo’ orbits”  
*Celestial Mechanics*, 32, 53–71.  
DOI: https://doi.org/10.1007/BF01358403

Used as a classical reference for three-dimensional periodic halo-orbit families.

**Implementation note.** `src/physics/cr3bp.js` and `src/missions/roman-transfer.js` use these
results directly: the collinear-point quintic locates Sun–Earth L2, and the linearised saddle
at that point supplies the stable eigenvector from which Roman's displayed transfer is
integrated. The resulting path is a low-energy stable-manifold arc, labelled `LOW_ENERGY_CR3BP`
in the UI; it is a generic CR3BP result, not Roman mission data, and it is a different transfer
class from Roman's direct injection. See docs/SPEC.md section 2.

---

## Software / rendering dependencies

These are implementation dependencies, not scientific data sources.

**Three.js**  
https://threejs.org/

Used for the WebGL / 3D rendering layer.

**satellite.js**  
https://github.com/shashwatak/satellite-js

Used for SGP4 propagation of Hubble TLE data.

---

## Attribution and ownership note

The presence of a source link in this file does not imply endorsement of this project by NASA, JPL, STScI, CelesTrak, or any other organization.

NASA, JPL, STScI, CelesTrak, and the cited authors retain ownership / authorship of their respective documents, scientific results, datasets, mission materials, and trademarks according to their own terms and policies.

This repository's original contribution is the software integration and educational visualization of those publicly available sources. It should not be cited as the originating source for NASA/JPL/STScI/CelesTrak orbital data.

For scientific, operational, or mission-critical use, consult the original source directly.
