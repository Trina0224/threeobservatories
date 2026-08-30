// Reused from Trina0224/simplegames/threebody/src/integrator.js
// See docs/UPSTREAM_REUSE.md.
//
// Adaptive Dormand-Prince 5(4) with dense output.

const C2 = 1 / 5, C3 = 3 / 10, C4 = 4 / 5, C5 = 8 / 9;
const A21 = 1 / 5;
const A31 = 3 / 40, A32 = 9 / 40;
const A41 = 44 / 45, A42 = -56 / 15, A43 = 32 / 9;
const A51 = 19372 / 6561, A52 = -25360 / 2187, A53 = 64448 / 6561, A54 = -212 / 729;
const A61 = 9017 / 3168, A62 = -355 / 33, A63 = 46732 / 5247, A64 = 49 / 176, A65 = -5103 / 18656;
const B1 = 35 / 384, B3 = 500 / 1113, B4 = 125 / 192, B5 = -2187 / 6784, B6 = 11 / 84;
const E1 = B1 - 5179 / 57600, E3 = B3 - 7571 / 16695, E4 = B4 - 393 / 640;
const E5 = B5 + 92097 / 339200, E6 = B6 - 187 / 2100, E7 = -1 / 40;
const D1 = -12715105075 / 11282082432, D3 = 87487479700 / 32700410799;
const D4 = -10690763975 / 1880347072, D5 = 701980252875 / 199316789632;
const D6 = -1453857185 / 822651844, D7 = 69997945 / 29380423;

const N_DEFAULT = 4;

export class Dopri5 {
  constructor(f, { absTol = 1e-12, relTol = 1e-12, minStep = 1e-12, maxStep = 1, dim = N_DEFAULT } = {}) {
    this.f = f;
    this.absTol = absTol;
    this.relTol = relTol;
    this.minStep = minStep;
    this.maxStep = maxStep;
    this.dim = dim;
    this.accepted = 0;
    this.rejected = 0;
    this.k = Array.from({ length: 7 }, () => new Float64Array(dim));
    this.tmp = new Float64Array(dim);
    this.y1 = new Float64Array(dim);
    this.cont = Array.from({ length: 5 }, () => new Float64Array(dim));
  }

  reset() {
    this.accepted = 0;
    this.rejected = 0;
    this.hasK1 = false;
    this.failed = false;
  }

  step(t, y, h) {
    const { f, k } = this;
    const N = this.dim;
    const [k1, k2, k3, k4, k5, k6, k7] = k;
    const tmp = this.tmp, y1 = this.y1;

    if (!this.hasK1) {
      const d = f(t, y);
      for (let i = 0; i < N; i++) k1[i] = d[i];
      this.hasK1 = true;
    }

    let tries = 0;
    for (;;) {
      if (!Number.isFinite(h) || h === 0) h = this.minStep * (this.dir || 1);
      h = Math.min(Math.abs(h), this.maxStep) * Math.sign(h);
      if (Math.abs(h) < this.minStep) h = this.minStep * Math.sign(h);

      for (let i = 0; i < N; i++) tmp[i] = y[i] + h * A21 * k1[i];
      let d = f(t + C2 * h, tmp); for (let i = 0; i < N; i++) k2[i] = d[i];
      for (let i = 0; i < N; i++) tmp[i] = y[i] + h * (A31 * k1[i] + A32 * k2[i]);
      d = f(t + C3 * h, tmp); for (let i = 0; i < N; i++) k3[i] = d[i];
      for (let i = 0; i < N; i++) tmp[i] = y[i] + h * (A41 * k1[i] + A42 * k2[i] + A43 * k3[i]);
      d = f(t + C4 * h, tmp); for (let i = 0; i < N; i++) k4[i] = d[i];
      for (let i = 0; i < N; i++) tmp[i] = y[i] + h * (A51 * k1[i] + A52 * k2[i] + A53 * k3[i] + A54 * k4[i]);
      d = f(t + C5 * h, tmp); for (let i = 0; i < N; i++) k5[i] = d[i];
      for (let i = 0; i < N; i++) tmp[i] = y[i] + h * (A61 * k1[i] + A62 * k2[i] + A63 * k3[i] + A64 * k4[i] + A65 * k5[i]);
      d = f(t + h, tmp); for (let i = 0; i < N; i++) k6[i] = d[i];
      for (let i = 0; i < N; i++) y1[i] = y[i] + h * (B1 * k1[i] + B3 * k3[i] + B4 * k4[i] + B5 * k5[i] + B6 * k6[i]);
      d = f(t + h, y1); for (let i = 0; i < N; i++) k7[i] = d[i];

      let err = 0;
      for (let i = 0; i < N; i++) {
        const e = h * (E1 * k1[i] + E3 * k3[i] + E4 * k4[i] + E5 * k5[i] + E6 * k6[i] + E7 * k7[i]);
        const sc = this.absTol + this.relTol * Math.max(Math.abs(y[i]), Math.abs(y1[i]));
        err += (e / sc) ** 2;
      }
      err = Math.sqrt(err / N);

      const fac = Number.isFinite(err) && err > 0
        ? Math.min(5, Math.max(0.2, 0.9 * err ** -0.2))
        : (Number.isFinite(err) ? 5 : 0.2);
      const hNext = h * fac;

      let finite = true;
      for (let i = 0; i < N; i++) {
        if (!Number.isFinite(y1[i])) {
          finite = false;
          break;
        }
      }
      if (!finite && ++tries > 60) {
        this.failed = true;
        return { h: 0, hNext: this.minStep, err: Infinity, failed: true };
      }

      if (finite && (err <= 1 || Math.abs(h) <= this.minStep)) {
        this.accepted += 1;
        this._buildInterpolant(y, y1, h);
        for (let i = 0; i < N; i++) k1[i] = k7[i];
        this.t = t;
        this.h = h;
        for (let i = 0; i < N; i++) y[i] = y1[i];
        return { h, hNext, err };
      }
      this.rejected += 1;
      h = hNext;
    }
  }

  _buildInterpolant(y0, y1, h) {
    const N = this.dim;
    const [k1, , k3, k4, k5, k6, k7] = this.k;
    const [c0, c1, c2, c3, c4] = this.cont;
    for (let i = 0; i < N; i++) {
      const dy = y1[i] - y0[i];
      c0[i] = y0[i];
      c1[i] = dy;
      c2[i] = h * k1[i] - dy;
      c3[i] = dy - h * k7[i] - c2[i];
      c4[i] = h * (D1 * k1[i] + D3 * k3[i] + D4 * k4[i] + D5 * k5[i] + D6 * k6[i] + D7 * k7[i]);
    }
  }

  interpolate(th, out) {
    const N = this.dim;
    const [c0, c1, c2, c3, c4] = this.cont;
    const s = 1 - th;
    for (let i = 0; i < N; i++) {
      out[i] = c0[i] + th * (c1[i] + s * (c2[i] + th * (c3[i] + s * c4[i])));
    }
    return out;
  }
}
