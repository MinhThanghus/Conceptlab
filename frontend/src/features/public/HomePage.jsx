import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pause, Play, RefreshCw, RotateCcw } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { Button, IconButton, LinkButton, ProvenanceBadge, SliderField } from '../../components/ui/index.js'
import PendulumLab3D from '../../components/lab3d/PendulumLab3D.jsx'
import ClassCodeForm from './ClassCodeForm.jsx'
import PendulumStage2D from './PendulumStage2D.jsx'
import PublicLabCard, { LabCardSkeleton } from './PublicLabCard.jsx'
import { useDocumentTitle, useFetch, usePrefersReducedMotion } from './hooks.js'
import { AMPLITUDE_DEG, G_EARTH, LENGTH_MAX, LENGTH_MIN, LENGTH_STEP, advancePhase, angleAt, pendulumPeriod, snapLength } from './pendulum.js'
import './home.css'

const DEMO_LAB = 'TPEND6'
const MATERIALS = [
  { key: 'page', code: 'TPEND6', shot: '/shots/home-page.webp', w: 1200, h: 900 },
  { key: 'photo', code: 'TPEND6', shot: '/shots/home-photo.webp', w: 1200, h: 900 },
  { key: 'video', code: 'VBPASS', shot: '/shots/home-video.webp', w: 1200, h: 900 },
  { key: 'paper', code: 'ATTN24', shot: '/shots/home-paper.webp', w: 1200, h: 900 },
]
const PROVENANCE = ['document', 'user', 'assumption', 'unknown']
const CLASSROOM = ['code', 'phones', 'projector', 'voice']
const DEG = Math.PI / 180

function createPath(user) {
  return user ? '/app/new' : `/register?next=${encodeURIComponent('/app/new')}`
}

/**
 * The hero's lab: the pendulum from page 64, running. The clock lives in a ref and drives the
 * 3D stand through its controller, so React renders only when the reader changes something.
 */
function HeroLab() {
  const { t, locale } = useT()
  const reduced = usePrefersReducedMotion()
  const fixed = useMemo(() => {
    const nf = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return (v) => (Number.isFinite(v) ? nf.format(v) : '')
  }, [locale])
  const ruler = useMemo(() => {
    const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
    return (m) => nf.format(m)
  }, [locale])
  const [length, setLength] = useState(1)
  const [amplitude, setAmplitude] = useState(AMPLITUDE_DEG)
  const [playing, setPlaying] = useState(!reduced)
  const [touched, setTouched] = useState(false)
  const [angle2d, setAngle2d] = useState(AMPLITUDE_DEG)
  const [mode, setMode] = useState('3d')
  const phase = useRef(0)
  const live = useRef({ length, amplitude })
  live.current = { length, amplitude }
  const ctl = useRef(null)
  const rootRef = useRef(null)
  const [visible, setVisible] = useState(true)
  const period = pendulumPeriod(length, G_EARTH)

  useEffect(() => {
    if (!touched) setPlaying(!reduced)
  }, [reduced, touched])

  useEffect(() => {
    const node = rootRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.05 })
    io.observe(node)
    return () => io.disconnect()
  }, [])

  const push = useCallback(() => {
    const { length: L, amplitude: A } = live.current
    const deg = angleAt(phase.current, A)
    if (ctl.current) ctl.current.update([{ length: L, theta: deg * DEG, amplitude: A * DEG }])
    else setAngle2d(deg)
  }, [])

  useEffect(() => {
    push()
  }, [length, amplitude, push])

  useEffect(() => {
    if (!playing || !visible) return undefined
    let frame = 0
    let last = performance.now()
    const tick = (now) => {
      phase.current = advancePhase(phase.current, (now - last) / 1000, pendulumPeriod(live.current.length, G_EARTH))
      last = now
      push()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, visible, push])

  const onDrag = useCallback((index, theta, stage) => {
    const deg = Math.max(-25, Math.min(25, theta / DEG))
    setTouched(true)
    if (stage === 'move') {
      setPlaying(false)
      ctl.current?.update([{ length: live.current.length, theta, amplitude: Math.abs(theta) }])
      return
    }
    const amp = Math.max(3, Math.abs(deg))
    phase.current = deg >= 0 ? 0 : Math.PI
    setAmplitude(amp)
    setPlaying(true)
  }, [])

  const label = t('home.lab.label3d', { length: fixed(length), period: fixed(period) })
  const fallback = <PendulumStage2D length={length} angleDeg={angle2d} amplitudeDeg={amplitude} label={label} />

  return (
    <div className="hero-lab" ref={rootRef}>
      <div className="hero-lab-sheet">
        <div className="hero-lab-head">
          <p className="hero-lab-name">{t('home.lab.name')}</p>
          <Link to={`/s/${DEMO_LAB}`} className="hero-lab-open">
            {t('home.lab.open')}
          </Link>
        </div>
        <div className="hero-lab-stage">
          <PendulumLab3D
            items={[{ length, theta: angleAt(phase.current, amplitude) * DEG, amplitude: amplitude * DEG }]}
            maxLength={LENGTH_MAX}
            label={label}
            formatLength={ruler}
            onDrag={onDrag}
            onReady={(controller) => {
              ctl.current = controller
              setMode('3d-ready')
              push()
            }}
            fallback={fallback}
          />
          {mode === '3d-ready' ? (
            <IconButton icon={RotateCcw} label={t('home.lab.view')} size="sm" className="hero-lab-view" onClick={() => ctl.current?.resetView()} />
          ) : null}
        </div>
        <div className="hero-lab-controls">
          <div className="hero-lab-slider">
            <SliderField
              label={t('home.lab.length')}
              unit="m"
              value={length}
              min={LENGTH_MIN}
              max={LENGTH_MAX}
              step={LENGTH_STEP}
              digits={2}
              onChange={(v) => setLength(snapLength(v))}
            />
          </div>
          <output className="hero-lab-period" aria-live="polite">
            <span className="hero-lab-period-label">{t('home.lab.period')}</span>
            <span className="hero-lab-period-value num">≈ {t('home.lab.seconds', { value: fixed(period) })}</span>
          </output>
          <Button
            className="hero-lab-play"
            icon={playing ? Pause : Play}
            onClick={() => {
              setTouched(true)
              setPlaying((p) => !p)
            }}
          >
            {playing ? t('home.lab.pause') : t('home.lab.play')}
          </Button>
        </div>
        <p className="hero-lab-caption">{mode === '3d-ready' ? t('home.lab.caption') : t('home.lab.captionStill')}</p>
      </div>
    </div>
  )
}

function Hero({ user }) {
  const { t } = useT()
  return (
    <section className="hm-hero" aria-labelledby="hm-hero-title">
      <div className="container hm-hero-grid">
        <div className="hm-hero-copy">
          <h1 id="hm-hero-title">{t('home.hero.title')}</h1>
          <p className="lead">{t('home.hero.lead')}</p>
          <div className="hm-hero-actions">
            <LinkButton to={createPath(user)} variant="primary" size="lg">
              {user ? t('home.hero.ctaCreateSignedIn') : t('home.hero.ctaCreate')}
            </LinkButton>
          </div>
          <div className="hm-join">
            <ClassCodeForm size="inline" label={t('home.hero.joinLabel')} submitLabel={t('home.hero.joinSubmit')} />
            <p className="hm-join-note">{t('home.hero.joinNote')}</p>
          </div>
        </div>
        <HeroLab />
      </div>
    </section>
  )
}

function Materials() {
  const { t } = useT()
  const [current, setCurrent] = useState(MATERIALS[0].key)
  const listRef = useRef(null)
  const active = MATERIALS.find((m) => m.key === current) || MATERIALS[0]
  const onKeyDown = (e) => {
    const idx = MATERIALS.findIndex((m) => m.key === current)
    let next = null
    if (e.key === 'ArrowRight') next = (idx + 1) % MATERIALS.length
    else if (e.key === 'ArrowLeft') next = (idx - 1 + MATERIALS.length) % MATERIALS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = MATERIALS.length - 1
    if (next === null) return
    e.preventDefault()
    setCurrent(MATERIALS[next].key)
    requestAnimationFrame(() => listRef.current?.querySelector(`#hm-mat-tab-${MATERIALS[next].key}`)?.focus())
  }
  const base = `home.materials.items.${active.key}`
  return (
    <section className="hm-section hm-materials" aria-labelledby="hm-materials-title">
      <div className="container">
        <div className="hm-materials-head">
          <h2 id="hm-materials-title">{t('home.materials.title')}</h2>
          <div className="hm-switch" role="tablist" aria-label={t('home.materials.tabsLabel')} ref={listRef} onKeyDown={onKeyDown}>
            {MATERIALS.map((m) => (
              <button
                key={m.key}
                id={`hm-mat-tab-${m.key}`}
                type="button"
                role="tab"
                aria-selected={m.key === current}
                aria-controls={m.key === current ? 'hm-mat-panel' : undefined}
                tabIndex={m.key === current ? 0 : -1}
                onClick={() => setCurrent(m.key)}
              >
                {t(`home.materials.items.${m.key}.tab`)}
              </button>
            ))}
          </div>
        </div>
        <div className="hm-materials-body" role="tabpanel" id="hm-mat-panel" aria-labelledby={`hm-mat-tab-${active.key}`}>
          <div className="hm-materials-text">
            <h3>{t(`${base}.title`)}</h3>
            <p>{t(`${base}.body`)}</p>
            <Link to={`/s/${active.code}`} className="hm-link">
              {t('home.materials.open')}
            </Link>
          </div>
          <figure className="hm-shot" data-slot={`material-${active.key}`} data-kind="product">
            <img key={active.key} src={active.shot} alt={t(`${base}.alt`)} width={active.w} height={active.h} loading="lazy" decoding="async" />
          </figure>
        </div>
      </div>
    </section>
  )
}

function Samples() {
  const { t, lang } = useT()
  const { data, loading, error, reload } = useFetch(`/api/public/featured?lang=${lang}`, { scope: lang })
  const items = Array.isArray(data) ? data.filter((lab) => lab && lab.share_code).slice(0, 9) : []
  return (
    <section className="hm-section hm-samples" aria-labelledby="hm-samples-title" aria-busy={loading || undefined}>
      <div className="container hm-samples-head">
        <h2 id="hm-samples-title">{t('home.samples.title')}</h2>
        <Link to="/gallery" className="hm-link">
          {t('home.samples.all')}
        </Link>
      </div>
      {loading && !items.length ? (
        <div className="container hm-rail" role="status" aria-label={t('common.states.loading')}>
          <LabCardSkeleton />
          <LabCardSkeleton />
          <LabCardSkeleton />
        </div>
      ) : items.length ? (
        <ul className="container hm-rail list-reset" aria-label={t('home.samples.railLabel')}>
          {items.map((lab) => (
            <li key={lab.id}>
              <PublicLabCard lab={lab} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="container hm-samples-empty">
          <p className="hm-samples-empty-title">{error ? t('home.samples.unavailable') : t('home.samples.empty')}</p>
          <p className="muted">{t('home.samples.emptyHint')}</p>
          {error ? (
            <Button size="sm" icon={RefreshCw} onClick={reload}>
              {t('common.actions.retry')}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  )
}

function Trust() {
  const { t } = useT()
  return (
    <section className="hm-section hm-trust" aria-labelledby="hm-trust-title">
      <div className="container hm-trust-grid">
        <div className="hm-trust-head">
          <h2 id="hm-trust-title">{t('home.trust.title')}</h2>
          <p className="lead">{t('home.trust.lead')}</p>
        </div>
        <dl className="hm-rows">
          {PROVENANCE.map((kind) => (
            <div key={kind} className="hm-row">
              <dt>
                <ProvenanceBadge value={kind} />
              </dt>
              <dd>{t(`home.trust.examples.${kind}`)}</dd>
            </div>
          ))}
        </dl>
        <p className="hm-trust-review">{t('home.trust.review')}</p>
      </div>
    </section>
  )
}

function Classroom() {
  const { t } = useT()
  return (
    <section className="hm-section hm-classroom" aria-labelledby="hm-classroom-title">
      <div className="container hm-classroom-grid">
        <div>
          <h2 id="hm-classroom-title">{t('home.classroom.title')}</h2>
          <dl className="hm-facts">
            {CLASSROOM.map((key) => (
              <div key={key}>
                <dt>{t(`home.classroom.items.${key}.title`)}</dt>
                <dd>{t(`home.classroom.items.${key}.body`)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <figure className="hm-phone" data-slot="phone" data-kind="product">
          <img src="/shots/home-phone.webp" alt={t('home.classroom.shotAlt')} width={780} height={1500} loading="lazy" decoding="async" />
        </figure>
      </div>
    </section>
  )
}

function Close({ user }) {
  const { t } = useT()
  return (
    <section className="hm-close torn-band ink" aria-labelledby="hm-close-title">
      <div className="container hm-close-inner">
        <h2 id="hm-close-title">{t('home.close.title')}</h2>
        <div className="hm-close-actions">
          <LinkButton to={createPath(user)} variant="primary" size="lg">
            {user ? t('home.hero.ctaCreateSignedIn') : t('home.close.create')}
          </LinkButton>
          <Link to="/join" className="hm-close-join">
            {t('home.close.join')}
          </Link>
        </div>
      </div>
    </section>
  )
}

export default function HomePage() {
  const { t } = useT()
  const { user } = useAuth()
  useDocumentTitle(t('home.meta.title'))
  return (
    <div className="home mk">
      <Hero user={user} />
      <Materials />
      <Samples />
      <Trust />
      <Classroom />
      <Close user={user} />
    </div>
  )
}
