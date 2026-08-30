# Upstream Reuse: `simplegames/threebody`

This project intentionally reuses validated orbital-mechanics work from the author's existing repository:

- Repository: `Trina0224/simplegames`
- Upstream directory: `threebody/`
- URL: https://github.com/Trina0224/simplegames/tree/main/threebody

The goal is not to fork the old application wholesale. The goal is to preserve tested numerical machinery and proven interaction concepts while replacing Earth–Moon-specific assumptions with mission-appropriate Sun–Earth and Earth-orbit models.

## Directly reused modules

### `src/core/integrator.js`

Upstream: `threebody/src/integrator.js`

Reason for direct reuse:
- adaptive Dormand–Prince 5(4)
- dense output
- accepted/rejected-step diagnostics
- supports configurable state dimension
- no Earth–Moon mission constants in the numerical tableau

The numerical algorithm should remain bit-for-bit structurally equivalent unless there is a documented numerical reason to change it.

### `src/core/playback.js`

Upstream: `threebody/src/playback.js`

Reason for direct reuse:
- keeps playback semantics separate from propagation
- prevents incomplete/event-terminated trajectories from being falsely looped
- deterministic and independent of rendering

## Modules to generalize

### CR3BP

Upstream references:
- `threebody/src/cr3bp3d.js`
- `threebody/src/lagrange.js`
- `threebody/src/trajectory3d.js`

Action:
- extract the generic two-primary normalized CR3BP equations
- parameterize mass ratio and dimensional scaling
- instantiate Sun–Earth constants separately
- preserve explicit conversion between normalized units and physical units

Do not reuse Earth–Moon `MU`, distance unit, time unit, radii, or barycentric positions in Sun–Earth calculations.

### Halo / Lissajous orbit machinery

Upstream references:
- `threebody/src/halo.js`
- `threebody/src/family3d.js`

Useful upstream work:
- Richardson third-order seed
- differential correction
- continuation in amplitude
- distinction between periodic halo and quasi-periodic Lissajous solutions
- numerical validation philosophy

Primary literature already cited upstream includes:
- Richardson, D. L. (1980), *Analytic construction of periodic orbits about the collinear points*, Celestial Mechanics 22, 241–253. DOI: 10.1007/BF01229511.
- Howell, K. C. (1984), *Three-dimensional, periodic, halo orbits*, Celestial Mechanics 32, 53–71. DOI: 10.1007/BF01358403.

For JWST and Roman, mission ephemerides remain the historical truth source. The halo solver is for validation, educational propagation, experiments, and future/fallback modeling—not a substitute for recorded mission trajectory data.

## Concepts to preserve from the old app

From `threebody/src/app.js` and `threebody/src/render3d.js`:

- one physical trajectory/history, many display frames
- playback speed never modifies the integrated trajectory
- propagation may run in a worker
- renderer never owns orbital truth
- complete orbit can remain visible under traveled trail
- top/side/end/oblique scientific viewpoints are useful for libration-point geometry
- reference planes and projected tracks make out-of-plane motion legible
- camera reset/fit must not trigger reintegration
- numerical diagnostics should remain inspectable

The new renderer should be Three.js/WebGL, not a direct copy of the previous Canvas 2D projection renderer.

## Regression strategy

Before accepting a generalized CR3BP or halo implementation:

1. Reproduce selected upstream Earth–Moon validation cases with the generalized solver.
2. Confirm Jacobi-constant behavior is comparable to the upstream implementation.
3. Confirm planar states remain an invariant subspace of the six-state solver.
4. Add Sun–Earth L1/L2 position sanity checks.
5. Add at least one Sun–Earth halo-family numerical case.
6. Compare mission-scale geometry against NASA/STScI products before using it in observatory visualizations.

## Provenance rule

Every reused/adapted file must include a header such as:

```js
// Adapted from Trina0224/simplegames/threebody/src/<file>
// See docs/UPSTREAM_REUSE.md.
```

When the upstream algorithm is materially changed, document the reason rather than silently diverging.
