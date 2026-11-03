import { useEffect, useId, useRef, useState } from 'react'
import { RotateCcw, RotateCw, Undo2 } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { can3D } from '../../components/lab3d/support.js'
import { SceneAside, SceneBar, SceneFocus, SceneNotes, StageTools, useSceneLayout } from '../../components/lab3d/sceneLayout.jsx'
import { thrustComponents } from './engineeringMath.js'
import '../../styles/stage3d.css'
import './engineering3d.css'

// the states a learner can reach: the camera frames all of them at once, so a slider never zooms the view
const ENVELOPES = {
  quadrotor: [{ tilt: -25, force: 10 }, { tilt: 25, force: 10 }, { tilt: 0, force: 10 }],
  solar_cell: [{ separation: 100, cracked: true, light: 100 }, { separation: 0, cracked: true, light: 100 }],
}

const COPY = {
  vi: {
    quad: 'Lực đẩy và độ nghiêng của thiết bị bay bốn cánh',
    solar: 'Các lớp của một tấm pin mặt trời',
    loading: 'Đang chuẩn bị mô hình 3D…', fallback: 'Đang dùng sơ đồ 2D; các điều khiển và giải thích vẫn hoạt động.',
    quadIntro: 'Nghiêng thiết bị và thay tổng lực đẩy để quan sát hai thành phần của lực.',
    solarIntro: 'Tách các lớp, bật vết nứt minh họa và thay độ sáng của các tia tới.',
    tilt: 'Góc nghiêng', force: 'Tổng lực đẩy', vertical: 'Thành phần thẳng đứng', horizontal: 'Thành phần ngang',
    quadLegend: 'Vàng là tổng lực đẩy, xanh là thành phần thẳng đứng, đỏ là thành phần ngang.',
    quadNote: 'Mô hình tĩnh dùng F đứng = F cos θ và F ngang = F sin θ. Đây không phải mô phỏng chuyến bay, bộ điều khiển PID hay phép tái hiện số liệu bài báo.',
    separation: 'Tách lớp', light: 'Độ sáng tia minh họa', crack: 'Hiện vết nứt minh họa',
    solarLegend: 'Từ trên xuống: kính, lớp bao, tế bào silic và tiếp điểm, lớp nền và khung.',
    solarNote: 'Màu tia chỉ giúp nhìn rõ ánh sáng; thanh trượt không dự đoán công suất hay nhiệt độ. Vết nứt và kích thước đều giả định, không tái hiện mẫu trong nghiên cứu.',
    rotateLeft: 'Xoay trái', rotateRight: 'Xoay phải', reset: 'Đặt lại góc nhìn', viewControls: 'Điều khiển góc nhìn',
    quadImage: 'Thiết bị bay bốn cánh với các mũi tên lực đẩy tổng, lực thẳng đứng và lực ngang.',
    solarImage: 'Mô hình tấm pin có kính, lớp bao, tế bào silic và lớp nền được tách ra.',
    quadDrawing: 'Sơ đồ 2D thiết bị bay bốn cánh: mũi tên vàng là tổng lực đẩy, vạch xanh là thành phần thẳng đứng, vạch đỏ là thành phần ngang; thiết bị nghiêng theo thanh trượt.',
    solarDrawing: 'Sơ đồ 2D tấm pin mặt trời: kính, lớp bao, tế bào silic và lớp nền tách xa nhau theo thanh trượt; các tia sáng phía trên đậm nhạt theo độ sáng đã chọn.',
  },
  en: {
    quad: 'Thrust and tilt of a quadrotor',
    solar: 'Layers of a solar panel',
    loading: 'Preparing the 3D model…', fallback: 'A 2D diagram is shown; the controls and explanations still work.',
    quadIntro: 'Tilt the craft and change total thrust to observe its two force components.',
    solarIntro: 'Separate the layers, show an illustrative crack and change the brightness of incoming rays.',
    tilt: 'Tilt angle', force: 'Total thrust', vertical: 'Vertical component', horizontal: 'Horizontal component',
    quadLegend: 'Gold is the total thrust, blue the vertical component, red the horizontal component.',
    quadNote: 'This static model uses F vertical = F cos θ and F horizontal = F sin θ. It is not a flight simulation, PID controller or reproduction of the paper’s data.',
    separation: 'Separate layers', light: 'Illustrative ray brightness', crack: 'Show illustrative crack',
    solarLegend: 'From the top: glass, encapsulant, silicon cells and contacts, backsheet and frame.',
    solarNote: 'Ray color only helps visualize light; the control does not predict power or temperature. The crack and dimensions are hypothetical, not the study’s samples.',
    rotateLeft: 'Rotate left', rotateRight: 'Rotate right', reset: 'Reset view', viewControls: 'View controls',
    quadImage: 'A quadrotor with arrows for total thrust and its vertical and horizontal components.',
    solarImage: 'A solar panel model with separated glass, encapsulant, silicon cells and backsheet.',
    quadDrawing: '2D diagram of the quadrotor: a gold arrow for total thrust, a blue line for its vertical component and a red line for its horizontal component; the craft tilts with the slider.',
    solarDrawing: '2D diagram of the solar panel: the glass, encapsulant, silicon cells and backsheet move apart with the slider; the rays above are as bright as the chosen brightness.',
  },
}

// the 2D drawings stand in for the 3D model, so each carries a text alternative of its own
function QuadFallback({ tilt, uid, label }) {
  const a = Number(tilt) * Math.PI / 180
  return <svg className="engineering3d-drawing" viewBox="0 0 600 280" role="img" aria-label={label}>
    <g className="ed-craft" transform={`rotate(${-tilt} 300 165)`} strokeWidth="4">
      <rect x="266" y="145" width="68" height="30" rx="8" />
      <path d="M270 160 L170 145 M330 160 L430 145" fill="none" strokeWidth="12" />
      <circle cx="170" cy="142" r="15" /><circle cx="430" cy="142" r="15" />
      <path className="ed-rotor" d="M120 125 H220 M380 125 H480" fill="none" strokeWidth="6" />
    </g>
    <path className="ed-thrust" d={`M300 130 L${300 + 115 * Math.sin(a)} ${130 - 115 * Math.cos(a)}`} strokeWidth="7" markerEnd={`url(#${uid}-arrow-gold)`} />
    <path className="ed-vertical" d={`M280 130 L280 ${130 - 100 * Math.cos(a)}`} strokeWidth="5" />
    <path className="ed-horizontal" d={`M300 140 L${300 + 95 * Math.sin(a)} 140`} strokeWidth="5" />
    <defs><marker id={`${uid}-arrow-gold`} markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path className="ed-thrust-head" d="M0 0 L7 3.5 L0 7Z" /></marker></defs>
  </svg>
}

function SolarFallback({ separation, cracked, light, label }) {
  const gap = Number(separation) * .5
  return <svg className="engineering3d-drawing" viewBox="0 0 600 300" role="img" aria-label={label}>
    <g transform="translate(0 20)">
      <path className="ed-glass" d={`M115 ${150-gap*1.5} L420 ${150-gap*1.5} L488 ${185-gap*1.5} L180 ${185-gap*1.5}Z`} strokeWidth="3" />
      <path className="ed-film" d={`M115 ${158-gap} L420 ${158-gap} L488 ${193-gap} L180 ${193-gap}Z`} strokeWidth="3" />
      <path className="ed-cells" d={`M115 ${168-gap*.5} L420 ${168-gap*.5} L488 ${203-gap*.5} L180 ${203-gap*.5}Z`} strokeWidth="3" />
      <path className="ed-fingers" d={`M214 ${168-gap*.5} L280 ${203-gap*.5} M316 ${168-gap*.5} L382 ${203-gap*.5} M147 ${185-gap*.5} L455 ${185-gap*.5}`} strokeWidth="2" />
      {cracked ? <path className="ed-crack" d={`M290 ${174-gap*.5} l16 7 l-8 6 l20 7 l-8 6`} fill="none" strokeWidth="3" /> : null}
      <path className="ed-back" d="M115 181 L420 181 L488 216 L180 216Z" strokeWidth="3" />
    </g>
    {Number(light) > 0 ? <path className="ed-rays" d="M235 22 l-25 44 M305 22 l-25 44 M375 22 l-25 44" opacity={Math.max(.15, Number(light) / 100)} strokeWidth="5" strokeLinecap="round" /> : null}
  </svg>
}

export default function EngineeringExplorer({ kind }) {
  const { lang, fmt, t } = useT()
  const { deck } = useSceneLayout()
  const text = COPY[lang] || COPY.vi
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const isQuad = kind === 'quadrotor'
  const [tilt, setTilt] = useState(15)
  const [force, setForce] = useState(8)
  const [separation, setSeparation] = useState(32)
  const [light, setLight] = useState(70)
  const [cracked, setCracked] = useState(false)
  const state = useRef({ tilt, force, separation, light, cracked })
  state.current = { tilt, force, separation, light, cracked }
  const host = useRef(null)
  const live = useRef(null)
  const [status, setStatus] = useState(() => can3D() ? 'loading' : 'unavailable')
  const components = thrustComponents(force, tilt)

  useEffect(() => {
    if (!can3D() || !['quadrotor', 'solar_cell'].includes(kind)) { setStatus('unavailable'); return undefined }
    setStatus('loading')
    let cancelled = false
    let stage
    let model
    let rotation = 0
    const lost = (event) => { event.preventDefault(); setStatus('unavailable') }
    ;(async () => {
      try {
        const [{ createStage }, { createQuadrotorModel, createSolarCellModel }, kit] = await Promise.all([
          import('../../lib/three/stage.js'), import('./engineeringModels.js'), import('../../lib/three/kit.js'),
        ])
        if (cancelled || !host.current) return
        stage = createStage(host.current, isQuad
          ? { view: { azimuth: .68, elevation: .36 }, turnRange: 1.5 }
          : { view: { azimuth: .62, elevation: .42 }, turnRange: 1.5 })
        stage.canvas.addEventListener('webglcontextlost', lost)
        const palette = kit.scenePalette(host.current)
        model = isQuad ? createQuadrotorModel(palette) : createSolarCellModel(palette)
        stage.world.add(model.group)
        model.update(state.current)
        // frame every state the sliders reach (the drone with the floor under it, so it hovers): a
        // snapshot of each state, measured part by part, so the silhouette and not a box fills the view
        const fit = () => {
          const THREE = stage.THREE
          if (!THREE || !stage.frame) return
          const envelope = new THREE.Group()
          let floor = Infinity
          for (const values of ENVELOPES[kind]) {
            model.update({ ...state.current, ...values })
            model.group.updateWorldMatrix(true, true)
            floor = Math.min(floor, new THREE.Box3().setFromObject(model.group).min.y)
            envelope.add(model.group.clone(true))
          }
          model.update(state.current)
          if (isQuad) floor -= .34
          model.group.userData.floor = floor
          stage.frame(envelope, { fill: isQuad ? .94 : .8, ground: floor })
          stage.frame(model.group, { fit: false, ground: floor, cast: true })
        }
        fit()
        live.current = {
          update: (values) => { model.update(values); stage.frame?.(model.group, { fit: false, ...(isQuad ? { ground: model.group.userData.floor } : {}) }); stage.invalidate() },
          rotate: (step) => { rotation += step; model.group.rotation.y = rotation; fit(); stage.invalidate() },
          reset: () => { rotation = 0; model.group.rotation.y = 0; stage.resetView(); fit(); stage.invalidate() },
        }
        stage.invalidate()
        setStatus('ready')
      } catch {
        model?.dispose()
        model = null
        stage?.dispose()
        stage = null
        if (!cancelled) setStatus('unavailable')
      }
    })()
    return () => {
      cancelled = true
      live.current = null
      model?.dispose()
      stage?.canvas.removeEventListener('webglcontextlost', lost)
      stage?.dispose()
    }
  }, [kind, isQuad])
  useEffect(() => { live.current?.update(state.current) }, [tilt, force, separation, light, cracked])
  if (!['quadrotor', 'solar_cell'].includes(kind)) return null

  const ready = status === 'ready'
  const viewTools = deck && ready ? [
      { icon: RotateCcw, label: text.rotateLeft, onClick: () => live.current?.rotate(-Math.PI / 5) },
      { icon: RotateCw, label: text.rotateRight, onClick: () => live.current?.rotate(Math.PI / 5) },
      { icon: Undo2, label: text.reset, onClick: () => live.current?.reset() },
  ] : null
  const stage = <div className="engineering3d-stage stage3d">
    {!ready ? <div className="engineering3d-fallback">{isQuad ? <QuadFallback tilt={tilt} uid={uid} label={text.quadDrawing} /> : <SolarFallback separation={separation} cracked={cracked} light={light} label={text.solarDrawing} />}{status === 'loading' ? <p className="stage3d-status" role="status">{text.loading}</p> : null}</div> : null}
    <div className="engineering3d-host" ref={host} role={ready ? 'img' : undefined}
      aria-label={ready ? (isQuad ? text.quadImage : text.solarImage) : undefined}
      aria-hidden={!ready || undefined} style={{ visibility: ready ? 'visible' : 'hidden' }} />
    {viewTools ? <StageTools className="engineering3d-controls" label={text.viewControls} tools={viewTools} /> : null}
  </div>
  const results = (className) => <dl className={className}><div><dt>{text.vertical}</dt><dd>{fmt.number(components.vertical, 2)} N</dd></div><div><dt>{text.horizontal}</dt><dd>{fmt.number(components.horizontal, 2)} N</dd></div></dl>

  // on a lesson slide: the stage, the sliders in one row, the readings and the key beside the model
  if (deck) {
    const range = (id, label, shown, props, onChange) => <label className="stage3d-range" htmlFor={`${uid}-${id}`}><span>{label}</span><strong>{shown}</strong>
      <input id={`${uid}-${id}`} type="range" {...props} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
    return <section className="engineering3d stage3d-scene is-deck" aria-label={isQuad ? text.quad : text.solar}>
      {stage}
      <SceneBar tools={viewTools} toolsLabel={text.viewControls}>
        {isQuad ? <>
          {range('tilt', text.tilt, `${fmt.number(tilt, 0)}°`, { min: '-35', max: '35', step: '1', value: tilt }, setTilt)}
          {range('force', text.force, `${fmt.number(force, 1)} N`, { min: '4', max: '12', step: '.5', value: force }, setForce)}
        </> : <>
          {range('separation', text.separation, `${fmt.number(separation, 0)}%`, { min: '0', max: '100', step: '1', value: separation }, setSeparation)}
          {range('light', text.light, `${fmt.number(light, 0)}%`, { min: '0', max: '100', step: '1', value: light }, setLight)}
          <button type="button" className="chip" aria-pressed={cracked} aria-label={text.crack} title={text.crack} onClick={() => setCracked(!cracked)}>{t('scene3d.engineering.crackShort')}</button>
        </>}
      </SceneBar>
      <SceneAside>
        {isQuad ? results('stage3d-readout') : null}
        <SceneFocus live={false}>{isQuad ? text.quadLegend : text.solarLegend}</SceneFocus>
        {status === 'unavailable' ? <p className="engineering3d-fallback-note stage3d-note">{text.fallback}</p> : null}
        <SceneNotes><p>{isQuad ? text.quadNote : text.solarNote}</p></SceneNotes>
      </SceneAside>
    </section>
  }

  return <section className="engineering3d stage3d-scene" aria-label={isQuad ? text.quad : text.solar}>
    <p className="engineering3d-intro">{isQuad ? text.quadIntro : text.solarIntro}</p>
    {stage}
    {status === 'unavailable' ? <p className="engineering3d-fallback-note stage3d-note" role="status">{text.fallback}</p> : null}
    <div className="engineering3d-content">
      {isQuad ? <>
        <label htmlFor={`${uid}-tilt`}>{text.tilt}: <strong>{fmt.number(tilt, 0)}°</strong></label>
        <input id={`${uid}-tilt`} type="range" min="-35" max="35" step="1" value={tilt} onChange={(event) => setTilt(Number(event.target.value))} />
        <label htmlFor={`${uid}-force`}>{text.force}: <strong>{fmt.number(force, 1)} N</strong></label>
        <input id={`${uid}-force`} type="range" min="4" max="12" step=".5" value={force} onChange={(event) => setForce(Number(event.target.value))} />
        {results('engineering3d-results')}
      </> : <>
        <label htmlFor={`${uid}-separation`}>{text.separation}: <strong>{fmt.number(separation, 0)}%</strong></label>
        <input id={`${uid}-separation`} type="range" min="0" max="100" step="1" value={separation} onChange={(event) => setSeparation(Number(event.target.value))} />
        <label htmlFor={`${uid}-light`}>{text.light}: <strong>{fmt.number(light, 0)}%</strong></label>
        <input id={`${uid}-light`} type="range" min="0" max="100" step="1" value={light} onChange={(event) => setLight(Number(event.target.value))} />
        <label className="engineering3d-check"><input type="checkbox" checked={cracked} onChange={(event) => setCracked(event.target.checked)} /> {text.crack}</label>
      </>}
      <p className="engineering3d-legend stage3d-note">{isQuad ? text.quadLegend : text.solarLegend}</p>
      {ready ? <div className="engineering3d-controls stage3d-view" role="group" aria-label={text.viewControls}>
        <button type="button" className="btn btn-ghost" onClick={() => live.current?.rotate(-Math.PI / 5)}><RotateCcw size={20} aria-hidden="true" />{text.rotateLeft}</button>
        <button type="button" className="btn btn-ghost" onClick={() => live.current?.rotate(Math.PI / 5)}><RotateCw size={20} aria-hidden="true" />{text.rotateRight}</button>
        <button type="button" className="btn btn-ghost" onClick={() => live.current?.reset()}><Undo2 size={20} aria-hidden="true" />{text.reset}</button>
      </div> : null}
      <p className="engineering3d-note stage3d-note">{isQuad ? text.quadNote : text.solarNote}</p>
    </div>
  </section>
}
