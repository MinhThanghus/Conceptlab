import {describe,it,expect} from 'vitest'
import {listFrom,listOrder,listInsert,listRemove,heapInsertFrames,heapRemoveFrames,bstFrom,bstInsertFrames,bstSearchFrames,bstDeleteFrames} from './advancedMath.js'

function inorder(nodes,i=0) {
  if(i===null || !nodes.length) return []
  return [...inorder(nodes,nodes[i].left),nodes[i].value,...inorder(nodes,nodes[i].right)]
}

describe('linked list, heap and search tree',()=>{
  it('rewires head and next links on insertion and removal without modifying the original',()=>{
    const original=listFrom([1,3]); const a=listInsert(original,1,2)
    expect(listOrder(a).map(n=>n.value)).toEqual([1,2,3]); expect(listOrder(original).map(n=>n.value)).toEqual([1,3])
    const b=listRemove(a,0); expect(b.removed).toBe(1); expect(listOrder(b.list).map(n=>n.value)).toEqual([2,3])
    expect(listRemove(b.list,2)).toBeNull()
  })
  it('sifts inserted values up and moves a removed maximum down',()=>{
    const add=heapInsertFrames([9,7,8,3],10)
    expect(add.some(f=>f.kind==='heapSwap')).toBe(true); expect(add.at(-1).heap).toEqual([10,9,8,3,7])
    const remove=heapRemoveFrames(add.at(-1).heap)
    expect(remove.at(-1).removed).toBe(10); expect(remove.at(-1).heap).toEqual([9,7,8,3])
    expect(heapRemoveFrames([])).toEqual([])
  })
  it('follows search paths and preserves BST order after insertion',()=>{
    const tree=bstFrom([8,3,10,1,6]); const add=bstInsertFrames(tree,4)
    expect(add.at(-1).kind).toBe('bstInserted')
    expect(add.filter(f=>f.kind==='bstCompare').map(f=>f.nodes[f.current].value)).toEqual([8,3,6])
    expect(bstSearchFrames(add.at(-1).nodes,4).at(-1).kind).toBe('bstFound')
    expect(bstSearchFrames(tree,4).at(-1).kind).toBe('bstMissing')
    expect(bstInsertFrames(tree,3).at(-1).kind).toBe('bstExists')
  })
  it('deletes a leaf and a one-child node while retaining all other values',()=>{
    const tree=bstFrom([8,3,10,1,6,9,14,7])
    const leaf=bstDeleteFrames(tree,1)
    expect(leaf.at(-1).kind).toBe('bstDeleteLeaf')
    expect(inorder(leaf.at(-1).nodes)).toEqual([3,6,7,8,9,10,14])
    const single=bstDeleteFrames(tree,6)
    expect(single.at(-1).kind).toBe('bstDeleteSingle')
    expect(inorder(single.at(-1).nodes)).toEqual([1,3,7,8,9,10,14])
    expect(inorder(tree)).toEqual([1,3,6,7,8,9,10,14])
  })
  it('promotes the root child and handles an empty tree',()=>{
    const child=bstDeleteFrames(bstFrom([4,2,1]),4)
    expect(child.at(-1).kind).toBe('bstDeleteSingle')
    expect(child.at(-1).nodes[0].value).toBe(2)
    expect(inorder(child.at(-1).nodes)).toEqual([1,2])
    expect(bstDeleteFrames(bstFrom([1]),1).at(-1).nodes).toEqual([])
    expect(bstDeleteFrames([],1).at(-1).kind).toBe('bstMissing')
  })
  it('deletes a two-child root using its successor and preserves the successor right child',()=>{
    const tree=bstFrom([10,5,20,15,17,25])
    const frames=bstDeleteFrames(tree,10)
    expect(frames.some(f=>f.kind==='bstFindSuccessor')).toBe(true)
    expect(frames.some(f=>f.kind==='bstSuccessorCopy' && f.replacement===15)).toBe(true)
    expect(frames.at(-1).kind).toBe('bstDeleteSuccessor')
    expect(frames.at(-1).pathValues).toEqual([10,20,15])
    expect(frames.at(-1).nodes[0].value).toBe(15)
    expect(inorder(frames.at(-1).nodes)).toEqual([5,15,17,20,25])
    expect(inorder(tree)).toEqual([5,10,15,17,20,25])
  })
  it('does not change a tree when the requested value is absent',()=>{
    const tree=bstFrom([8,3,10])
    const frames=bstDeleteFrames(tree,5)
    expect(frames.at(-1).kind).toBe('bstMissing')
    expect(frames.at(-1).nodes).toEqual(tree)
  })
})
