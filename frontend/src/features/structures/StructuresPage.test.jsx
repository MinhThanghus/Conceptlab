import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { DICTS, I18nProvider } from '../../i18n/index.jsx'
import viText from '../../i18n/locales/vi/structures.js'
import enText from '../../i18n/locales/en/structures.js'
import StructuresPage from './StructuresPage.jsx'

beforeEach(()=>{DICTs(); window.localStorage.setItem('cl.lang','en')})
function DICTs(){ DICTS.vi.structures=viText; DICTS.en.structures=enText }
afterEach(()=>{cleanup();window.localStorage.clear()})

describe('structures learning page',()=>{
  it('shows stack and queue removal on the same input',()=>{
    render(<I18nProvider><StructuresPage /></I18nProvider>)
    fireEvent.click(screen.getByRole('button',{name:'Pop from top'}))
    expect(screen.getByText('Removed 5.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'Queue'}))
    fireEvent.click(screen.getByRole('button',{name:'Dequeue from front'}))
    expect(screen.getByText('Removed 3.')).toBeTruthy()
  })
  it('sets a new tree and steps BFS, showing the live queue',()=>{
    render(<I18nProvider><StructuresPage /></I18nProvider>)
    fireEvent.change(screen.getByLabelText('Tree values'),{target:{value:'1,2,3'}})
    fireEvent.click(screen.getByRole('button',{name:'Build tree'}))
    fireEvent.click(screen.getByRole('button',{name:'Next step'}))
    expect(screen.getByText('Visit node 1.')).toBeTruthy()
    const status=screen.getByText('Queue after this step, front first:').parentElement
    expect(within(status).getByText(/2, 3/)).toBeTruthy()
  })
  it('rejects an invalid tree without silently changing it',()=>{
    render(<I18nProvider><StructuresPage /></I18nProvider>)
    fireEvent.change(screen.getByLabelText('Tree values'),{target:{value:'one'}})
    fireEvent.click(screen.getByRole('button',{name:'Build tree'}))
    expect(screen.getByRole('alert').textContent).toMatch(/1 to 15 valid integers/)
  })
  it('renders Vietnamese labels when selected',()=>{
    window.localStorage.setItem('cl.lang','vi')
    render(<I18nProvider><StructuresPage /></I18nProvider>)
    expect(screen.getByRole('heading',{name:'Ngăn xếp, hàng đợi và cây'})).toBeTruthy()
    expect(screen.getByLabelText('Cách duyệt')).toBeTruthy()
  })
  it('inserts and removes at a linked-list position',()=>{
    render(<I18nProvider><StructuresPage /></I18nProvider>)
    const area=within(screen.getByRole('region',{name:'3. Linked lists, heaps and search trees'}))
    fireEvent.change(area.getByRole('textbox',{name:'Integer value'}),{target:{value:'4'}})
    fireEvent.change(area.getByLabelText('Position index'),{target:{value:'1'}})
    fireEvent.click(area.getByRole('button',{name:'Insert at position'}))
    expect(area.getByText('Inserted 4 at index 1 and updated the links.')).toBeTruthy()
    fireEvent.click(area.getByRole('button',{name:'Delete at position'}))
    expect(area.getByText('Removed 4 at index 1 and reconnected the nodes.')).toBeTruthy()
  })
  it('steps a real heap insertion and a binary-search-tree search',()=>{
    render(<I18nProvider><StructuresPage /></I18nProvider>)
    const area=within(screen.getByRole('region',{name:'3. Linked lists, heaps and search trees'}))
    fireEvent.click(area.getByRole('button',{name:'Max heap'}))
    fireEvent.change(area.getByRole('textbox',{name:'Integer value'}),{target:{value:'50'}})
    fireEvent.click(area.getByRole('button',{name:'Insert into heap'}))
    while(!area.getByRole('button',{name:'Next step'}).disabled) fireEvent.click(area.getByRole('button',{name:'Next step'}))
    expect(area.getByText(/Array in level order: 50/)).toBeTruthy()
    fireEvent.click(area.getByRole('button',{name:'Binary search tree'}))
    fireEvent.change(area.getByRole('textbox',{name:'Integer value'}),{target:{value:'6'}})
    fireEvent.click(area.getByRole('button',{name:'Search tree'}))
    while(!area.getByRole('button',{name:'Next step'}).disabled) fireEvent.click(area.getByRole('button',{name:'Next step'}))
    expect(area.getByText('Found 6.')).toBeTruthy()
  })
  it('steps deletion of a BST root with two children',()=>{
    render(<I18nProvider><StructuresPage /></I18nProvider>)
    const area=within(screen.getByRole('region',{name:'3. Linked lists, heaps and search trees'}))
    fireEvent.click(area.getByRole('button',{name:'Binary search tree'}))
    fireEvent.change(area.getByRole('textbox',{name:'Integer value'}),{target:{value:'8'}})
    fireEvent.click(area.getByRole('button',{name:'Delete from tree'}))
    while(!area.getByRole('button',{name:'Next step'}).disabled) fireEvent.click(area.getByRole('button',{name:'Next step'}))
    expect(area.getByText('Removed the old successor and connected its right child if present. 9 replaces 8.')).toBeTruthy()
    expect(area.getByRole('img',{name:'Binary search tree'}).textContent).not.toContain('8')
  })
})
