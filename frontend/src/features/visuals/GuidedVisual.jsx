import { Component, lazy, Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../../i18n/index.jsx'
import { useBlockEnv } from '../blocks/BlockEnv.jsx'
import { SceneLayoutProvider } from '../../components/lab3d/sceneLayout.jsx'
import { VISUAL_CATALOG, visualCopy } from './catalog.js'

const Circulation = lazy(() => import('../blocks/text/Circulation3D.jsx'))
const Research = lazy(() => import('../blocks/text/ResearchVisual3D.jsx'))
const Molecules = lazy(() => import('../science/MoleculePage.jsx').then((m) => ({ default: m.MoleculeExplorer })))
const MoleculesDeck = lazy(() => import('../science/MoleculeScene.jsx').then((m) => ({ default: m.MoleculeDeckScene })))
const Globe = lazy(() => import('../geography/GeoLessonPage.jsx'))
const Water = lazy(() => import('../geography/WaterCycle3D.jsx'))
const Pixels = lazy(() => import('../vision/EmbeddedVisionRelief.jsx'))
const Tree = lazy(() => import('../structures/EmbeddedTree3D.jsx'))
const Engineering = lazy(() => import('../engineering/EngineeringExplorer.jsx'))
const Diffusion = lazy(() => import('../vision/DiffusionExplorer.jsx'))
const Study = lazy(() => import('../study/StudyExplorer.jsx'))
const Semiconductor = lazy(() => import('../semiconductors/SemiconductorExplorer.jsx'))

const SCENES = {
  circulation: Circulation, enzyme_binding: Research, population_grid: Research,
  molecular_geometry: Molecules, solar_globe: Globe, water_cycle: Water, image_relief: Pixels, data_tree: Tree,
  quadrotor: Engineering, solar_cell: Engineering,
  diffusion_process: Diffusion,
  agriculture_field: Study, reaction_diffusion: Study, porous_adsorption: Study,
  semiconductor_chip: Semiconductor,
}
// on a slide, a scene that lives inside a whole lesson page elsewhere gets a compact stage of its own
const DECK_SCENES = { molecular_geometry: MoleculesDeck }

class SceneBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    const vi = this.props.lang === 'vi'
    return <div role="alert" className="card-muted">
      <p>{vi ? 'Chưa tải được mô hình. Bạn vẫn có thể đọc nội dung và xem nguồn của bài học.' : 'The model could not be loaded. You can still read the lesson and inspect its sources.'}</p>
      <p className="small">{this.props.scope}</p>
      <button type="button" className="btn" onClick={() => window.location.reload()}>{vi ? 'Tải lại trang' : 'Reload page'}</button>
    </div>
  }
}

/**
 * On a lesson slide the scene's words (the current choice explained, its notes) move into the
 * slide's caption column while that column stands beside the model; on a narrow sheet they stay
 * under the controls. The deck's layout is read from the page, so nothing here depends on it.
 */
function useCaptionColumn(deck, root) {
  const [aside, setAside] = useState(null)
  useLayoutEffect(() => {
    const column = deck ? root.current?.closest('.deck-visual3d-stage') : null
    const caption = column?.parentElement?.querySelector(':scope > .deck-visual3d-caption')
    if (!column || !caption) {
      setAside(null)
      return undefined
    }
    const check = () => {
      const model = column.getBoundingClientRect()
      const words = caption.getBoundingClientRect()
      // a hidden slide measures nothing: keep the last answer until it shows again
      if (!model.width || !words.width) return
      setAside(words.left >= model.right - 1 ? caption : null)
    }
    check()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check)
    observer?.observe(column.parentElement)
    return () => observer?.disconnect()
  }, [deck, root])
  return aside
}

export default function GuidedVisual({ kind, initialMode, initialGeometry }) {
  const { lang } = useT()
  const deck = useBlockEnv().presentation === 'slides'
  const root = useRef(null)
  const aside = useCaptionColumn(deck, root)
  const layout = useMemo(() => ({ deck, aside }), [deck, aside])
  const Scene = (deck && DECK_SCENES[kind]) || SCENES[kind]
  if (!Scene) return null
  return <div ref={root} className={deck ? 'guided-visual is-deck' : 'guided-visual'}>
    <SceneLayoutProvider value={layout}>
      <SceneBoundary key={kind} lang={lang} scope={VISUAL_CATALOG.find((item) => item.id === kind)?.scope[lang]}>
        <Suspense fallback={<p role="status">{visualCopy(lang).loading}</p>}><Scene kind={kind} initialMode={initialMode} initialGeometry={initialGeometry} embedded /></Suspense>
      </SceneBoundary>
    </SceneLayoutProvider>
  </div>
}
