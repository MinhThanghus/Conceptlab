// A teaching approximation: solar declination follows a 365-day circular orbit.
// It neglects the equation of time, refraction and the finite size of the Sun.
const rad = (degrees) => degrees * Math.PI / 180

export function solarDeclination(day) {
  return 23.44 * Math.sin(2 * Math.PI * (Number(day) - 80) / 365)
}

// SphereGeometry's map uses +X for Greenwich and -Z for 90° east. Keeping
// this convention here aligns geographic markers with the equirectangular map.
export function geographicDirection(latitude, longitude) {
  const lat = rad(Number(latitude))
  const lon = rad(Number(longitude))
  return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)]
}

// The hour control is LOCAL SOLAR time, not civil clock time. A location at
// solar noon shares the subsolar meridian; every hour shifts it by 15°.
export function subsolarLongitude(longitude, localSolarHour) {
  return ((Number(longitude) - 15 * (Number(localSolarHour) - 12) + 540) % 360) - 180
}

export function daylightHours(latitude, day) {
  const lat = Math.max(-90, Math.min(90, Number(latitude)))
  const declination = solarDeclination(day)
  // At an exact pole on the model equinox, the Sun's centre stays exactly on
  // the ideal horizon; treating this degenerate case as 12 hours is misleading.
  if (Math.abs(Math.cos(rad(lat))) < 1e-12 && Math.abs(Math.sin(rad(declination))) < 1e-12) return null
  const solarNoon = Math.sin(rad(lat)) * Math.sin(rad(declination)) + Math.cos(rad(lat)) * Math.cos(rad(declination))
  const solarMidnight = Math.sin(rad(lat)) * Math.sin(rad(declination)) - Math.cos(rad(lat)) * Math.cos(rad(declination))
  if (solarMidnight >= 0) return 24
  if (solarNoon <= 0) return 0
  const cosHourAngle = -Math.tan(rad(lat)) * Math.tan(rad(declination))
  return 24 * Math.acos(Math.max(-1, Math.min(1, cosHourAngle))) / Math.PI
}

export function sunAboveHorizon(latitude, day, hour) {
  const lat = rad(Number(latitude))
  const declination = rad(solarDeclination(day))
  const hourAngle = (Number(hour) - 12) * Math.PI / 12
  const altitude = Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle)
  return Math.abs(altitude) < 1e-12 ? null : altitude > 0
}

export function dayCurve(latitude) {
  return Array.from({ length: 74 }, (_, index) => {
    const day = Math.min(365, 1 + index * 5)
    return { day, hours: daylightHours(latitude, day) }
  })
}
