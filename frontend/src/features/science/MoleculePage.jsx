import { lazy, Suspense, useCallback, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n/index.jsx'
import { canRender3D } from '../../lib/three/capability.js'
import { useDocumentTitle } from '../public/hooks.js'
import { MOLECULES } from './molecules.js'
import './science.css'

const MoleculeScene = lazy(() => import('./MoleculeScene.jsx'))

const words = {
  vi: {
    back: 'Các bài học trực quan', title: 'Hình dạng phân tử', lead: 'So sánh cách nguyên tử sắp xếp trong không gian và góc giữa hai liên kết.',
    choose: 'Chọn phân tử', water: 'Nước', carbonDioxide: 'Cacbon đioxit', methane: 'Metan',
    rotate: 'Xoay mô hình', fallback: 'Sơ đồ 2D', angle: 'Góc liên kết xấp xỉ', center: 'Nguyên tử trung tâm', outer: 'Nguyên tử xung quanh',
    description: { water: 'Hai nguyên tử hiđro tạo hình gấp khúc quanh nguyên tử oxi.', carbonDioxide: 'Hai nguyên tử oxi nằm trên một đường thẳng qua nguyên tử cacbon.', methane: 'Bốn nguyên tử hiđro nằm ở các đỉnh của một tứ diện quanh cacbon.' },
    notice: 'Mô hình quả cầu và thanh chỉ minh họa cách sắp xếp; kích thước và chiều dài liên kết không theo tỉ lệ. Sơ đồ 2D là hình chiếu.',
    source: 'Dữ liệu góc liên kết: NIST', no3d: 'Thiết bị không hỗ trợ 3D hoặc đang tiết kiệm dữ liệu. Bạn vẫn có thể xem sơ đồ và thông tin bên dưới.',
    prompt: 'Quan sát: hai liên kết của phân tử nào tạo thành một đường thẳng?', answer: 'CO₂ có góc O–C–O là 180°.', show: 'Xem gợi ý',
    load: 'Đang tải mô hình 3D',
  },
  en: {
    back: 'Visual lessons', title: 'Molecular shapes', lead: 'Compare how atoms are arranged in space and the angle between two bonds.',
    choose: 'Choose a molecule', water: 'Water', carbonDioxide: 'Carbon dioxide', methane: 'Methane',
    rotate: 'Rotate the model', fallback: '2D diagram', angle: 'Approximate bond angle', center: 'Central atom', outer: 'Surrounding atoms',
    description: { water: 'Two hydrogen atoms form a bent shape around oxygen.', carbonDioxide: 'Two oxygen atoms lie on a straight line through carbon.', methane: 'Four hydrogen atoms occupy the corners of a tetrahedron around carbon.' },
    notice: 'The ball-and-stick model illustrates the arrangement; atom sizes and bond lengths are not to scale. The 2D diagram is a projection.',
    source: 'Bond-angle data: NIST', no3d: '3D is unavailable or data saving is enabled. The diagram and information remain available.',
    prompt: 'Observe: which molecule has two bonds in a straight line?', answer: 'CO₂ has an O–C–O angle of 180°.', show: 'Show a hint',
    load: 'Loading the 3D model',
  },
}

function FlatDiagram({ config }) {
  const points = config.directions.map(([x, y, z]) => [150 + x * 88 + z * 24, 105 - y * 76 + z * 16])
  return <svg viewBox="0 0 300 210" role="img" aria-label={config.formula}>
    {points.map(([x, y], i) => <line key={i} x1="150" y1="105" x2={x} y2={y} stroke="currentColor" strokeWidth="3" />)}
    {points.map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="18" className="molecule-atom-outer" /><text x={x} y={y + 5} textAnchor="middle">{config.outer}</text></g>)}
    <circle cx="150" cy="105" r="23" className="molecule-atom-center" /><text x="150" y="110" textAnchor="middle">{config.center}</text>
  </svg>
}

export function MoleculeExplorer({ embedded = false }) {
  const { lang, fmt } = useT()
  const w = words[lang] || words.vi
  useDocumentTitle(embedded ? null : w.title)
  const groupName = `molecule-${useId()}`
  const [molecule, setMolecule] = useState('water')
  const [rotation, setRotation] = useState(0)
  const [enabled3d, setEnabled3d] = useState(() => canRender3D())
  const fail = useCallback(() => setEnabled3d(false), [])
  const config = MOLECULES[molecule]
  return <div className={embedded ? 'science-embedded' : 'container page science-page'}>
    {!embedded ? <><p><Link to="/learn">{w.back}</Link></p><h1>{w.title}</h1></> : null}<p className="science-lead">{w.lead}</p>
    <fieldset className="science-choices"><legend>{w.choose}</legend>
      {Object.keys(MOLECULES).map((key) => <label key={key}><input type="radio" name={groupName} value={key} checked={molecule === key} onChange={() => setMolecule(key)} /> {w[key]} ({MOLECULES[key].formula})</label>)}
    </fieldset>
    <div className="science-columns">
      <div className="science-view">
        {enabled3d ? <Suspense fallback={<p role="status">{w.load}</p>}><MoleculeScene molecule={molecule} rotation={rotation} onFailure={fail} /></Suspense> : <><p>{w.no3d}</p><FlatDiagram config={config} /></>}
        {enabled3d ? <label>{w.rotate} <output>{rotation}°</output><input type="range" min="-180" max="180" step="5" value={rotation} onChange={(e) => setRotation(Number(e.target.value))} /></label> : null}
      </div>
      <div className="science-details">
        <h2>{w[molecule]} · {config.formula}</h2>
        <p>{w.description[molecule]}</p>
        <dl><div><dt>{w.angle}</dt><dd>{fmt.number(config.angle, 1)}°</dd></div><div><dt>{w.center}</dt><dd>{config.center}</dd></div><div><dt>{w.outer}</dt><dd>{config.directions.length} × {config.outer}</dd></div></dl>
        <p>{w.notice}</p><p><a href={config.source} target="_blank" rel="noreferrer">{w.source}</a></p>
        <details><summary>{w.prompt}</summary><p>{w.answer}</p></details>
      </div>
    </div>
  </div>
}

export default function MoleculePage() { return <MoleculeExplorer /> }
