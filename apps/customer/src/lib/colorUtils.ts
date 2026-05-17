/** Blend a hex background toward white for subtle elevation surfaces */
export function elevateSurfaceHex(hex: string, towardWhite = 0.06): string {
  const m = hex.trim().match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i)
  if (!m) return hex
  const r = parseInt(m[1], 16)
  const g = parseInt(m[2], 16)
  const b = parseInt(m[3], 16)
  const mix = (c: number) => Math.round(c + (255 - c) * towardWhite)
  const nr = mix(r)
  const ng = mix(g)
  const nb = mix(b)
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`
}
