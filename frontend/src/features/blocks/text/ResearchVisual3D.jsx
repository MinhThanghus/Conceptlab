import { useEffect, useRef, useState } from 'react'
import { RotateCw, Undo2 } from 'lucide-react'
import { can3D } from '../../../components/lab3d/support.js'
import { SceneAside, SceneBar, SceneFocus, SceneNotes, StageTools, useSceneLayout } from '../../../components/lab3d/sceneLayout.jsx'
import { useT } from '../../../i18n/index.jsx'
import { POPULATION_GRID as GRID, researchSceneFactories } from '../../../lib/three/models/researchScenes.js'
import '../../../styles/stage3d.css'
import './researchVisual3d.css'

// the widest state each scene reaches: the camera frames it once, so the slider never zooms the view
const ENVELOPE = { enzyme_binding: [8, 'release'], population_grid: [4, 'approach'] }

const COPY = {
  vi: { enzyme: 'Mô hình enzyme và cơ chất', grid: 'Lưới dân số minh họa', count: 'Số cơ chất minh họa', scale: 'Tỉ lệ chiều cao', rotate: 'Xoay', reset: 'Đặt lại góc nhìn',
    stages: ['Tiếp cận', 'Gắn kết', 'Giải phóng'], stageLabel: 'Chọn giai đoạn minh họa',
    stageDescriptions: ['Cơ chất tiến tới vùng hoạt động.', 'Cơ chất được minh họa gắn vào enzyme.', 'Sản phẩm rời vùng hoạt động; enzyme có thể tiếp tục hoạt động.'],
    noSubstrate: 'Thêm ít nhất một cơ chất để xem giai đoạn này.',
    drag: 'Kéo hoặc dùng nút Xoay để quan sát.', fallback: 'Hiển thị 2D khi 3D chưa sẵn sàng hoặc không được hỗ trợ.',
    enzymeNote: 'Vùng xanh ngọc đánh dấu vị trí hoạt động; các hình vàng tượng trưng cho cơ chất. Hình dạng là minh họa, không phải cấu trúc phân tử hay phép đo.',
    gridNote: 'Cột cao hơn thể hiện giá trị tương đối lớn hơn. Thay tỉ lệ chiều cao không làm thay đổi giá trị. Dữ liệu và địa điểm đều là giả định.',
    enzymeAlt: (value) => `Mô hình enzyme và ${value} hình cơ chất`, gridAlt: 'Lưới giá trị dân số tương đối giả định' },
  en: { enzyme: 'Enzyme and substrate model', grid: 'Illustrative population grid', count: 'Substrate symbols', scale: 'Height scale', rotate: 'Rotate', reset: 'Reset view',
    stages: ['Approach', 'Binding', 'Release'], stageLabel: 'Choose an illustrative stage',
    stageDescriptions: ['A substrate approaches the active site.', 'A substrate is shown bound to the enzyme.', 'Products leave the active site; the enzyme can be used again.'],
    noSubstrate: 'Add at least one substrate to view this stage.',
    drag: 'Drag or use Rotate to turn the scene.', fallback: '2D view shown because 3D is unavailable or still loading.',
    enzymeNote: 'Teal marks the active site; gold shapes symbolize substrates. The shapes illustrate an idea, not a molecular structure or measurement.',
    gridNote: 'Taller cells indicate larger illustrative values. Changing the height scale does not change the values. Values and locations are fictional.',
    enzymeAlt: (value) => `Conceptual enzyme and ${value} substrate symbols`, gridAlt: 'Illustrative grid of relative population values' },
}

function discard(group) {
  const geometries = new Set(), materials = new Set()
  group?.traverse((item) => {
    if (item.geometry) geometries.add(item.geometry)
    for (const mat of Array.isArray(item.material) ? item.material : [item.material]) if (mat) materials.add(mat)
  })
  geometries.forEach((g) => g.dispose())
  materials.forEach((m) => m.dispose())
}

function Fallback({ kind, value, text, phase }) {
  if (kind === 'enzyme_binding') {
    return <svg viewBox="0 0 400 200" role="img" aria-label={text.enzymeAlt(value)}>
      <ellipse className="research3d-body" cx="200" cy="105" rx="100" ry="48" />
      <circle className="research3d-site" cx="230" cy="80" r="13" />
      {Array.from({ length: value }, (_, i) => <circle key={i} className="research3d-substrate" cx={i === 0 && phase === 'binding' ? 230 : 200 + 145 * Math.cos(i * Math.PI / 4)} cy={i === 0 && phase === 'binding' ? 80 : 105 + 70 * Math.sin(i * Math.PI / 4)} r="8" />)}
    </svg>
  }
  return <svg viewBox="0 0 400 200" role="img" aria-label={text.gridAlt}>
    {GRID.map((n, i) => {
      const height = 3 + n * value
      return <rect key={i} data-cell={i} className={n >= 3 ? 'research3d-dense' : 'research3d-sparse'} x={126 + (i % 5) * 30} y={53 + Math.floor(i / 5) * 30 - height} width="22" height={height} rx="2" />
    })}
  </svg>
}

export default function ResearchVisual3D({ kind }) {
  const { lang, t } = useT()
  const { deck } = useSceneLayout()
  const text = COPY[lang] || COPY.vi
  const enzyme = kind === 'enzyme_binding'
  const [value, setValue] = useState(enzyme ? 5 : 3)
  const [phase, setPhase] = useState('approach')
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const valueRef = useRef(value)
  valueRef.current = value
  const host = useRef(null)
  const live = useRef(null)
  const [status, setStatus] = useState(() => can3D() ? 'loading' : 'unavailable')

  useEffect(() => {
    if (!can3D()) return undefined
    let cancelled = false
    let stage
    let current
    let envelope
    let rotation = 0
    const lost = (event) => { event.preventDefault(); setStatus('unavailable') }
    ;(async () => {
      try {
        const [{ createStage }, THREE, kit] = await Promise.all([import('../../../lib/three/stage.js'), import('three'), import('../../../lib/three/kit.js')])
        if (cancelled || !host.current) return
        stage = createStage(host.current, { view: { azimuth: .62, elevation: enzyme ? .42 : .52 }, turnRange: 1.2 })
        stage.canvas.addEventListener('webglcontextlost', lost)
        const palette = kit.scenePalette(host.current)
        const material = (role, overrides) => kit.studioMaterial(role, palette, overrides)
        const build = (count, phase) => researchSceneFactories[kind](THREE, count, phase, material)
        envelope = build(...ENVELOPE[kind])
        // frame the widest state, then let the model on show cast its shadows on the floor
        const fit = () => {
          envelope.rotation.y = rotation
          stage.frame?.(envelope, { fill: enzyme ? .97 : .92 })
          if (current) stage.frame?.(current, { fit: false, cast: true })
        }
        const update = (next) => {
          if (current) {
            stage.world.remove(current)
            discard(current)
          }
          current = build(next, phaseRef.current)
          current.rotation.y = rotation
          stage.world.add(current)
          stage.frame?.(current, { fit: false, cast: true })
          stage.invalidate()
        }
        live.current = {
          update,
          rotate: () => { rotation += Math.PI / 4; current.rotation.y = rotation; fit(); stage.invalidate() },
          reset: () => { rotation = 0; current.rotation.y = 0; stage.resetView(); fit(); stage.invalidate() },
        }
        update(valueRef.current)
        fit()
        setStatus('ready')
      } catch {
        stage?.dispose()
        stage = null
        if (!cancelled) setStatus('unavailable')
      }
    })()
    return () => {
      cancelled = true
      live.current = null
      if (current) {
        discard(current)
      }
      discard(envelope)
      stage?.canvas.removeEventListener('webglcontextlost', lost)
      stage?.dispose()
    }
  }, [kind])

  useEffect(() => { live.current?.update(value) }, [value, phase])

  if (!['enzyme_binding', 'population_grid'].includes(kind)) return null
  const ready = status === 'ready'
  const phases = ['approach', 'binding', 'release']
  const viewTools = deck && ready ? [
      { icon: RotateCw, label: text.rotate, onClick: () => live.current?.rotate() },
      { icon: Undo2, label: text.reset, onClick: () => live.current?.reset() },
  ] : null
  const stage = <div className={`research3d-stage stage3d${ready ? ' is-ready' : ''}`}>
    {!ready ? <div className="research3d-fallback"><Fallback kind={kind} value={value} text={text} phase={phase} /></div> : null}
    <div className="research3d-host" ref={host} role={ready ? 'img' : undefined} aria-hidden={!ready || undefined} style={{ visibility: ready ? 'visible' : 'hidden' }} aria-label={ready ? (enzyme ? text.enzyme : text.grid) : undefined} />
    {viewTools ? <StageTools label={t('scene3d.view')} tools={viewTools} /> : null}
  </div>
  const slider = (className) => <label className={className}>{deck ? <span>{enzyme ? text.count : text.scale}</span> : <>{enzyme ? text.count : text.scale}: </>}<strong>{value}</strong>
    <input type="range" min={enzyme ? 0 : 1} max={enzyme ? 8 : 4} step="1" value={value} onChange={(e) => setValue(Number(e.target.value))} />
  </label>

  // on a lesson slide: the stage, the stages and the slider in one row, the stage on show explained beside the model
  if (deck) return <section className="research3d stage3d-scene is-deck" aria-label={enzyme ? text.enzyme : text.grid}>
    {stage}
    <SceneBar tools={viewTools} toolsLabel={t('scene3d.view')}>
      {enzyme ? <div className="stage3d-choices" role="group" aria-label={text.stageLabel}>
        {phases.map((item, index) => <button key={item} type="button" className="chip" aria-pressed={phase === item} onClick={() => setPhase(item)}>{index + 1}. {text.stages[index]}</button>)}
      </div> : null}
      {slider('stage3d-range')}
    </SceneBar>
    <SceneAside>
      {enzyme
        ? <SceneFocus title={`${phases.indexOf(phase) + 1}. ${text.stages[phases.indexOf(phase)]}`}>{value ? text.stageDescriptions[phases.indexOf(phase)] : text.noSubstrate}</SceneFocus>
        : <SceneFocus live={false}>{text.gridNote}</SceneFocus>}
      <SceneNotes><p>{ready ? text.drag : text.fallback}</p>{enzyme ? <p>{text.enzymeNote}</p> : null}</SceneNotes>
    </SceneAside>
  </section>

  return <div className="research3d stage3d-scene">
    {stage}
    {enzyme ? <div className="research3d-stages" role="group" aria-label={text.stageLabel}>
      <div className="stage3d-choices">{phases.map((item, index) => <button key={item} type="button" className="chip" aria-pressed={phase === item} onClick={() => setPhase(item)}>{index + 1}. {text.stages[index]}</button>)}</div>
      <p className="stage3d-detail" aria-live="polite">{value ? text.stageDescriptions[phases.indexOf(phase)] : text.noSubstrate}</p>
    </div> : null}
    <div className="research3d-controls">
      {slider(undefined)}
      {ready ? <div className="stage3d-view"><button type="button" className="btn btn-ghost" onClick={() => live.current?.rotate()}><RotateCw size={20} aria-hidden="true" />{text.rotate}</button><button type="button" className="btn btn-ghost" onClick={() => live.current?.reset()}><Undo2 size={20} aria-hidden="true" />{text.reset}</button></div> : null}
    </div>
    <p className="research3d-note stage3d-note">{ready ? text.drag : text.fallback} {enzyme ? text.enzymeNote : text.gridNote}</p>
  </div>
}
