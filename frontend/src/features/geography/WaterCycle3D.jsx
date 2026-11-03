import { useEffect, useRef, useState } from 'react'
import { RotateCcw, RotateCw, Undo2 } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { can3D } from '../../components/lab3d/support.js'
import { SceneAside, SceneBar, SceneFocus, SceneNotes, StageTools, useSceneLayout } from '../../components/lab3d/sceneLayout.jsx'
import '../../styles/stage3d.css'
import './waterCycle3d.css'

const STAGES = ['evaporation', 'condensation', 'rain', 'runoff', 'infiltration']
const COPY = {
  vi: {
    title: 'Vòng tuần hoàn nước: mô hình cắt lớp',
    image: 'Mô hình 3D có biển, mây, mưa, núi, sông và các lớp đất; chấm vàng đánh dấu quá trình được chọn.',
    drawing: 'Sơ đồ 2D: hơi nước bốc lên từ biển, mây cho mưa xuống núi, sông chảy về biển và nước thấm xuống lớp đất.',
    intro: 'Chọn một quá trình để tìm vị trí trên mô hình, rồi xoay để quan sát cả mặt đất và phần nước bên dưới.',
    loading: 'Đang chuẩn bị mô hình 3D…', fallback: 'Sơ đồ 2D đang được hiển thị vì thiết bị không mở được 3D. Các nút bên dưới vẫn giải thích từng quá trình.',
    stages: {
      evaporation: ['Bốc hơi', 'Nước lỏng từ biển, hồ và mặt đất chuyển thành hơi nước trong không khí.'],
      condensation: ['Ngưng tụ', 'Hơi nước nguội đi và ngưng tụ thành các giọt nhỏ tạo nên mây.'],
      rain: ['Mưa', 'Các giọt nước trong mây có thể kết hợp, lớn lên và rơi xuống dưới dạng mưa.'],
      runoff: ['Dòng chảy mặt', 'Một phần nước chảy trên mặt đất vào suối, sông rồi trở về biển.'],
      infiltration: ['Thấm', 'Một phần nước thấm qua đất, bổ sung nước ngầm; dòng chảy ngầm có thể quay về sông hoặc biển.'],
    },
    controls: 'Điều khiển góc nhìn', rotateLeft: 'Xoay trái', rotateRight: 'Xoay phải', reset: 'Đặt lại góc nhìn',
    note: 'Mô hình minh họa: địa hình, màu sắc và kích thước được đơn giản hóa, không phải số liệu đo tại một địa điểm.',
  },
  en: {
    title: 'Water cycle: a cutaway landscape',
    image: '3D model showing sea, clouds, rain, mountains, a river and soil layers; a gold marker shows the selected process.',
    drawing: '2D diagram: water vapor rises from the sea, a cloud rains over the mountain, a river flows back to the sea and water seeps into the soil.',
    intro: 'Choose a process to locate it on the model, then rotate to see both the surface and water below ground.',
    loading: 'Preparing the 3D model…', fallback: 'A 2D diagram is shown because this device cannot open 3D. The controls below still explain each process.',
    stages: {
      evaporation: ['Evaporation', 'Liquid water from the sea, lakes and ground becomes water vapor in the air.'],
      condensation: ['Condensation', 'Water vapor cools and condenses into small droplets that form clouds.'],
      rain: ['Rain', 'Water droplets in clouds can combine, grow and fall as rain.'],
      runoff: ['Surface runoff', 'Some water flows over the land into streams and rivers, and returns to the sea.'],
      infiltration: ['Infiltration', 'Some water enters the soil and replenishes groundwater; groundwater can flow back to rivers or the sea.'],
    },
    controls: 'View controls', rotateLeft: 'Rotate left', rotateRight: 'Rotate right', reset: 'Reset view',
    note: 'Teaching illustration: terrain, colors and sizes are simplified and are not measurements from a particular place.',
  },
}

// shown instead of the 3D model, so it carries the picture's text alternative
function WaterCycleFallback({ label }) {
  return <svg className="water-cycle-drawing" viewBox="0 0 600 260" role="img" aria-label={label}>
    <rect className="wc-soil" x="5" y="187" width="590" height="65" rx="12" />
    <path className="wc-land" d="M15 187 Q90 145 175 181 L250 187 L370 56 L510 187Z" />
    <path className="wc-snow" d="M330 101 L370 56 L410 101 L392 95 L370 78 L348 95Z" />
    <path className="wc-sea" d="M15 188 H285 V222 H15Z" />
    <path className="wc-cloud" d="M493 124 Q465 124 465 106 Q465 88 484 88 Q493 65 516 70 Q538 69 546 89 Q570 85 572 104 Q573 123 553 124Z" />
    <path className="wc-rain" d="M486 137 l-6 17 M510 137 l-6 17 M534 137 l-6 17" />
    <path className="wc-vapour" d="M135 159 q-12 -15 0 -30 q12 -15 0 -30 M158 157 q-12 -15 0 -30 q12 -15 0 -30" />
    <path className="wc-river" d="M438 161 Q385 196 305 193 Q250 187 205 198" />
    <path className="wc-seep" d="M463 195 v31 M484 195 v31" />
  </svg>
}

export default function WaterCycle3D() {
  const { lang } = useT()
  const { deck } = useSceneLayout()
  const text = COPY[lang] || COPY.vi
  const [selected, setSelected] = useState('evaporation')
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const host = useRef(null)
  const live = useRef(null)
  const [status, setStatus] = useState(() => can3D() ? 'loading' : 'unavailable')

  useEffect(() => {
    if (!can3D()) return undefined
    let cancelled = false
    let stage
    let model
    let marker
    let ring
    let rotation = 0
    let model3d
    const lost = (event) => { event.preventDefault(); setStatus('unavailable') }
    ;(async () => {
      try {
        const [{ createStage }, { createWaterCycleDiorama }, THREE, kit] = await Promise.all([
          import('../../lib/three/stage.js'), import('../../lib/three/models/waterCycle.js'), import('three'), import('../../lib/three/kit.js'),
        ])
        if (cancelled || !host.current) return
        // from the front left, as the offline render: both cut faces (the sea's and the soil's) face the reader
        stage = createStage(host.current, { view: { azimuth: -.48, elevation: .36 }, turnRange: 1.4 })
        stage.canvas.addEventListener('webglcontextlost', lost)
        model = createWaterCycleDiorama({ seed: 5 })
        // in the lab the sun sits in the sky above the sea, inside the frame (the offline render keeps its own place)
        const sun = model.parts?.sun?.[0]?.parent
        if (sun) { sun.position.set(-4.3, 4.2, -2.6); sun.scale.setScalar(.8) }
        stage.world.add(model.group)
        const palette = kit.scenePalette(host.current)
        // the selection pin: a pear bead in an ink ring, drawn over everything, never part of the framing
        marker = new THREE.Mesh(new THREE.SphereGeometry(.17, 24, 18), new THREE.MeshBasicMaterial({ color: palette.pear, depthTest: false }))
        ring = new THREE.Mesh(new THREE.RingGeometry(.27, .34, 48), new THREE.MeshBasicMaterial({ color: palette.ink, side: THREE.DoubleSide, depthTest: false }))
        marker.renderOrder = 20
        ring.renderOrder = 19
        marker.userData.noFit = true
        ring.userData.noFit = true
        stage.world.add(marker, ring)
        model3d = model.group
        stage.frame?.(model3d, { fill: .86, shadow: .45 })
        const select = (key) => {
          stage.world.updateMatrixWorld(true)
          const bounds = new THREE.Box3()
          for (const part of model.parts[key] || []) bounds.union(new THREE.Box3().setFromObject(part))
          if (bounds.isEmpty()) { marker.visible = false; ring.visible = false; stage.invalidate(); return }
          const center = bounds.getCenter(new THREE.Vector3())
          center.y = bounds.max.y + .2
          stage.world.worldToLocal(center)
          marker.position.copy(center)
          ring.position.copy(center)
          // the preview capture shows the landscape only
          marker.visible = ring.visible = !kit.captureMode?.()
          ring.lookAt(stage.camera.position)
          stage.invalidate()
        }
        live.current = {
          select,
          rotate: (increment) => { rotation += increment; stage.world.rotation.y = rotation; stage.frame?.(model3d, { fill: .86, shadow: .45 }); select(selectedRef.current) },
          reset: () => { rotation = 0; stage.world.rotation.y = 0; stage.resetView(); stage.frame?.(model3d, { fill: .86, shadow: .45 }); select(selectedRef.current) },
        }
        select(selectedRef.current)
        setStatus('ready')
      } catch {
        model?.dispose()
        stage?.dispose()
        stage = null
        if (!cancelled) setStatus('unavailable')
      }
    })()
    return () => {
      cancelled = true
      live.current = null
      marker?.geometry.dispose(); marker?.material.dispose()
      ring?.geometry.dispose(); ring?.material.dispose()
      model?.dispose()
      stage?.canvas.removeEventListener('webglcontextlost', lost)
      stage?.dispose()
    }
  }, [])
  useEffect(() => { live.current?.select(selected) }, [selected])

  const ready = status === 'ready'
  const viewTools = deck && ready ? [
      { icon: RotateCcw, label: text.rotateLeft, onClick: () => live.current?.rotate(-Math.PI / 5) },
      { icon: RotateCw, label: text.rotateRight, onClick: () => live.current?.rotate(Math.PI / 5) },
      { icon: Undo2, label: text.reset, onClick: () => live.current?.reset() },
  ] : null
  const stage = <div className="water-cycle-stage stage3d">
    {!ready ? <div className="water-cycle-fallback"><WaterCycleFallback label={text.drawing} />{status === 'loading' ? <p className="stage3d-status" role="status">{text.loading}</p> : null}</div> : null}
    <div className="water-cycle-host" ref={host} role={ready ? 'img' : undefined}
      aria-label={ready ? text.image : undefined} aria-hidden={!ready || undefined}
      style={{ visibility: ready ? 'visible' : 'hidden' }} />
    {viewTools ? <StageTools className="water-cycle-controls" label={text.controls} tools={viewTools} /> : null}
  </div>
  const options = <div className="water-cycle-options stage3d-choices" role="group" aria-label={text.title}>
    {STAGES.map((key) => <button key={key} type="button" className="chip" aria-pressed={selected === key} onClick={() => setSelected(key)}>{text.stages[key][0]}</button>)}
  </div>

  // on a lesson slide: the stage, the five processes in one row, the chosen one explained beside the model
  if (deck) return <section className="water-cycle stage3d-scene is-deck" aria-label={text.title}>
    {stage}
    <SceneBar tools={viewTools} toolsLabel={text.controls}>{options}</SceneBar>
    <SceneAside>
      <SceneFocus className="water-cycle-detail" title={text.stages[selected][0]}>{text.stages[selected][1]}</SceneFocus>
      {status === 'unavailable' ? <p className="water-cycle-fallback-note stage3d-note">{text.fallback}</p> : null}
      <SceneNotes><p className="water-cycle-note">{text.note}</p></SceneNotes>
    </SceneAside>
  </section>

  return <section className="water-cycle stage3d-scene" aria-label={text.title}>
    <p className="water-cycle-intro">{text.intro}</p>
    {stage}
    {status === 'unavailable' ? <p className="water-cycle-fallback-note stage3d-note" role="status">{text.fallback}</p> : null}
    <div className="water-cycle-content">
      {options}
      <p className="water-cycle-detail stage3d-detail" role="status">{text.stages[selected][1]}</p>
      {ready ? <div className="water-cycle-controls stage3d-view" role="group" aria-label={text.controls}>
        <button type="button" className="btn btn-ghost" onClick={() => live.current?.rotate(-Math.PI / 5)}><RotateCcw size={20} aria-hidden="true" />{text.rotateLeft}</button>
        <button type="button" className="btn btn-ghost" onClick={() => live.current?.rotate(Math.PI / 5)}><RotateCw size={20} aria-hidden="true" />{text.rotateRight}</button>
        <button type="button" className="btn btn-ghost" onClick={() => live.current?.reset()}><Undo2 size={20} aria-hidden="true" />{text.reset}</button>
      </div> : null}
      <p className="water-cycle-note stage3d-note">{text.note}</p>
    </div>
  </section>
}
