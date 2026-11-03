import { useEffect, useRef, useState } from 'react'
import { RotateCcw, RotateCw, Undo2, ZoomIn, ZoomOut } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { can3D } from '../../../components/lab3d/support.js'
import { SceneAside, SceneBar, SceneFocus, SceneNotes, StageTools, useSceneLayout } from '../../../components/lab3d/sceneLayout.jsx'
import '../../../styles/stage3d.css'
import './anatomicalHeart3d.css'

const MODEL_URL = '/models/bodyparts3d/heart.glb'
const CAVITIES = new Set(['right-ventricle', 'left-ventricle'])
const LARGE_VESSELS = new Set(['ascending-aorta', 'aortic-arch', 'pulmonary-trunk', 'superior-vena-cava'])
const COPY = {
  vi: {
    title: 'Cấu tạo tim 3D',
    image: 'Mô hình 3D tim người, với thành tim và các mạch máu lớn; kéo để xoay hoặc dùng các nút điều khiển.',
    loading: 'Đang tải mô hình tim 3D…',
    unavailable: 'Không thể mở mô hình 3D trên thiết bị này. Hãy chọn mục Sơ đồ đường đi của máu để tiếp tục học.',
    controls: 'Điều khiển mô hình', rotateLeft: 'Xoay trái', rotateRight: 'Xoay phải',
    zoomIn: 'Phóng to', zoomOut: 'Thu nhỏ', reset: 'Đặt lại',
    parts: 'Chọn phần quan sát', all: 'Toàn bộ tim', cavities: 'Khoang tâm thất', vessels: 'Mạch máu lớn',
    allText: 'Quan sát bề mặt tim cùng một số mạch máu lớn. Kéo chuột để xoay, hoặc dùng các nút bên dưới.',
    cavityText: 'Bề mặt khoang tâm thất được tách ra để quan sát; đây là không gian bên trong, không phải cơ tim.',
    vesselText: 'Hiển thị động mạch chủ, thân động mạch phổi và tĩnh mạch chủ trên.',
    limitation: 'Mô hình tham chiếu nam trưởng thành đã đơn giản hóa; không có van tim, khoang tâm nhĩ hay phần lớn tĩnh mạch. Màu sắc chỉ phân biệt cấu trúc; quy ước máu xanh/đỏ áp dụng cho sơ đồ đường đi của máu. Chưa được chuyên gia giải phẫu thẩm định.',
    source: 'Nguồn mô hình', adapted: 'OrganUI chọn, tô màu và chuyển đổi mô hình từ dữ liệu gốc.',
  },
  en: {
    title: 'Heart anatomy in 3D',
    image: '3D model of a human heart, including the heart wall and major vessels; drag to rotate or use the controls.',
    loading: 'Loading the 3D heart model…',
    unavailable: 'The 3D model could not be opened on this device. Select the blood flow diagram to continue learning.',
    controls: 'Model controls', rotateLeft: 'Rotate left', rotateRight: 'Rotate right',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', reset: 'Reset',
    parts: 'Choose what to inspect', all: 'Whole heart', cavities: 'Ventricular cavities', vessels: 'Major vessels',
    allText: 'Explore the heart surface and some major vessels. Drag to rotate, or use the controls below.',
    cavityText: 'The ventricular cavity surfaces are isolated here; they represent interior spaces, not heart muscle.',
    vesselText: 'Shows the aorta, pulmonary trunk and superior vena cava.',
    limitation: 'This simplified adult male reference model omits the valves, atrial cavities and most veins. Colors distinguish structures; the blue/red oxygen convention applies to the blood flow diagram. Expert anatomical review is pending.',
    source: 'Model source', adapted: 'OrganUI selected, colored and converted this model from the original data.',
  },
}

function disposeModel(model) {
  const geometries = new Set()
  const materials = new Set()
  model?.traverse((part) => {
    if (part.geometry) geometries.add(part.geometry)
    for (const material of Array.isArray(part.material) ? part.material : [part.material]) {
      if (material) materials.add(material)
    }
  })
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
}

/** `lead`: on a lesson slide, the parent's own choice (the heart or the flow diagram) opens the control row. */
export default function AnatomicalHeart3D({ lead = null }) {
  const { lang } = useT()
  const { deck } = useSceneLayout()
  const text = COPY[lang] || COPY.vi
  const host = useRef(null)
  const live = useRef(null)
  const [view, setView] = useState('all')
  const [status, setStatus] = useState(() => can3D() ? 'loading' : 'unavailable')

  useEffect(() => {
    if (!can3D()) return undefined
    let cancelled = false
    let stage
    let model
    let rotation = 0
    let zoom = 1
    const lost = (event) => { event.preventDefault(); setStatus('unavailable') }
    ;(async () => {
      try {
        const [{ createStage }, { GLTFLoader }, THREE] = await Promise.all([
          import('../../../lib/three/stage.js'),
          import('three/addons/loaders/GLTFLoader.js'),
          import('three'),
        ])
        if (cancelled || !host.current) return
        stage = createStage(host.current, { view: { azimuth: .2, elevation: .16 }, turnRange: Math.PI })
        stage.canvas.addEventListener('webglcontextlost', lost)
        const gltf = await new GLTFLoader().loadAsync(MODEL_URL)
        model = gltf.scene
        if (cancelled) { disposeModel(model); return }
        const pieces = []
        model.traverse((part) => { if (part.isMesh) pieces.push(part) })
        if (!pieces.length || !pieces.some((part) => CAVITIES.has(part.name))) throw new Error('Invalid heart model')
        const bounds = new THREE.Box3().setFromObject(model)
        const center = bounds.getCenter(new THREE.Vector3())
        model.position.sub(center)
        // studio finish on the reference model's own colours: a satin surface, no plastic gloss
        pieces.forEach((part) => {
          for (const material of Array.isArray(part.material) ? part.material : [part.material]) {
            if (material && 'roughness' in material) { material.roughness = Math.max(material.roughness ?? .6, .58); material.metalness = 0 }
          }
        })
        stage.world.add(model)
        // the camera fits the whole heart at its own size; the zoom buttons then scale it, and the
        // floor and its shadows follow the part on show
        const fit = () => {
          const scale = stage.world.scale.x
          stage.world.scale.setScalar(1)
          stage.frame?.(stage.world, { fill: .84, cast: true })
          stage.world.scale.setScalar(scale)
          stage.frame?.(stage.world, { fit: false })
        }
        const apply = (selection) => {
          pieces.forEach((part) => { part.visible = selection === 'all' || (selection === 'cavities' ? CAVITIES : LARGE_VESSELS).has(part.name) })
          stage.frame?.(stage.world, { fit: false })
          stage.invalidate()
        }
        live.current = {
          select: apply,
          rotate: (step) => { rotation += step; stage.world.rotation.y = rotation; fit(); stage.invalidate() },
          zoom: (factor) => { zoom = Math.min(1.4, Math.max(.7, zoom * factor)); stage.world.scale.setScalar(zoom); stage.frame?.(stage.world, { fit: false }); stage.invalidate() },
          reset: () => { rotation = 0; zoom = 1; stage.world.rotation.y = 0; stage.world.scale.setScalar(1); stage.resetView(); fit(); apply('all') },
        }
        fit()
        apply('all')
        setStatus('ready')
      } catch {
        if (model) disposeModel(model)
        stage?.dispose()
        stage = null
        if (!cancelled) setStatus('unavailable')
      }
    })()
    return () => {
      cancelled = true
      live.current = null
      if (model) disposeModel(model)
      stage?.canvas.removeEventListener('webglcontextlost', lost)
      stage?.dispose()
    }
  }, [])

  function select(next) { setView(next); live.current?.select(next) }
  function reset() { setView('all'); live.current?.reset() }
  const ready = status === 'ready'
  const description = text[view === 'all' ? 'allText' : view === 'cavities' ? 'cavityText' : 'vesselText']
  const credit = <p className="anatomical-heart-credit stage3d-note">{text.source}: <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html" target="_blank" rel="noopener noreferrer">BodyParts3D, © The Database Center for Life Science, CC BY 4.0</a>. {text.adapted} <a href="https://github.com/organui/heart-3d/blob/c72ce6654ff8e282942f97750d3104f55ef4fc3d/public/models/ATTRIBUTION.md" target="_blank" rel="noopener noreferrer">OrganUI</a>.</p>
  const parts = <div className="anatomical-heart-parts stage3d-choices" role="group" aria-label={text.parts}>
    {['all', 'cavities', 'vessels'].map((id) => <button key={id} type="button" className="chip" aria-pressed={view === id} disabled={!ready} onClick={() => select(id)}>{text[id]}</button>)}
  </div>
  const viewTools = deck && ready ? [
      { icon: RotateCcw, label: text.rotateLeft, onClick: () => live.current?.rotate(-Math.PI / 4) },
      { icon: RotateCw, label: text.rotateRight, onClick: () => live.current?.rotate(Math.PI / 4) },
      { icon: ZoomIn, label: text.zoomIn, onClick: () => live.current?.zoom(1.15) },
      { icon: ZoomOut, label: text.zoomOut, onClick: () => live.current?.zoom(1 / 1.15) },
      { icon: Undo2, label: text.reset, onClick: reset },
  ] : null
  const stage = <div className="anatomical-heart-stage stage3d">
    {!ready ? <p className="anatomical-heart-placeholder" role="status">{status === 'loading' ? text.loading : text.unavailable}</p> : null}
    <div className="anatomical-heart-host" ref={host} role={ready ? 'img' : undefined}
      aria-label={ready ? text.image : undefined} aria-hidden={!ready || undefined}
      style={{ visibility: ready ? 'visible' : 'hidden' }} />
    {viewTools ? <StageTools className="anatomical-heart-controls" label={text.controls} tools={viewTools} /> : null}
  </div>

  // on a lesson slide: the stage, one row of choices, the part on show explained beside the model
  if (deck) return <section className="anatomical-heart stage3d-scene is-deck" aria-label={text.title}>
    {stage}
    <SceneBar lead={lead} tools={viewTools} toolsLabel={text.controls}>{parts}</SceneBar>
    <SceneAside>
      <SceneFocus className="anatomical-heart-description" title={text[view]} live={false}>{description}</SceneFocus>
      <SceneNotes><p className="anatomical-heart-limit">{text.limitation}</p>{credit}</SceneNotes>
    </SceneAside>
  </section>

  return <section className="anatomical-heart stage3d-scene" aria-label={text.title}>
    {stage}
    <div className="anatomical-heart-content">
      {parts}
      <p className="anatomical-heart-description stage3d-detail">{description}</p>
      <div className="anatomical-heart-controls stage3d-view" role="group" aria-label={text.controls}>
        <button type="button" className="btn btn-ghost" disabled={!ready} onClick={() => live.current?.rotate(-Math.PI / 4)}><RotateCcw size={20} aria-hidden="true" />{text.rotateLeft}</button>
        <button type="button" className="btn btn-ghost" disabled={!ready} onClick={() => live.current?.rotate(Math.PI / 4)}><RotateCw size={20} aria-hidden="true" />{text.rotateRight}</button>
        <button type="button" className="btn btn-ghost" disabled={!ready} onClick={() => live.current?.zoom(1.15)}><ZoomIn size={20} aria-hidden="true" />{text.zoomIn}</button>
        <button type="button" className="btn btn-ghost" disabled={!ready} onClick={() => live.current?.zoom(1 / 1.15)}><ZoomOut size={20} aria-hidden="true" />{text.zoomOut}</button>
        <button type="button" className="btn btn-ghost" disabled={!ready} onClick={reset}><Undo2 size={20} aria-hidden="true" />{text.reset}</button>
      </div>
      <p className="anatomical-heart-limit stage3d-note">{text.limitation}</p>
      {credit}
    </div>
  </section>
}
