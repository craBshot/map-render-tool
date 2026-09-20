/**
 * Blends a hex color toward white by `amount` (0..1) — used to give a
 * chain's alternating hold/travel segments two solid tones of the same
 * hue instead of a diagonal-stripe pattern (explicitly requested: plain
 * light/dark, not a stripe/pattern mix).
 */
export function lighten(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = (num >> 16) & 0xff
  const g = (num >> 8) & 0xff
  const b = num & 0xff
  const blend = (channel: number) => Math.round(channel + (255 - channel) * amount)
  return `#${[blend(r), blend(g), blend(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}
