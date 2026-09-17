/** Cubic ease-in-out, used for the camera zoom curve. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** Overshoot-and-settle curve, used for the marker pop-in animation. */
export function easeOutBack(x: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

/** Plain decelerating ramp (no overshoot), used for the area fade-in. */
export function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t)
}
