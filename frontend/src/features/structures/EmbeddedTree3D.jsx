import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { useT } from '../../i18n/index.jsx'
import { canRender3D } from '../../lib/three/capability.js'
import { traversalFrames, treePoint } from './structuresMath.js'
import './structures.css'

const Tree3D = lazy(() => import('./Tree3D.jsx'))
const SAMPLE = [8, 3, 10, 1, 6, 9, 14]

/** A compact BFS demonstration. Values are synthetic, not extracted from the user's image. */
export default function EmbeddedTree3D() {
  const { lang, t } = useT()
  const [step, setStep] = useState(0), [show3d, setShow3d] = useState(true), [failed, setFailed] = useState(false)
  const [can3d] = useState(() => canRender3D())
  const frames = useMemo(() => traversalFrames(SAMPLE, 'bfs'), [])
  const frame = frames[step]
  const fail = useCallback(() => { setFailed(true); setShow3d(false) }, [])
  const c = lang === 'vi' ? {
    title: 'Duyệt cây theo chiều rộng', sample: 'Các giá trị dưới đây là ví dụ để học thuật toán, không được trích từ tài liệu tải lên.',
    diagram: 'Cây nhị phân ví dụ', current: 'Nút hiện tại', visited: 'Đã thăm', pending: 'Chưa thăm', none: 'chưa có',
    queue: 'Hàng đợi', order: 'Thứ tự đã thăm', previous: 'Bước trước', next: 'Bước tiếp', reset: 'Làm lại',
    show: 'Hiện cây 3D', hide: 'Ẩn cây 3D', fallback: 'Mô hình 3D không khả dụng; sơ đồ 2D và các bước vẫn hoạt động.',
    note: 'Các cạnh nối nút cha với nút con. Màu thể hiện bước duyệt; vị trí trong hình không phải địa chỉ bộ nhớ.',
  } : {
    title: 'Breadth-first tree traversal', sample: 'These values are a teaching example, not data extracted from the uploaded source.',
    diagram: 'Example binary tree', current: 'Current node', visited: 'Visited', pending: 'Not visited', none: 'none',
    queue: 'Queue', order: 'Visit order', previous: 'Previous step', next: 'Next step', reset: 'Reset',
    show: 'Show 3D tree', hide: 'Hide 3D tree', fallback: 'The 3D model is unavailable; the 2D tree and traversal remain usable.',
    note: 'Edges connect each parent to its children. Colors show traversal state; positions are not memory addresses.',
  }
  const display = (ids) => ids.length ? ids.map((i) => SAMPLE[i]).join(', ') : c.none
  return <section className="structures-embedded" aria-label={c.title}>
    <h4>{c.title}</h4><p>{c.sample}</p>
    <svg className="structures-tree" viewBox="0 0 800 270" role="img" aria-label={c.diagram}>
      {SAMPLE.map((_, i) => { if (!i) return null; const a = treePoint(Math.floor((i - 1) / 2)), b = treePoint(i); return <line key={`e${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> })}
      {SAMPLE.map((value, i) => { const p = treePoint(i), state = frame.current === i ? 'active' : frame.visited.includes(i) ? 'visited' : 'pending'; return <g key={i} className={`tree-${state}`}><circle cx={p.x} cy={p.y} r="24" /><text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central">{value}</text></g> })}
    </svg>
    <div className="structures-controls"><button type="button" className="btn" disabled={!step} onClick={() => setStep((n) => n - 1)}>{c.previous}</button><button type="button" className="btn" disabled={step >= frames.length - 1} onClick={() => setStep((n) => n + 1)}>{c.next}</button><button type="button" className="btn" onClick={() => setStep(0)}>{c.reset}</button></div>
    <div aria-live="polite"><p>{c.current}: <strong>{frame.current == null ? c.none : SAMPLE[frame.current]}</strong></p><p>{c.order}: {display(frame.visited)}</p><p>{c.queue}: {display(frame.pending)}</p></div>
    {can3d && !failed ? <button type="button" className="btn" onClick={() => setShow3d((v) => !v)} aria-pressed={show3d}>{show3d ? c.hide : c.show}</button> : <p>{c.fallback}</p>}
    {can3d && !failed && show3d && <><div className="structures-3d-legend"><span><i className="tree-key-current" />{c.current}</span><span><i className="tree-key-visited" />{c.visited}</span><span><i className="tree-key-pending" />{c.pending}</span></div>
      <Suspense fallback={<p role="status">{t('common.states.loading')}</p>}><Tree3D values={SAMPLE} frame={frame} lang={lang} label={`${c.diagram}. ${c.current}: ${frame.current == null ? c.none : SAMPLE[frame.current]}.`} onFailure={fail} /></Suspense></>}
    <p className="small">{c.note}</p>
  </section>
}
