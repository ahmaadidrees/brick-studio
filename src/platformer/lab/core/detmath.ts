/**
 * Deterministic math (decision 5). ECMAScript lets engines approximate Math.sin/cos/atan/exp/log, so two browsers
 * can disagree in the last bits and a replay drifts. Everything here uses only + - * / and Math.sqrt / floor / abs,
 * which IEEE 754 and ECMAScript define exactly. Degrees in, degrees out, like the blocks.
 */

const PI = 3.141592653589793
const DEG = PI / 180
const LN2 = 0.6931471805599453

/** Reduce degrees into [0, 360). */
function wrap360(d: number): number {
  const r = d - 360 * Math.floor(d / 360)
  return r >= 360 ? 0 : r
}

/** sin of x radians for |x| <= pi/4. Taylor series to x^17; error well under 1e-16 there. */
function sinPoly(x: number): number {
  const x2 = x * x
  let term = x
  let sum = x
  for (let n = 1; n <= 8; n++) {
    term *= -x2 / ((2 * n) * (2 * n + 1))
    sum += term
  }
  return sum
}

/** cos of x radians for |x| <= pi/4. */
function cosPoly(x: number): number {
  const x2 = x * x
  let term = 1
  let sum = 1
  for (let n = 1; n <= 8; n++) {
    term *= -x2 / ((2 * n - 1) * (2 * n))
    sum += term
  }
  return sum
}

/** sin and cos of an angle in [0, 90] degrees, exact at 0, 45-free endpoints. */
function sinCosQuarter(d: number): [number, number] {
  if (d === 0) return [0, 1]
  if (d === 90) return [1, 0]
  if (d <= 45) {
    const x = d * DEG
    return [sinPoly(x), cosPoly(x)]
  }
  const x = (90 - d) * DEG
  return [cosPoly(x), sinPoly(x)]
}

/** [sin, cos] of `deg` degrees. Exact 0/±1 at multiples of 90. Non-finite input gives [NaN, NaN]. */
export function sinCosDeg(deg: number): [number, number] {
  if (!Number.isFinite(deg)) return [NaN, NaN]
  const [s, c] = sinCosRaw(wrap360(deg))
  // + 0 turns -0 into 0 so exact quadrant values compare cleanly.
  return [s + 0, c + 0]
}

function sinCosRaw(d: number): [number, number] {
  if (d < 90) return sinCosQuarter(d)
  if (d < 180) {
    const [s, c] = sinCosQuarter(d - 90)
    return [c, -s]
  }
  if (d < 270) {
    const [s, c] = sinCosQuarter(d - 180)
    return [-s, -c]
  }
  const [s, c] = sinCosQuarter(d - 270)
  return [-c, s]
}

export const sinDeg = (deg: number): number => sinCosDeg(deg)[0]
export const cosDeg = (deg: number): number => sinCosDeg(deg)[1]

/** tan in degrees. Returns ±Infinity where cos is exactly 0 (90 → Infinity, 270 → -Infinity). */
export function tanDeg(deg: number): number {
  const [s, c] = sinCosDeg(deg)
  if (c === 0) return s > 0 ? Infinity : -Infinity
  return s / c
}

/** atan in radians for |t| <= 1, using argument halving then a short series. */
function atanSmall(t: number): number {
  // atan(t) = 2 atan(t / (1 + sqrt(1 + t^2))), applied twice brings |t| below ~0.2.
  let scale = 1
  for (let i = 0; i < 2; i++) {
    t = t / (1 + Math.sqrt(1 + t * t))
    scale *= 2
  }
  const t2 = t * t
  let term = t
  let sum = t
  for (let n = 1; n <= 14; n++) {
    term *= -t2
    sum += term / (2 * n + 1)
  }
  return sum * scale
}

/** atan in radians. */
function atanRad(t: number): number {
  if (Number.isNaN(t)) return NaN
  if (t === Infinity) return PI / 2
  if (t === -Infinity) return -PI / 2
  if (t > 1) return PI / 2 - atanSmall(1 / t)
  if (t < -1) return -PI / 2 - atanSmall(1 / t)
  return atanSmall(t)
}

/** atan in degrees. */
export const atanDeg = (t: number): number => atanRad(t) / DEG

/** atan2(y, x) in degrees, in (-180, 180]. */
export function atan2Deg(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN
  if (x === 0 && y === 0) return 0
  if (x > 0) return atanDeg(y / x)
  if (x < 0) return y >= 0 ? atanDeg(y / x) + 180 : atanDeg(y / x) - 180
  return y > 0 ? 90 : -90
}

/** asin in degrees; NaN outside [-1, 1]. */
export function asinDeg(v: number): number {
  if (!(v >= -1 && v <= 1)) return NaN
  return atan2Deg(v, Math.sqrt(1 - v * v))
}

/** acos in degrees; NaN outside [-1, 1]. */
export function acosDeg(v: number): number {
  if (!(v >= -1 && v <= 1)) return NaN
  return atan2Deg(Math.sqrt(1 - v * v), v)
}

/** Multiply by 2^k exactly (powers of two are exact in binary floating point). */
function scale2(x: number, k: number): number {
  while (k > 0) {
    const step = Math.min(k, 60)
    x *= 2 ** step
    k -= step
  }
  while (k < 0) {
    const step = Math.min(-k, 60)
    x /= 2 ** step
    k += step
  }
  return x
}

/** e^x. */
export function exp(x: number): number {
  if (Number.isNaN(x)) return NaN
  if (x === Infinity) return Infinity
  if (x === -Infinity) return 0
  if (x > 709.8) return Infinity
  if (x < -745.2) return 0
  const k = Math.floor(x / LN2 + 0.5)
  const r = x - k * LN2 // |r| <= ~0.35
  let term = 1
  let sum = 1
  for (let n = 1; n <= 24; n++) {
    term *= r / n
    sum += term
  }
  return scale2(sum, k)
}

/** Natural log. */
export function ln(x: number): number {
  if (Number.isNaN(x) || x < 0) return NaN
  if (x === 0) return -Infinity
  if (x === Infinity) return Infinity
  // Bring m into [sqrt(1/2), sqrt(2)) with x = m * 2^k.
  let k = 0
  let m = x
  while (m >= 1.4142135623730951) {
    m /= 2
    k++
  }
  while (m < 0.7071067811865476) {
    m *= 2
    k--
  }
  // ln(m) = 2 atanh(s), s = (m - 1) / (m + 1), |s| < 0.172
  const s = (m - 1) / (m + 1)
  const s2 = s * s
  let term = s
  let sum = s
  for (let n = 1; n <= 20; n++) {
    term *= s2
    sum += term / (2 * n + 1)
  }
  return 2 * sum + k * LN2
}

/** log base 10. */
export const log10 = (x: number): number => ln(x) / 2.302585092994046

/** 10^x. */
export const pow10 = (x: number): number => exp(x * 2.302585092994046)
