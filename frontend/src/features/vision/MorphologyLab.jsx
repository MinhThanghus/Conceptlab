import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { useT } from '../../i18n/index.jsx'
import { canRender3D } from '../../lib/three/capability.js'
import { SIZE, visibleValue } from './visionMath.js'
import { binaryNeighbours, binaryThreshold, brightnessHistogram, GRAYSCALE, morphologyImage } from './morphologyMath.js'

const VisionRelief = lazy(() => import('./VisionRelief.jsx'))

function Grid({ values, selected }) {
  return <div className="vision-grid" aria-hidden="true">{values.map((value, i) => {
    const level = Math.round(visibleValue(value) * 255)
    return <span key={i} className={i === selected ? 'is-selected' : ''} style={{ backgroundColor: `rgb(${level}, ${level}, ${level})` }} />
  })}</div>
}

function Histogram({ bins, threshold }) {
  const { t } = useT()
  const max = Math.max(...bins, 1)
  return <figure className="vision-histogram">
    <h3>{t('vision.morph.histTitle')}</h3>
    <svg viewBox="0 0 360 150" role="img" aria-label={t('vision.morph.histAlt')}>
      <line x1="30" y1="115" x2="340" y2="115" className="vision-hist-axis" />
      {bins.map((count, i) => <rect key={i} x={30 + i * 31} y={115 - count * 90 / max} width="27" height={count * 90 / max} className="vision-hist-bar" />)}
      <line x1={30 + threshold * 310} y1="12" x2={30 + threshold * 310} y2="115" className="vision-hist-threshold" />
      <text x="30" y="138">0</text><text x="340" y="138" textAnchor="end">1</text>
    </svg>
    <figcaption>{t('vision.morph.histExplain')}</figcaption>
    <details><summary>{t('vision.morph.histTable')}</summary>
      <table className="vision-data"><thead><tr><th scope="col">{t('vision.morph.bin')}</th><th scope="col">{t('vision.morph.count')}</th></tr></thead>
        <tbody>{bins.map((count, i) => <tr key={i}><th scope="row">[{(i / 10).toFixed(1)}, {((i + 1) / 10).toFixed(1)}{i === 9 ? ']' : ')'}</th><td>{count}</td></tr>)}</tbody>
      </table>
    </details>
  </figure>
}

/** One threshold and one explicit binary morphology step, with inspectable arithmetic. */
export default function MorphologyLab() {
  const { t, fmt, lang } = useT()
  const [threshold, setThreshold] = useState(0.35)
  const [mode, setMode] = useState('dilate')
  const [row, setRow] = useState(3), [column, setColumn] = useState(3)
  const [show3d, setShow3d] = useState(false), [failed3d, setFailed3d] = useState(false)
  const [can3d] = useState(() => canRender3D())
  const mask = useMemo(() => binaryThreshold(GRAYSCALE, threshold), [threshold])
  const output = useMemo(() => morphologyImage(mask, mode), [mask, mode])
  const bins = useMemo(() => brightnessHistogram(GRAYSCALE), [])
  const selected = row * SIZE + column
  const neighbourhood = binaryNeighbours(mask, row, column)
  const white = mask.reduce((sum, value) => sum + value, 0)
  const fail3d = useCallback(() => { setShow3d(false); setFailed3d(true) }, [])

  return <section className="vision-section" aria-labelledby="vision-morph-heading">
    <h2 id="vision-morph-heading">{t('vision.morph.title')}</h2>
    <p>{t('vision.morph.lead')}</p>
    <div className="vision-controls">
      <div className="vision-range">
        <label htmlFor="vision-morph-threshold">{t('vision.morph.threshold')}</label>
        <output htmlFor="vision-morph-threshold">{fmt.number(threshold, 2)}</output>
        <input id="vision-morph-threshold" type="range" min="0" max="1" step="0.05" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
      </div>
      <label>{t('vision.morph.operation')}<select value={mode} onChange={(event) => setMode(event.target.value)}>
        <option value="dilate">{t('vision.morph.dilate')}</option><option value="erode">{t('vision.morph.erode')}</option>
      </select></label>
      <label>{t('vision.morph.row')}<select value={row} onChange={(event) => setRow(Number(event.target.value))}>{Array.from({ length: SIZE }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}</select></label>
      <label>{t('vision.morph.column')}<select value={column} onChange={(event) => setColumn(Number(event.target.value))}>{Array.from({ length: SIZE }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}</select></label>
    </div>
    <p>{t('vision.morph.rule')}</p>
    <div className="vision-images">
      <figure><figcaption>{t('vision.morph.gray')}</figcaption><Grid values={GRAYSCALE} selected={selected} /></figure>
      <figure><figcaption>{t('vision.morph.mask')}</figcaption><Grid values={mask} selected={selected} /></figure>
      <figure><figcaption>{t('vision.morph.result')}</figcaption><Grid values={output} selected={selected} /></figure>
    </div>
    <p aria-live="polite">{t('vision.morph.pixel', { row: row + 1, col: column + 1, value: fmt.number(GRAYSCALE[selected], 2), threshold: fmt.number(threshold, 2), binary: mask[selected] })}</p>
    <p>{t('vision.morph.whiteCount', { count: white })}</p>
    <div className="vision-calculation"><div><h3>{t('vision.morph.neighbours')}</h3>
      <table className="vision-matrix" aria-label={t('vision.morph.neighbours')}><tbody>{Array.from({ length: 3 }, (_, r) =>
        <tr key={r}>{neighbourhood.slice(r * 3, r * 3 + 3).map((value, c) => <td key={c}>{value}</td>)}</tr>)}</tbody></table>
    </div></div>
    <p>{t(mode === 'erode' ? 'vision.morph.erodeRule' : 'vision.morph.dilateRule')}</p>
    <p><strong>{t('vision.morph.pixelResult', { row: row + 1, col: column + 1, value: output[selected] })}</strong></p>
    <p className="small">{t('vision.morph.border')}</p>
    <Histogram bins={bins} threshold={threshold} />
    {can3d && !failed3d ? <button className="btn" onClick={() => setShow3d((value) => !value)} aria-pressed={show3d}>{t(show3d ? 'vision.morph.hide3d' : 'vision.morph.show3d')}</button> : <p>{t('vision.no3d')}</p>}
    {show3d ? <><Suspense fallback={<p role="status">{t('common.states.loading')}</p>}><VisionRelief values={output} selected={selected} lang={lang} label={t('vision.morph.reliefAlt')} onFailure={fail3d} /></Suspense><p className="vision-relief-key"><span><i className="vision-key-selected" />{lang === 'vi' ? 'Ô đang chọn' : 'Selected pixel'}</span></p><p>{t('vision.morph.reliefNote')} {lang === 'vi' ? 'Mũi tên cam: cột tăng; mũi tên xanh: hàng tăng.' : 'Orange arrow: increasing column; teal arrow: increasing row.'}</p></> : null}
  </section>
}
