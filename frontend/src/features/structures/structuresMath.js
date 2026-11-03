// The sample tree uses a complete binary-tree layout stored in level order.
export function parseTree(text) {
  const input = String(text).trim()
  if (!input) return null
  const tokens = input.split(/[\s,]+/)
  if (tokens.length > 15 || tokens.some((s) => !/^-?\d+$/.test(s))) return null
  const values = tokens.map(Number)
  return values.every((v) => Number.isSafeInteger(v) && v >= -99 && v <= 99) ? values : null
}

export function parseValue(text) {
  const input = String(text).trim()
  if (!/^-?\d+$/.test(input)) return null
  const value = Number(input)
  return Number.isSafeInteger(value) && value >= -99 && value <= 99 ? value : null
}

/** Each frame is immutable: BFS exposes the queue; DFS exposes the recursion call stack. */
export function traversalFrames(values, mode) {
  if (!values?.length || !['bfs','pre','in','post'].includes(mode)) return []
  const frames = [], visited = [], pending = []
  const emit = (kind,current=null) => frames.push({ kind, current, visited: [...visited], pending: [...pending] })
  if (mode === 'bfs') {
    pending.push(0)
    emit('start')
    while (pending.length) {
      const current = pending.shift()
      visited.push(current)
      for (const child of [2*current+1,2*current+2]) if (child<values.length) pending.push(child)
      emit('visit',current)
    }
  } else {
    emit('start')
    const walk = (index) => {
      if (index>=values.length) return
      pending.push(index)
      emit('enter',index)
      const visit = () => { visited.push(index); emit('visit',index) }
      if(mode==='pre') visit()
      walk(2*index+1)
      if(mode==='in') visit()
      walk(2*index+2)
      if(mode==='post') visit()
      pending.pop()
      emit('exit',index)
    }
    walk(0)
  }
  return frames
}

export function insertValue(items,value) { return [...items,value] }
export function removeValue(items,mode) {
  if (!items.length) return { items: [], removed: null }
  return mode === 'stack'
    ? { items: items.slice(0,-1), removed: items[items.length-1] }
    : { items: items.slice(1), removed: items[0] }
}

export function treePoint(index) {
  const depth = Math.floor(Math.log2(index+1))
  const position = index-(2**depth-1)
  return { x: 800*(position+0.5)/(2**depth), y: 40+depth*95 }
}
