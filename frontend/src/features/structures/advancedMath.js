// A singly linked list is represented by explicit node ids and next links, not array positions.
export function listFrom(values) {
  return { head: values.length ? 0 : null, nextId: values.length, nodes: values.map((value,i)=>({id:i,value,next:i+1<values.length?i+1:null})) }
}
export function listOrder(list) {
  const map = new Map(list.nodes.map((n)=>[n.id,n])), seen=new Set(), ordered=[]
  let id=list.head
  while (id !== null && map.has(id) && !seen.has(id)) { seen.add(id); const node=map.get(id); ordered.push(node); id=node.next }
  return ordered
}
export function listInsert(list,index,value) {
  const order=listOrder(list)
  if (!Number.isInteger(index) || index<0 || index>order.length) return null
  const copy={...list,nodes:list.nodes.map((n)=>({...n}))}, node={id:list.nextId,value,next:order[index]?.id ?? null}
  copy.nextId++; copy.nodes.push(node)
  if(index===0) copy.head=node.id
  else copy.nodes.find((n)=>n.id===order[index-1].id).next=node.id
  return copy
}
export function listRemove(list,index) {
  const order=listOrder(list)
  if (!Number.isInteger(index) || index<0 || index>=order.length) return null
  const removed=order[index], copy={...list,nodes:list.nodes.filter((n)=>n.id!==removed.id).map((n)=>({...n}))}
  if(index===0) copy.head=removed.next
  else copy.nodes.find((n)=>n.id===order[index-1].id).next=removed.next
  return {list:copy,removed:removed.value}
}

/** Produce actual sift-up states; caller advances through each comparison and swap. */
export function heapInsertFrames(values,value) {
  const heap=[...values,value], frames=[]
  const emit=(kind,indices=[])=>frames.push({kind,heap:[...heap],indices})
  let i=heap.length-1; emit('heapAppend',[i])
  while(i>0) {
    const p=Math.floor((i-1)/2); emit('heapCompare',[p,i])
    if(heap[p]>=heap[i]) break
    ;[heap[p],heap[i]]=[heap[i],heap[p]]; emit('heapSwap',[p,i]); i=p
  }
  emit('heapDone'); return frames
}
export function heapRemoveFrames(values) {
  if(!values.length) return []
  const heap=[...values], removed=heap[0], frames=[]
  const emit=(kind,indices=[])=>frames.push({kind,heap:[...heap],indices,removed})
  const last=heap.pop()
  if(heap.length) { heap[0]=last; emit('heapReplace',[0]) } else emit('heapRemoveOnly')
  let i=0
  while(i<heap.length) {
    const l=i*2+1,r=l+1
    let largest=i
    if(l<heap.length && heap[l]>heap[largest]) largest=l
    if(r<heap.length && heap[r]>heap[largest]) largest=r
    if(l<heap.length) emit('heapCompare',[i,l,...(r<heap.length?[r]:[])])
    if(largest===i) break
    ;[heap[i],heap[largest]]=[heap[largest],heap[i]]; emit('heapSwap',[i,largest]); i=largest
  }
  emit('heapDone'); return frames
}

export function bstInsertFrames(input,value) {
  const nodes=input.map((n)=>({...n})), frames=[], path=[]
  const emit=(kind,current=null)=>frames.push({kind,current,path:[...path],nodes:nodes.map((n)=>({...n})),target:value})
  if(!nodes.length) { nodes.push({value,left:null,right:null}); path.push(0); emit('bstInserted',0); return frames }
  let current=0
  while(true) {
    path.push(current); emit('bstCompare',current)
    if(value===nodes[current].value) {emit('bstExists',current);return frames}
    const side=value<nodes[current].value?'left':'right'
    if(nodes[current][side]===null) {
      nodes[current][side]=nodes.length; nodes.push({value,left:null,right:null}); path.push(nodes.length-1); emit('bstInserted',nodes.length-1); return frames
    }
    current=nodes[current][side]
  }
}
export function bstSearchFrames(input,value) {
  const nodes=input.map((n)=>({...n})),frames=[],path=[]
  const emit=(kind,current=null)=>frames.push({kind,current,path:[...path],nodes:nodes.map((n)=>({...n})),target:value})
  let current=nodes.length?0:null
  while(current!==null) {
    path.push(current); emit('bstCompare',current)
    if(value===nodes[current].value) {emit('bstFound',current);return frames}
    current=nodes[current][value<nodes[current].value?'left':'right']
  }
  emit('bstMissing'); return frames
}

// Remove unreachable storage slots and remap child indices. This also makes a promoted
// child the root at index 0, without changing the order or identity of any remaining value.
function compactTree(nodes,root) {
  if (root === null) return []
  const queue=[root], ids=[]
  while(queue.length) {
    const id=queue.shift(); ids.push(id)
    const node=nodes[id]
    if(node.left!==null) queue.push(node.left)
    if(node.right!==null) queue.push(node.right)
  }
  const index=new Map(ids.map((id,i)=>[id,i]))
  return ids.map((id)=>({value:nodes[id].value,left:nodes[id].left===null?null:index.get(nodes[id].left),right:nodes[id].right===null?null:index.get(nodes[id].right)}))
}

/** Locate the value, then show leaf, single-child, or successor replacement step by step. */
export function bstDeleteFrames(input,value) {
  let nodes=input.map((n)=>({...n})), root=nodes.length?0:null, current=root, parent=null, side=null
  const frames=[],path=[],pathValues=[]
  const emit=(kind,selected=current,replacement=null)=>frames.push({kind,current:selected,path:[...path],pathValues:[...pathValues],nodes:nodes.map((n)=>({...n})),target:value,replacement})
  while(current!==null) {
    path.push(current);pathValues.push(nodes[current].value);emit('bstCompare')
    if(nodes[current].value===value) break
    parent=current;side=value<nodes[current].value?'left':'right';current=nodes[current][side]
  }
  if(current===null) {emit('bstMissing');return frames}
  const node=nodes[current]
  if(node.left!==null && node.right!==null) {
    let successor=node.right, successorParent=current, successorSide='right'
    path.push(successor);pathValues.push(nodes[successor].value);emit('bstFindSuccessor',successor)
    while(nodes[successor].left!==null) {
      successorParent=successor;successorSide='left';successor=nodes[successor].left
      path.push(successor);pathValues.push(nodes[successor].value);emit('bstFindSuccessor',successor)
    }
    const replacement=nodes[successor].value
    node.value=replacement
    emit('bstSuccessorCopy',current,replacement)
    // A successor has no left child but can have a right child.
    nodes[successorParent][successorSide]=nodes[successor].right
    nodes=compactTree(nodes,root);path.length=0
    emit('bstDeleteSuccessor',null,replacement)
  } else {
    const child=node.left!==null?node.left:node.right
    if(parent===null) root=child
    else nodes[parent][side]=child
    nodes=compactTree(nodes,root);path.length=0
    emit(child===null?'bstDeleteLeaf':'bstDeleteSingle',null)
  }
  return frames
}
export function bstFrom(values) {
  return values.reduce((nodes,value)=>bstInsertFrames(nodes,value).at(-1).nodes,[])
}
