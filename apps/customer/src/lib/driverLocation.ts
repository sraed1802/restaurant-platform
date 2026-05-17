export type DriverGpsLocation = {
  lat: number
  lng: number
  updated_at?: string
  accuracy_m?: number | null
}

export function parseDriverLocation(value: unknown): DriverGpsLocation | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const lat = Number(row.lat)
  const lng = Number(row.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return {
    lat,
    lng,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : undefined,
    accuracy_m: row.accuracy_m != null ? Number(row.accuracy_m) : null,
  }
}

export function mapsUrlForLocation(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`
}
