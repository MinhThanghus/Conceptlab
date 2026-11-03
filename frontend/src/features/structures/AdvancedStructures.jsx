import { useState } from 'react'
import { useT } from '../../i18n/index.jsx'
import { parseValue, treePoint } from './structuresMath.js'
import { listFrom, listOrder, listInsert, listRemove, heapInsertFrames, heapRemoveFrames, bstFrom, bstInsertFrames, bstSearchFrames, bstDeleteFrames } from './advancedMath.js'

const MAX=8
function useFrames(initial,field) {
  const [base,setBase]=useState(initial), [frames,setFrames]=useState([]), [step,setStep]=useState(0)
  const frame=frames[step], value=frame ? frame[field] : base
  const busy=frames.length>0 && step<frames.length-1
  const launch=(next)=>{ setBase(value);setFrames(next);setStep(0) }
  const cancel=()=>{setFrames([]);setStep(0)}
  return {value,frame,frames,step,setStep,busy,launch,cancel}
}

function StepControls({ op }) {
  const {t}=useT()
  if(!op.frames.length) return null
  return <div className="structures-steps">
    <div className="structures-controls">
      <button className="btn" disabled={op.step===0} onClick={()=>op.setStep(op.step-1)}>{t('structures.previous')}</button>
      <button className="btn" disabled={op.step===op.frames.length-1} onClick={()=>op.setStep(op.step+1)}>{t('structures.next')}</button>
      {op.busy && <button className="btn" onClick={op.cancel}>{t('structures.adv.cancel')}</button>}
    </div>
    <div aria-live="polite"><p><strong>{t('structures.step',{current:op.step+1,total:op.frames.length})}</strong></p>
      <p>{t(`structures.adv.${op.frame.kind}`,{value:op.frame.target,removed:op.frame.removed,replacement:op.frame.replacement})}</p></div>
  </div>
}

function LinkedList() {
  const {t}=useT(), [list,setList]=useState(()=>listFrom([3,7,5])), [value,setValue]=useState(''), [index,setIndex]=useState('0'), [message,setMessage]=useState('')
  const order=listOrder(list)
  const action=(insert)=>{
    const position=/^\d+$/.test(index.trim())?Number(index):NaN, n=parseValue(value)
    if(insert && n===null){setMessage(t('structures.invalidValue'));return}
    if(insert && order.length>=MAX){setMessage(t('structures.capacity'));return}
    const result=insert ? listInsert(list,position,n) : listRemove(list,position)
    if(!result){setMessage(t('structures.adv.badIndex'));return}
    setList(insert?result:result.list)
    setMessage(insert?t('structures.adv.listAdded',{value:n,index:position}):t('structures.adv.listRemoved',{value:result.removed,index:position}))
  }
  return <div>
    <p>{t('structures.adv.listExplain')}</p>
    <div className="structures-controls"><label>{t('structures.input')}<input value={value} inputMode="numeric" onChange={(e)=>setValue(e.target.value)} /></label>
      <label>{t('structures.adv.index')}<input value={index} inputMode="numeric" onChange={(e)=>setIndex(e.target.value)} /></label>
      <button className="btn btn-primary" onClick={()=>action(true)}>{t('structures.adv.listInsert')}</button>
      <button className="btn" onClick={()=>action(false)} disabled={!order.length}>{t('structures.adv.listDelete')}</button></div>
    <p className="small">{t('structures.adv.listHint')}</p><p role="status">{message}</p>
    {order.length ? <ol className="structures-chain">{order.map((node,i)=><li key={node.id}><span>{node.value}</span><small>{t('structures.adv.indexLabel',{index:i})}</small>{i<order.length-1 && <b aria-hidden="true">→</b>}</li>)}</ol> : <p>{t('structures.empty')}</p>}
    <p className="small">{t('structures.adv.listComplexity')}</p>
  </div>
}

function HeapDiagram({heap,indices,label}) {
  const active=new Set(indices||[])
  if(!heap.length) return <p>{label}</p>
  return <svg className="structures-tree structures-tree-small" viewBox="0 0 800 370" role="img" aria-label={label}>
    {heap.map((_,i)=>{if(!i)return null;const a=treePoint(Math.floor((i-1)/2)),b=treePoint(i);return <line key={`l${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>})}
    {heap.map((value,i)=>{const p=treePoint(i);return <g key={i} className={active.has(i)?'tree-active':'tree-pending'}><circle cx={p.x} cy={p.y} r="24"/><text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central">{value}</text></g>})}
  </svg>
}

function Heap() {
  const {t}=useT(), op=useFrames([42,25,19,8,13],'heap'), [value,setValue]=useState(''), [message,setMessage]=useState('')
  const insert=()=>{
    const n=parseValue(value)
    if(n===null){setMessage(t('structures.invalidValue'));return}
    if(op.value.length>=MAX){setMessage(t('structures.capacity'));return}
    setMessage('');op.launch(heapInsertFrames(op.value,n));setValue('')
  }
  const remove=()=>{if(op.value.length){setMessage('');op.launch(heapRemoveFrames(op.value))}}
  return <div><p>{t('structures.adv.heapExplain')}</p>
    <div className="structures-controls"><label>{t('structures.input')}<input value={value} onChange={(e)=>setValue(e.target.value)} inputMode="numeric" /></label>
      <button className="btn btn-primary" onClick={insert} disabled={op.busy}>{t('structures.adv.heapInsert')}</button>
      <button className="btn" onClick={remove} disabled={op.busy || !op.value.length}>{t('structures.adv.heapRemove')}</button></div>
    <p className="small">{t('structures.inputHint')}</p><p role="status">{message}</p>
    <HeapDiagram heap={op.value} indices={op.frame?.indices} label={op.value.length?t('structures.adv.heapDiagram'):t('structures.empty')} />
    <p>{t('structures.adv.array')}: {op.value.length?op.value.join(', '):t('structures.none')}</p>
    <StepControls op={op}/><p className="small">{t('structures.adv.heapComplexity')}</p>
  </div>
}

// In-order rank gives every node a distinct horizontal position, even for skewed trees.
function bstPositions(nodes) {
  const points={}, ordered=[]
  const walk=(i,depth)=>{if(i===null)return; const n=nodes[i];walk(n.left,depth+1); ordered.push({i,depth});walk(n.right,depth+1)}
  if(nodes.length) walk(0,0)
  ordered.forEach(({i,depth},rank)=>{points[i]={x:ordered.length===1?400:45+rank*710/(ordered.length-1),y:42+depth*75}})
  return points
}
function BstDiagram({nodes,current,path,label,empty}) {
  if(!nodes.length) return <p>{empty}</p>
  const points=bstPositions(nodes), depth=Math.max(...Object.values(points).map(p=>p.y)), height=Math.max(150,depth+42)
  return <svg className="structures-tree" viewBox={`0 0 800 ${height}`} role="img" aria-label={label}>
    {nodes.flatMap((node,i)=>[node.left,node.right].filter(x=>x!==null).map(child=><line key={`${i}-${child}`} x1={points[i].x} y1={points[i].y} x2={points[child].x} y2={points[child].y}/>))}
    {nodes.map((node,i)=><g key={i} className={current===i?'tree-active':path.includes(i)?'tree-visited':'tree-pending'}><circle cx={points[i].x} cy={points[i].y} r="22"/><text x={points[i].x} y={points[i].y} textAnchor="middle" dominantBaseline="central">{node.value}</text></g>)}
  </svg>
}

function SearchTree() {
  const {t}=useT(), op=useFrames(bstFrom([8,3,10,1,6,9,14]),'nodes'), [value,setValue]=useState(''), [message,setMessage]=useState('')
  const run=(kind)=>{
    const n=parseValue(value)
    if(n===null){setMessage(t('structures.invalidValue'));return}
    if(kind==='insert' && op.value.length>=15 && !op.value.some(node=>node.value===n)){setMessage(t('structures.adv.bstCapacity'));return}
    const frames=kind==='insert'?bstInsertFrames(op.value,n):kind==='delete'?bstDeleteFrames(op.value,n):bstSearchFrames(op.value,n)
    setMessage('');op.launch(frames);setValue('')
  }
  return <div><p>{t('structures.adv.bstExplain')}</p>
    <div className="structures-controls"><label>{t('structures.input')}<input value={value} onChange={(e)=>setValue(e.target.value)} inputMode="numeric" /></label>
      <button className="btn btn-primary" disabled={op.busy} onClick={()=>run('insert')}>{t('structures.adv.bstInsert')}</button>
      <button className="btn" disabled={op.busy} onClick={()=>run('search')}>{t('structures.adv.bstSearch')}</button>
      <button className="btn" disabled={op.busy} onClick={()=>run('delete')}>{t('structures.adv.bstDelete')}</button></div>
    <p className="small">{t('structures.adv.bstInputHint')}</p><p role="status">{message}</p>
    <BstDiagram nodes={op.value} current={op.frame?.current} path={op.frame?.path||[]} label={t('structures.adv.bstDiagram')} empty={t('structures.empty')}/>
    <p>{t('structures.adv.path')}: {op.frame?.pathValues?.length ? op.frame.pathValues.join(', ') : op.frame?.path?.length ? op.frame.path.map(i=>op.frame.nodes[i].value).join(', ') : t('structures.none')}</p>
    <StepControls op={op}/><p className="small">{t('structures.adv.bstComplexity')}</p>
  </div>
}

export default function AdvancedStructures() {
  const {t}=useT(), [mode,setMode]=useState('list')
  return <section className="structures-section" aria-labelledby="structures-advanced">
    <h2 id="structures-advanced">{t('structures.adv.title')}</h2><p>{t('structures.adv.intro')}</p>
    <div className="structures-mode" role="group" aria-label={t('structures.adv.title')}>{['list','heap','bst'].map(kind=><button key={kind} className="btn" aria-pressed={mode===kind} onClick={()=>setMode(kind)}>{t(`structures.adv.${kind}`)}</button>)}</div>
    <div hidden={mode!=='list'}><LinkedList/></div><div hidden={mode!=='heap'}><Heap/></div><div hidden={mode!=='bst'}><SearchTree/></div>
    <ul><li><a href="https://www.hello-algo.com/en/chapter_array_and_linkedlist/linked_list/">{t('structures.adv.listReference')}</a></li>
      <li><a href="https://www.hello-algo.com/en/chapter_heap/heap/">{t('structures.adv.heapReference')}</a></li>
      <li><a href="https://www.hello-algo.com/en/chapter_tree/binary_search_tree/">{t('structures.adv.bstReference')}</a></li></ul>
  </section>
}
