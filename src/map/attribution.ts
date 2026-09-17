const ATTRIBUTION = '© OpenMapTiles  © OpenStreetMap-Mitwirkende'

/**
 * Draws attribution directly into the export canvas — the DOM attribution
 * control is disabled, since DOM elements are never part of the export.
 */
export function drawAttribution(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const size = Math.round(Math.max(11, width / 150))
  ctx.font = `500 ${size}px Barlow, "Segoe UI", sans-serif`
  const pad = Math.round(size * 0.5)
  const w = ctx.measureText(ATTRIBUTION).width + pad * 2
  const h = size + pad * 1.4
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.fillRect(width - w, height - h, w, h)
  ctx.fillStyle = '#333'
  ctx.textBaseline = 'middle'
  ctx.fillText(ATTRIBUTION, width - w + pad, height - h / 2)
}
