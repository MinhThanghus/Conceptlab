import { useEffect, useId, useRef, useState } from 'react'
import { Minus, Plus, RotateCcw, RotateCw, Undo2, ZoomIn, ZoomOut } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { can3D } from '../../components/lab3d/support.js'
import { SceneAside, SceneBar, SceneFocus, SceneNotes, StageTools, useSceneLayout } from '../../components/lab3d/sceneLayout.jsx'
import { cmosInverter } from './semiconductorMath.js'
import '../../styles/stage3d.css'
import './semiconductor.css'

const MODES = ['device', 'cmos', 'stack', 'memristor']
const GEOMETRIES = ['planar', 'nanosheet', 'nanowire']
const validGeometry = (value) => GEOMETRIES.includes(value) ? value : 'planar'
const validMode = (value) => MODES.includes(value) ? value : value === 'transistor' ? 'device' : value === 'inverter' ? 'cmos' : 'device'
const COPY = {
  vi: {
    zoomIn: 'Phóng to', zoomOut: 'Thu nhỏ', zoomLabel: 'Độ phóng đại', zoomHint: 'Cuộn chuột hoặc chụm hai ngón tay để thu phóng. Kéo để xoay.', topView: 'Nhìn từ trên', isoView: 'Nhìn phối cảnh',
    schematic: 'Sơ đồ nối điện 2D', selectPart: 'Chọn bộ phận để tìm hiểu', vddInfo: 'VDD là nguồn mức cao của mạch.', gndInfo: 'GND là mốc mức thấp của mạch.', inputInfo: 'Đầu vào chung điều khiển cả hai transistor.', outputInfo: 'Đầu ra nối với nút chung giữa hai transistor.', pmosInfo: 'pMOS nối đầu ra với VDD khi đầu vào ở mức 0.', nmosInfo: 'nMOS nối đầu ra với GND khi đầu vào ở mức 1.',
    circuitSummary: 'Xem sơ đồ nối tiếp 2D', circuitMemory: 'Phần tử nhớ HfSe₂', circuitSelector: 'Bộ chọn silic', middleElectrode: 'Điện cực giữa', bottomElectrode: 'Điện cực dưới', memristor: 'Bộ nhớ điện trở', geometryControls: 'Cấu trúc thiết bị', planar: 'Phẳng', nanosheet: 'Lá nano', nanowire: 'Dây nano đứng',
    geometryNote: 'Hình minh họa so sánh hình học: lá xếp ngang hoặc dây thẳng đứng, với cổng bao quanh kênh. Mô hình không so sánh hiệu năng hay tái hiện thiết bị nghiên cứu.',
    memoryTitle: 'Bộ nhớ điện trở và phần tử chọn', memoryLead: 'Khám phá một ô gồm phần tử chọn silic nối tiếp phần tử nhớ HfSe₂. Thử ghi, đọc và xóa trạng thái điện trở.',
    setMemory: 'Ghi SET', readMemory: 'Đọc READ', resetMemory: 'Xóa RESET', memoryControls: 'Thao tác bộ nhớ', memoryHigh: 'Điện trở cao', memoryLow: 'Điện trở thấp',
    memoryInitial: 'Ban đầu ở trạng thái điện trở cao.', memorySet: 'SET đưa ô minh họa về trạng thái điện trở thấp.', memoryRead: 'READ quan sát trạng thái hiện tại và giữ nguyên trạng thái trong mô hình lý tưởng này.', memoryReset: 'RESET đưa ô minh họa về trạng thái điện trở cao.',
    memoryNote: 'Màu chỉ biểu thị trạng thái điện trở, không mô tả sợi dẫn hoặc cơ chế chuyển mạch. Đây là sơ đồ lấy cảm hứng từ cấu trúc 1S1R, không theo tỷ lệ, không mô phỏng điện áp hay số liệu thí nghiệm; thao tác đọc lý tưởng có thể khác thực tế.',
    topElectrode: 'Điện cực trên', switchLayer: 'Lớp HfSe₂', selector: 'Bộ chọn silic', sceneMemory: 'Sơ đồ 3D ô nhớ: điện cực trên, lớp chuyển mạch HfSe₂, điện cực giữa và bộ chọn silic.', memorySource: 'Nghiên cứu: mảng HfSe₂ và bộ chọn silic',
    title: 'Từ transistor tới mạch và các lớp chip', kicker: 'Bán dẫn, mô hình khái niệm',
    lead: 'Khám phá cấu tạo MOSFET, dự đoán đầu ra của cổng đảo CMOS, rồi xem các lớp kết nối trên chip.',
    modes: 'Chọn nội dung', device: 'Transistor', cmos: 'Cổng đảo CMOS', stack: 'Các lớp chip',
    deviceTitle: 'MOSFET kênh n: mặt cắt đơn giản',
    deviceLead: 'Quan sát cực nguồn S, cực máng D, cực cổng G, lớp cách điện và đế bán dẫn. Thử đổi tín hiệu cổng.',
    gateControls: 'Tín hiệu cổng', gateLow: 'Cổng thấp', gateHigh: 'Cổng cao',
    off: 'Trong mô hình lý tưởng, kênh dẫn chưa hình thành. Mô hình bỏ qua dòng rò và vùng dưới ngưỡng.',
    on: 'Cổng cao tạo kênh dẫn giữa S và D. Dòng điện qua kênh còn cần có điện áp phù hợp giữa hai cực.',
    deviceLegend: 'Xanh đậm là đế loại p, xanh ngọc là vùng n+, vàng là điện môi cổng, tím là cực cổng, xanh nhạt là kênh minh họa.',
    source: 'Nguồn S', gate: 'Cổng G', drain: 'Máng D', oxide: 'Điện môi', substrate: 'Đế loại p',
    cmosTitle: 'Dự đoán cổng đảo CMOS',
    cmosLead: 'Hai transistor bổ sung dùng chung đầu vào. Hãy dự đoán đầu ra trước khi kiểm tra đường nối.',
    input: 'Đầu vào', output: 'Đầu ra', prediction: 'Dự đoán đầu ra', check: 'Kiểm tra dự đoán', tryAgain: 'Chọn lại đầu vào để thử tiếp.',
    correct: 'Đúng.', incorrect: 'Chưa đúng.',
    zero: 'Đầu vào 0: pMOS bật, nMOS tắt; đầu ra được nối lên VDD nên là 1.',
    one: 'Đầu vào 1: pMOS tắt, nMOS bật; đầu ra được nối xuống GND nên là 0.',
    before: 'Chọn 0 hoặc 1 cho đầu ra, rồi bấm kiểm tra để hiện trạng thái mạch.',
    truth: 'Bảng trạng thái lý tưởng', pmos: 'pMOS', nmos: 'nMOS', conducting: 'Bật', blocked: 'Tắt',
    steady: 'Mô hình chỉ xét hai mức logic ổn định và công tắc lý tưởng. Chuyển tiếp, dòng rò và tải không được mô phỏng; đường được tô sáng biểu thị kết nối, không khẳng định có dòng liên tục.',
    stackTitle: 'Các lớp kết nối trên chip',
    stackLead: 'Tách các lớp để quan sát đế silic với vùng transistor, lớp điện môi, đường kim loại và các via kết nối.',
    spread: 'Khoảng tách để quan sát', stackLegend: 'Xanh đậm là đế, xanh ngọc là vùng thiết bị, tím là cổng, xanh nhạt trong suốt là điện môi, vàng cát và xanh dương là các lớp nối kim loại.',
    stackNote: 'Các lớp được vẽ tách để dễ nhìn; khoảng cách, số lớp và hình dạng không theo tỷ lệ. Đây không phải quy trình chế tạo đầy đủ hay cấu trúc của một bài báo cụ thể.',
    loading: 'Đang chuẩn bị mô hình 3D…', fallback: 'Thiết bị không mở được WebGL; sơ đồ 2D và các điều khiển vẫn hoạt động.',
    rotateLeft: 'Xoay trái', rotateRight: 'Xoay phải', reset: 'Đặt lại góc nhìn', viewControls: 'Điều khiển góc nhìn',
    sceneDevice: 'Mặt cắt 3D MOSFET có nguồn, cổng, máng, điện môi và đế. Chọn tín hiệu cổng để xem kênh minh họa.',
    sceneCmos: 'Mô hình 3D mạch đảo với pMOS, nMOS, VDD, GND, đầu vào chung và đầu ra chung.',
    sceneStack: 'Các lớp 3D gồm đế silic, vùng thiết bị, điện môi, đường nối và via.',
    scope: 'Mô hình khái niệm do ConceptLab dựng, không tái hiện hình học, vật liệu, thông số hoặc kết quả thực nghiệm của các nghiên cứu. Tỉ lệ được phóng đại để dễ học.',
    sources: 'Nguồn kiến thức nền', mit: 'MIT OpenCourseWare: MOSFET và cổng CMOS', sia: 'SIA: các bước chế tạo trên wafer',
  },
  en: {
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', zoomLabel: 'Zoom', zoomHint: 'Use the mouse wheel or pinch with two fingers to zoom. Drag to rotate.', topView: 'Top view', isoView: 'Isometric view',
    schematic: 'Linked 2D circuit', selectPart: 'Select a part to learn more', vddInfo: 'VDD is the high supply rail.', gndInfo: 'GND is the low reference rail.', inputInfo: 'The shared input controls both transistors.', outputInfo: 'The output is the shared node between the two transistors.', pmosInfo: 'pMOS connects the output to VDD when the input is 0.', nmosInfo: 'nMOS connects the output to GND when the input is 1.',
    circuitSummary: 'View the 2D series schematic', circuitMemory: 'HfSe₂ memory element', circuitSelector: 'Silicon selector', middleElectrode: 'Middle electrode', bottomElectrode: 'Bottom electrode', memristor: 'Resistive memory', geometryControls: 'Device geometry', planar: 'Planar', nanosheet: 'Nanosheets', nanowire: 'Vertical nanowire',
    geometryNote: 'These sketches compare geometry: horizontal stacked sheets or a vertical wire, with a gate around the channel. They do not compare performance or reproduce the research devices.',
    memoryTitle: 'Resistive memory and selector', memoryLead: 'Explore a cell with a silicon selector in series with an HfSe₂ memory element. Write, read and reset its resistance state.',
    setMemory: 'SET', readMemory: 'READ', resetMemory: 'RESET', memoryControls: 'Memory operations', memoryHigh: 'High resistance', memoryLow: 'Low resistance',
    memoryInitial: 'The initial state is high resistance.', memorySet: 'SET switches this illustration to low resistance.', memoryRead: 'READ observes the current state and leaves it unchanged in this ideal model.', memoryReset: 'RESET switches this illustration to high resistance.',
    memoryNote: 'Color indicates resistance state; it does not depict a filament or switching mechanism. This is a conceptual diagram inspired by a 1S1R structure, not to scale and without experimental voltages or data; ideal reading may differ in real devices.',
    topElectrode: 'Top electrode', switchLayer: 'HfSe₂ layer', selector: 'Silicon selector', sceneMemory: '3D schematic of a memory cell: top electrode, HfSe₂ switching layer, middle electrode and silicon selector.', memorySource: 'Study: HfSe₂ array and silicon selector',
    title: 'From transistor to circuit and chip layers', kicker: 'Semiconductors, a conceptual model',
    lead: 'Explore MOSFET structure, predict a CMOS inverter output, then inspect the interconnect layers on a chip.',
    modes: 'Choose a topic', device: 'Transistor', cmos: 'CMOS inverter', stack: 'Chip layers',
    deviceTitle: 'n-channel MOSFET: a simplified cross-section',
    deviceLead: 'Observe the source S, drain D, gate G, insulating layer and semiconductor substrate. Change the gate signal.',
    gateControls: 'Gate signal', gateLow: 'Gate low', gateHigh: 'Gate high',
    off: 'In the idealized model, the conducting channel has not formed. Leakage and subthreshold behavior are omitted.',
    on: 'A high gate signal creates a channel between S and D. Current through the channel also requires an appropriate voltage across the terminals.',
    deviceLegend: 'Dark blue is the p-type substrate, mint the n+ regions, yellow the gate dielectric, purple the gate electrode, pale mint the illustrative channel.',
    source: 'Source S', gate: 'Gate G', drain: 'Drain D', oxide: 'Dielectric', substrate: 'p-type substrate',
    cmosTitle: 'Predict the CMOS inverter',
    cmosLead: 'Two complementary transistors share the input. Predict the output before checking the connected path.',
    input: 'Input', output: 'Output', prediction: 'Predict the output', check: 'Check prediction', tryAgain: 'Choose the input again to try another prediction.',
    correct: 'Correct.', incorrect: 'Not quite.',
    zero: 'Input 0: pMOS is on and nMOS is off; the output connects to VDD and is 1.',
    one: 'Input 1: pMOS is off and nMOS is on; the output connects to GND and is 0.',
    before: 'Choose output 0 or 1, then check to reveal the circuit state.',
    truth: 'Ideal truth table', pmos: 'pMOS', nmos: 'nMOS', conducting: 'On', blocked: 'Off',
    steady: 'The model shows only stable binary levels and ideal switches. Transients, leakage and load are omitted; the highlighted path shows a connection, not a claim of continuous current.',
    stackTitle: 'Chip interconnect layers',
    stackLead: 'Separate the layers to observe the silicon with transistor regions, dielectric, metal lines and connecting vias.',
    spread: 'Separation for viewing', stackLegend: 'Dark blue is the substrate, mint the device regions, purple the gates, pale translucent blue the dielectric, sand and blue the metal interconnects.',
    stackNote: 'Layers are pulled apart for clarity; spacing, count and shapes are not to scale. This is not a complete manufacturing process or a particular paper’s device.',
    loading: 'Preparing the 3D model…', fallback: 'WebGL is unavailable; the 2D diagram and controls still work.',
    rotateLeft: 'Rotate left', rotateRight: 'Rotate right', reset: 'Reset view', viewControls: 'View controls',
    sceneDevice: '3D MOSFET cross-section with source, gate, drain, dielectric and substrate. Change the gate signal to show the illustrative channel.',
    sceneCmos: '3D inverter model with pMOS, nMOS, VDD, GND, shared input and shared output.',
    sceneStack: '3D layers representing silicon substrate, device regions, dielectric, interconnects and vias.',
    scope: 'Conceptual model created by ConceptLab; it does not reproduce the geometry, materials, parameters or experimental results of any study. Dimensions are exaggerated for learning.',
    sources: 'Background references', mit: 'MIT OpenCourseWare: MOSFETs and CMOS gates', sia: 'SIA: wafer fabrication steps',
  },
}

function DeviceFallback({ labels, gateHigh, geometry }) {
  const channel = gateHigh ? 'sd-channel' : 'sd-doped'
  if (geometry !== 'planar') return <svg className="semiconductor-drawing" viewBox="0 0 640 300" role="img" aria-label={labels.sceneDevice}>
    <rect className="sd-substrate" x="80" y="245" width="480" height="35" />
    {geometry === 'nanosheet' ? <><rect className="sd-doped" x="95" y="65" width="90" height="170" /><rect className="sd-doped" x="455" y="65" width="90" height="170" />{[90,145,200].map(y => <g key={y}><rect className="sd-gate-ring" x="230" y={y-15} width="180" height="30" strokeWidth="8"/><rect className={channel} x="185" y={y-5} width="270" height="10" /></g>)}</> : <><rect className="sd-doped" x="250" y="215" width="140" height="30" /><rect className={channel} x="303" y="70" width="34" height="145" /><rect className="sd-gate-ring" x="275" y="110" width="90" height="65" strokeWidth="10"/><rect className="sd-metal" x="250" y="50" width="140" height="24" /></>}
    <text className="sd-text" x="320" y="28" textAnchor="middle" fontSize="19">{labels[geometry]}: {labels.gate}</text>
  </svg>
  return <svg className="semiconductor-drawing" viewBox="0 0 640 300" role="img" aria-label={labels.sceneDevice}>
    <rect className="sd-substrate" x="50" y="160" width="540" height="90" rx="8" />
    <rect className="sd-doped" x="85" y="120" width="155" height="50" /><rect className="sd-doped" x="400" y="120" width="155" height="50" />
    {gateHigh ? <rect className="sd-channel" x="240" y="146" width="160" height="14" /> : null}
    <rect className="sd-oxide" x="240" y="110" width="160" height="12" /><rect className="sd-gate" x="240" y="78" width="160" height="32" />
    <rect className="sd-metal" x="137" y="84" width="52" height="36" /><rect className="sd-metal" x="451" y="84" width="52" height="36" />
    <g className="sd-text" textAnchor="middle" fontSize="19" fontWeight="600"><text x="163" y="72">{labels.source}</text><text x="320" y="60">{labels.gate}</text><text x="477" y="72">{labels.drain}</text><text x="320" y="282">{labels.substrate}</text></g>
  </svg>
}

function CmosFallback({ labels, input, revealed }) {
  const state = cmosInverter(input)
  const p = revealed && state.pOn ? 'sd-p-on' : 'sd-off'
  const n = revealed && state.nOn ? 'sd-n-on' : 'sd-off'
  return <svg className="semiconductor-drawing" viewBox="0 0 640 300" role="img" aria-label={labels.sceneCmos}>
    <g fill="none" strokeWidth="9" strokeLinecap="round"><path className={`${p}-line`} d="M320 30 V84 M320 118 V150" /><path className={`${n}-line`} d="M320 150 V182 M320 216 V267" /><path className="sd-out-line" d="M320 150 H535" /><path className="sd-in-line" d="M82 150 H168 V101 H275 M168 150 V199 H275" /></g>
    <rect className={p} x="275" y="84" width="90" height="34" rx="9" /><rect className={n} x="275" y="182" width="90" height="34" rx="9" />
    <g className="sd-text" fontSize="19" fontWeight="600" textAnchor="middle"><text x="320" y="24">VDD</text><text x="320" y="293">GND</text><text x="75" y="137">{labels.input} {input}</text><text x="545" y="137">{labels.output} {revealed ? state.output : '?'}</text><text x="415" y="108">pMOS</text><text x="415" y="206">nMOS</text></g>
  </svg>
}

function CmosDiagram({ labels, input, revealed, selectedPart, onSelect }) {
  const state = cmosInverter(input)
  const part = (key, text) => <button type="button" className={'semiconductor-circuit-part part-' + key} aria-pressed={selectedPart === key} onClick={() => onSelect(key)}>{text}</button>
  return <section className="semiconductor-circuit" aria-label={labels.schematic}>
    <h5>{labels.schematic}</h5>
    <div className="semiconductor-circuit-layout">
      <div className="semiconductor-circuit-side">{part('input', labels.input + ': ' + input)}<span>↳ pMOS + nMOS</span></div>
      <div className="semiconductor-circuit-branch">
        {part('vdd', 'VDD')}<span className={'semiconductor-circuit-wire ' + (revealed && state.pOn ? 'is-p' : '')} />
        {part('pmos', 'pMOS')}<span className={'semiconductor-circuit-wire ' + (revealed && state.pOn ? 'is-p' : '')} />
        {part('output', labels.output + ': ' + (revealed ? state.output : '?'))}
        <span className={'semiconductor-circuit-wire ' + (revealed && state.nOn ? 'is-n' : '')} />{part('nmos', 'nMOS')}
        <span className={'semiconductor-circuit-wire ' + (revealed && state.nOn ? 'is-n' : '')} />{part('gnd', 'GND')}
      </div>
    </div>
    <p role="status"><strong>{labels.selectPart}:</strong> {labels[selectedPart + 'Info']}</p>
  </section>
}

function StackFallback({ labels, separation }) {
  const d = Number(separation) * .5
  return <svg className="semiconductor-drawing" viewBox="0 0 640 300" role="img" aria-label={labels.sceneStack}>
    <path className="sd-substrate" d="M80 210 H560 V260 H80Z" />
    <path className="sd-doped" d={`M100 ${198-d*.15} H540 V${210-d*.15} H100Z`} />
    <path className="sd-dielectric" d={`M100 ${181-d*.42} H540 V${194-d*.42} H100Z`} />
    <path className="sd-metal" d={`M100 ${162-d*.7} H540 V${175-d*.7} H100Z`} />
    <path className="sd-n-on" d={`M100 ${143-d} H540 V${156-d} H100Z`} />
    <text className="sd-text" x="320" y="286" textAnchor="middle" fontSize="18">{labels.substrate}</text>
  </svg>
}

function MemoryFallback({ labels, memoryState }) {
  return <svg className="semiconductor-drawing" viewBox="0 0 640 300" role="img" aria-label={labels.sceneMemory}>
    <rect className="sd-substrate" x="110" y="225" width="420" height="35" /><rect className="sd-metal" x="140" y="205" width="360" height="16" />
    <rect className="sd-doped" x="160" y="155" width="320" height="46" /><rect className="sd-metal" x="140" y="138" width="360" height="16" />
    <rect className={memoryState === 'low' ? 'sd-n-on' : 'sd-off'} x="175" y="103" width="290" height="30" /><rect className="sd-metal" x="140" y="85" width="360" height="16" />
    <g className="sd-text" textAnchor="middle" fontSize="18" fontWeight="600"><text x="320" y="65">{labels.topElectrode}</text><text x="320" y="125">{labels.switchLayer}</text><text x="320" y="185">{labels.selector}</text></g>
  </svg>
}

export default function SemiconductorExplorer({ embedded = false, kind = 'semiconductor_chip', initialMode = 'device', initialGeometry = 'planar' }) {
  const { lang, fmt, t } = useT()
  const { deck } = useSceneLayout()
  const text = COPY[lang] || COPY.vi
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [zoom, setZoom] = useState(1)
  const [selectedPart, setSelectedPart] = useState('input')
  const overlayRefs = useRef({})
  const [mode, setMode] = useState(() => validMode(initialMode))
  const [geometry, setGeometry] = useState(() => validGeometry(initialGeometry))
  const [memoryState, setMemoryState] = useState('high')
  const [memoryAction, setMemoryAction] = useState('initial')
  const [gateHigh, setGateHigh] = useState(false)
  const [input, setInput] = useState(0)
  const [prediction, setPrediction] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [separation, setSeparation] = useState(35)
  const values = useRef({ gateHigh, input, revealed, separation, geometry, memoryState })
  values.current = { gateHigh, input, revealed, separation, geometry, memoryState }
  const host = useRef(null)
  const live = useRef(null)
  const [status, setStatus] = useState(() => can3D() ? 'loading' : 'unavailable')
  const labels = { source: text.source, gate: text.gate, drain: text.drain, oxide: text.oxide, substrate: text.substrate, pmos: text.pmos, nmos: text.nmos, input: text.input, output: text.output, topElectrode: text.topElectrode, switchLayer: text.switchLayer, selector: text.selector }
  const logic = cmosInverter(input)

  useEffect(() => { setMode(validMode(initialMode)) }, [initialMode])
  useEffect(() => { setGeometry(validGeometry(initialGeometry)) }, [initialGeometry])
  useEffect(() => {
    if (!can3D()) { setStatus('unavailable'); return undefined }
    setStatus('loading')
    let cancelled = false
    let stage
    let model
    let rotation = 0
    const lost = (event) => { event.preventDefault(); setStatus('unavailable') }
    ;(async () => {
      try {
        const [{ createStage }, { createSemiconductorModel }, kit] = await Promise.all([
          import('../../lib/three/stage.js'), import('./semiconductorModels.js'), import('../../lib/three/kit.js'),
        ])
        if (cancelled || !host.current) return
        stage = createStage(host.current, { view: { azimuth: .55, elevation: .5 }, turnRange: 1.3, zoom: true })
        stage.canvas.addEventListener('webglcontextlost', lost)
        model = createSemiconductorModel(mode, labels, kit.scenePalette(host.current), { minPx: kit.labelFloor(host.current) })
        stage.world.add(model.group)
        stage.onResize = (unit) => model.setPixelUnit?.(unit)
        stage.onZoomChange = (value) => setZoom(value)
        if (mode === 'cmos' && stage.camera) stage.onFrame = () => {
          model.group.updateWorldMatrix(true, false)
          const positions = { vdd:[0,.55,-2.25], gnd:[0,.55,2.25], pmos:[.55,.85,-1], nmos:[.55,.85,1], input:[-1.8,.4,0], output:[2,.4,0] }
          const offsets = { vdd:[-18,-36], gnd:[0,24], pmos:[54,-4], nmos:[54,0], input:[-24,0], output:[24,0] }
          for (const [key, coords] of Object.entries(positions)) {
            const element = overlayRefs.current[key]
            if (!element) continue
            const point = new stage.THREE.Vector3(...coords).applyMatrix4(model.group.matrixWorld).project(stage.camera)
            const x = Math.max(10, Math.min(90, (point.x + 1) * 50 + offsets[key][0] / host.current.clientWidth * 100))
            const y = Math.max(6, Math.min(94, (1 - point.y) * 50 + offsets[key][1] / host.current.clientHeight * 100))
            element.style.left = x + '%'; element.style.top = y + '%'
          }
        }
        model.update(values.current)
        // frame what is on show (the chosen device geometry; the layer stack at its widest
        // separation, so the slider never zooms the view); the floor follows the model
        let framed = null
        const fit = (next = values.current) => {
          framed = `${next.geometry}`
          if (mode === 'stack') model.update({ ...next, separation: 100 })
          stage.frame?.(model.group, { fill: mode === 'cmos' ? .86 : .8 })
          if (mode === 'stack') model.update(next)
          stage.frame?.(model.group, { fit: false })
        }
        fit()
        live.current = {
          update: (next) => {
            model.update(next)
            if (mode === 'device' && framed !== `${next.geometry}`) fit(next)
            else stage.frame?.(model.group, { fit: false })
            stage.invalidate()
          },
          rotate: (step) => { rotation += step; model.group.rotation.y = rotation; fit(); stage.invalidate() },
          reset: () => { rotation = 0; model.group.rotation.y = 0; stage.resetView(); fit(); stage.invalidate() },
          zoom: (value) => stage.setZoom(value),
          view: (azimuth, elevation) => { stage.setView(azimuth, elevation); stage.invalidate() },
        }
        stage.invalidate()
        setStatus('ready')
      } catch {
        model?.dispose(); model = null
        stage?.dispose(); stage = null
        if (!cancelled) setStatus('unavailable')
      }
    })()
    return () => {
      cancelled = true; live.current = null
      model?.dispose()
      stage?.canvas.removeEventListener('webglcontextlost', lost)
      stage?.dispose()
    }
  }, [mode, lang])
  useEffect(() => { live.current?.update(values.current) }, [gateHigh, input, revealed, separation, geometry, memoryState])
  useEffect(() => { if (status === 'ready') live.current?.update(values.current) }, [status])

  const setInputAndReset = (value) => { setInput(value); setPrediction(null); setRevealed(false) }
  const heading = mode === 'device' ? text.deviceTitle : mode === 'cmos' ? text.cmosTitle : mode === 'stack' ? text.stackTitle : text.memoryTitle
  const intro = mode === 'device' ? text.deviceLead : mode === 'cmos' ? text.cmosLead : mode === 'stack' ? text.stackLead : text.memoryLead
  const ready = status === 'ready'
  const sceneLabel = mode === 'device' ? text.sceneDevice : mode === 'cmos' ? text.sceneCmos : mode === 'stack' ? text.sceneStack : text.sceneMemory
  const sources = <details className="semiconductor-sources"><summary>{text.sources}</summary><ul>
    <li><a href="https://ocw.mit.edu/courses/6-004-computation-structures-spring-2017/pages/c3/c3s1/" target="_blank" rel="noreferrer">{text.mit}</a></li>
    <li><a href="https://www.semiconductors.org/semiconductors-101/how-are-semiconductors-made/stage-3-front-end-manufacturing/" target="_blank" rel="noreferrer">{text.sia}</a></li>
  </ul></details>
  const viewTools = deck && ready ? [
      { icon: RotateCcw, label: text.rotateLeft, onClick: () => live.current?.rotate(-Math.PI / 5) },
      { icon: RotateCw, label: text.rotateRight, onClick: () => live.current?.rotate(Math.PI / 5) },
      { icon: ZoomOut, label: text.zoomOut, onClick: () => live.current?.zoom(zoom / 1.2) },
      { icon: ZoomIn, label: text.zoomIn, onClick: () => live.current?.zoom(zoom * 1.2) },
      { icon: Undo2, label: text.reset, onClick: () => live.current?.reset() },
  ] : null
  const stage = <div className="semiconductor-stage stage3d" tabIndex={0} onKeyDown={(event) => { if (status !== 'ready') return; if (event.key === '+' || event.key === '=') { event.preventDefault(); live.current?.zoom(zoom * 1.2) } else if (event.key === '-') { event.preventDefault(); live.current?.zoom(zoom / 1.2) } }}>
    {!ready ? <div className="semiconductor-fallback">{mode === 'device' ? <DeviceFallback labels={text} gateHigh={gateHigh} geometry={geometry} /> : mode === 'cmos' ? <CmosFallback labels={text} input={input} revealed={revealed} /> : mode === 'stack' ? <StackFallback labels={text} separation={separation} /> : <MemoryFallback labels={text} memoryState={memoryState} />}{status === 'loading' ? <p className="stage3d-status" role="status">{text.loading}</p> : null}</div> : null}
    <div className="semiconductor-host" ref={host} role={ready ? 'img' : undefined}
      aria-label={ready ? sceneLabel : undefined}
      aria-hidden={!ready || undefined} style={{ visibility: ready ? 'visible' : 'hidden' }} />
    {ready && mode === 'cmos' ? <div className="semiconductor-annotations" aria-label={text.selectPart}>
      {['vdd', 'pmos', 'nmos', 'gnd', 'input', 'output'].map((key) => <button type="button" key={key} ref={(node) => { overlayRefs.current[key] = node }} aria-pressed={selectedPart === key} onClick={() => setSelectedPart(key)}>{key === 'input' ? text.input : key === 'output' ? text.output : key === 'pmos' ? 'pMOS' : key === 'nmos' ? 'nMOS' : key.toUpperCase()}</button>)}
    </div> : null}
    {viewTools ? <StageTools className="semiconductor-view-controls" label={text.viewControls} tools={viewTools} /> : null}
  </div>

  // on a lesson slide: the stage, one row (the topic as a menu, then this topic's own choices), and
  // beside the model what the current state means; legends, limits and sources behind one disclosure
  if (deck) {
    const pick = (label, value, options, onChange) => <label className="stage3d-select">
      <span className="visually-hidden">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((item) => <option key={item} value={item}>{text[item]}</option>)}</select>
    </label>
    const focus = mode === 'device' ? (gateHigh ? text.on : text.off)
      : mode === 'cmos' ? <><p>{revealed ? `${prediction === logic.output ? text.correct : text.incorrect} ${input === 0 ? text.zero : text.one}` : text.before}</p><p>{text[selectedPart + 'Info']}</p></>
        : mode === 'stack' ? text.stackLegend
          : <><strong>{memoryState === 'high' ? text.memoryHigh : text.memoryLow}.</strong> {text[{ initial: 'memoryInitial', set: 'memorySet', read: 'memoryRead', reset: 'memoryReset' }[memoryAction]]}</>
    return <section className={`semiconductor stage3d-scene is-deck${embedded ? ' is-embedded' : ''}`} aria-label={text.title} data-kind={kind}>
      {stage}
      <SceneBar lead={pick(text.modes, mode, MODES, (value) => setMode(validMode(value)))} tools={viewTools} toolsLabel={text.viewControls}>
        {mode === 'device' ? <>
          {pick(text.geometryControls, geometry, GEOMETRIES, (value) => setGeometry(validGeometry(value)))}
          <div className="semiconductor-input stage3d-choices" role="group" aria-label={text.gateControls}>
            <button type="button" className="chip" aria-pressed={!gateHigh} onClick={() => setGateHigh(false)}>{text.gateLow}</button>
            <button type="button" className="chip" aria-pressed={gateHigh} onClick={() => setGateHigh(true)}>{text.gateHigh}</button>
          </div>
        </> : mode === 'cmos' ? <>
          <div className="semiconductor-input stage3d-choices" role="group" aria-label={text.input}><span>{text.input}</span>{[0, 1].map((value) => <button key={value} type="button" className="chip stage3d-bead" aria-pressed={input === value} onClick={() => setInputAndReset(value)}>{value}</button>)}</div>
          <div className="semiconductor-input stage3d-choices" role="group" aria-label={text.prediction}><span>{text.output}</span>{[0, 1].map((value) => <button key={value} type="button" className="chip stage3d-bead" aria-pressed={prediction === value} onClick={() => { setPrediction(value); setRevealed(false) }}>{value}</button>)}</div>
          <button className="semiconductor-check btn" type="button" aria-label={text.check} title={text.check} disabled={prediction === null} onClick={() => setRevealed(true)}>{t('scene3d.semiconductor.checkShort')}</button>
        </> : mode === 'stack' ? <label className="stage3d-range" htmlFor={`${uid}-separation`}><span>{text.spread}</span><strong>{fmt.number(separation, 0)}%</strong>
          <input id={`${uid}-separation`} type="range" min="0" max="100" value={separation} onChange={(event) => setSeparation(Number(event.target.value))} />
        </label> : <div className="semiconductor-input stage3d-choices" role="group" aria-label={text.memoryControls}>
          <button type="button" className="btn" onClick={() => { setMemoryState('low'); setMemoryAction('set') }}>{text.setMemory}</button>
          <button type="button" className="btn" onClick={() => setMemoryAction('read')}>{text.readMemory}</button>
          <button type="button" className="btn" onClick={() => { setMemoryState('high'); setMemoryAction('reset') }}>{text.resetMemory}</button>
        </div>}
      </SceneBar>
      <SceneAside>
        <SceneFocus className="semiconductor-explain" title={heading}>{focus}</SceneFocus>
        {status === 'unavailable' ? <p className="semiconductor-fallback-note stage3d-note">{text.fallback}</p> : null}
        <SceneNotes>
          {mode === 'device' ? <p>{geometry === 'planar' ? text.deviceLegend : text.geometryNote}</p>
            : mode === 'cmos' ? <><p>{text.steady}</p><table className="semiconductor-table"><caption className="visually-hidden">{text.truth}</caption><thead><tr><th>{text.input}</th><th>{text.pmos}</th><th>{text.nmos}</th><th>{text.output}</th></tr></thead><tbody>{[0, 1].map((bit) => { const row = cmosInverter(bit); return <tr key={bit}><td>{bit}</td><td>{row.pOn ? text.conducting : text.blocked}</td><td>{row.nOn ? text.conducting : text.blocked}</td><td>{row.output}</td></tr> })}</tbody></table></>
              : mode === 'stack' ? <p>{text.stackNote}</p>
                : <><p>{text.memoryNote}</p><p><a href="https://www.nature.com/articles/s41467-025-58039-3" target="_blank" rel="noreferrer">{text.memorySource}</a></p></>}
          {ready ? <p>{text.zoomHint}</p> : null}
          <p>{text.scope}</p>
          {sources}
        </SceneNotes>
      </SceneAside>
    </section>
  }

  return <section className={`semiconductor stage3d-scene${embedded ? ' is-embedded' : ''}`} aria-label={text.title} data-kind={kind}>
    <header className="semiconductor-head"><h3>{text.title}</h3><p className="semiconductor-byline">{text.kicker}</p><p>{text.lead}</p></header>
    <div className="semiconductor-main">
      <div className="semiconductor-modes stage3d-choices" role="group" aria-label={text.modes}>
        {MODES.map((item) => <button key={item} type="button" className="chip" aria-pressed={mode === item} onClick={() => setMode(item)}>{text[item]}</button>)}
      </div>
      <div className="semiconductor-context"><h4>{heading}</h4><p>{intro}</p></div>
      {mode === 'device' ? <div className="semiconductor-input stage3d-choices" role="group" aria-label={text.geometryControls}><span>{text.geometryControls}</span>{GEOMETRIES.map((item) => <button type="button" className="chip" key={item} aria-pressed={geometry === item} onClick={() => setGeometry(item)}>{text[item]}</button>)}</div> : null}
      {mode === 'cmos' ? <div className="semiconductor-predict">
        <div className="semiconductor-input stage3d-choices" role="group" aria-label={text.input}><span>{text.input}</span>{[0, 1].map((value) => <button key={value} type="button" className="chip" aria-pressed={input === value} onClick={() => setInputAndReset(value)}>{value}</button>)}</div>
        <div className="semiconductor-input stage3d-choices" role="group" aria-label={text.prediction}><span>{text.prediction}</span>{[0, 1].map((value) => <button key={value} type="button" className="chip" aria-pressed={prediction === value} onClick={() => { setPrediction(value); setRevealed(false) }}>{value}</button>)}<button className="semiconductor-check btn" type="button" disabled={prediction === null} onClick={() => setRevealed(true)}>{text.check}</button></div>
        <p role="status">{revealed ? `${prediction === logic.output ? text.correct : text.incorrect} ${input === 0 ? text.zero : text.one}` : text.before}</p>
      </div> : null}
      {stage}
      {status === 'ready' ? <p className="semiconductor-zoom-hint stage3d-note">{text.zoomHint}</p> : null}
      {mode === 'cmos' ? <CmosDiagram labels={text} input={input} revealed={revealed} selectedPart={selectedPart} onSelect={setSelectedPart} /> : null}
      {status === 'unavailable' ? <p className="semiconductor-fallback-note stage3d-note" role="status">{text.fallback}</p> : null}
      {mode === 'device' ? <>
        <div className="semiconductor-input stage3d-choices" role="group" aria-label={text.gateControls}>
          <button type="button" className="chip" aria-pressed={!gateHigh} onClick={() => setGateHigh(false)}>{text.gateLow}</button>
          <button type="button" className="chip" aria-pressed={gateHigh} onClick={() => setGateHigh(true)}>{text.gateHigh}</button>
        </div>
        <p className="semiconductor-explain stage3d-detail" role="status">{gateHigh ? text.on : text.off}</p>
        <p className="semiconductor-legend stage3d-note">{geometry === 'planar' ? text.deviceLegend : text.geometryNote}</p>
      </> : mode === 'cmos' ? <>
        <p className="semiconductor-legend stage3d-note">{text.steady}</p>
        <div><h5 className="semiconductor-truth-title">{text.truth}</h5><table className="semiconductor-table"><thead><tr><th>{text.input}</th><th>{text.pmos}</th><th>{text.nmos}</th><th>{text.output}</th></tr></thead><tbody>{[0, 1].map((bit) => { const row = cmosInverter(bit); return <tr key={bit}><td>{bit}</td><td>{row.pOn ? text.conducting : text.blocked}</td><td>{row.nOn ? text.conducting : text.blocked}</td><td>{row.output}</td></tr> })}</tbody></table></div>
      </> : mode === 'stack' ? <>
        <label className="semiconductor-slider" htmlFor={`${uid}-separation`}>{text.spread}: <strong>{fmt.number(separation, 0)}%</strong>
          <input id={`${uid}-separation`} type="range" min="0" max="100" value={separation} onChange={(event) => setSeparation(Number(event.target.value))} />
        </label>
        <p className="semiconductor-legend stage3d-note">{text.stackLegend}</p><p className="semiconductor-legend stage3d-note">{text.stackNote}</p>
      </> : <>
        <div className="semiconductor-input stage3d-view" role="group" aria-label={text.memoryControls}>
          <button type="button" className="btn" onClick={() => { setMemoryState('low'); setMemoryAction('set') }}>{text.setMemory}</button>
          <button type="button" className="btn" onClick={() => setMemoryAction('read')}>{text.readMemory}</button>
          <button type="button" className="btn" onClick={() => { setMemoryState('high'); setMemoryAction('reset') }}>{text.resetMemory}</button>
        </div>
        <p className="semiconductor-explain stage3d-detail" role="status"><strong>{memoryState === 'high' ? text.memoryHigh : text.memoryLow}.</strong> {text[{ initial:'memoryInitial', set:'memorySet', read:'memoryRead', reset:'memoryReset' }[memoryAction]]}</p>
        <details><summary>{text.circuitSummary}</summary><svg className="semiconductor-drawing semiconductor-series" viewBox="0 0 560 220" role="img" aria-label={text.sceneMemory}>
          <g className="sd-wire" fill="none" strokeWidth="5"><path d="M130 15V47 M130 87V123 M130 163V205" /></g>
          <rect className={memoryState === 'low' ? 'sd-n-on' : 'sd-off'} x="82" y="47" width="96" height="40" rx="8" />
          <rect className="sd-doped" x="82" y="123" width="96" height="40" rx="8" />
          <g className="sd-text" fontSize="16"><text x="205" y="22">{text.topElectrode}</text><text x="205" y="72">{text.circuitMemory}</text><text x="205" y="111">{text.middleElectrode}</text><text x="205" y="148">{text.circuitSelector}</text><text x="205" y="204">{text.bottomElectrode}</text></g>
        </svg></details>
        <p className="semiconductor-legend stage3d-note">{text.memoryNote}</p>
        <p><a href="https://www.nature.com/articles/s41467-025-58039-3" target="_blank" rel="noreferrer">{text.memorySource}</a></p>
      </>}
      {status === 'ready' ? <div className="semiconductor-view-controls stage3d-view" role="group" aria-label={text.viewControls}>
        <button type="button" className="btn btn-ghost" onClick={() => live.current?.rotate(-Math.PI / 5)}><RotateCcw size={20} aria-hidden="true" />{text.rotateLeft}</button>
        <button type="button" className="btn btn-ghost" onClick={() => live.current?.rotate(Math.PI / 5)}><RotateCw size={20} aria-hidden="true" />{text.rotateRight}</button>
        <button type="button" className="btn btn-ghost semiconductor-zoom" onClick={() => live.current?.zoom(zoom / 1.2)} aria-label={text.zoomOut}><Minus size={20} aria-hidden="true" /></button>
        <output aria-label={text.zoomLabel}>{Math.round(zoom * 100)}%</output>
        <button type="button" className="btn btn-ghost semiconductor-zoom" onClick={() => live.current?.zoom(zoom * 1.2)} aria-label={text.zoomIn}><Plus size={20} aria-hidden="true" /></button>
        <button type="button" className="btn btn-ghost" onClick={() => live.current?.view(.55, 1.28)}>{text.topView}</button>
        <button type="button" className="btn btn-ghost" onClick={() => live.current?.view(.55, .5)}>{text.isoView}</button>
        <button type="button" className="btn btn-ghost" onClick={() => live.current?.reset()}><Undo2 size={20} aria-hidden="true" />{text.reset}</button>
      </div> : null}
      <p className="semiconductor-scope stage3d-note">{text.scope}</p>
      {sources}
    </div>
  </section>
}
