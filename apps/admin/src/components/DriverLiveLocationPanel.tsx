import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { mapsUrlForLocation, parseDriverLocation, type DriverGpsLocation } from '../lib/driverLocation'

export default function DriverLiveLocationPanel({
  driverId,
  enabled,
}: {
  driverId: string
  enabled: boolean
}) {
  const [location, setLocation] = useState<DriverGpsLocation | null>(null)

  useEffect(() => {
    if (!enabled || !driverId) {
      setLocation(null)
      return
    }

    let cancelled = false

    async function load() {
      const { data, error } = await supabase.from('drivers').select('current_location').eq('id', driverId).maybeSingle()
      if (cancelled || error) return
      const row = data as { current_location?: unknown } | null
      setLocation(parseDriverLocation(row?.current_location))
    }

    void load()

    const channel = supabase
      .channel(`admin:driver-location:${driverId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'drivers', filter: `id=eq.${driverId}` },
        (payload) => {
          setLocation(parseDriverLocation((payload.new as { current_location?: unknown }).current_location))
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void channel.unsubscribe()
    }
  }, [driverId, enabled])

  if (!enabled) return null

  return (
    <div className="sl-section">
      <p className="sl-label">Driver live location</p>
      {location ? (
        <p className="sl-val" style={{ fontSize: '0.8rem' }}>
          <a href={mapsUrlForLocation(location.lat, location.lng)} target="_blank" rel="noopener noreferrer">
            View on map
          </a>
          {location.updated_at
            ? ` · updated ${new Date(location.updated_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}`
            : null}
        </p>
      ) : (
        <p className="sl-val" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Waiting for GPS from the driver app…
        </p>
      )}
    </div>
  )
}
