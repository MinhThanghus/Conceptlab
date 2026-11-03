import { useEffect, useRef } from 'react'
import * as mapboxgl from 'mapbox-gl/esm'
import 'mapbox-gl/mapbox-gl.css'

/** Loaded only after the learner explicitly enables Mapbox with a public token. */
export default function MapboxGlobe({ token, longitude, latitude, onError }) {
  const container = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)

  useEffect(() => {
    let map
    let marker
    try {
      map = new mapboxgl.Map({
        container: container.current,
        accessToken: token,
        style: 'mapbox://styles/mapbox/standard',
        projection: 'globe',
        center: [longitude, latitude],
        zoom: 1.4,
        attributionControl: true,
      })
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
      marker = new mapboxgl.Marker({ color: '#c34a37' }).setLngLat([longitude, latitude]).addTo(map)
      map.on('error', onError)
      mapRef.current = map
      markerRef.current = marker
    } catch {
      onError()
    }
    return () => {
      mapRef.current = null
      markerRef.current = null
      marker?.remove()
      map?.remove()
    }
    // The map is deliberately recreated only when the token changes, not each slider move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, onError])

  useEffect(() => {
    markerRef.current?.setLngLat([longitude, latitude])
    mapRef.current?.jumpTo({ center: [longitude, latitude] })
  }, [longitude, latitude])

  return <div className="geo-map" ref={container} />
}
