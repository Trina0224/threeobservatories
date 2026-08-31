// Periodic halo orbits about a collinear libration point.
//
// Two stages, which is how this is normally done:
//
//   1. Richardson's third-order analytic approximation supplies a starting
//      state. It is close but not periodic.
//   2. Differential correction drives it onto an actual periodic orbit: from a
//      perpendicular crossing of the xz-plane, integrate to the next crossing
//      and Newton on the initial state until the velocity there is perpendicular
//      again.
//
// Which two variables you free decides *which* orbit you get, and getting it
// wrong is silent. `correctHalo` frees (z0, vy0), so Newton may walk the
// out-of-plane amplitude to zero and land on the planar Lyapunov orbit, which
// is periodic, closes to under a kilometre, and is not a halo. Use
// `correctHaloAtAmplitude` -- which holds z0 and frees (x0, vy0) -- whenever the
// amplitude matters, and reach large amplitudes with `continueHaloFrom`, since
// the Richardson guess is outside Newton's basin at this stiffness.
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
  // Richardson also defines d2; none of the terms below use it, so it is not
  // computed here.
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

/**
 * Amplitude-preserving corrector: hold z0, free x0 and vy0.
 *
 * This is the difference between finding *a* periodic orbit and finding the one
 * you asked for. `correctHalo` frees z0, so nothing stops Newton from walking
 * the out-of-plane amplitude down to zero -- and z = 0 is the planar Lyapunov
 * orbit, which is perfectly periodic and closes to a fraction of a kilometre.
 * Nothing about the residual looks wrong; the orbit is simply not a halo. A
 * scan of the family showed it collapsing that way at almost every requested
 * amplitude, with one lucky exception.
 *
 * Holding z0 fixes the amplitude, so the only solutions Newton can reach are
 * genuine halos of the requested size. The targets are the same: vx = vz = 0 at
 * the next perpendicular crossing of the xz-plane.
 */
export function correctHaloAtAmplitude(system, guessState, {
  span = 2.2,
  steps = 4000,
  minTime = 0.6,
  tolerance = 1e-11,
  iterations = 60,
  difference = 1e-8,
  maxStep = 5e-3,
} = {}) {
  const [initialX, , z0, , initialVy] = guessState;
  let x0 = initialX;
  let vy0 = initialVy;
  const options = { span, steps, minTime };
  const crossingFor = (x, vy) => nextPlaneCrossing(system, [x, 0, z0, 0, vy, 0], options);

  for (let i = 0; i < iterations; i += 1) {
    const crossing = crossingFor(x0, vy0);
    if (!crossing) return null;
    const [, , , vx, , vz] = crossing.state;
    if (Math.max(Math.abs(vx), Math.abs(vz)) < tolerance) {
      return { state: [x0, 0, z0, 0, vy0, 0], period: 2 * crossing.time, iterations: i };
    }
    const byX = crossingFor(x0 + difference, vy0);
    const byVy = crossingFor(x0, vy0 + difference);
    if (!byX || !byVy) return null;
    const j11 = (byX.state[3] - vx) / difference;
    const j12 = (byVy.state[3] - vx) / difference;
    const j21 = (byX.state[5] - vz) / difference;
    const j22 = (byVy.state[5] - vz) / difference;
    const determinant = j11 * j22 - j12 * j21;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-24) return null;
    let dx = (-vx * j22 + vz * j12) / determinant;
    let dv = (-j11 * vz + j21 * vx) / determinant;
    const largest = Math.max(Math.abs(dx), Math.abs(dv));
    if (largest > maxStep) {
      const scale = maxStep / largest;
      dx *= scale;
      dv *= scale;
    }
    x0 += dx;
    vy0 += dv;
  }
  return null;
}

/**
 * Walk the halo family from a small out-of-plane amplitude up to `targetZ`,
 * correcting at each step and using each solution to seed the next.
 *
 * Continuation rather than a single solve because the Richardson guess is a
 * third-order approximation: it is close enough to converge for small
 * amplitudes and drifts away as the amplitude grows. Stepping keeps every
 * Newton start inside its basin.
 *
 * `seed(z)` supplies the initial guess at the smallest amplitude.
 */
export function continueHaloToAmplitude(system, seed, targetZ, {
  startZ = Math.sign(targetZ) * 2e-5,
  stepCount = 24,
  ...options
} = {}) {
  let solution = null;
  let guess = null;
  for (let i = 0; i <= stepCount; i += 1) {
    // Geometric spacing: the family changes fastest at small amplitude.
    const z = startZ * (targetZ / startZ) ** (i / stepCount);
    const start = guess
      ? [guess[0], 0, z, 0, guess[4], 0]
      : (() => { const g = seed(z); return g && [g[0], 0, z, 0, g[4], 0]; })();
    if (!start) return null;
    const next = correctHaloAtAmplitude(system, start, options);
    if (!next) return solution;
    solution = next;
    guess = next.state;
  }
  return solution;
}

/**
 * Monodromy matrix: the state transition across one full period, by finite
 * differences. Six integrations rather than 36 variational equations.
 *
 * Pass a negative `period` to get the transition of the backward flow, whose
 * dominant direction is the *stable* direction of the forward flow.
 */
export function monodromy(system, state, period, { steps = 4000, difference = 1e-7 } = {}) {
  const flow = (start) => {
    const dt = period / steps;
    let current = start;
    for (let i = 0; i < steps; i += 1) current = system.step(current, dt);
    return current;
  };
  const base = flow(state);
  const matrix = Array.from({ length: 6 }, () => new Array(6).fill(0));
  for (let column = 0; column < 6; column += 1) {
    const perturbed = Array.from(state);
    perturbed[column] += difference;
    const moved = flow(perturbed);
    for (let row = 0; row < 6; row += 1) {
      matrix[row][column] = (moved[row] - base[row]) / difference;
    }
  }
  return { matrix, base };
}

/**
 * Dominant eigenvector of a 6x6 by power iteration, returned as a unit vector
 * with its eigenvalue. A halo's monodromy has a real reciprocal pair with a
 * large unstable eigenvalue, so this converges quickly and a full eigensolver
 * would be overkill.
 */
export function dominantEigenvector(matrix, { iterations = 400 } = {}) {
  let vector = [1, 0, 0, 0, 1, 0];
  let eigenvalue = 0;
  for (let i = 0; i < iterations; i += 1) {
    const next = matrix.map((row) => row.reduce((sum, value, j) => sum + value * vector[j], 0));
    eigenvalue = Math.hypot(...next);
    if (!(eigenvalue > 0)) return null;
    vector = next.map((value) => value / eigenvalue);
  }
  return { vector, eigenvalue };
}
