import { useId, useRef } from 'react'

/**
 * WAI-ARIA tabs with roving focus (Arrow keys, Home/End).
 *   <Tabs label="..." tabs={[{ id, label, icon }]} value={id} onChange={setId} />
 *   <TabPanel tabsId={...} id="x" value={current}>…</TabPanel>
 * For simple cases use <TabsWithPanels tabs={[{id,label,content}]} />.
 */
export function Tabs({ tabs, value, onChange, label, idPrefix }) {
  const listRef = useRef(null)
  const auto = useId()
  const prefix = idPrefix || `t${auto.replace(/[:]/g, '')}`
  const onKeyDown = (event) => {
    const idx = tabs.findIndex((tab) => tab.id === value)
    let next = null
    if (event.key === 'ArrowRight') next = (idx + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    if (next === null) return
    event.preventDefault()
    onChange(tabs[next].id)
    requestAnimationFrame(() => listRef.current?.querySelector(`#${prefix}-tab-${tabs[next].id}`)?.focus())
  }
  return (
    <div className="tabs" role="tablist" aria-label={label} ref={listRef} onKeyDown={onKeyDown}>
      {tabs.map((tab) => {
        const Icon = tab.icon
        const selected = tab.id === value
        return (
          <button
            key={tab.id}
            id={`${prefix}-tab-${tab.id}`}
            type="button"
            role="tab"
            className="tab"
            aria-selected={selected}
            // Only the selected tab points at its panel: <TabPanel> renders just the active
            // one, so an id for a hidden panel would be a broken reference.
            aria-controls={selected ? `${prefix}-panel-${tab.id}` : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
          >
            {Icon ? <Icon aria-hidden="true" /> : null}
            {tab.label}
            {tab.badge !== undefined && tab.badge !== null ? <span className="badge">{tab.badge}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

export function TabPanel({ idPrefix, id, value, children, className }) {
  if (id !== value) return null
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`} tabIndex={0} className={className}>
      {children}
    </div>
  )
}

export function TabsWithPanels({ tabs, value, onChange, label, panelClassName }) {
  const auto = useId()
  const prefix = `t${auto.replace(/[:]/g, '')}`
  return (
    <>
      <Tabs tabs={tabs} value={value} onChange={onChange} label={label} idPrefix={prefix} />
      {tabs.map((tab) => (
        <TabPanel key={tab.id} idPrefix={prefix} id={tab.id} value={value} className={panelClassName}>
          {tab.content}
        </TabPanel>
      ))}
    </>
  )
}
