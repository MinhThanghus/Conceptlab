import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { useDocumentTitle } from '../public/hooks.js'
import GuidedVisual from './GuidedVisual.jsx'
import { VISUAL_CATALOG, visualName } from './catalog.js'
import './visualLibrary.css'

const GROUPS = {
  biology: ['circulation', 'enzyme_binding'], chemistry: ['molecular_geometry', 'reaction_diffusion', 'porous_adsorption'],
  geography: ['solar_globe', 'water_cycle', 'population_grid'], computing: ['image_relief', 'data_tree', 'diffusion_process'],
  engineering: ['quadrotor', 'solar_cell', 'semiconductor_chip'], agriculture: ['agriculture_field'],
}
const COPY = {
  vi: { title: 'Phòng khám phá 3D', lead: 'Nhìn rõ cấu tạo. Tự thay đổi. Hiểu điều đang xảy ra.', back: 'Tất cả chủ đề', all: 'Tất cả',
    biology: 'Sinh học', chemistry: 'Hóa học', geography: 'Địa lý & môi trường', computing: 'Tin học & xử lý ảnh', engineering: 'Kỹ thuật', agriculture: 'Nông nghiệp',
    choose: 'Chọn mô hình để khám phá', open: 'Khám phá', active: 'Đang khám phá', group: 'Lĩnh vực', models: 'mô hình học tập',
    practice: 'Dự đoán trước khi thao tác, thử thay đổi một yếu tố, rồi đối chiếu với kết quả.',
    more: 'Thí nghiệm vật lý và thể thao', pendulum: 'Con lắc đơn', projectile: 'Chuyển động ném', sports: 'Chiến thuật trên sân',
    moreNote: 'Các bài này có tham số, diễn biến hoặc vị trí người chơi gắn với cảnh 3D.',
  },
  en: { title: 'The 3D exploration room', lead: 'See the structure. Make a change. Understand what happens.', back: 'All topics', all: 'All',
    biology: 'Biology', chemistry: 'Chemistry', geography: 'Geography & environment', computing: 'Computing & image processing', engineering: 'Engineering', agriculture: 'Agriculture',
    choose: 'Choose a model to explore', open: 'Explore', active: 'Exploring now', group: 'Subject', models: 'learning models',
    practice: 'Make a prediction, change one thing, then compare your prediction with the result.',
    more: 'Physics and sports experiments', pendulum: 'Simple pendulum', projectile: 'Projectile motion', sports: 'Tactics on the court',
    moreNote: 'These lessons connect parameters, motion or player positions to their 3D scenes.',
  },
}

export default function VisualLibrary() {
  const { lang } = useT()
  const w = COPY[lang] || COPY.vi
  useDocumentTitle(w.title)
  const [params, setParams] = useSearchParams()
  const [group, setGroup] = useState('all')
  const stage = useRef(null)
  const heading = useRef(null)
  const selected = VISUAL_CATALOG.find((item) => item.id === params.get('model'))
  // ?capture=1: the preview capture mode (a 16:9 well, no tools, no labels); ?mode= and ?geometry=
  // open a model in a given view (the semiconductor topics), as a lesson's settings would
  const capture = params.get('capture') === '1'
  // set while rendering, so a scene that mounts in this same commit already sees it
  if (capture && typeof document !== 'undefined') document.documentElement.dataset.capture = 'stage'
  useEffect(() => {
    if (!capture || typeof document === 'undefined') return undefined
    const root = document.documentElement
    root.dataset.capture = 'stage'
    return () => { delete root.dataset.capture }
  }, [capture])
  const models = VISUAL_CATALOG.filter((item) => group === 'all' || GROUPS[group]?.includes(item.id))
  const open = (id) => {
    setParams({ model: id }, { preventScrollReset: true })
    // the opened model mounts above the catalog: bring it into view and take focus there, without a smooth scroll
    requestAnimationFrame(() => {
      stage.current?.scrollIntoView({ behavior: 'instant', block: 'start' })
      heading.current?.focus({ preventScroll: true })
    })
  }
  return <div className="container page visual-library">
    <Link className="visual-back" to="/learn"><ArrowLeft size={16} aria-hidden="true" />{w.back}</Link>
    <header className="visual-library-intro"><h1>{w.title}</h1><p>{w.lead}</p><p className="visual-count">{VISUAL_CATALOG.length} {w.models}</p></header>
    {selected ? <section className="visual-library-active" ref={stage} aria-label={visualName(selected, lang)}>
      <div className="visual-active-heading"><h2 ref={heading} tabIndex={-1}>{visualName(selected, lang)}</h2><a href="#visual-library-catalog">{w.choose}<ArrowDown size={16} aria-hidden="true" /></a></div>
      <p className="visual-practice">{w.practice}</p>
      <GuidedVisual key={selected.id} kind={selected.id} initialMode={params.get('mode') || undefined} initialGeometry={params.get('geometry') || undefined} />
      <p className="visual-scope">{selected.scope[lang]}</p>
    </section> : null}
    <section id="visual-library-catalog" className="visual-library-catalog" aria-label={w.choose}>
      <h2>{w.choose}</h2>
      <div className="visual-filter" role="group" aria-label={w.group}>
        {['all', ...Object.keys(GROUPS)].map((id) => <button type="button" className="chip" key={id} aria-pressed={group === id} onClick={() => setGroup(id)}>{w[id]}</button>)}
      </div>
      <div className="visual-library-grid">{models.map((item) => <button className="visual-model-card" type="button" key={item.id} aria-pressed={selected?.id === item.id} onClick={() => open(item.id)}>
        <span className="visual-model-media"><img src={`/visual-previews/${item.id}.png`} alt="" loading="lazy" width="640" height="360" /></span>
        <span className="visual-model-name">{visualName(item, lang)}</span><span className="visual-model-open">{selected?.id === item.id ? w.active : w.open}<ArrowRight size={16} aria-hidden="true" /></span>
      </button>)}</div>
    </section>
    <aside className="visual-more"><h2>{w.more}</h2><p>{w.moreNote}</p><div><Link to="/s/TPEND6">{w.pendulum}<ArrowRight size={16} aria-hidden="true" /></Link><Link to="/s/JUMP45">{w.projectile}<ArrowRight size={16} aria-hidden="true" /></Link><Link to="/s/VBPASS">{w.sports}<ArrowRight size={16} aria-hidden="true" /></Link></div></aside>
  </div>
}
