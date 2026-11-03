import { useEffect, useId, useRef, useState } from 'react'
import { RotateCcw, RotateCw, Undo2 } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { can3D } from '../../components/lab3d/support.js'
import { SceneAside, SceneBar, SceneFocus, SceneNotes, StageTools, useSceneLayout } from '../../components/lab3d/sceneLayout.jsx'
import { initialTransport, advanceTransport, siteOccupancy } from './transportMath.js'
import '../../styles/stage3d.css'
import './studyExplorer.css'

// the largest state each model reaches: the camera frames it once, so no control zooms the view
const ENVELOPE = {
  agriculture_field: (state) => ({ ...state, crop: 'maize', layout: 'broadcast', waterStage: 'flooded', microbes: true }),
  reaction_diffusion: (state) => ({ ...state, cells: state.cells.map(() => ({ a: 0, b: 1, c: 0 })) }),
  porous_adsorption: (state) => ({ ...state, occupancy: { carbon: 24, moisture: 0, empty: 0 }, separation: true }),
}

const COPY = {
  en: {
    agriculture_field: 'A field, the root zone and water', reaction_diffusion: 'Separate transport from reaction', porous_adsorption: 'Inside a porous carbon surface',
    loading: 'Preparing the 3D view…', fallback: '2D view: all learning controls remain available.',
    predict: 'Predict', observe: 'Observe and compare', reset: 'Reset initial concentrations', left: 'Rotate left', right: 'Rotate right', view: 'Reset view',
    water: 'Water stage', flooded: 'Flooded', draining: 'Draining', drained: 'Drained', layout: 'Planting pattern', rows: 'Rows', broadcast: 'Scattered',
    microbes: 'Show root-zone microorganism symbols', crop: 'Crop structure', rice: 'Rice', maize: 'Maize',
    fieldPredict: 'What changes when water is drained, and what cannot be inferred just by looking at this field?',
    fieldObserve: 'Compare water above the soil, plant spacing and the root zone. Changing one view does not measure yield, methane emissions or microbial abundance. Check which of those quantities the paper actually measured.',
    fieldNote: 'Conceptual cutaway. Water stages, plants and microorganisms are manually arranged illustrations, not the experiment’s samples, a time series, irrigation advice or a yield model.',
    soil: 'Soil and roots', surfaceWater: 'Surface water', microbeLabel: 'Microorganism symbols',
    diffusion: 'Diffusion coefficient D (dimensionless)', reaction: 'Enable A + B → 2B', removal: 'Enable B → C removal', advance: 'Advance 20 numerical steps', time: 'Model time',
    transportPredict: 'With both reaction switches off, will the peak get higher or spread out? With autocatalysis on, where does new B come from?',
    transportObserve: 'The 3D height and the blue curve both represent concentration B. Diffusion redistributes material; the reactions convert A into B and B into C. Compare the same initial state with one setting changed.',
    transportNote: 'A dimensionless, closed 1D teaching model with no-flux boundaries. It is not the paper’s thiol network or a reproduction of sustained chemical waves. The paper also requires a specific inhibitory network and reactant supply.',
    total: 'Total A + B + C', position: 'Position along the channel', concentration: 'Dimensionless concentration',
    co2: 'Sites marked with CO₂', moisture: 'Sites marked with H₂O', empty: 'Unmarked sites', detached: 'Lift molecules away from the surface',
    porePredict: 'Is an adsorbed molecule in the empty pore volume, or associated with a surface? What would you need to predict how much gas a real sample holds?',
    poreObserve: 'Place CO₂ and H₂O at illustrative sites, then lift them to distinguish the surface from the pore volume. The counters describe your arrangement; they are not calculated adsorption capacities.',
    poreNote: 'Manually allocated sites in a schematic pore. No adsorption isotherm, pressure response or CO₂/H₂O competition law is solved. Real uptake depends on pore size, temperature, pressure and surface chemistry; consult the paper’s experiments.',
    diagram: 'Linked 2D diagram', graph: 'Concentrations along the demonstration channel',
  },
  vi: {
    agriculture_field: 'Ruộng, vùng rễ và nước', reaction_diffusion: 'Phân biệt vận chuyển và phản ứng', porous_adsorption: 'Bên trong bề mặt carbon xốp',
    loading: 'Đang chuẩn bị góc nhìn 3D…', fallback: 'Góc nhìn 2D: các thao tác học tập vẫn hoạt động.',
    predict: 'Dự đoán', observe: 'Quan sát và đối chiếu', reset: 'Đặt lại nồng độ ban đầu', left: 'Xoay trái', right: 'Xoay phải', view: 'Đặt lại góc nhìn',
    water: 'Trạng thái nước', flooded: 'Ngập nước', draining: 'Đang rút nước', drained: 'Đã rút nước', layout: 'Bố trí cây', rows: 'Theo hàng', broadcast: 'Rải phân tán',
    microbes: 'Hiện ký hiệu vi sinh vật vùng rễ', crop: 'Cấu trúc cây', rice: 'Lúa', maize: 'Ngô',
    fieldPredict: 'Khi rút nước, điều gì thay đổi và điều gì không thể suy ra chỉ bằng cách nhìn ruộng?',
    fieldObserve: 'So sánh nước trên mặt đất, khoảng cách cây và vùng rễ. Thay đổi hình vẽ không đo được năng suất, phát thải methane hay số lượng vi sinh vật. Đối chiếu xem bài báo thực sự đo những đại lượng nào.',
    fieldNote: 'Mặt cắt khái niệm. Nước, cây và vi sinh vật là hình minh họa bố trí thủ công, không phải mẫu thí nghiệm, chuỗi đo theo thời gian, chỉ dẫn tưới hay mô hình năng suất.',
    soil: 'Đất và rễ', surfaceWater: 'Nước trên mặt đất', microbeLabel: 'Ký hiệu vi sinh vật',
    diffusion: 'Hệ số khuếch tán D (không thứ nguyên)', reaction: 'Bật A + B → 2B', removal: 'Bật phản ứng B → C', advance: 'Tiến thêm 20 bước tính', time: 'Thời gian mô hình',
    transportPredict: 'Khi tắt cả hai phản ứng, đỉnh nồng độ sẽ tăng hay lan rộng? Khi bật tự xúc tác, B mới đến từ đâu?',
    transportObserve: 'Chiều cao 3D và đường màu xanh đều biểu diễn nồng độ B. Khuếch tán phân bố lại vật chất; phản ứng chuyển A thành B và B thành C. So sánh cùng trạng thái đầu khi thay một thiết lập.',
    transportNote: 'Mô hình học tập một chiều, không thứ nguyên, hệ kín với biên không thông lượng. Đây không phải mạng thiol hay phép tái hiện sóng hóa học duy trì trong bài báo. Nghiên cứu còn cần mạng ức chế cụ thể và nguồn cấp chất phản ứng.',
    total: 'Tổng A + B + C', position: 'Vị trí dọc kênh', concentration: 'Nồng độ không thứ nguyên',
    co2: 'Vị trí được đánh dấu CO₂', moisture: 'Vị trí được đánh dấu H₂O', empty: 'Vị trí chưa đánh dấu', detached: 'Nâng phân tử khỏi bề mặt',
    porePredict: 'Phân tử bị hấp phụ nằm trong khoảng trống hay gắn với bề mặt? Cần thêm gì để dự đoán lượng khí một mẫu thật giữ lại?',
    poreObserve: 'Đặt CO₂ và H₂O tại các vị trí minh họa, rồi nâng lên để phân biệt bề mặt và thể tích lỗ xốp. Bộ đếm mô tả cách bạn bố trí, không tính dung lượng hấp phụ.',
    poreNote: 'Các vị trí được bố trí thủ công trong lỗ xốp sơ đồ. Không giải đường đẳng nhiệt, đáp ứng áp suất hay quy luật cạnh tranh CO₂/H₂O. Lượng hấp phụ thật phụ thuộc kích thước lỗ, nhiệt độ, áp suất và hóa học bề mặt; hãy xem thí nghiệm trong bài báo.',
    diagram: 'Sơ đồ 2D liên kết', graph: 'Nồng độ dọc kênh minh họa',
  },
}

function LinkedDiagram({ kind, state, w }) {
  if (kind === 'reaction_diffusion') return <svg className="study-linked" viewBox="0 0 600 230" role="img" aria-label={w.graph}>
    <path className="sl-axis" d="M40 20 V190 H575" fill="none" />
    {['a', 'b', 'c'].map((key) => <polyline key={key} className={`sl-${key}`} fill="none" strokeWidth="3" points={state.cells.map((x, i) => `${40 + i * 13.2},${190 - x[key] * 160}`).join(' ')} />)}
    <text x="45" y="16">{w.concentration}</text><text x="250" y="218">{w.position}</text>
    <text className="sl-a-text" x="490" y="28">A</text><text className="sl-b-text" x="520" y="28">B</text><text className="sl-c-text" x="550" y="28">C</text>
  </svg>
  if (kind === 'porous_adsorption') return <svg className="study-linked" viewBox="0 0 600 170" role="img" aria-label={w.diagram}>
    <path className="sl-pore" d="M30 25 V125 H570 V25" fill="none" strokeWidth="15" />
    {Array.from({ length: 24 }, (_, i) => <g key={i} transform={`translate(${48 + i * 22},${state.separation ? 50 : 103})`}>
      <circle r="7" className={i < state.occupancy.carbon ? 'sl-co2' : i < state.occupancy.carbon + state.occupancy.moisture ? 'sl-h2o' : 'sl-empty'} />
    </g>)}
    <text x="50" y="156"><tspan>CO₂: {state.occupancy.carbon}</tspan><tspan dx="18">H₂O: {state.occupancy.moisture}</tspan><tspan dx="18">{w.empty}: {state.occupancy.empty}</tspan></text>
  </svg>
  return <svg className="study-linked" viewBox="0 0 600 200" role="img" aria-label={w.diagram}>
    <path className="sl-soil" d="M20 110 H580 V185 H20Z" />
    {state.waterStage !== 'drained' ? <rect className="sl-water" x="20" y={state.waterStage === 'flooded' ? 90 : 105} width="560" height={state.waterStage === 'flooded' ? 20 : 5} /> : null}
    {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <g key={i} transform={`translate(${60 + i * 66 + (state.layout === 'broadcast' ? Math.sin(i * 7) * 19 : 0)} 110)`}>
      <path className="sl-plant" d={state.crop === 'maize' ? 'M0 -8 V-78 M0 -34 Q-25 -65 -24 -55 M0 -26 Q28 -55 27 -40 M0 -56 L-7 -67 M0 -56 L7 -67' : 'M0 -8 V-65 M0 -32 Q-23 -55 -21 -65 M0 -23 Q22 -50 26 -52'} fill="none" strokeWidth={state.crop === 'maize' ? 5 : 3} />
      <path className="sl-root" d="M0 0 V35 M0 10 L-14 35 M0 16 L12 40" fill="none" strokeWidth="2" />
      {state.microbes ? <g className="sl-microbe"><ellipse cx="-14" cy="25" rx="4" ry="2" /><ellipse cx="10" cy="32" rx="4" ry="2" /></g> : null}
    </g>)}
    <text x="24" y="22"><tspan>{w[state.crop]}</tspan><tspan dx="16">{w.soil}</tspan>{state.microbes ? <tspan dx="16">{w.microbeLabel}</tspan> : null}</text>
  </svg>
}

export default function StudyExplorer({ kind }) {
  const { lang, fmt, t } = useT(), w = COPY[lang] || COPY.en
  const { deck } = useSceneLayout()
  const uid = useId()
  const [waterStage, setWater] = useState('flooded'), [layout, setLayout] = useState('rows'), [microbes, setMicrobes] = useState(false), [crop, setCrop] = useState('rice')
  const [cells, setCells] = useState(initialTransport), [diffusion, setDiffusion] = useState(.2), [reaction, setReaction] = useState(true), [removal, setRemoval] = useState(false), [time, setTime] = useState(0)
  const [carbon, setCarbon] = useState(6), [moisture, setMoisture] = useState(4), [separation, setSeparation] = useState(false)
  const occupancy = siteOccupancy(carbon, moisture)
  const state = useRef(null); state.current = { waterStage, layout, microbes, crop, cells, occupancy, separation }
  const host = useRef(null), live = useRef(null)
  const [status, setStatus] = useState(() => can3D() ? 'loading' : 'fallback')
  useEffect(() => {
    if (!can3D()) { setStatus('fallback'); return }
    let cancelled = false, stage, model, rotation = 0
    setStatus('loading')
    const lost = (e) => {
      e.preventDefault(); live.current = null
      stage?.canvas.removeEventListener('webglcontextlost', lost)
      model?.dispose(); model = null; stage?.dispose(); stage = null
      setStatus('fallback')
    }
    ;(async () => {
      try {
        const [{ createStage }, models, kit] = await Promise.all([import('../../lib/three/stage.js'), import('./studyModels.js'), import('../../lib/three/kit.js')])
        if (cancelled || !host.current) return
        stage = createStage(host.current, { view: { azimuth: .6, elevation: .46 }, turnRange: 1.5 })
        model = { agriculture_field: models.agricultureModel, reaction_diffusion: models.reactionModel, porous_adsorption: models.adsorptionModel }[kind](kit.scenePalette(host.current))
        stage.world.add(model.group)
        // frame the model at its largest, then show the learner's state on a floor that follows it
        const fit = () => {
          model.update(ENVELOPE[kind](state.current))
          stage.frame?.(model.group, { fill: .84 })
          model.update(state.current)
          stage.frame?.(model.group, { fit: false })
        }
        fit()
        stage.canvas.addEventListener('webglcontextlost', lost)
        live.current = { update() { model.update(state.current); stage.frame?.(model.group, { fit: false }); stage.invalidate() }, rotate(delta) { rotation += delta; model.group.rotation.y = rotation; fit(); stage.invalidate() }, reset() { rotation = 0; model.group.rotation.y = 0; stage.resetView(); fit(); stage.invalidate() } }
        stage.invalidate(); setStatus('ready')
      } catch { model?.dispose(); model = null; stage?.dispose(); stage = null; if (!cancelled) setStatus('fallback') }
    })()
    return () => { cancelled = true; live.current = null; stage?.canvas.removeEventListener('webglcontextlost', lost); model?.dispose(); stage?.dispose() }
  }, [kind])
  useEffect(() => { live.current?.update() }, [waterStage, layout, microbes, crop, cells, carbon, moisture, separation])
  const field = kind === 'agriculture_field', transport = kind === 'reaction_diffusion'
  const note = field ? w.fieldNote : transport ? w.transportNote : w.poreNote
  const predict = field ? w.fieldPredict : transport ? w.transportPredict : w.porePredict
  const observe = field ? w.fieldObserve : transport ? w.transportObserve : w.poreObserve
  const total = fmt.number(cells.reduce((sum, c) => sum + c.a + c.b + c.c, 0), 2)
  const viewTools = deck && status === 'ready' ? [
      { icon: RotateCcw, label: w.left, onClick: () => live.current?.rotate(-.25) },
      { icon: RotateCw, label: w.right, onClick: () => live.current?.rotate(.25) },
      { icon: Undo2, label: w.view, onClick: () => live.current?.reset() },
  ] : null
  const stage = <div className="study-stage stage3d" hidden={status === 'fallback'}>
    <div ref={host} className="study-host" role="img" aria-label={w[kind]} />
    {status === 'loading' ? <p className="stage3d-status" role="status">{w.loading}</p> : null}
    {viewTools ? <StageTools className="study-view-controls" label={t('scene3d.view')} tools={viewTools} /> : null}
  </div>
  const advance = () => { setCells((current) => advanceTransport(current, { diffusion, reaction, removal })); setTime((n) => n + 2) }
  const restart = () => { setCells(initialTransport()); setTime(0) }

  // on a lesson slide: the stage, one row of compact controls, and beside the model the question to
  // predict with the readings; what to compare, the linked 2D diagram and the limits behind one disclosure
  if (deck) {
    const menu = (label, value, options, onChange) => <label className="stage3d-select">
      <span className="visually-hidden">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>{options.map((item) => <option key={item} value={item}>{w[item]}</option>)}</select>
    </label>
    const toggle = (pressed, onChange, label, name) => <button type="button" className="chip" aria-pressed={pressed} aria-label={name} title={name} onClick={() => onChange(!pressed)}>{label}</button>
    const range = (id, label, value, props, onChange) => <label className="stage3d-range" htmlFor={`${uid}-${id}`}><span>{label}</span><strong>{value}</strong>
      <input id={`${uid}-${id}`} type="range" {...props} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
    return <section className="study-explorer stage3d-scene is-deck" aria-label={w[kind]}>
      {stage}
      {status === 'fallback' ? <div className="study-deck-fallback"><LinkedDiagram kind={kind} state={state.current} w={w} /></div> : null}
      <SceneBar tools={viewTools} toolsLabel={t('scene3d.view')}>
        {field ? <>
          {menu(w.water, waterStage, ['flooded', 'draining', 'drained'], setWater)}
          {menu(w.layout, layout, ['rows', 'broadcast'], setLayout)}
          {menu(w.crop, crop, ['rice', 'maize'], setCrop)}
          {toggle(microbes, setMicrobes, t('scene3d.study.microbesShort'), w.microbes)}
        </> : transport ? <>
          {range('d', t('scene3d.study.diffusionShort'), fmt.number(diffusion, 2), { min: '0', max: '1', step: '.05', value: diffusion }, setDiffusion)}
          <div className="stage3d-choices">
            {toggle(reaction, setReaction, t('scene3d.study.reactionShort'), w.reaction)}
            {toggle(removal, setRemoval, t('scene3d.study.removalShort'), w.removal)}
          </div>
          <button type="button" className="btn" aria-label={w.advance} title={w.advance} onClick={advance}>{t('scene3d.study.advanceShort')}</button>
          <button type="button" className="btn" aria-label={w.reset} title={w.reset} onClick={restart}>{t('scene3d.study.resetShort')}</button>
        </> : <>
          {range('co', 'CO₂', occupancy.carbon, { min: '0', max: '24', step: '1', value: carbon, 'aria-label': w.co2 }, (n) => { setCarbon(n); setMoisture((v) => Math.min(v, 24 - n)) })}
          {range('h', 'H₂O', occupancy.moisture, { min: '0', max: String(24 - occupancy.carbon), step: '1', value: moisture, 'aria-label': w.moisture }, setMoisture)}
          {toggle(separation, setSeparation, t('scene3d.study.detachShort'), w.detached)}
        </>}
      </SceneBar>
      <SceneAside>
        <SceneFocus className="study-predict" title={w.predict} live={false}>{predict}</SceneFocus>
        {transport ? <dl className="stage3d-readout study-readout"><div><dt>{w.time}</dt><dd>{time}</dd></div><div><dt>{w.total}</dt><dd>{total}</dd></div></dl>
          : !field ? <dl className="stage3d-readout study-readout"><div><dt>CO₂</dt><dd>{occupancy.carbon}</dd></div><div><dt>H₂O</dt><dd>{occupancy.moisture}</dd></div><div><dt>{w.empty}</dt><dd>{occupancy.empty}</dd></div></dl> : null}
        {status === 'fallback' ? <p className="stage3d-note">{w.fallback}</p> : null}
        <SceneNotes>
          <p><strong>{w.observe}.</strong> {observe}</p>
          {status !== 'fallback' ? <LinkedDiagram kind={kind} state={state.current} w={w} /> : null}
          <p className="study-scope">{note}</p>
        </SceneNotes>
      </SceneAside>
    </section>
  }

  return <section className="study-explorer stage3d-scene" aria-label={w[kind]}>
    <h3>{w[kind]}</h3>
    <div className="study-predict"><strong>{w.predict}</strong><p>{predict}</p></div>
    {stage}
    {status === 'fallback' ? <p className="stage3d-note" role="status">{w.fallback}</p> : null}
    <div className="study-controls">
      {field ? <>
        <label>{w.water}<select value={waterStage} onChange={(e) => setWater(e.target.value)}>{['flooded', 'draining', 'drained'].map((s) => <option key={s} value={s}>{w[s]}</option>)}</select></label>
        <label>{w.layout}<select value={layout} onChange={(e) => setLayout(e.target.value)}>{['rows', 'broadcast'].map((s) => <option key={s} value={s}>{w[s]}</option>)}</select></label>
        <label>{w.crop}<select value={crop} onChange={(e) => setCrop(e.target.value)}>{['rice', 'maize'].map((s) => <option key={s} value={s}>{w[s]}</option>)}</select></label>
        <label className="study-check"><input type="checkbox" checked={microbes} onChange={(e) => setMicrobes(e.target.checked)} />{w.microbes}</label>
      </> : transport ? <>
        <label htmlFor={`${uid}-d`}>{w.diffusion}: {fmt.number(diffusion, 2)}<input id={`${uid}-d`} type="range" min="0" max="1" step=".05" value={diffusion} onChange={(e) => setDiffusion(Number(e.target.value))} /></label>
        <label className="study-check"><input type="checkbox" checked={reaction} onChange={(e) => setReaction(e.target.checked)} />{w.reaction}</label>
        <label className="study-check"><input type="checkbox" checked={removal} onChange={(e) => setRemoval(e.target.checked)} />{w.removal}</label>
        <button type="button" className="btn" onClick={advance}>{w.advance}</button>
        <button type="button" className="btn" onClick={restart}>{w.reset}</button>
        <output className="study-readout"><span>{w.time}: {time}</span><span>{w.total}: {total}</span></output>
      </> : <>
        <label htmlFor={`${uid}-co`}>{w.co2}: {occupancy.carbon}<input id={`${uid}-co`} type="range" min="0" max="24" step="1" value={carbon} onChange={(e) => { const n = Number(e.target.value); setCarbon(n); setMoisture((v) => Math.min(v, 24 - n)) }} /></label>
        <label htmlFor={`${uid}-h`}>{w.moisture}: {occupancy.moisture}<input id={`${uid}-h`} type="range" min="0" max={24 - occupancy.carbon} step="1" value={moisture} onChange={(e) => setMoisture(Number(e.target.value))} /></label>
        <label className="study-check"><input type="checkbox" checked={separation} onChange={(e) => setSeparation(e.target.checked)} />{w.detached}</label>
      </>}
    </div>
    {status === 'ready' ? <div className="study-view-controls stage3d-view"><button type="button" className="btn btn-ghost" onClick={() => live.current?.rotate(-.25)}><RotateCcw size={20} aria-hidden="true" />{w.left}</button><button type="button" className="btn btn-ghost" onClick={() => live.current?.rotate(.25)}><RotateCw size={20} aria-hidden="true" />{w.right}</button><button type="button" className="btn btn-ghost" onClick={() => live.current?.reset()}><Undo2 size={20} aria-hidden="true" />{w.view}</button></div> : null}
    <h4>{w.diagram}</h4><LinkedDiagram kind={kind} state={state.current} w={w} />
    <div className="study-observe"><strong>{w.observe}</strong><p>{observe}</p></div>
    <p className="study-scope stage3d-note">{note}</p>
  </section>
}
