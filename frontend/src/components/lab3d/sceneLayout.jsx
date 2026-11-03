import { createContext, useContext } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'

/**
 * Where a 3D scene stands. On a lesson slide (GuidedVisual in the deck) a scene shows its stage,
 * filling the column, and ONE control row under it; the explanation of the current choice and its
 * notes go to `aside`, the slide's caption column, while that column stands beside the model (on
 * a phone it is null and they follow the controls). Everywhere else `deck` is false and the scene
 * keeps its page layout.
 */
const SceneLayout = createContext({ deck: false, aside: null })

export const SceneLayoutProvider = SceneLayout.Provider

export function useSceneLayout() {
  return useContext(SceneLayout)
}

/** The scene's words about what is on show: in the deck's caption column when there is one beside the model, in place otherwise. */
export function SceneAside({ children }) {
  const { deck, aside } = useSceneLayout()
  const { lang } = useT()
  if (!deck) return children
  // the caption column carries the lesson's language; the scene speaks the interface's
  const body = <div className="stage3d-aside" lang={lang}>{children}</div>
  return aside ? createPortal(body, aside) : body
}

/** The current choice explained: a short title and its sentence, announced when it changes. */
export function SceneFocus({ title, children, live = true, className = '' }) {
  return (
    <div className={`stage3d-focus${className ? ` ${className}` : ''}`}>
      {title ? <p className="stage3d-focus-title">{title}</p> : null}
      <div className="stage3d-focus-text" role={live ? 'status' : undefined}>{children}</div>
    </div>
  )
}

/**
 * The one row of controls under the stage; `lead` (a parent's choice, e.g. the heart's view) opens
 * it. `tools` are the stage's view tools again: on a narrow sheet they leave the stage (where they
 * would cover the model) and close the row instead; CSS shows one copy at a time.
 */
export function SceneBar({ lead = null, tools = null, toolsLabel, children }) {
  return (
    <div className="stage3d-bar">
      {lead}
      {lead ? <span className="stage3d-bar-sep" aria-hidden="true" /> : null}
      {children}
      {tools ? <StageTools className="stage3d-bar-tools" tools={tools} label={toolsLabel} /> : null}
    </div>
  )
}

/** Limits, credits and legends: behind one quiet disclosure on a slide, in place on a page. */
export function SceneNotes({ children }) {
  const { deck } = useSceneLayout()
  const { t } = useT()
  if (!deck) return children
  return (
    <details className="stage3d-notes">
      <summary><Info size={20} aria-hidden="true" /><span>{t('scene3d.about')}</span></summary>
      <div className="stage3d-notes-body">{children}</div>
    </details>
  )
}

/**
 * View tools that sit on the stage, bottom right: card-stock icon buttons whose words stay for
 * screen readers and as a tooltip. `tools`: [{ icon, label, onClick, disabled }].
 */
export function StageTools({ tools, label, className = '' }) {
  return (
    <div className={`stage3d-tools${className ? ` ${className}` : ''}`} role="group" aria-label={label}>
      {tools.map(({ icon: Icon, label: name, onClick, disabled }) => (
        <button key={name} type="button" className="btn" title={name} disabled={disabled} onClick={onClick}>
          <Icon size={20} aria-hidden="true" />
          <span className="stage3d-tool-label">{name}</span>
        </button>
      ))}
    </div>
  )
}
