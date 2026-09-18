export function fmtNum(n: number, decimals: number): string {
  return n.toFixed(decimals).replace('.', ',')
}

export function describePoint(lng: number, lat: number, zr?: number): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lng >= 0 ? 'O' : 'W'
  const base = `${fmtNum(Math.abs(lat), 4)} ${ns}, ${fmtNum(Math.abs(lng), 4)} ${ew}`
  return zr === undefined ? base : `${base}, Zoom ${fmtNum(zr, 1)}`
}

/** Spreadsheet-column-style letters for a 0-based index: 0->A, 25->Z, 26->AA, ... */
export function waypointLetter(index: number): string {
  let n = index
  let label = ''
  do {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return label
}
