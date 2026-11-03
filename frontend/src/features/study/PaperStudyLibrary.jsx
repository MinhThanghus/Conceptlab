import { Link } from 'react-router-dom'
import { useT } from '../../i18n/index.jsx'
import { useDocumentTitle } from '../public/hooks.js'
import papers from '../../../../shared/paper_study_batch.json'
import './paperStudyLibrary.css'

const TITLES = {
  AGWATR: ['Nước ruộng và khí nhà kính tại An Giang', 'Water levels and greenhouse gases in An Giang'],
  AGFARM: ['Cách gieo trồng lúa tại Cần Thơ', 'Rice establishment practices in Can Tho'],
  AGMAZE: ['Vi sinh vật vùng rễ và cây ngô', 'Root-zone microorganisms and maize'],
  PCWAVS: ['Sự hình thành sóng hóa học', 'How chemical waves emerge'],
  PCPARE: ['CO₂, hơi nước và carbon xốp', 'CO₂, water vapor and porous carbon'],
  CHNASH: ['Transistor tấm nano', 'Nanosheet transistors'],
  CHNWRE: ['Transistor dây nano thẳng đứng', 'Vertical nanowire transistors'],
  CHCMPS: ['Từ transistor đến mạch CMOS', 'From transistors to CMOS circuits'],
  CHMSTE: ['Tiếp điểm và transistor MoS₂', 'Contacts and MoS₂ transistors'],
  CHMEMS: ['Phần tử nhớ và bộ chọn', 'Memory elements and selectors'],
}
const COPY = {
  vi: { title: 'Từ bài báo đến phòng học', lead: '10 nghiên cứu gốc. Ba lĩnh vực. Một cách học: đọc bằng chứng, tự thao tác và giải thích điều quan sát được.', back: 'Các chủ đề trực quan',
    semiconductor: 'Chip và bán dẫn', agriculture: 'Nông nghiệp', physical_chemistry: 'Hóa lý',
    semiconductorLead: 'Bắt đầu từ hình học thiết bị, tìm hiểu cổng và tiếp điểm, rồi nối sang mạch logic và trạng thái nhớ.',
    agricultureLead: 'Phân biệt bố trí thí nghiệm, quan sát trên ruộng và kết luận có thể rút ra từ số liệu.',
    physical_chemistryLead: 'Phân biệt vận chuyển, phản ứng và cấu trúc bề mặt bằng các mô hình khái niệm có giới hạn rõ ràng.',
    path: ['Câu hỏi nghiên cứu', 'Đọc phương pháp và bằng chứng', 'Dự đoán → thao tác 2D/3D', 'Đối chiếu và tự kiểm tra'],
    original: 'Bài báo gốc', open: 'Vào bài học', english: 'Bài báo và bài học gốc bằng tiếng Anh', questions: 'câu hỏi có giải thích',
    note: 'Các mô hình dùng để học cơ chế, không tự tái hiện kết quả thực nghiệm. Mỗi bài tách rõ kết luận từ nguồn, ví dụ minh họa và giới hạn của mô hình.', explore: 'Thử mô hình chip trước',
  },
  en: { title: 'From paper to learning lab', lead: '10 original studies. Three fields. Read the evidence, experiment with a model and explain what you observe.', back: 'Visual topics',
    semiconductor: 'Chips and semiconductors', agriculture: 'Agriculture', physical_chemistry: 'Physical chemistry',
    semiconductorLead: 'Begin with device geometry, investigate gates and contacts, then connect devices to logic circuits and memory states.',
    agricultureLead: 'Distinguish the experimental design, field observations and conclusions supported by the measurements.',
    physical_chemistryLead: 'Separate transport, reaction and surface structure through conceptual models with explicit limits.',
    path: ['Research question', 'Methods and evidence', 'Predict → interact in 2D/3D', 'Compare and check understanding'],
    original: 'Original paper', open: 'Open learning lab', english: 'Original papers and lessons are in English', questions: 'questions with explanations',
    note: 'The models teach mechanisms; they do not automatically reproduce experimental results. Each lesson distinguishes source findings, illustrative examples and model limitations.', explore: 'Try the chip model first',
  },
}
export default function PaperStudyLibrary() {
  const { lang } = useT(), w = COPY[lang] || COPY.en
  useDocumentTitle(w.title)
  const domains = ['semiconductor', 'agriculture', 'physical_chemistry']
  const group = (domain) => papers.filter((p) => p.domain === domain || (domain === 'semiconductor' && p.domain === 'semiconductors'))
  return <div className="container page paper-study-library">
    <Link to="/learn" className="research-back">← {w.back}</Link>
    <header className="research-intro"><p className="research-kicker">CONCEPTLAB · PAPER2EXPLORER</p><h1>{w.title}</h1><p>{w.lead}</p><span className="research-language">{w.english}</span></header>
    <ol className="research-learning-path">{w.path.map((step) => <li key={step}>{step}</li>)}</ol>
    <nav className="research-domains" aria-label={w.title}>{domains.map((domain) => <a key={domain} href={`#research-${domain}`}>{w[domain]} <span>{group(domain).length}</span></a>)}</nav>
    {domains.map((domain) => <section className="research-domain" id={`research-${domain}`} key={domain}>
      <header><div><h2>{w[domain]}</h2><p>{w[`${domain}Lead`]}</p></div>{domain === 'semiconductor' ? <Link className="btn" to="/learn/3d?model=semiconductor_chip">{w.explore} →</Link> : null}</header>
      <div className="research-card-grid">{group(domain).map((paper, index) => <article className="research-paper-card" key={paper.id}>
        <Link to={`/s/${paper.share_code}`} tabIndex={-1} aria-hidden="true"><img src={`/paper-previews/${paper.share_code}.png`} alt="" width="640" height="360" loading="lazy" /></Link>
        <div className="research-card-copy"><p className="research-meta">{String(index + 1).padStart(2, '0')} · {paper.year} · 2D / 3D · {paper.questions.length} {w.questions}</p>
          <h3><Link to={`/s/${paper.share_code}`}>{TITLES[paper.share_code]?.[lang === 'vi' ? 0 : 1] || paper.title}</Link></h3>
          <p className="research-original-title" lang="en">{paper.title}</p>
          <div className="research-card-links"><Link to={`/s/${paper.share_code}`}>{w.open} →</Link><a href={paper.fulltext_url} target="_blank" rel="noreferrer">{w.original} ↗</a></div>
        </div>
      </article>)}</div>
    </section>)}
    <p className="research-scope">{w.note}</p>
  </div>
}
