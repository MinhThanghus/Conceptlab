import { lazy, Suspense, useCallback, useId, useMemo, useState } from 'react'
import { useT } from '../../i18n/index.jsx'
import { canRender3D } from '../../lib/three/capability.js'
import { useDocumentTitle } from '../public/hooks.js'
import { dayCurve, daylightHours, solarDeclination, sunAboveHorizon } from './solarMath.js'
import './geography.css'

const SolarGlobe3D = lazy(() => import('./SolarGlobe3D.jsx'))
const MapboxGlobe = lazy(() => import('./MapboxGlobe.jsx'))
const WaterCycle3D = lazy(() => import('./WaterCycle3D.jsx'))
const LOCATIONS = {
  hanoi: { latitude: 21.03, longitude: 105.85 },
  london: { latitude: 51.51, longitude: -0.13 },
  quito: { latitude: -0.18, longitude: -78.47 },
  sydney: { latitude: -33.87, longitude: 151.21 },
}

function DaylightGraph({ latitude, day }) {
  const { t } = useT()
  const curve = useMemo(() => dayCurve(latitude), [latitude])
  const x = (d) => 42 + (d - 1) * 326 / 364
  const y = (h) => 195 - h * 7
  const path = curve.map((item, i) => `${i ? 'L' : 'M'}${x(item.day).toFixed(1)} ${y(item.hours).toFixed(1)}`).join(' ')
  const currentDaylight = daylightHours(latitude, day)
  return (
    <figure className="geo-chart">
      <h3>{t('geography.graphTitle')}</h3>
      <svg viewBox="0 0 390 225" role="img" aria-label={t('geography.graphDescription')}>
        {[0, 6, 12, 18, 24].map((n) => <g key={n}>
          <line x1="42" x2="368" y1={y(n)} y2={y(n)} className="geo-grid" />
          <text x="34" y={y(n) + 4} textAnchor="end">{n}</text>
        </g>)}
        <path d={path} className="geo-curve" />
        {currentDaylight !== null ? <circle cx={x(day)} cy={y(currentDaylight)} r="5" className="geo-point" /> : null}
        <text x="42" y="217">{t('geography.graphStart')}</text>
        <text x="368" y="217" textAnchor="end">{t('geography.graphEnd')}</text>
      </svg>
      <figcaption>{t('geography.graphDescription')}</figcaption>
    </figure>
  )
}

export default function GeoLessonPage({ embedded = false }) {
  const { t, fmt } = useT()
  const instance = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const domId = (name) => embedded ? `geo-${instance}-${name}` : `geo-${name}`
  useDocumentTitle(embedded ? '' : t('geography.title'))
  const [latitude, setLatitude] = useState(21.03)
  const [longitude, setLongitude] = useState(105.85)
  const [location, setLocation] = useState('hanoi')
  const [day, setDay] = useState(172)
  const [hour, setHour] = useState(12)
  const [show3d, setShow3d] = useState(() => canRender3D())
  const [failed3d, setFailed3d] = useState(false)
  const [textureFailed, setTextureFailed] = useState(false)
  const [token, setToken] = useState(() => import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN || '')
  const [mapToken, setMapToken] = useState('')
  const [mapError, setMapError] = useState(false)
  const validToken = /^pk\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(token.trim())
  const fail3d = useCallback(() => { setFailed3d(true); setShow3d(false) }, [])
  const failTexture = useCallback(() => setTextureFailed(true), [])
  const readyTexture = useCallback(() => setTextureFailed(false), [])
  const failMap = useCallback(() => setMapError(true), [])
  const chooseLocation = (key) => {
    setLocation(key)
    if (LOCATIONS[key]) { setLatitude(LOCATIONS[key].latitude); setLongitude(LOCATIONS[key].longitude) }
  }
  const latitudeText = latitude === 0 ? t('geography.equator') : t('geography.latitudeValue', {
    value: fmt.number(Math.abs(latitude), 2), hemisphere: t(latitude > 0 ? 'geography.north' : 'geography.south'),
  })
  const declination = solarDeclination(day)
  const daylight = daylightHours(latitude, day)
  const aboveHorizon = sunAboveHorizon(latitude, day, hour)
  const sunLat = Math.abs(declination) < 0.01 ? t('geography.equator') : t('geography.latitudeValue', {
    value: fmt.number(Math.abs(declination), 1), hemisphere: t(declination > 0 ? 'geography.north' : 'geography.south'),
  })
  const loading = <p role="status">{t('geography.loading')}</p>

  return (
    <div className={embedded ? 'geo-page geo-page-embedded' : 'container page geo-page'}>
      {!embedded ? <><h1>{t('geography.title')}</h1><p className="geo-intro">{t('geography.intro')}</p></> : null}
      <section aria-labelledby={domId('model-title')} className="geo-workspace">
        <div className="geo-controls">
          <h2 id={domId('model-title')}>{t('geography.modelTitle')}</h2>
          <label htmlFor={domId('location')}>{t('geography.location')}</label>
          <select id={domId('location')} value={location} onChange={(event) => chooseLocation(event.target.value)}>
            {Object.keys(LOCATIONS).map((key) => <option key={key} value={key}>{t(`geography.locations.${key}`)}</option>)}
            <option value="custom">{t('geography.locations.custom')}</option>
          </select>
          <label htmlFor={domId('latitude')}>{t('geography.latitude')}: <strong>{latitudeText}</strong></label>
          <input id={domId('latitude')} type="range" min="-90" max="90" step="0.01" value={latitude} onChange={(event) => { setLatitude(Number(event.target.value)); setLocation('custom') }} />
          <label htmlFor={domId('longitude')}>{t('geography.longitude')}: <strong>{t('geography.longitudeValue', { value: fmt.number(longitude, 2) })}</strong></label>
          <input id={domId('longitude')} type="range" min="-180" max="180" step="0.01" value={longitude} onChange={(event) => { setLongitude(Number(event.target.value)); setLocation('custom') }} />
          <label htmlFor={domId('day')}>{t('geography.day')}: <strong>{t('geography.dayValue', { day })}</strong></label>
          <input id={domId('day')} type="range" min="1" max="365" value={day} onChange={(event) => setDay(Number(event.target.value))} />
          <label htmlFor={domId('hour')}>{t('geography.hour')}: <strong>{t('geography.hourValue', { hour })}</strong></label>
          <input id={domId('hour')} type="range" min="0" max="24" value={hour} onChange={(event) => setHour(Number(event.target.value))} />
          <dl className="geo-results" aria-live="polite">
            <div><dt>{t('geography.length')}</dt><dd>{daylight === null ? t('geography.indeterminate') : t('geography.hours', { value: fmt.number(daylight, 1) })}</dd></div>
            <div><dt>{t('geography.sunDeclination')}</dt><dd>{sunLat}</dd></div>
            <div><dt>{t('geography.state')}</dt><dd>{t(aboveHorizon === null ? 'geography.horizon' : aboveHorizon ? 'geography.daytime' : 'geography.nighttime')}</dd></div>
          </dl>
        </div>
        <div className="geo-visuals">
          {show3d ? <Suspense fallback={loading}><SolarGlobe3D latitude={latitude} longitude={longitude} day={day} hour={hour} onError={fail3d} onTextureError={failTexture} onTextureReady={readyTexture} /></Suspense> : null}
          {show3d ? <><p>{t('geography.modelDescription')}</p>{textureFailed ? <p role="status">{t('geography.textureUnavailable')}</p> : <p className="geo-attribution">{t('geography.textureCaption')} <a href="https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/" target="_blank" rel="noreferrer">NASA Earth Observatory · Blue Marble</a>.</p>}</> : null}
          {failed3d ? <p role="status">{t('geography.no3d')}</p> : null}
          {canRender3D() && !failed3d ? <button className="btn" type="button" aria-pressed={show3d} onClick={() => setShow3d((value) => !value)}>{t(show3d ? 'geography.hide3d' : 'geography.use3d')}</button> : null}
          <p className="small muted">{t('geography.twoD')}</p>
          <DaylightGraph latitude={latitude} day={day} />
        </div>
      </section>
      <section className="geo-notes" aria-labelledby={domId('experiment')}>
        <h2 id={domId('experiment')}>{t('geography.experimentTitle')}</h2>
        <p>{t('geography.modelWhy')}</p>
        <ol><li>{t('geography.experiment1')}</li><li>{t('geography.experiment2')}</li><li>{t('geography.experiment3')}</li></ol>
        <h3>{t('geography.mathTitle')}</h3>
        <p>{t('geography.mathDeclination')}</p>
        <p>{t('geography.mathDuration')}</p>
        <p>{t('geography.mathPolar')}</p>
        <p>{t('geography.approximation')}</p>
      </section>
      {!embedded ? <section className="geo-water-section" aria-labelledby={domId('water-heading')}>
        <h2 id={domId('water-heading')}>{t('geography.waterTitle')}</h2>
        <Suspense fallback={loading}><WaterCycle3D /></Suspense>
      </section> : null}
      {!embedded ? <section className="geo-notes" aria-labelledby={domId('map-heading')}>
        <h2 id={domId('map-heading')}>{t('geography.mapTitle')}</h2>
        <p>{t('geography.mapInfo')}</p>
        {!mapToken ? <div className="geo-map-controls">
          <label htmlFor={domId('map-token')}>{t('geography.mapToken')}</label>
          <input id={domId('map-token')} type="text" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} />
          <p className="small muted">{t('geography.mapTokenHelp')}</p>
          {token && !validToken ? <p role="alert">{t('geography.mapTokenInvalid')}</p> : null}
          <button type="button" className="btn" disabled={!validToken} onClick={() => { if (validToken) { setMapError(false); setMapToken(token.trim()) } }}>{t('geography.mapOpen')}</button>
        </div> : <>
          <button type="button" className="btn btn-ghost" onClick={() => { setMapToken(''); setMapError(false) }}>{t('geography.mapClose')}</button>
          <p>{t('geography.mapAccessible')}</p>
          {mapError ? <p role="alert">{t('geography.mapError')}</p> : null}
          <Suspense fallback={loading}><MapboxGlobe token={mapToken} longitude={longitude} latitude={latitude} onError={failMap} /></Suspense>
        </>}
      </section> : null}
      <section className="geo-notes" aria-labelledby={domId('sources')}>
        <h2 id={domId('sources')}>{t('geography.sources')}</h2>
        <ul>
          <li><a href="https://gml.noaa.gov/grad/solcalc/solareqns.PDF" target="_blank" rel="noreferrer">{t('geography.sourceNoaa')}</a></li>
          <li><a href="https://aa.usno.navy.mil/faq/rs_solstices" target="_blank" rel="noreferrer">{t('geography.sourceUsno')}</a></li>
          <li><a href="https://docs.mapbox.com/mapbox-gl-js/guides/globe/" target="_blank" rel="noreferrer">{t('geography.sourceMapbox')}</a></li>
        </ul>
      </section>
    </div>
  )
}
