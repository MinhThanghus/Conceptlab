import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import { RotateCw, Undo2 } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { can3D } from '../../../components/lab3d/support.js'
import { SceneAside, SceneBar, SceneFocus, SceneNotes, StageTools, useSceneLayout } from '../../../components/lab3d/sceneLayout.jsx'
import '../../../styles/stage3d.css'
import './circulation3d.css'

const AnatomicalHeart3D = lazy(() => import('./AnatomicalHeart3D.jsx'))

// A flow diagram, deliberately not an anatomical or structural heart model.
const POINTS = [[-2.3, 1.42, 0], [-.45, 1.78, .34], [-.45, .91, .34], [2.3, 1.42, 0], [.45, 1.78, .34], [.45, .91, .34]]
// blue: oxygen-poor blood (the right heart, the body's return); coral: oxygen-rich blood
const POOR = [true, true, true, false, false, false]
const COPY = {
  vi: {
    title: 'Sơ đồ tuần hoàn đơn giản', diagram: 'Sơ đồ vòng tuần hoàn: các cơ quan, nhĩ phải, thất phải, phổi, nhĩ trái và thất trái.',
    stages: ['Các cơ quan', 'Tâm nhĩ phải', 'Tâm thất phải', 'Phổi', 'Tâm nhĩ trái', 'Tâm thất trái'],
    details: [
      'Máu nhường oxy cho các cơ quan, nhận CO₂ rồi theo tĩnh mạch chủ về tâm nhĩ phải.',
      'Tâm nhĩ phải nhận máu nghèo oxy từ cơ thể và đưa xuống tâm thất phải.',
      'Tâm thất phải bơm máu nghèo oxy theo động mạch phổi lên phổi.',
      'Tại phổi, máu nhận oxy và thải CO₂; máu giàu oxy theo tĩnh mạch phổi về tâm nhĩ trái.',
      'Tâm nhĩ trái nhận máu giàu oxy từ phổi và đưa xuống tâm thất trái.',
      'Tâm thất trái bơm máu giàu oxy vào động mạch chủ tới các cơ quan.',
    ],
    choose: 'Theo dõi đường đi của máu', rotate: 'Xoay mô hình', reset: 'Đặt lại góc nhìn',
    subtitle: 'Mô hình minh họa, không theo tỉ lệ giải phẫu', body: 'Cơ thể', heart: 'Tim', lungs: 'Phổi',
    fallback: 'Đang hiển thị sơ đồ 2D vì 3D chưa sẵn sàng hoặc không được hỗ trợ.',
    poor: 'Xanh: máu nghèo oxy', rich: 'Đỏ: máu giàu oxy',
  },
  en: {
    title: 'Simplified circulation diagram', diagram: 'Circulation diagram: body organs, right atrium, right ventricle, lungs, left atrium, and left ventricle.',
    stages: ['Body organs', 'Right atrium', 'Right ventricle', 'Lungs', 'Left atrium', 'Left ventricle'],
    details: [
      'Blood delivers oxygen to the organs, takes up CO₂, and returns to the right atrium through the venae cavae.',
      'The right atrium receives oxygen-poor blood from the body and passes it to the right ventricle.',
      'The right ventricle pumps oxygen-poor blood to the lungs through the pulmonary artery.',
      'In the lungs, blood takes up oxygen and releases CO₂; oxygen-rich blood returns to the left atrium through the pulmonary veins.',
      'The left atrium receives oxygen-rich blood from the lungs and passes it to the left ventricle.',
      'The left ventricle pumps oxygen-rich blood into the aorta and onward to the organs.',
    ],
    choose: 'Follow the path of blood', rotate: 'Rotate model', reset: 'Reset view',
    subtitle: 'Illustrative model, not anatomically to scale', body: 'Body', heart: 'Heart', lungs: 'Lungs',
    fallback: 'The 2D diagram is shown while 3D loads or if it is unavailable.',
    poor: 'Blue: oxygen-poor blood', rich: 'Red: oxygen-rich blood',
  },
}

function dispose(group) {
  group?.traverse((part) => { part.geometry?.dispose(); part.material?.map?.dispose(); part.material?.dispose() })
}

/** The diagram in the studio's inks: token colours (read at runtime), lighter tints mixed toward card. */
function makeModel(THREE, kit, palette, selected, text, floor = 13) {
  const group = new THREE.Group()
  const nodes = []
  const flows = []
  const chips = []
  const tint = (color, k) => new THREE.Color(color).lerp(new THREE.Color(palette.card), k)
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .55, metalness: 0, ...extra })
  const ellipsoid = (parent, color, position, scale, extra = {}) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), mat(color, extra))
    mesh.position.set(...position)
    mesh.scale.set(...scale)
    parent.add(mesh)
    return mesh
  }

  // A deliberately stylized cutaway, with four separate chambers. The human
  // right side appears on the viewer's left, as in standard medical diagrams.
  const heart = new THREE.Shape()
  heart.moveTo(0, -1.04)
  heart.bezierCurveTo(-.34, -.74, -1.08, -.32, -1.05, .35)
  heart.bezierCurveTo(-1.02, 1.04, -.40, 1.13, 0, .72)
  heart.bezierCurveTo(.40, 1.13, 1.02, 1.04, 1.05, .35)
  heart.bezierCurveTo(1.08, -.32, .34, -.74, 0, -1.04)
  const heartMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(heart, { depth: .42, bevelEnabled: true, bevelThickness: .10, bevelSize: .10, bevelSegments: 5, curveSegments: 32 }), mat(tint(palette.coral, .62), { roughness: .82 }))
  heartMesh.position.set(0, 1.37, -.42)
  heartMesh.scale.set(.87, .87, .87)
  group.add(heartMesh)
  ;[[text.body, -2.3, 2.12], [text.heart, 0, 2.42], [text.lungs, 2.3, 2.12]].forEach(([title, x, y]) => {
    const chip = kit.createChip(title, { size: .13, minPx: floor, maxPx: 18, palette })
    chip.sprite.position.set(x, y, .65)
    group.add(chip.sprite)
    chips.push(chip)
  })

  // The outer stations are recognizable body/lung icons, not anatomical meshes.
  POINTS.forEach(([x, y, z], i) => {
    const node = new THREE.Group()
    node.position.set(x, y, z)
    if (i === 0) {
      ellipsoid(node, tint(palette.muted, .25), [0, .29, 0], [.18, .19, .14])
      ellipsoid(node, tint(palette.muted, .45), [0, -.12, 0], [.30, .39, .15])
      ellipsoid(node, palette.card, [0, -.12, .15], [.15, .24, .05])
    } else if (i === 3) {
      ellipsoid(node, tint(palette.coral, .4), [-.18, 0, 0], [.19, .38, .17], { roughness: .75 })
      ellipsoid(node, tint(palette.coral, .48), [.18, 0, 0], [.19, .38, .17], { roughness: .75 })
      const airway = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .45, 16), mat(palette.card))
      airway.position.set(0, .18, .14)
      node.add(airway)
    } else {
      const lower = i === 2 || i === 5
      const color = POOR[i] ? palette.blue : palette.coral
      ellipsoid(node, color, [0, 0, 0], [lower ? .31 : .29, lower ? .34 : .24, .16], { roughness: .6 })
      ellipsoid(node, tint(color, .7), [-.08, .09, .14], [.08, .10, .025], { transparent: true, opacity: .45 })
    }
    node.scale.setScalar(i === selected ? 1.12 : 1)
    group.add(node)
    nodes.push(node)
    // the step's number: an ink bead with paper type, always facing the reader
    const label = kit.createChip(String(i + 1), { size: .12, minPx: floor, maxPx: 17, palette, fill: palette.ink, stroke: palette.ink, color: palette.paper, weight: 700 })
    label.sprite.position.set(x, y, z + .62)
    group.add(label.sprite)
    chips.push(label)
  })

  // Separate curved paths show the two circuits without the criss-crossing
  // straight lines of the earlier diagram. Every arrow follows the blood flow.
  const paths = [
    [[-2.04, 1.67, .05], [-1.65, 2.47, .04], [-1.05, 2.35, .16], [-.54, 1.98, .28]],
    [[-.45, 1.50, .42], [-.45, 1.40, .42], [-.45, 1.30, .42], [-.45, 1.23, .42]],
    [[-.56, .58, .23], [-.72, -.15, -.16], [1.45, -.12, -.16], [2.11, 1.06, -.02]],
    [[2.03, 1.66, .05], [1.61, 2.42, .04], [1.02, 2.32, .16], [.54, 1.98, .28]],
    [[.45, 1.50, .42], [.45, 1.40, .42], [.45, 1.30, .42], [.45, 1.23, .42]],
    [[.56, .57, .42], [.70, -.42, .48], [-1.65, -.39, .48], [-2.12, 1.02, .08]],
  ]
  paths.forEach((points, i) => {
    const color = POOR[i] ? palette.blue : palette.coral
    const curve = new THREE.CubicBezierCurve3(...points.map((p) => new THREE.Vector3(...p)))
    const material = mat(color, { roughness: .45, emissive: color, emissiveIntensity: i === selected ? .35 : .05 })
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, .055, 12, false), material)
    group.add(tube)
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(.13, .27, 24), mat(color, { roughness: .45, emissive: color, emissiveIntensity: i === selected ? .35 : .05 }))
    const t = .67
    arrow.position.copy(curve.getPoint(t))
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), curve.getTangent(t).normalize())
    group.add(arrow)
    flows.push({ tube, arrow })
  })
  group.userData.nodes = nodes
  group.userData.flows = flows
  return { group, nodes, flows, chips }
}

function Fallback({ selected, text }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const points = [[70,145],[273,105],[273,198],[570,145],[367,105],[367,198]]
  const paths = ['M99 120 C135 40 207 48 250 88', 'M273 132 L273 174',
    'M257 220 C230 290 502 293 550 177', 'M542 120 C505 40 433 48 390 88',
    'M367 132 L367 174', 'M382 220 C421 320 140 319 90 177']
  return <svg className="circulation3d-drawing" viewBox="0 0 640 320" role="img" aria-label={text.diagram}>
    <defs>{['poor', 'rich'].map((kind) => <marker key={kind} id={`${uid}-${kind}`} markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path className={`cd-${kind}-fill`} d="M0 0L9 4.5L0 9Z" /></marker>)}</defs>
    <path className="cd-heart" d="M320 250 C285 220 230 190 230 124 C230 69 280 55 320 92 C360 55 410 69 410 124 C410 190 355 220 320 250Z" />
    <circle className="cd-body" cx="70" cy="117" r="16" /><path className="cd-body" d="M47 178V151 Q47 132 70 132 Q93 132 93 151V178Z" />
    <ellipse className="cd-lung" cx="556" cy="145" rx="17" ry="32" /><ellipse className="cd-lung" cx="584" cy="145" rx="17" ry="32" /><path className="cd-airway" d="M570 107V146" />
    <ellipse className="cd-poor-fill" cx="273" cy="105" rx="29" ry="24" /><ellipse className="cd-poor-fill" cx="273" cy="198" rx="31" ry="34" />
    <ellipse className="cd-rich-fill" cx="367" cy="105" rx="29" ry="24" /><ellipse className="cd-rich-fill" cx="367" cy="198" rx="31" ry="34" />
    {paths.map((path, i) => <path key={i} className={`cd-path ${POOR[i] ? 'cd-poor' : 'cd-rich'}`} d={path} strokeWidth={i === selected ? 8 : 5} markerEnd={`url(#${uid}-${POOR[i] ? 'poor' : 'rich'})`} />)}
    {points.map(([x, y], i) => <g key={i}><circle className="cd-bead" cx={x} cy={y} r={i === selected ? 16 : 13} /><text className="cd-bead-text" x={x} y={y + 4} textAnchor="middle">{i + 1}</text></g>)}
    <g className="cd-caption" textAnchor="middle"><text x="70" y="72">{text.body}</text><text x="320" y="45">{text.heart}</text><text x="570" y="72">{text.lungs}</text></g>
  </svg>
}

function CirculationDiagram({ lead = null }) {
  const { lang, t } = useT()
  const { deck } = useSceneLayout()
  const text = COPY[lang] || COPY.vi
  const [selected, setSelected] = useState(0)
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const host = useRef(null)
  const live = useRef(null)
  const [status, setStatus] = useState(() => can3D() ? 'loading' : 'unavailable')

  useEffect(() => {
    if (!can3D()) return undefined
    let cancelled = false, stage, model, rotation = 0
    const lost = (event) => { event.preventDefault(); setStatus('unavailable') }
    ;(async () => {
      try {
        const [{ createStage }, THREE, kit] = await Promise.all([import('../../../lib/three/stage.js'), import('three'), import('../../../lib/three/kit.js')])
        if (cancelled || !host.current) return
        stage = createStage(host.current, { view: { azimuth: .28, elevation: .2 }, turnRange: 1.2 })
        stage.canvas.addEventListener('webglcontextlost', lost)
        const palette = kit.scenePalette(host.current)
        model = makeModel(THREE, kit, palette, selectedRef.current, text, kit.labelFloor(host.current))
        stage.world.add(model.group)
        stage.onResize = (unit) => model.chips.forEach((chip) => chip.setPixelUnit(unit))
        const fit = () => stage.frame?.(model.group, { fill: .86, cast: true })
        fit()
        live.current = {
          select: (index) => {
            model.nodes.forEach((node, i) => node.scale.setScalar(i === index ? 1.12 : 1))
            model.flows.forEach(({ tube, arrow }, i) => { tube.material.emissiveIntensity = arrow.material.emissiveIntensity = i === index ? .35 : .05 })
            stage.invalidate()
          },
          rotate: () => { rotation += Math.PI / 4; model.group.rotation.y = rotation; fit(); stage.invalidate() },
          reset: () => { rotation = 0; model.group.rotation.y = 0; stage.resetView(); fit(); stage.invalidate() },
        }
        stage.invalidate()
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
      if (model) dispose(model.group)
      stage?.canvas.removeEventListener('webglcontextlost', lost)
      stage?.dispose()
    }
  }, [lang])
  useEffect(() => { live.current?.select(selected) }, [selected])

  const ready = status === 'ready'
  const viewTools = deck && ready ? [
      { icon: RotateCw, label: text.rotate, onClick: () => live.current?.rotate() },
      { icon: Undo2, label: text.reset, onClick: () => live.current?.reset() },
  ] : null
  const stage = <div className="circulation3d-stage stage3d">
    {!ready ? <div className="circulation3d-fallback"><Fallback selected={selected} text={text} /></div> : null}
    <div className="circulation3d-host" ref={host} style={{ visibility: ready ? 'visible' : 'hidden' }} role={ready ? 'img' : undefined} aria-hidden={!ready || undefined} aria-label={ready ? text.diagram : undefined} />
    {deck ? (viewTools ? <StageTools label={t('scene3d.view')} tools={viewTools} /> : null) : <p className="circulation3d-stage-note stage3d-caption">{text.subtitle}</p>}
  </div>

  // on a lesson slide: the six stations as numbered beads under the stage, the chosen one explained beside the model
  if (deck) return <section className="circulation3d stage3d-scene is-deck" aria-label={text.title}>
    {stage}
    <SceneBar lead={lead} tools={viewTools} toolsLabel={t('scene3d.view')}>
      <div className="circulation3d-stations stage3d-choices" role="group" aria-label={text.choose}>
        {text.stages.map((name, i) => <button key={name} type="button" className="chip stage3d-bead" aria-pressed={selected === i} aria-label={`${i + 1}. ${name}`} title={name} onClick={() => setSelected(i)}>{i + 1}</button>)}
      </div>
    </SceneBar>
    <SceneAside>
      <SceneFocus className="circulation3d-detail" title={`${selected + 1}. ${text.stages[selected]}`}>{text.details[selected]}</SceneFocus>
      <p className="stage3d-key circulation3d-key-row"><span><i className="is-poor" aria-hidden="true" />{text.poor}</span><span><i className="is-rich" aria-hidden="true" />{text.rich}</span></p>
      <SceneNotes><p>{text.subtitle}</p>{!ready ? <p>{text.fallback}</p> : null}</SceneNotes>
    </SceneAside>
  </section>

  return <section className="circulation3d stage3d-scene" aria-label={text.title}>
    {stage}
    <p className="circulation3d-legend"><span className="circulation3d-key is-poor" aria-hidden="true" />{text.poor}<span className="circulation3d-key is-rich" aria-hidden="true" />{text.rich}</p>
    <div className="circulation3d-controls">
      <p>{text.choose}</p>
      <ol>{text.stages.map((stage, i) => <li key={stage}><button type="button" aria-pressed={selected === i} onClick={() => setSelected(i)}><span aria-hidden="true">{i + 1}</span> {stage}</button></li>)}</ol>
      <p className="circulation3d-detail stage3d-detail" role="status">{text.details[selected]}</p>
      {ready ? <div className="circulation3d-view stage3d-view"><button type="button" className="btn btn-ghost" onClick={() => live.current?.rotate()}><RotateCw size={20} aria-hidden="true" />{text.rotate}</button><button type="button" className="btn btn-ghost" onClick={() => live.current?.reset()}><Undo2 size={20} aria-hidden="true" />{text.reset}</button></div> : <p className="circulation3d-fallback-note stage3d-note">{text.fallback}</p>}
    </div>
  </section>
}

/** The anatomical model and flow diagram describe different things: the first
 * shows a static heart, the second is a schematic of the two blood circuits. */
export default function Circulation3D() {
  const { lang, t } = useT()
  const { deck } = useSceneLayout()
  const [view, setView] = useState('heart')
  // on a slide the view switch moves into the shown scene's control row: keep the focus on the pill
  const refocus = useRef(null)
  const labels = lang === 'en'
    ? { group: 'Choose a view', heart: '3D heart', flow: 'Blood flow diagram' }
    : { group: 'Chọn góc nhìn', heart: 'Tim 3D', flow: 'Sơ đồ đường đi của máu' }
  const pick = (next) => { refocus.current = next; setView(next) }
  const pill = (id, label, short) => <button type="button" className="chip" aria-pressed={view === id} onClick={() => pick(id)}
    aria-label={short ? label : undefined} title={short ? label : undefined}
    ref={deck ? (node) => { if (node && refocus.current === id) { refocus.current = null; node.focus({ preventScroll: true }) } } : undefined}>{short || label}</button>
  const switcher = <div className="circulation3d-switch stage3d-choices" role="group" aria-label={labels.group}>
    {pill('heart', labels.heart)}
    {pill('flow', labels.flow, deck ? t('scene3d.circulation.diagramShort') : null)}
  </div>
  if (deck) return view === 'heart'
    ? <Suspense fallback={<p role="status">{t('common.states.loading')}</p>}><AnatomicalHeart3D lead={switcher} /></Suspense>
    : <CirculationDiagram lead={switcher} />
  return <div className="circulation3d-shell">
    {switcher}
    {view === 'heart'
      ? <Suspense fallback={<p role="status">{t('common.states.loading')}</p>}><AnatomicalHeart3D /></Suspense>
      : <CirculationDiagram />}
  </div>
}
