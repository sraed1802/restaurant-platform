import { useEffect } from 'react'
import { publishDriverLocation } from '../services/driverLocation'
import type { DriverStatus } from '../services/driverInbox'

const PUBLISH_INTERVAL_MS = 20_000

export function useDriverLocationPublisher(options: {
  enabled: boolean
  driverStatus: DriverStatus | undefined
}) {
  const shouldTrack =
    options.enabled && (options.driverStatus === 'busy' || options.driverStatus === 'available')

  useEffect(() => {
    if (!shouldTrack || typeof navigator === 'undefined' || !navigator.geolocation) return

    let cancelled = false

    async function publishPosition(position: GeolocationPosition) {
      if (cancelled) return
      try {
        await publishDriverLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy_m: position.coords.accuracy,
          heading: position.coords.heading ?? undefined,
        })
      } catch (err) {
        console.warn('Driver location publish failed', err)
      }
    }

    function onPosition(position: GeolocationPosition) {
      void publishPosition(position)
    }

    function onError(err: GeolocationPositionError) {
      console.warn('Driver geolocation error', err.code, err.message)
    }

    navigator.geolocation.getCurrentPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 10_000,
      timeout: 15_000,
    })

    const watchId = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: PUBLISH_INTERVAL_MS,
      timeout: 20_000,
    })

    const intervalId = window.setInterval(() => {
      navigator.geolocation.getCurrentPosition(onPosition, onError, {
        enableHighAccuracy: true,
        maximumAge: 5_000,
        timeout: 15_000,
      })
    }, PUBLISH_INTERVAL_MS)

    return () => {
      cancelled = true
      navigator.geolocation.clearWatch(watchId)
      window.clearInterval(intervalId)
    }
  }, [shouldTrack])
}
