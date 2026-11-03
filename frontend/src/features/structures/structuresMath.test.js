import { describe, expect, it } from 'vitest'
import { parseTree, parseValue, traversalFrames, insertValue, removeValue, treePoint } from './structuresMath.js'

describe('teaching structures', () => {
  it('implements last-in-first-out and first-in-first-out with the same input', () => {
    const values = [1,2,3].reduce(insertValue,[])
    expect(removeValue(values,'stack')).toEqual({items:[1,2],removed:3})
    expect(removeValue(values,'queue')).toEqual({items:[2,3],removed:1})
    expect(removeValue([],'queue')).toEqual({items:[],removed:null})
  })
  it('rejects malformed and oversized input while accepting repeated values', () => {
    expect(parseTree('4, 4, -2')).toEqual([4,4,-2])
    expect(parseTree('1, 2x')).toBeNull()
    expect(parseTree(Array(16).fill(1).join(','))).toBeNull()
    expect(parseValue('2.5')).toBeNull()
    expect(parseValue('-9')).toBe(-9)
  })
  it('visits the correct nodes in each traversal without mutating earlier frames', () => {
    const tree=[1,2,3,4,5,6,7]
    const order = (mode) => traversalFrames(tree,mode).at(-1).visited.map((i)=>tree[i])
    expect(order('bfs')).toEqual([1,2,3,4,5,6,7])
    expect(order('pre')).toEqual([1,2,4,5,3,6,7])
    expect(order('in')).toEqual([4,2,5,1,6,3,7])
    expect(order('post')).toEqual([4,5,2,6,7,3,1])
    const frames = traversalFrames(tree,'pre')
    expect(frames[0].visited).toEqual([])
    expect(frames[0].pending).toEqual([])
    expect(frames.at(-1).pending).toEqual([])
  })
  it('places the root above and between its two children', () => {
    expect(treePoint(0)).toEqual({x:400,y:40})
    expect(treePoint(1).x).toBeLessThan(treePoint(0).x)
    expect(treePoint(2).x).toBeGreaterThan(treePoint(0).x)
  })
})
