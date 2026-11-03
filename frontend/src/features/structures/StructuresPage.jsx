import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { useT } from '../../i18n/index.jsx'
import { canRender3D } from '../../lib/three/capability.js'
import { insertValue, parseTree, parseValue, removeValue, traversalFrames, treePoint } from './structuresMath.js'
import AdvancedStructures from './AdvancedStructures.jsx'
import './structures.css'

const Tree3D = lazy(() => import('./Tree3D.jsx'))
const INITIAL_TREE = [8,3,10,1,6,9,14]

function BinaryTree({ values, frame, label }) {
  const visited = new Set(frame.visited)
  return <svg className="structures-tree" viewBox="0 0 800 370" role="img" aria-label={label}>
    {values.map((_,i) => { if (!i) return null; const a=treePoint(Math.floor((i-1)/2)),b=treePoint(i); return <line key={`e${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> })}
    {values.map((value,i) => { const p=treePoint(i), state=frame.current===i?'active':visited.has(i)?'visited':'pending'; return <g key={i} className={`tree-${state}`}><circle cx={p.x} cy={p.y} r="24" /><text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central">{value}</text></g> })}
  </svg>
}

export default function StructuresPage() {
  const {t, lang} = useT()
  const [mode,setMode] = useState('stack'), [stack,setStack] = useState([3,7,5]), [queue,setQueue] = useState([3,7,5])
  const [input,setInput] = useState(''), [message,setMessage] = useState('')
  const [treeInput,setTreeInput] = useState(INITIAL_TREE.join(', ')), [values,setValues] = useState(INITIAL_TREE)
  const [treeError,setTreeError] = useState(''), [order,setOrder] = useState('bfs'), [step,setStep] = useState(0)
  const [view3d,setView3d] = useState(false), [failed3d,setFailed3d] = useState(false)
  const [can3d] = useState(() => canRender3D())
  const frames = useMemo(()=>traversalFrames(values,order),[values,order])
  const frame = frames[Math.min(step,frames.length-1)]
  const data = mode==='stack' ? stack : queue
  const updateData = mode==='stack' ? setStack : setQueue
  const failure = useCallback(()=>{setFailed3d(true);setView3d(false)},[])
  const textOrder = (ids) => ids.length ? ids.map((i)=>values[i]).join(', ') : t('structures.none')
  const add = () => {
    const n=parseValue(input)
    if(n===null) { setMessage(t('structures.invalidValue')); return }
    if(data.length>=8) { setMessage(t('structures.capacity')); return }
    updateData(insertValue(data,n)); setInput(''); setMessage(t('structures.added',{value:n}))
  }
  const remove = () => {
    const result=removeValue(data,mode)
    updateData(result.items); setMessage(result.removed===null?t('structures.empty'):t('structures.removed',{value:result.removed}))
  }
  const applyTree = () => {
    const next=parseTree(treeInput)
    if(!next) {setTreeError(t('structures.invalidTree'));return}
    setTreeError(''); setValues(next); setStep(0)
  }
  return <div className="container page structures-page">
    <header><h1>{t('structures.title')}</h1><p>{t('structures.intro')}</p></header>
    <section className="structures-section" aria-labelledby="structures-linear">
      <h2 id="structures-linear">{t('structures.linearTitle')}</h2>
      <div className="structures-mode" role="group" aria-label={t('structures.linearTitle')}>
        {['stack','queue'].map((kind)=><button key={kind} className="btn" aria-pressed={mode===kind} onClick={()=>{setMode(kind);setMessage('')}}>{t(`structures.${kind}`)}</button>)}
      </div>
      <p>{t(mode==='stack'?'structures.stackRule':'structures.queueRule')}</p>
      <div className="structures-controls">
        <label>{t('structures.input')}<input type="text" inputMode="numeric" value={input} onChange={(e)=>setInput(e.target.value)} aria-describedby="structures-input-hint" /></label>
        <button className="btn btn-primary" onClick={add}>{t(mode==='stack'?'structures.addStack':'structures.addQueue')}</button>
        <button className="btn" onClick={remove} disabled={!data.length}>{t(mode==='stack'?'structures.removeStack':'structures.removeQueue')}</button>
      </div>
      <p id="structures-input-hint" className="small">{t('structures.inputHint')}</p><p role="status">{message}</p>
      <div className="structures-linear-demo"><span>{t(mode==='stack'?'structures.bottom':'structures.front')}</span>
        {data.length ? <ol className="structures-items">{data.map((v,i)=><li key={i}>{v}</li>)}</ol> : <p>{t('structures.empty')}</p>}
        <span>{t(mode==='stack'?'structures.top':'structures.rear')}</span></div>
    </section>
    <section className="structures-section" aria-labelledby="structures-tree-title">
      <h2 id="structures-tree-title">{t('structures.treeTitle')}</h2><p>{t('structures.treeIntro')}</p>
      <div className="structures-controls"><label>{t('structures.valuesLabel')}<input value={treeInput} onChange={(e)=>setTreeInput(e.target.value)} aria-describedby="structures-tree-hint" aria-invalid={Boolean(treeError)} /></label>
        <button className="btn btn-primary" onClick={applyTree}>{t('structures.apply')}</button></div>
      <p id="structures-tree-hint" className="small">{t('structures.valuesHint')}</p>{treeError && <p role="alert">{treeError}</p>}
      <label className="structures-order">{t('structures.orderLabel')}<select value={order} onChange={(e)=>{setOrder(e.target.value);setStep(0)}}>
        <option value="bfs">{t('structures.bfs')}</option><option value="pre">{t('structures.pre')}</option><option value="in">{t('structures.inorder')}</option><option value="post">{t('structures.post')}</option>
      </select></label>
      <p>{t(`structures.${order==='in'?'inRule':order+'Rule'}`)}</p>
      <BinaryTree values={values} frame={frame} label={t('structures.treeDiagram')} />
      <div className="structures-controls">
        <button className="btn" disabled={step===0} onClick={()=>setStep((n)=>n-1)}>{t('structures.previous')}</button>
        <button className="btn" disabled={step>=frames.length-1} onClick={()=>setStep((n)=>n+1)}>{t('structures.next')}</button>
        <button className="btn" onClick={()=>setStep(0)}>{t('structures.reset')}</button>
      </div>
      <div aria-live="polite"><p><strong>{t('structures.step',{current:step+1,total:frames.length})}</strong></p>
        <p>{frame.kind==='start'?t('structures.start'):t(`structures.${frame.kind}`,{value:values[frame.current]})}</p>
        <p><strong>{t('structures.visited')}:</strong> {textOrder(frame.visited)}</p>
        <p><strong>{t(order==='bfs'?'structures.queueState':'structures.callStack')}:</strong> {textOrder(frame.pending)}</p></div>
      <details><summary>{t('structures.treeTable')}</summary><table className="structures-table"><thead><tr><th>{t('structures.node')}</th><th>{t('structures.left')}</th><th>{t('structures.right')}</th></tr></thead><tbody>{values.map((v,i)=><tr key={i}><th scope="row">{v}</th><td>{values[2*i+1] ?? t('structures.none')}</td><td>{values[2*i+2] ?? t('structures.none')}</td></tr>)}</tbody></table></details>
      {can3d && !failed3d ? <button className="btn" onClick={()=>setView3d((v)=>!v)} aria-pressed={view3d}>{t(view3d?'structures.hide3d':'structures.show3d')}</button> : <p>{t('structures.no3d')}</p>}
      {view3d && <><div className="structures-3d-legend" aria-label={lang === 'vi' ? 'Chú giải cây 3D' : '3D tree legend'}>
        <span><i className="tree-key-current" />{lang === 'vi' ? 'Nút hiện tại' : 'Current node'}</span>
        <span><i className="tree-key-visited" />{lang === 'vi' ? 'Đã thăm' : 'Visited'}</span>
        <span><i className="tree-key-pending" />{lang === 'vi' ? 'Chưa thăm' : 'Not visited'}</span>
      </div><Suspense fallback={<p role="status">{t('common.states.loading')}</p>}><Tree3D values={values} frame={frame} lang={lang} label={lang === 'vi' ? `Cây 3D, các giá trị ${values.join(', ')}. Nút hiện tại ${frame.current == null ? 'chưa có' : values[frame.current]}.` : `3D tree, values ${values.join(', ')}. Current node ${frame.current == null ? 'none' : values[frame.current]}.`} onFailure={failure} /></Suspense><p className="small">{lang === 'vi' ? 'Giá trị nằm trên mỗi nút; màu và cạnh đổi theo bước duyệt. Cách sắp xếp là sơ đồ, không phải địa chỉ bộ nhớ.' : 'Values appear on the nodes; colors and connections follow each traversal step. The layout is a diagram, not a map of memory addresses.'}</p></>}
    </section>
    <AdvancedStructures />
    <section className="structures-section"><h2>{t('structures.reference')}</h2><ul>
      <li><a href="https://www.hello-algo.com/en/chapter_stack_and_queue/stack/">{t('structures.refStack')}</a></li>
      <li><a href="https://www.hello-algo.com/en/chapter_stack_and_queue/queue/">{t('structures.refQueue')}</a></li>
      <li><a href="https://www.hello-algo.com/en/chapter_tree/binary_tree_traversal/">{t('structures.refTree')}</a></li>
    </ul></section>
  </div>
}
