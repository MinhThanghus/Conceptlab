import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { useT } from '../../i18n/index.jsx'
import { canRender3D } from '../../lib/three/capability.js'
import { filterImage, KERNELS, ORIGINAL, SIZE, visibleValue } from './visionMath.js'
import '../../styles/stage3d.css'
import './vision.css'

const VisionRelief = lazy(() => import('./VisionRelief.jsx'))

/** Self-contained teaching example; it does not claim to extract pixels from an uploaded source. */
export default function EmbeddedVisionRelief() {
  const { lang, fmt, t } = useT()
  const [selected, setSelected] = useState(27), [view, setView] = useState('input')
  const [show3d, setShow3d] = useState(true), [failed, setFailed] = useState(false)
  const [can3d] = useState(() => canRender3D())
  const filtered = useMemo(() => filterImage(ORIGINAL, KERNELS.mean), [])
  const values = view === 'input' ? ORIGINAL : filtered
  const row = Math.floor(selected / SIZE), col = selected % SIZE
  const fail = useCallback(() => { setFailed(true); setShow3d(false) }, [])
  const c = lang === 'vi' ? {
    title: 'Khám phá bộ lọc ảnh', sample: 'Lưới 8 × 8 được tạo để học; đây không phải ảnh hay số liệu trích từ tài liệu tải lên.',
    input: 'Ảnh đầu vào', output: 'Sau bộ lọc trung bình', choose: 'Chọn dữ liệu', grid: 'Chọn một ô trong lưới',
    row: 'Hàng', col: 'cột', rowSelect: 'Chọn hàng', colSelect: 'Chọn cột', pixel: 'Giá trị', result: 'Giá trị sau lọc', show: 'Hiện mô hình 3D', hide: 'Ẩn mô hình 3D',
    selected: 'Ô đang chọn', neighbors: 'Vùng 3 × 3', axes: 'Mũi tên cam: cột tăng; mũi tên xanh: hàng tăng.',
    note: 'Chiều cao cột là độ sáng từ 0 đến 1. Bộ lọc lấy trung bình chín ô lân cận; ở biên, giá trị ngoài ảnh được lấy bằng ô biên gần nhất.',
    fallback: 'Mô hình 3D không khả dụng; vẫn có thể học với lưới và kết quả bên dưới.',
  } : {
    title: 'Explore an image filter', sample: 'This 8 × 8 grid is a teaching example; it is not an image or data extracted from the uploaded source.',
    input: 'Input image', output: 'After the mean filter', choose: 'Choose the data', grid: 'Choose a grid cell',
    row: 'Row', col: 'column', rowSelect: 'Select row', colSelect: 'Select column', pixel: 'Value', result: 'Filtered value', show: 'Show the 3D model', hide: 'Hide the 3D model',
    selected: 'Selected cell', neighbors: '3 × 3 neighborhood', axes: 'Orange arrow: increasing column; teal arrow: increasing row.',
    note: 'Column height represents brightness from 0 to 1. The mean filter averages nine neighbors; outside the image, the closest edge value is repeated.',
    fallback: 'The 3D model is unavailable; the grid and calculation remain usable.',
  }
  return <section className="vision-embedded" aria-label={c.title}>
    <h4>{c.title}</h4><p>{c.sample}</p>
    <div className="vision-3d-choices" role="group" aria-label={c.choose}>
      {['input', 'output'].map((name) => <button type="button" className="btn" key={name} aria-pressed={view === name} onClick={() => setView(name)}>{c[name]}</button>)}
    </div>
    <div className="vision-controls"><label>{c.rowSelect}<select value={row} onChange={(event) => setSelected(Number(event.target.value) * SIZE + col)}>{Array.from({ length: SIZE }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}</select></label><label>{c.colSelect}<select value={col} onChange={(event) => setSelected(row * SIZE + Number(event.target.value))}>{Array.from({ length: SIZE }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}</select></label></div>
    <p className="vision-embedded-readout"><strong>{c[view]}</strong>: {c.row} {row + 1}, {c.col} {col + 1}. {c.pixel}: {fmt.number(values[selected], 2)}. {c.result}: {fmt.number(filtered[selected], 2)}.</p>
    <div className="vision-embedded-grid" role="group" aria-label={c.grid}>
      {values.map((value, index) => {
        const shade = Math.round(visibleValue(value) * 255)
        return <button type="button" key={index} className={index === selected ? 'is-selected' : ''} aria-pressed={index === selected} aria-label={`${c.row} ${Math.floor(index / SIZE) + 1}, ${c.col} ${index % SIZE + 1}: ${fmt.number(value, 2)}`} style={{ background: `rgb(${shade}, ${shade}, ${shade})` }} onClick={() => setSelected(index)} />
      })}
    </div>
    {can3d && !failed ? <button type="button" className="btn" onClick={() => setShow3d((v) => !v)} aria-pressed={show3d}>{show3d ? c.hide : c.show}</button> : <p>{c.fallback}</p>}
    {can3d && !failed && show3d && <><Suspense fallback={<p role="status">{t('common.states.loading')}</p>}><VisionRelief values={values} selected={selected} neighborhood={view === 'input'} lang={lang} label={`${c[view]}. ${c.row} ${row + 1}, ${c.col} ${col + 1}.`} onFailure={fail} /></Suspense>
      <p className="vision-relief-key"><span><i className="vision-key-selected" />{c.selected}</span>{view === 'input' && <span><i className="vision-key-kernel" />{c.neighbors}</span>}</p><p className="small">{c.axes}</p></>}
    <p className="small">{c.note}</p>
  </section>
}
