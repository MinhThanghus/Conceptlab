import { lazy, Suspense, useCallback, useId, useMemo, useState } from 'react'
import { useT } from '../../i18n/index.jsx'
import { canRender3D } from '../../lib/three/capability.js'
import { SIZE } from './visionMath.js'
import { DIFFUSION_SAMPLE, diffusionDisplay, diffusionMarginal, diffusionNoise } from './diffusionMath.js'
import './vision.css'
import './diffusionExplorer.css'

const VisionRelief = lazy(() => import('./VisionRelief.jsx'))
const COPY = {
  vi: {
    title: 'Lấy mẫu nhiễu thuận trong DDPM',
    lead: 'Thay ᾱ để xem một ảnh mẫu pha với cùng một mẫu nhiễu Gaussian ở các mức khác nhau.',
    alpha: 'Tín hiệu tích lũy ᾱ', alphaNote: 'ᾱ = 1 cho ảnh gốc; ᾱ = 0 cho nhiễu. Đây là hai đầu mút lý tưởng, không phải lịch nhiễu được huấn luyện.',
    noiseAgain: 'Lấy mẫu nhiễu mới', noiseSeed: 'Hạt giống nhiễu', row: 'Hàng', column: 'Cột',
    original: 'Ảnh mẫu x₀', noise: 'Nhiễu ε', result: 'Mẫu xₜ',
    synthetic: 'Ảnh 8 × 8 do ConceptLab tạo để học; không lấy từ bài báo hoặc ảnh tải lên.',
    formula: 'xₜ = √ᾱ · x₀ + √(1 − ᾱ) · ε,   ε ~ N(0, I)',
    sample: 'Ô đang chọn', sourceValue: 'x₀', noiseValue: 'ε', rawValue: 'xₜ chưa giới hạn', displayValue: 'Độ sáng hiển thị',
    clip: 'Ảnh và cột 3D ánh xạ giá trị từ [−1, 1] sang [0, 1], sau đó giới hạn về [0, 1]. Nhiễu Gaussian và xₜ có thể vượt [−1, 1]; bảng giữ nguyên giá trị chưa giới hạn.',
    clipped: 'Số ô xₜ nằm ngoài [−1, 1] trước khi hiển thị',
    table: 'Xem giá trị xₜ chưa giới hạn', rawTable: 'Bảng giá trị xₜ chưa giới hạn',
    show3d: 'Hiện địa hình giá trị 3D', hide3d: 'Ẩn địa hình giá trị 3D', no3d: 'Không có WebGL; vẫn có thể xem ảnh, điều khiển và các giá trị 2D.',
    relief: 'Địa hình 3D của ảnh xₜ sau ánh xạ và giới hạn độ sáng',
    reliefNote: 'Chiều cao cột là độ sáng hiển thị sau ánh xạ và giới hạn; chấm vàng chỉ ô đang chọn. Các giá trị có dấu chưa giới hạn ở bảng phía trên.',
    scope: 'Mỗi vị trí ᾱ là một mẫu phân phối biên q(xₜ | x₀), dùng cùng ε để so sánh; chuỗi khi kéo thanh trượt không phải quỹ đạo Markov được lấy mẫu. Kéo ngược cũng không phải khử nhiễu đã học: không có mô hình được huấn luyện hay quá trình sinh ảnh ở đây.',
    reference: 'Nguồn công thức',
  },
  en: {
    title: 'DDPM forward noise sampling',
    lead: 'Change ᾱ to mix a sample image with the same Gaussian noise draw at different levels.',
    alpha: 'Cumulative signal ᾱ', alphaNote: 'ᾱ = 1 gives the original image; ᾱ = 0 gives noise. These are ideal endpoints, not a trained noise schedule.',
    noiseAgain: 'Draw new noise', noiseSeed: 'Noise seed', row: 'Row', column: 'Column',
    original: 'Sample image x₀', noise: 'Noise ε', result: 'Sample xₜ',
    synthetic: 'ConceptLab created this 8 × 8 learning sample; it is not from the paper or an upload.',
    formula: 'xₜ = √ᾱ · x₀ + √(1 − ᾱ) · ε,   ε ~ N(0, I)',
    sample: 'Selected pixel', sourceValue: 'x₀', noiseValue: 'ε', rawValue: 'Unclipped xₜ', displayValue: 'Displayed brightness',
    clip: 'Images and 3D columns map values from [−1, 1] into [0, 1], then clip to [0, 1]. Gaussian noise and xₜ can exceed [−1, 1]; the table keeps the unclipped values.',
    clipped: 'xₜ pixels outside [−1, 1] before display',
    table: 'View unclipped xₜ values', rawTable: 'Table of unclipped xₜ values',
    show3d: 'Show 3D value relief', hide3d: 'Hide 3D value relief', no3d: 'WebGL is unavailable; the images, controls and raw 2D values still work.',
    relief: '3D relief of xₜ after mapping and clipping brightness',
    reliefNote: 'Column height is mapped and clipped display brightness; the gold marker identifies the selected pixel. Signed unclipped values are in the table above.',
    scope: 'Each ᾱ position is a sample from the marginal q(xₜ | x₀), using the same ε for comparison; dragging is not a sampled Markov trajectory. Dragging backwards is not learned denoising: no trained model or image generation runs here.',
    reference: 'Formula source',
  },
}

function PixelPanel({ title, values, selected }) {
  return <figure className="diffusion-panel">
    <figcaption>{title}</figcaption>
    <div className="diffusion-grid" aria-hidden="true">
      {values.map((value, index) => {
        const grey = Math.round(diffusionDisplay(value) * 255)
        return <span key={index} className={index === selected ? 'is-selected' : ''} style={{ backgroundColor: `rgb(${grey},${grey},${grey})` }} />
      })}
    </div>
  </figure>
}

export default function DiffusionExplorer() {
  const { lang, fmt } = useT()
  const c = COPY[lang] || COPY.vi
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [alpha, setAlpha] = useState(.75)
  const [seed, setSeed] = useState(61)
  const [row, setRow] = useState(3)
  const [col, setCol] = useState(3)
  const [can3d] = useState(() => canRender3D())
  const [show3d, setShow3d] = useState(() => canRender3D())
  const [failed3d, setFailed3d] = useState(false)
  const onFailure = useCallback(() => { setFailed3d(true); setShow3d(false) }, [])
  const noise = useMemo(() => diffusionNoise(seed), [seed])
  const values = useMemo(() => diffusionMarginal(DIFFUSION_SAMPLE, noise, alpha), [noise, alpha])
  const display = useMemo(() => values.map(diffusionDisplay), [values])
  const selected = row * SIZE + col
  const number = (value) => fmt.number(value, 2)
  const clippedCount = values.filter((value) => value < -1 || value > 1).length

  return <section className="diffusion-explorer" aria-label={c.title}>
    <div className="diffusion-head"><p className="diffusion-kicker">DDPM · q(xₜ | x₀)</p><h3>{c.title}</h3><p>{c.lead}</p></div>
    <div className="diffusion-content">
      <p className="diffusion-formula">{c.formula}</p>
      <label className="diffusion-slider" htmlFor={`${uid}-alpha`}><span>{c.alpha}: <strong>{number(alpha)}</strong></span>
        <input id={`${uid}-alpha`} type="range" min="0" max="1" step=".01" value={alpha} onChange={(event) => setAlpha(Number(event.target.value))} />
      </label>
      <p className="diffusion-help">{c.alphaNote}</p>
      <div className="diffusion-noise-controls"><button type="button" onClick={() => setSeed((value) => value + 1)}>{c.noiseAgain}</button><span>{c.noiseSeed}: {seed}</span></div>
      <div className="diffusion-panels">
        <PixelPanel title={c.original} values={DIFFUSION_SAMPLE} selected={selected} />
        <PixelPanel title={c.noise} values={noise} selected={selected} />
        <PixelPanel title={c.result} values={values} selected={selected} />
      </div>
      <p className="diffusion-help">{c.synthetic}</p>
      <div className="diffusion-cell-controls">
        <label htmlFor={`${uid}-row`}>{c.row}<select id={`${uid}-row`} value={row} onChange={(event) => setRow(Number(event.target.value))}>{Array.from({ length: SIZE }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}</select></label>
        <label htmlFor={`${uid}-col`}>{c.column}<select id={`${uid}-col`} value={col} onChange={(event) => setCol(Number(event.target.value))}>{Array.from({ length: SIZE }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}</select></label>
      </div>
      <div className="diffusion-values" role="status" aria-live="polite" aria-label={c.sample}>
        <div><span>{c.sourceValue}</span><strong>{number(DIFFUSION_SAMPLE[selected])}</strong></div>
        <div><span>{c.noiseValue}</span><strong>{number(noise[selected])}</strong></div>
        <div><span>{c.rawValue}</span><strong>{number(values[selected])}</strong></div>
        <div><span>{c.displayValue}</span><strong>{number(display[selected])}</strong></div>
      </div>
      <p className="diffusion-help">{c.clip}</p><p className="diffusion-help">{c.clipped}: <strong>{clippedCount} / {SIZE * SIZE}</strong></p>
      <details className="diffusion-details"><summary>{c.table}</summary><div className="diffusion-table-wrap"><table aria-label={c.rawTable}><tbody>{Array.from({ length: SIZE }, (_, r) => <tr key={r}>{values.slice(r * SIZE, r * SIZE + SIZE).map((value, i) => <td key={i}>{number(value)}</td>)}</tr>)}</tbody></table></div></details>
      {can3d && !failed3d ? <button className="diffusion-3d-toggle" type="button" aria-pressed={show3d} onClick={() => setShow3d((value) => !value)}>{show3d ? c.hide3d : c.show3d}</button> : <p className="diffusion-help">{c.no3d}</p>}
      {show3d && can3d && !failed3d ? <><Suspense fallback={<p role="status">{lang === 'vi' ? 'Đang tải…' : 'Loading…'}</p>}><VisionRelief values={display} selected={selected} safeFraming lang={lang} label={c.relief} onFailure={onFailure} /></Suspense><p className="diffusion-help">{c.reliefNote}</p></> : null}
      <p className="diffusion-scope">{c.scope}</p>
      <p className="diffusion-source">{c.reference}: <a href="https://arxiv.org/abs/2006.11239" target="_blank" rel="noreferrer">Ho, Jain &amp; Abbeel (2020)</a>.</p>
    </div>
  </section>
}
