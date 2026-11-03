import { Link } from 'react-router-dom'
import { useT } from '../../i18n/index.jsx'
import { useDocumentTitle } from '../public/hooks.js'
import './learn.css'

const copy = {
  vi: {
    title: 'Khám phá bằng trực quan',
    lead: 'Chọn một chủ đề, thay đổi góc nhìn hoặc dữ liệu và quan sát điều gì xảy ra. Mỗi bài tập trung vào ý tưởng cần học.',
    open: 'Mở bài học', three: 'Có mô hình 3D', steps: 'Từng bước',
    models: ['Nhiều lĩnh vực', 'Phòng khám phá 3D', 'Chọn mô hình theo môn, quan sát cấu tạo và thử các điều khiển có hướng dẫn.'],
    research: ['Đọc nghiên cứu', 'Từ bài báo đến phòng học', '10 bài về nông nghiệp, hóa lý và chip: đọc nguồn, khám phá mô hình rồi tự kiểm tra.'],
    geography: ['Địa lý', 'Ánh sáng và các mùa', 'Quan sát vị trí Mặt Trời, vĩ độ và ngày trong năm.'],
    chemistry: ['Hóa học', 'Hình dạng phân tử', 'So sánh nước, cacbon đioxit và metan trong không gian.'],
    vision: ['Thị giác máy tính', 'Ảnh, nhiễu và khuếch tán', 'Xem sự thay đổi từng bước của ảnh và tìm hiểu quá trình thêm nhiễu.'],
    algorithms: ['Tin học', 'Thuật toán cơ bản', 'Theo dõi từng phép so sánh và thay đổi dữ liệu trong thuật toán.'],
    structures: ['Tin học', 'Cấu trúc dữ liệu', 'Thêm và lấy phần tử, rồi duyệt cây theo từng bước.'],
    physics: ['Vật lý', 'Con lắc đơn', 'Thay đổi chiều dài dây để quan sát chu kỳ dao động.'],
    math: ['Toán', 'Hàm số bậc hai', 'Thay đổi hệ số và quan sát hình dạng đồ thị.'],
    biology: ['Sinh học', 'Hệ tuần hoàn', 'Khám phá tim và hai vòng tuần hoàn qua sơ đồ.'],
  },
  en: {
    title: 'Explore visually',
    lead: 'Choose a topic, change the viewpoint or data, and observe what happens. Each lesson focuses on an idea to understand.',
    open: 'Open lesson', three: '3D model', steps: 'Step by step',
    models: ['Across subjects', 'The 3D exploration room', 'Choose a model by subject, inspect its structure and try guided controls.'],
    research: ['Research reading', 'From paper to learning lab', '10 papers in agriculture, physical chemistry and chips: read the source, explore a model and check your understanding.'],
    geography: ['Geography', 'Sunlight and seasons', 'Observe the Sun’s position, latitude and day of the year.'],
    chemistry: ['Chemistry', 'Molecular shapes', 'Compare water, carbon dioxide and methane in space.'],
    vision: ['Computer vision', 'Images, noise and diffusion', 'See an image change step by step and explore how noise is added.'],
    algorithms: ['Computer science', 'Fundamental algorithms', 'Follow comparisons and changes to data one step at a time.'],
    structures: ['Computer science', 'Data structures', 'Add and remove elements, then traverse a tree one step at a time.'],
    physics: ['Physics', 'The simple pendulum', 'Change string length and observe the period.'],
    math: ['Mathematics', 'Quadratic functions', 'Change coefficients and observe the graph.'],
    biology: ['Biology', 'The circulatory system', 'Explore the heart and two circulation loops through a diagram.'],
  },
}
const lessons = [
  { id: 'models', to: '/learn/3d', kind: 'three' },
  { id: 'research', to: '/learn/research', kind: 'three' },
  { id: 'geography', to: '/learn/geography', kind: 'three' },
  { id: 'chemistry', to: '/learn/molecules', kind: 'three' },
  { id: 'vision', to: '/learn/vision', kind: 'three' },
  { id: 'algorithms', to: '/learn/algorithms', kind: 'steps' },
  { id: 'structures', to: '/learn/structures', kind: 'three' },
  { id: 'physics', to: '/s/TPEND6', kind: 'three' },
  { id: 'math', to: '/s/PARAB3', kind: 'steps' },
  { id: 'biology', to: '/s/HEART8', kind: 'three' },
]

export default function LearnPage() {
  const { lang } = useT()
  const w = copy[lang] || copy.vi
  useDocumentTitle(w.title)
  return <div className="container page learn-page">
    <h1>{w.title}</h1><p className="learn-intro">{w.lead}</p>
    <div className="learn-list">
      {lessons.map(({ id, to, kind }, i) => <article key={id} className="learn-item">
        <span className="learn-number" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
        <div><p className="learn-subject">{w[id][0]} · {w[kind]}</p><h2>{w[id][1]}</h2><p>{w[id][2]}</p></div>
        <Link to={to} className="btn btn-ghost">{w.open}<span className="visually-hidden">: {w[id][1]}</span></Link>
      </article>)}
    </div>
  </div>
}
