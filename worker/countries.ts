/**
 * Countries getting the "deep" tier (administrative boundaries down to
 * Kreis-equivalent level, admin_level 2-6). Everything else falls into the
 * "coarse" tier (admin_level 2+4 only) — see overpassEnumeration.ts.
 *
 * Deliberately a plain, editable list, not derived from any external
 * geography library — per CLAUDE.md, nothing about area coverage should be
 * hidden in code the user can't see or adjust. Geographic Europe, minus
 * Russia and Turkey (transcontinental, and their administrative subdivision
 * counts would dwarf the rest of the tier).
 */
export const EUROPE_ISO2: ReadonlySet<string> = new Set([
  'AD', 'AL', 'AT', 'BA', 'BE', 'BG', 'BY', 'CH', 'CY', 'CZ',
  'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GR', 'HR', 'HU',
  'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD', 'ME',
  'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'SE', 'SI',
  'SK', 'SM', 'UA', 'VA',
])
