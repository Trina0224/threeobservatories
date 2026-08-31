// Periodic halo orbits about a collinear libration point.
//
// Two stages, which is how this is normally done:
//
//   1. Richardson's third-order analytic approximation supplies a starting
//      state. It is close but not periodic.
//   2. Differential correction drives it onto an actual periodic orbit: from a
//      perpendicular crossing of the xz-plane, integrate to the next crossing
//      and Newton on the initial state until the velocity there is perpendicular
//      again. Free variables are z0 and vy0, with x0 held; freeing (x0, vy0)
//      instead leaves vz uncontrolled and wanders off the family.
//
// The Jacobian is finite-differenced rather than propagated as a state
// transition matrix. That costs two extra integrations per Newton step and
// saves carrying 36 variational equations, and the convergence check is the
// same either way: the orbit must close on itself.
//
// Richardson, D. L. (1980), Celestial Mechanics 22, 241-253 -- see reference.md.
// Amplitudes in Richardson's construction are in units of gamma, the distance
// from the secondary to the libration point, not in system units. Mixing those
// up silently produces amplitudes about a hundred times too large.
//
// Layer rule (AGENTS.md): pure orbital mechanics, no Three.js, no mission
// constants. Plain arrays for state.

/** Richardson's series coefficients for the L2 point of a system. */
export function richardsonCoefficients(mu, gamma) {
  const cn = (n) => ((-1) ** n / gamma ** 3)
    * (mu + ((1 - mu) * gamma ** (n + 1)) / (1 + gamma) ** (n + 1));
  const c2 = cn(2);
  const c3 = cn(3);
  const c4 = cn(4);
  const lambda = Math.sqrt((2 - c2 + Math.sqrt(9 * c2 * c2 - 8 * c2)) / 2);
  const k = (lambda * lambda + 1 + 2 * c2) / (2 * lambda);
  const l2s = lambda * lambda;

  const d1 = ((3 * l2s) / k) * (k * (6 * l2s - 1) - 2 * lambda);
  const d2 = ((8 * l2s) / k) * (k * (11 * l2s - 1) - 2 * lambda);
  const a21 = (3 * c3 * (k * k - 2)) / (4 * (1 + 2 * c2));
  const a22 = (3 * c3) / (4 * (1 + 2 * c2));
  const a23 = -((3 * c3 * lambda) / (4 * k * d1)) * (3 * k ** 3 * lambda - 6 * k * (k - lambda) + 4);
  const a24 = -((3 * c3 * lambda) / (4 * k * d1)) * (2 + 3 * k * lambda);
  const b21 = -((3 * c3 * lambda) / (2 * d1)) * (3 * k * lambda - 4);
  const b22 = (3 * c3 * lambda) / d1;
  const d21 = -c3 / (2 * l2s);

  const denominator = 2 * lambda * (lambda * (1 + k * k) - 2 * k);
  const s1 = (1.5 * c3 * (2 * a21 * (k * k - 2) - a23 * (k * k + 2) - 2 * k * b21)
    - 0.375 * c4 * (3 * k ** 4 - 8 * k * k + 8)) / denominator;
  const s2 = (1.5 * c3 * (2 * a22 * (k * k - 2) + a24 * (k * k + 2) + 2 * k * b22 + 5 * d21)
    + 0.375 * c4 * (12 - k * k)) / denominator;
  const a1 = -1.5 * c3 * (2 * a21 + a23 + 5 * d21) - 0.375 * c4 * (12 - k * k);
  const a2 = 1.5 * c3 * (a24 - 2 * a22) + 1.125 * c4;

  return {
    c2, c3, c4, lambda, k, a21, a22, s1, s2,
    l1: a1 + 2 * l2s * s1,
    l2: a2 + 2 * l2s * s2,
    delta: l2s - c2,
  };
}

/**
 * Starting state for a halo of out-of-plane amplitude `azGamma` (in units of
 * gamma), at the perpendicular xz-plane crossing. Returns null if the amplitude
 * constraint has no real in-plane amplitude, which is what happens below the
 * family's minimum.
 */
export function richardsonGuess(coefficients, pointX, gamma, azGamma) {
  const { lambda, k, a21, a22, s1, s2, l1, l2, delta } = coefficients;
  const inner = -(l2 * azGamma * azGamma + delta) / l1;
  if (!(inner > 0)) return null;
  const axGamma = Math.sqrt(inner);
  const frequency = 1 + s1 * axGamma * axGamma + s2 * azGamma * azGamma;
  return {
    axGamma,
    azGamma,
    state: [
      pointX + gamma * (-axGamma + a21 * axGamma * axGamma + a22 * azGamma * azGamma),
      0,
      gamma * azGamma,
      0,
      gamma * k * axGamma * lambda * frequency,
      0,
    ],
  };
}

/** Integrate to the next crossing of the xz-plane, refining the crossing time. */
function nextPlaneCrossing(system, state, { span, steps, minTime }) {
  const dt = span / steps;
  let current = state;
  let time = 0;
  for (let i = 0; i < steps; i += 1) {
    const previous = current;
    const previousTime = time;
    current = system.step(current, dt);
    time += dt;
    if (time > minTime && previous[1] * current[1] < 0) {
      let low = 0;
      let high = dt;
      for (let j = 0; j < 60; j += 1) {
        const mid = (low + high) / 2;
        if (system.step(previous, mid)[1] * previous[1] < 0) high = mid;
        else low = mid;
      }
      return { time: previousTime + high, state: system.step(previous, high) };
    }
  }
  return null;
}

/**
 * Differentially correct a guess onto a periodic halo. `x0` is held; `z0` and
 * `vy0` move until the crossing velocity is perpendicular to the plane again.
 */
export function correctHalo(system, guessState, {
  span = 2.2,
  steps = 4000,
  minTime = 0.6,
  tolerance = 1e-12,
  iterations = 40,
  difference = 1e-7,
  maxStep = 5e-4,
} = {}) {
  const [x0, , initialZ, , initialVy] = guessState;
  let z0 = initialZ;
  let vy0 = initialVy;
  const options = { span, steps, minTime };
  const residual = (z, vy) => nextPlaneCrossing(system, [x0, 0, z, 0, vy, 0], options);

  for (let i = 0; i < iterations; i += 1) {
    const crossing = residual(z0, vy0);
    if (!crossing) return null;
    const [, , , vx, , vz] = crossing.state;
    if (Math.max(Math.abs(vx), Math.abs(vz)) < tolerance) {
      return { state: [x0, 0, z0, 0, vy0, 0], period: 2 * crossing.time, iterations: i };
    }
    const byZ = residual(z0 + difference, vy0);
    const byVy = residual(z0, vy0 + difference);
    if (!byZ || !byVy) return null;
    const j11 = (byZ.state[3] - vx) / difference;
    const j12 = (byVy.state[3] - vx) / difference;
    const j21 = (byZ.state[5] - vz) / difference;
    const j22 = (byVy.state[5] - vz) / difference;
    const determinant = j11 * j22 - j12 * j21;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-20) return null;
    let dz = (-vx * j22 + vz * j12) / determinant;
    let dv = (-j11 * vz + j21 * vx) / determinant;
    // Newton can throw the state clean off the family on the first steps; cap
    // the move rather than restarting from a different guess.
    const largest = Math.max(Math.abs(dz), Math.abs(dv));
    if (largest > maxStep) {
      const scale = maxStep / largest;
      dz *= scale;
      dv *= scale;
    }
    z0 += dz;
    vy0 += dv;
  }
  return null;
}
