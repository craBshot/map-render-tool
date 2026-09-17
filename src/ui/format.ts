export function fmtNum(n: number, decimals: number): string {
  return n.toFixed(decimals).replace('.', ',')
}

export function describePoint(lng: number, lat: number, zr?: number): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lng >= 0 ? 'O' : 'W'
  const base = `${fmtNum(Math.abs(lat), 4)} ${ns}, ${fmtNum(Math.abs(lng), 4)} ${ew}`
  return zr === undefined ? base : `${base}, Zoom ${fmtNum(zr, 1)}`
}
