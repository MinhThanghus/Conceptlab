import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { useT } from '../../i18n/index.jsx'
import { canRender3D } from '../../lib/three/capability.js'
import { filterImage, filterPixel, flowPath, gaussianNoise, KERNELS, neighbours, ORIGINAL, SIZE, visibleValue } from './visionMath.js'
import MorphologyLab from './MorphologyLab.jsx'
import './vision.css'

const VisionRelief = lazy(() => import('./VisionRelief.jsx'))
const number = (n) => new Intl.NumberFormat(undefined,{ maximumFractionDigits:2 }).format(n)

function PixelGrid({ values, selected, edge=false }) {
  return <div className="vision-grid" aria-hidden="true">{values.map((value,i) => {
    const level = Math.round(visibleValue(edge ? Math.abs(value)/4 : value)*255)
    return <span key={i} className={i===selected ? 'is-selected' : ''} style={{ backgroundColor: `rgb(${level}, ${level}, ${level})` }} />
  })}</div>
}

function Matrix({ values, format=number, name }) {
  return <table className="vision-matrix" aria-label={name}><tbody>{Array.from({length:3},(_,row) =>
    <tr key={row}>{values.slice(row*3,row*3+3).map((value,col) => <td key={col}>{format(value)}</td>)}</tr>)}</tbody></table>
}

export default function VisionPage() {
  const { t, fmt, lang } = useT()
  const [row,setRow] = useState(3), [col,setCol] = useState(3)
  const [mode,setMode] = useState('mean'), [time,setTime] = useState(0.25), [seed,setSeed] = useState(61)
  const [show3d,setShow3d] = useState(false), [failed3d,setFailed3d] = useState(false)
  const [filter3d,setFilter3d] = useState(false), [fieldView,setFieldView] = useState('input')
  const [can3d] = useState(() => canRender3D())
  const noise = useMemo(() => gaussianNoise(SIZE*SIZE,seed),[seed])
  const filtered = useMemo(() => filterImage(ORIGINAL,KERNELS[mode]),[mode])
  const flow = useMemo(() => flowPath(ORIGINAL,noise,time),[noise,time])
  const selected = row*SIZE+col
  const values = neighbours(ORIGINAL,row,col)
  const showFailure = useCallback(() => { setFailed3d(true); setShow3d(false); setFilter3d(false) },[])
  const format = (value) => fmt.number(value,2)
  const copy = lang === 'vi' ? {
    show: 'Khám phá ảnh và bộ lọc 3D', hide: 'Ẩn mô hình bộ lọc 3D', choices: 'Chọn dữ liệu hiển thị', input: 'Ảnh đầu vào', output: 'Ảnh đầu ra',
    selected: 'Ô đang chọn', kernel: 'Vùng 3×3 của bộ lọc', axes: 'Mũi tên cam: cột tăng; mũi tên xanh: hàng tăng.',
    note: 'Chiều cao thể hiện độ sáng hiển thị trong khoảng 0–1. Với Sobel, chiều cao là trị tuyệt đối chia 4; phép tính có dấu vẫn được nêu ở trên.',
    flowNote: 'Chiều cao là giá trị hiển thị sau khi giới hạn trong khoảng 0–1; giá trị thực được ghi trong bảng.',
  } : {
    show: 'Explore image and filter in 3D', hide: 'Hide the 3D filter model', choices: 'Choose the data to display', input: 'Input image', output: 'Output image',
    selected: 'Selected pixel', kernel: '3×3 filter neighborhood', axes: 'Orange arrow: increasing column; teal arrow: increasing row.',
    note: 'Height shows displayed brightness between 0 and 1. For Sobel, height is the absolute value divided by 4; the signed calculation remains above.',
    flowNote: 'Height shows the value clipped to the display range 0–1; the table contains the actual value.',
  }

  return <div className="container page vision-page">
    <header className="vision-intro"><h1>{t('vision.title')}</h1><p>{t('vision.lead')}</p><p>{t('vision.generated')}</p></header>
    <section className="vision-section" aria-labelledby="vision-filter-heading">
      <h2 id="vision-filter-heading">{t('vision.filterTitle')}</h2><p>{t('vision.filterLead')}</p>
      <div className="vision-controls">
        <label>{t('vision.operation')}<select value={mode} onChange={(e)=>setMode(e.target.value)}>
          <option value="mean">{t('vision.mean')}</option><option value="sobel">{t('vision.sobel')}</option>
        </select></label>
        <label>{t('vision.row')}<select value={row} onChange={(e)=>setRow(Number(e.target.value))}>{Array.from({length:SIZE},(_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label>
        <label>{t('vision.column')}<select value={col} onChange={(e)=>setCol(Number(e.target.value))}>{Array.from({length:SIZE},(_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label>
      </div>
      <div className="vision-images"><figure><figcaption>{t('vision.input')}</figcaption><PixelGrid values={ORIGINAL} selected={selected} /></figure>
        <figure><figcaption>{t('vision.output')}</figcaption><PixelGrid values={filtered} selected={selected} edge={mode==='sobel'} /></figure></div>
      <p>{t('vision.selected',{row:row+1,col:col+1})}</p>
      <div className="vision-calculation"><div><h3>{t('vision.neighbours')}</h3><Matrix values={values} name={t('vision.neighbours')} format={format} /></div><div><h3>{t('vision.kernel')}</h3><Matrix values={KERNELS[mode]} name={t('vision.kernel')} format={(v)=>mode==='mean'?'1/9':format(v)} /></div></div>
      <p>{t(mode==='mean'?'vision.formulaMean':'vision.formulaSobel')}</p><p><strong>{t('vision.answer',{value:format(filterPixel(ORIGINAL,row,col,KERNELS[mode]))})}</strong></p>
      {mode==='sobel' && <p className="small">{t('vision.sobelDisplay')}</p>}
      {can3d && !failed3d ? <button className="btn" onClick={()=>setFilter3d((on)=>!on)} aria-pressed={filter3d}>{filter3d ? copy.hide : copy.show}</button> : <p>{t('vision.no3d')}</p>}
      {filter3d && <div className="vision-relief-panel">
        <div className="vision-3d-choices" role="group" aria-label={copy.choices}>
          {['input','output'].map((name)=><button key={name} className="btn" aria-pressed={fieldView===name} onClick={()=>setFieldView(name)}>{copy[name]}</button>)}
        </div>
        <p className="vision-3d-caption"><strong>{copy[fieldView]}</strong> · {t('vision.selected',{row:row+1,col:col+1})}</p>
        <Suspense fallback={<p role="status">{t('common.states.loading')}</p>}><VisionRelief values={fieldView==='input' ? ORIGINAL : filtered} selected={selected} neighborhood={fieldView==='input'} magnitude={fieldView==='output' && mode==='sobel'} lang={lang} label={`${copy[fieldView]}. ${t('vision.selected',{row:row+1,col:col+1})}`} onFailure={showFailure} /></Suspense>
        <p className="vision-relief-key"><span><i className="vision-key-selected" />{copy.selected}</span>{fieldView==='input' && <span><i className="vision-key-kernel" />{copy.kernel}</span>}</p>
        <p className="small">{copy.axes} {copy.note}</p>
      </div>}
    </section>
    <MorphologyLab />
    <section className="vision-section" aria-labelledby="vision-flow-heading">
      <h2 id="vision-flow-heading">{t('vision.flowTitle')}</h2><p>{t('vision.flowLead')}</p>
      <div className="vision-controls"><label>{t('vision.time')}: <output>{format(time)}</output><input type="range" min="0" max="1" step="0.05" value={time} onChange={(e)=>setTime(Number(e.target.value))} /></label>
        <button className="btn" onClick={()=>setSeed((n)=>n+1)}>{t('vision.drawAgain')}</button></div>
      <p className="vision-equation" lang="en">{t('vision.flowFormula')}</p>
      <div className="vision-images"><figure><figcaption>x₀</figcaption><PixelGrid values={ORIGINAL} selected={selected} /></figure>
        <figure><figcaption>xₜ</figcaption><PixelGrid values={flow} selected={selected} /></figure>
        <figure><figcaption>ε</figcaption><PixelGrid values={noise} selected={selected} /></figure></div>
      <p><strong>{t('vision.flowDetail',{x:format(ORIGINAL[selected]),noise:format(noise[selected]),result:format(flow[selected])})}</strong></p>
      <p>{t('vision.clipped')}</p><p>{t('vision.noModel')}</p>
      <details><summary>{t('vision.dataGrid')}</summary><table className="vision-data"><tbody>{Array.from({length:SIZE},(_,r)=><tr key={r}><th scope="row">{t('vision.tableRow',{row:r+1})}</th>{flow.slice(r*SIZE,r*SIZE+SIZE).map((v,i)=><td key={i}>{format(v)}</td>)}</tr>)}</tbody></table></details>
      {can3d && !failed3d ? <button className="btn" onClick={()=>setShow3d((on)=>!on)} aria-pressed={show3d}>{t(show3d?'vision.hideRelief':'vision.relief')}</button> : <p>{t('vision.no3d')}</p>}
      {show3d && <><Suspense fallback={<p role="status">{t('common.states.loading')}</p>}><VisionRelief values={flow} selected={selected} lang={lang} label={`${t('vision.reliefAlt')} ${t('vision.selected',{row:row+1,col:col+1})}`} onFailure={showFailure} /></Suspense><p className="vision-relief-key"><span><i className="vision-key-selected" />{copy.selected}</span></p><p className="small">{copy.axes} {copy.flowNote}</p></>}
    </section>
    <section className="vision-section"><h2>{t('vision.references')}</h2><ul>
      <li><a href="https://docs.opencv.org/4.x/d2/d2c/tutorial_sobel_derivatives.html">{t('vision.filterRef')}</a></li>
      <li><a href="https://docs.opencv.org/4.x/d7/d4d/tutorial_py_thresholding.html">{t('vision.morph.thresholdRef')}</a></li>
      <li><a href="https://docs.opencv.org/4.x/d9/d61/tutorial_py_morphological_ops.html">{t('vision.morph.morphologyRef')}</a></li>
      <li><a href="https://arxiv.org/abs/2210.02747">{t('vision.flowRef')}</a></li>
      <li><a href="https://arxiv.org/abs/2006.11239">{t('vision.diffusionRef')}</a></li>
    </ul></section>
  </div>
}
