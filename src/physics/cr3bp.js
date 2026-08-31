// Circular Restricted Three-Body Problem, parameterised by mass ratio.
//
// Layer rule (AGENTS.md): pure orbital mechanics. No Three.js, no mission
// constants, and no Earth-Moon normalisation baked in -- the caller supplies
// the mass parameter, so the same code serves Sun-Earth and any other pair.
//
// Normalised units throughout: the primary separation is 1, the mean motion is
// 1, so one time unit is 1/(2*pi) of the system's orbital period. The rotating
// frame puts the larger primary at x = -mu and the smaller at x = 1 - mu, with
// +z along the orbit normal. State vectors are plain arrays
// [x, y, z, vx, vy, vz].
//
// References for the collinear-point and linearisation results:
//   Richardson, D. L. (1980), Celestial Mechanics 22, 241-253.
//   Howell, K. C. (1984), Celestial Mechanics 32, 53-71.
// Both are recorded in reference.md.

export function createCr3bp(mu) {
  const secondaryX = 1 - mu;
  const primaryX = -mu;

  // Scratch buffers. A transfer solve runs tens of thousands of steps, and
  // allocating five arrays per step dominated the cost; only the returned state
  // is fresh, because callers keep references to it.
  const k1 = new Float64Array(6);
  const k2 = new Float64Array(6);
  const k3 = new Float64Array(6);
  const k4 = new Float64Array(6);
  const temp = new Float64Array(6);

  /** Equations of motion in the rotating frame, written into `out`. */
  function derivative(state, out) {
    const [x, y, z, vx, vy, vz] = state;
    const dxPrimary = x + mu;
    const dxSecondary = x - secondaryX;
    const r1 = Math.hypot(dxPrimary, y, z);
    const r2 = Math.hypot(dxSecondary, y, z);
    const a = (1 - mu) / (r1 * r1 * r1);
    const b = mu / (r2 * r2 * r2);
    out[0] = vx;
    out[1] = vy;
    out[2] = vz;
    out[3] = 2 * vy + x - a * dxPrimary - b * dxSecondary;
    out[4] = -2 * vx + y - a * y - b * y;
    out[5] = -a * z - b * z;
    return out;
  }

  /** Classical RK4. `dt` may be negative to integrate backwards. */
  function step(state, dt) {
    derivative(state, k1);
    for (let i = 0; i < 6; i += 1) temp[i] = state[i] + k1[i] * (dt / 2);
    derivative(temp, k2);
    for (let i = 0; i < 6; i += 1) temp[i] = state[i] + k2[i] * (dt / 2);
    derivative(temp, k3);
    for (let i = 0; i < 6; i += 1) temp[i] = state[i] + k3[i] * dt;
    derivative(temp, k4);
    const next = new Float64Array(6);
    for (let i = 0; i < 6; i += 1) {
      next[i] = state[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    }
    return next;
  }

  /**
   * Jacobi constant. It is the only integral of motion here, so its drift over
   * an integration is the honest measure of how good that integration was.
   */
  function jacobi(state) {
    const [x, y, z, vx, vy, vz] = state;
    const r1 = Math.hypot(x + mu, y, z);
    const r2 = Math.hypot(x - secondaryX, y, z);
    return x * x + y * y + 2 * (1 - mu) / r1 + 2 * mu / r2 - (vx * vx + vy * vy + vz * vz);
  }

  /**
   * Distance from the smaller primary to a collinear point, by Newton on the
   * classical quintic. `which` is 'L1' (sunward) or 'L2' (anti-sunward).
   */
  function collinearGamma(which) {
    const outward = which === 'L2';
    let gamma = Math.cbrt(mu / 3);
    for (let i = 0; i < 200; i += 1) {
      const s = outward ? 1 : -1;
      const f = gamma ** 5 + s * (3 - mu) * gamma ** 4 + (3 - 2 * mu) * gamma ** 3
        - mu * gamma * gamma - s * 2 * mu * gamma - mu;
      const df = 5 * gamma ** 4 + s * 4 * (3 - mu) * gamma ** 3 + 3 * (3 - 2 * mu) * gamma * gamma
        - 2 * mu * gamma - s * 2 * mu;
      const delta = f / df;
      gamma -= delta;
      if (Math.abs(delta) < 1e-15) break;
    }
    return gamma;
  }

  /**
   * Linearised dynamics about a collinear point: the in-plane saddle rate
   * `lambda`, the eigenvector slope `beta`, and the out-of-plane frequency `nu`.
   */
  function collinearLinearisation(pointX, gamma) {
    const c2 = (1 - mu) / Math.abs(pointX + mu) ** 3 + mu / gamma ** 3;
    const uxx = 1 + 2 * c2;
    const uyy = 1 - c2;
    const b = 4 - uxx - uyy;
    const lambdaSquared = (-b + Math.sqrt(b * b - 4 * uxx * uyy)) / 2;
    const lambda = Math.sqrt(lambdaSquared);
    return { c2, lambda, beta: (lambdaSquared - uxx) / (2 * lambda), nu: Math.sqrt(c2) };
  }

  return { mu, primaryX, secondaryX, derivative, step, jacobi, collinearGamma, collinearLinearisation };
}
