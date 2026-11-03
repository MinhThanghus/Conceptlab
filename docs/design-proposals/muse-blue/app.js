"use strict";
/* ConceptLab blue prototype — in-memory only, no network, no storage of user data. */

const UI = {
  vi: {
    skip:"Bỏ qua tới nội dung chính", protoBar:"Bản mẫu thiết kế để duyệt — dữ liệu là bài học mẫu, chưa kết nối hệ thống thật.", protoTag:"PROTOTYPE",
    brandSub:"Phòng thí nghiệm khái niệm", navLabel:"Điều hướng chính", navExplore:"Khám phá", navTopics:"Chủ đề", navLessons:"Bài học", navAbout:"Về bản mẫu", headerCta:"Bắt đầu khám phá",
    heroEyebrow:"Nền tảng học tập tương tác cho học sinh & giáo viên", heroTitle:"Hiểu sâu một khái niệm, bắt đầu từ một câu hỏi hay.",
    heroLead:"ConceptLab biến những ý tưởng trừu tượng trong khoa học, thuật toán và thể thao thành các bài học ngắn, trực quan và có thể tự tay khám phá — từng bước một, bằng tiếng Việt hoặc tiếng Anh.",
    heroPrimary:"Xem các bài học mẫu", heroSecondary:"Duyệt theo chủ đề ↓",
    heroPoint1:"Mỗi bài học có mục tiêu, thí nghiệm tư duy và câu hỏi kiểm tra", heroPoint2:"Trực quan bằng hình vẽ và mô phỏng ngay trong trình duyệt", heroPoint3:"Song ngữ Việt — Anh, chuyển đổi tức thì không cần tải lại trang",
    heroMeta:"8 bài học mẫu · 7 lĩnh vực · Hoạt động hoàn toàn ngoại tuyến trong bản mẫu này",
    visualTitle:"conceptlab — tìm kiếm nhị phân", visualFound:"tìm 17 → đã thấy ✓", visualLeft:"trái — giữa", visualRight:"giữa — phải", visualPill1:"Thuật toán", visualPill2:"Mô phỏng từng bước", visualCaption:"Minh hoạ tĩnh — bấm vào bài học để xem chi tiết", chipA:"Con lắc · T = 2π√(l/g)", chipB:"H₂O · Liên kết cộng hoá trị",
    topicsTitle:"Bảy lĩnh vực, một cách học", topicsSub:"Chọn một lĩnh vực để lọc bài học bên dưới. Mỗi lĩnh vực dùng cùng một nhịp học: quan sát → dự đoán → kiểm chứng.", topicsBadge:"Lọc trực tiếp, không tải lại trang",
    lessonsTitle:"Bài học mẫu", lessonsSub:"Tất cả nội dung dưới đây là ví dụ minh hoạ cho bản mẫu thiết kế. Chưa có trích dẫn bài báo hay dữ liệu người dùng thật.",
    searchLabel:"Tìm kiếm bài học", searchPh:"Tìm theo tên bài, khái niệm, từ khoá…", emptyTitle:"Không tìm thấy bài học phù hợp", emptyText:"Thử từ khoá khác hoặc xoá bộ lọc lĩnh vực.", emptyBtn:"Đặt lại bộ lọc",
    aboutTitle:"Bản mẫu này cho thấy điều gì?", aboutLead:"Đây là đề xuất giao diện xanh dương độc lập cho ConceptLab, dùng để duyệt hướng thiết kế trước khi tích hợp. Không có máy chủ, không thu thập dữ liệu, không gọi API.",
    about1t:"Hệ màu mới:", about1:"Xanh navy sâu làm nền tin cậy, xanh dương trung tính cho hành động, trắng và xám xanh cho bề mặt đọc — thay hẳn vai trò của màu vàng cũ.",
    about2t:"Tương tác thật:", about2:"Chuyển VI/EN dịch toàn bộ giao diện và nội dung bài học, lọc theo lĩnh vực kết hợp tìm kiếm, và mở panel chi tiết có mục tiêu học tập.",
    about3t:"Truy cập được:", about3:"Điều hướng bằng bàn phím, vòng focus rõ, nút tối thiểu 44px, tôn trọng giảm chuyển động và hiển thị tốt ở 320px.",
    principlesTitle:"Nguyên tắc thiết kế", p1t:"Rõ trước, đẹp sau", p1:"Thứ bậc chữ và khoảng trắng dẫn mắt; màu chỉ nhấn nơi cần hành động.", p2t:"Một nhịp học lặp lại", p2:"Quan sát → Dự đoán → Kiểm chứng xuất hiện nhất quán ở mọi lĩnh vực.", p3t:"Trung thực về dữ liệu", p3:"Mọi số liệu đều là nhãn mô tả bản mẫu; không thống kê, trích dẫn hay tài khoản giả.",
    footerTag:"Bản mẫu giao diện xanh dương — để duyệt thiết kế", footerNote:"Mở trực tiếp file index.html trên máy để xem. Không cần cài đặt, không cần mạng.", footerSmall:"Nội dung bài học là ví dụ minh hoạ phục vụ việc học khái niệm.",
    sampleBadge:"Bài học mẫu", dlgObjectives:"Bạn sẽ học được gì", dlgConcepts:"Khái niệm cốt lõi", dlgSteps:"Khám phá từng bước", dlgCheckpoint:"✦ Tự kiểm tra", dlgClose:"Đóng chi tiết", dlgNote:"Bản mẫu: nút này chỉ đóng panel, không lưu tiến độ.",
    all:"Tất cả", viewLesson:"Xem chi tiết", minutes:"phút", results:(n,q)=> q? `${n} bài học cho “${q}”` : `${n} bài học`, levelBeginner:"Cơ bản", levelIntermediate:"Trung cấp",
    topics:{
      geography:{name:"Địa lý", desc:"Bản đồ, địa hình và cách đọc không gian quanh ta."},
      physics:{name:"Vật lý", desc:"Chuyển động, lực và năng lượng qua thí nghiệm tư duy."},
      chemistry:{name:"Hoá học", desc:"Nguyên tử, liên kết và phản ứng ở mức khái niệm."},
      biology:{name:"Sinh học", desc:"Tế bào, năng lượng sống và hệ sinh thái."},
      vision:{name:"Thị giác máy tính", desc:"Máy “nhìn” ảnh như thế nào — ở mức ý tưởng, không phải sản phẩm."},
      algorithms:{name:"Thuật toán", desc:"Tìm kiếm, sắp xếp và đồ thị qua từng bước trực quan."},
      sport:{name:"Thể thao & chuyển động", desc:"Dùng vật lý để hiểu kỹ thuật và quỹ đạo trong thể thao."}
    }
  },
  en: {
    skip:"Skip to main content", protoBar:"Design prototype for review — sample lessons only, not connected to a live system.", protoTag:"PROTOTYPE",
    brandSub:"Concept laboratory", navLabel:"Main navigation", navExplore:"Explore", navTopics:"Topics", navLessons:"Lessons", navAbout:"About this prototype", headerCta:"Start exploring",
    heroEyebrow:"An interactive learning platform for students & teachers", heroTitle:"Understand a concept deeply, starting from one good question.",
    heroLead:"ConceptLab turns abstract ideas in science, algorithms and sport into short, visual lessons you can explore hands-on — step by step, in Vietnamese or English.",
    heroPrimary:"Browse sample lessons", heroSecondary:"Browse by topic ↓",
    heroPoint1:"Every lesson has goals, a thought experiment and a checkpoint question", heroPoint2:"Explained with drawings and in-browser visualisations", heroPoint3:"Vietnamese — English bilingual, switching instantly with no reload",
    heroMeta:"8 sample lessons · 7 fields · Runs fully offline in this prototype",
    visualTitle:"conceptlab — binary search", visualFound:"target = 17 → found ✓", visualLeft:"left — middle", visualRight:"middle — right", visualPill1:"Algorithms", visualPill2:"Step-by-step simulation", visualCaption:"Static illustration — open a lesson for details", chipA:"Pendulum · T = 2π√(l/g)", chipB:"H₂O · Covalent bonds",
    topicsTitle:"Seven fields, one way of learning", topicsSub:"Pick a field to filter the lessons below. Every field follows the same rhythm: observe → predict → verify.", topicsBadge:"Filters instantly, no page reload",
    lessonsTitle:"Sample lessons", lessonsSub:"Everything below is illustrative content for this design prototype. No paper citations or real user data are included.",
    searchLabel:"Search lessons", searchPh:"Search by lesson title, concept, keyword…", emptyTitle:"No lessons match your search", emptyText:"Try a different keyword or clear the field filter.", emptyBtn:"Reset filters",
    aboutTitle:"What does this prototype show?", aboutLead:"This is a standalone blue interface proposal for ConceptLab, made to review a design direction before any integration. No server, no data collection, no API calls.",
    about1t:"A new colour system:", about1:"Deep navy for trust, a neutral blue for actions, and white with blue-grey reading surfaces — fully replacing the role of the old yellow.",
    about2t:"Real interactions:", about2:"The VI/EN toggle translates the whole interface and lesson content, field filters combine with search, and a detail panel shows learning goals.",
    about3t:"Accessible by default:", about3:"Keyboard navigation, visible focus rings, 44px minimum controls, reduced-motion support and a layout that holds up at 320px.",
    principlesTitle:"Design principles", p1t:"Clarity first, beauty second", p1:"Type hierarchy and whitespace guide the eye; colour only marks where to act.", p2t:"One repeated learning rhythm", p2:"Observe → Predict → Verify appears consistently across every field.", p3t:"Honest about data", p3:"Every number is a prototype label; no fake statistics, citations or accounts.",
    footerTag:"Blue interface prototype — for design review", footerNote:"Open the index.html file locally to view it. No install, no network needed.", footerSmall:"Lesson content is illustrative and made to support learning concepts.",
    sampleBadge:"Sample lesson", dlgObjectives:"What you will learn", dlgConcepts:"Core concepts", dlgSteps:"Explore step by step", dlgCheckpoint:"✦ Check yourself", dlgClose:"Close details", dlgNote:"Prototype: this button only closes the panel; nothing is saved.",
    all:"All", viewLesson:"View details", minutes:"min", results:(n,q)=> q? `${n} lesson(s) for “${q}”` : `${n} lesson(s)`, levelBeginner:"Beginner", levelIntermediate:"Intermediate",
    topics:{
      geography:{name:"Geography", desc:"Maps, terrain and how to read the space around us."},
      physics:{name:"Physics", desc:"Motion, forces and energy through thought experiments."},
      chemistry:{name:"Chemistry", desc:"Atoms, bonds and reactions at the concept level."},
      biology:{name:"Biology", desc:"Cells, living energy and ecosystems."},
      vision:{name:"Computer vision", desc:"How machines “see” images — as an idea, not a product."},
      algorithms:{name:"Algorithms", desc:"Searching, sorting and graphs, one visual step at a time."},
      sport:{name:"Sport & movement", desc:"Using physics to understand technique and trajectories in sport."}
    }
  }
};

const TOPICS = [
  {id:"geography", icon:"◎", bg:"#E0F2FE", fg:"#0369A1"},
  {id:"physics", icon:"◐", bg:"#DBEAFE", fg:"#1D4ED8"},
  {id:"chemistry", icon:"⬢", bg:"#E0E7FF", fg:"#3730A3"},
  {id:"biology", icon:"✿", bg:"#DCFCE7", fg:"#15803D"},
  {id:"vision", icon:"▣", bg:"#E0F2FE", fg:"#0369A1"},
  {id:"algorithms", icon:"⧉", bg:"#DBEAFE", fg:"#1D4ED8"},
  {id:"sport", icon:"➤", bg:"#FEF3C7", fg:"#92400E"}
];

/* Code-drawn visuals (inline SVG strings) — no placeholder rectangles */
function visual(kind, large){
  const s = large ? "" : "";
  const art = {
    geography:`<svg viewBox="0 0 400 148" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="400" height="148" fill="#EFF6FF"/><path d="M0 110 C70 70 120 95 180 55 C240 20 310 45 400 25 L400 148 L0 148Z" fill="#BFDBFE"/><path d="M0 122 C80 88 150 105 220 70 C280 42 340 58 400 42 L400 148 L0 148Z" fill="#93C5FD"/><g fill="none" stroke="#2563EB" stroke-width="1.6" opacity=".65"><path d="M60 92 C110 60 170 70 210 40"/><path d="M45 105 C105 70 180 82 235 48"/><path d="M80 78 C120 52 165 58 195 34"/></g><circle cx="292" cy="52" r="14" fill="#FDE68A" stroke="#F59E0B" stroke-width="2"/><path d="M292 28v-8M292 84v-8M268 52h-8M324 52h-8" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/><text x="20" y="26" font-size="11" fill="#1E40AF" font-weight="700">▲ 1 240 m</text></svg>`,
    physics:`<svg viewBox="0 0 400 148" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="400" height="148" fill="#EFF6FF"/><line x1="200" y1="12" x2="200" y2="30" stroke="#0F2A52" stroke-width="4"/><rect x="150" y="8" width="100" height="10" rx="4" fill="#0F2A52"/><line x1="200" y1="18" x2="148" y2="96" stroke="#2563EB" stroke-width="2.5"/><circle cx="148" cy="102" r="13" fill="#2563EB"/><line x1="200" y1="18" x2="252" y2="96" stroke="#93C5FD" stroke-width="2" stroke-dasharray="5 4"/><circle cx="252" cy="102" r="13" fill="#BFDBFE" stroke="#2563EB" stroke-width="1.6"/><path d="M160 118 A62 62 0 0 0 240 118" fill="none" stroke="#0F2A52" stroke-width="1.6" stroke-dasharray="4 3"/><text x="200" y="140" text-anchor="middle" font-size="11" fill="#334155" font-weight="600">T = 2π √(l / g)</text></svg>`,
    chemistry:`<svg viewBox="0 0 400 148" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="400" height="148" fill="#EEF2FF"/><g stroke="#334155" stroke-width="2.4"><line x1="200" y1="74" x2="148" y2="48"/><line x1="200" y1="74" x2="252" y2="48"/><line x1="200" y1="74" x2="200" y2="118"/></g><circle cx="200" cy="74" r="20" fill="#2563EB"/><text x="200" y="79" text-anchor="middle" fill="#fff" font-size="13" font-weight="800">O</text><circle cx="140" cy="42" r="13" fill="#fff" stroke="#334155" stroke-width="1.6"/><text x="140" y="47" text-anchor="middle" font-size="11" font-weight="700" fill="#0F2440">H</text><circle cx="260" cy="42" r="13" fill="#fff" stroke="#334155" stroke-width="1.6"/><text x="260" y="47" text-anchor="middle" font-size="11" font-weight="700" fill="#0F2440">H</text><circle cx="200" cy="126" r="9" fill="#38BDF8"/><text x="322" y="34" font-size="11" fill="#3730A3" font-weight="700">H₂O</text><text x="56" y="128" font-size="11" fill="#475569">104.5°</text></svg>`,
    biology:`<svg viewBox="0 0 400 148" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="400" height="148" fill="#F0FDF4"/><path d="M200 132 C200 90 200 60 200 28" stroke="#15803D" stroke-width="3" fill="none"/><path d="M200 84 C160 84 138 62 134 34 C162 36 190 54 200 84Z" fill="#4ADE80"/><path d="M200 68 C240 68 262 46 266 18 C238 20 210 38 200 68Z" fill="#22C55E"/><circle cx="316" cy="34" r="13" fill="#FDE68A" stroke="#F59E0B" stroke-width="2"/><g font-size="10.5" fill="#166534" font-weight="600"><text x="28" y="34">CO₂ + H₂O</text><text x="28" y="122">→ C₆H₁₂O₆ + O₂</text></g><path d="M92 38 L150 66 M92 116 L150 94" stroke="#86EFAC" stroke-width="1.6" stroke-dasharray="4 3"/></svg>`,
    vision:`<svg viewBox="0 0 400 148" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="400" height="148" fill="#F0F9FF"/><g fill="#E0F2FE" stroke="#BAE6FD"><rect x="52" y="22" width="28" height="28"/><rect x="80" y="22" width="28" height="28"/><rect x="108" y="22" width="28" height="28"/><rect x="52" y="50" width="28" height="28"/><rect x="80" y="50" width="28" height="28" fill="#38BDF8"/><rect x="108" y="50" width="28" height="28" fill="#0369A1"/><rect x="52" y="78" width="28" height="28"/><rect x="80" y="78" width="28" height="28"/><rect x="108" y="78" width="28" height="28" fill="#7DD3FC"/></g><text x="94" y="128" text-anchor="middle" font-size="10.5" fill="#475569">pixels → numbers</text><path d="M150 64 H196" stroke="#0F2A52" stroke-width="2"/><path d="M188 56 L198 64 L188 72" fill="none" stroke="#0F2A52" stroke-width="2"/><g fill="none" stroke="#0F2A52" stroke-width="2"><rect x="212" y="30" width="62" height="62" rx="8" stroke="#2563EB"/><circle cx="243" cy="61" r="16" stroke="#2563EB"/></g><text x="243" y="112" text-anchor="middle" font-size="10.5" fill="#1D4ED8" font-weight="700">edge?</text><g font-family="ui-monospace,monospace" font-size="10" fill="#64748B"><text x="306" y="44">0 0 1 0</text><text x="306" y="62">0 1 1 0</text><text x="306" y="80">0 0 1 0</text></g></svg>`,
    algorithms:`<svg viewBox="0 0 400 148" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="400" height="148" fill="#EFF6FF"/><g><rect x="48" y="86" width="34" height="42" rx="6" fill="#BFDBFE"/><rect x="92" y="64" width="34" height="64" rx="6" fill="#93C5FD"/><rect x="136" y="38" width="34" height="90" rx="6" fill="#2563EB"/><rect x="180" y="74" width="34" height="54" rx="6" fill="#BFDBFE"/><rect x="224" y="52" width="34" height="76" rx="6" fill="#93C5FD"/><rect x="268" y="28" width="34" height="100" rx="6" fill="#DBEAFE"/></g><path d="M58 44 H292" stroke="#0F2A52" stroke-width="1.6" stroke-dasharray="5 4"/><text x="170" y="34" text-anchor="middle" font-size="11" fill="#0F2A52" font-weight="700">mid</text><g font-size="10.5" fill="#475569" text-anchor="middle"><text x="65" y="142">lo</text><text x="153" y="142">mid</text><text x="285" y="142">hi</text></g><circle cx="153" cy="38" r="5" fill="#fff" stroke="#2563EB" stroke-width="2.4"/></svg>`,
    graph:`<svg viewBox="0 0 400 148" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="400" height="148" fill="#EFF6FF"/><g stroke="#93C5FD" stroke-width="2"><line x1="90" y1="74" x2="160" y2="36"/><line x1="90" y1="74" x2="160" y2="112"/><line x1="160" y1="36" x2="238" y2="74"/><line x1="160" y1="112" x2="238" y2="74"/><line x1="238" y1="74" x2="312" y2="40"/><line x1="238" y1="74" x2="312" y2="110"/></g><g text-anchor="middle" font-size="11" font-weight="800"><circle cx="90" cy="74" r="16" fill="#2563EB"/><text x="90" y="78" fill="#fff">A</text><circle cx="160" cy="36" r="15" fill="#fff" stroke="#2563EB" stroke-width="2"/><text x="160" y="40" fill="#1D4ED8">B</text><circle cx="160" cy="112" r="15" fill="#fff" stroke="#2563EB" stroke-width="2"/><text x="160" y="116" fill="#1D4ED8">C</text><circle cx="238" cy="74" r="15" fill="#DBEAFE" stroke="#2563EB" stroke-width="2"/><text x="238" y="78" fill="#1D4ED8">D</text><circle cx="312" cy="40" r="14" fill="#fff" stroke="#94A3B8" stroke-width="1.6"/><text x="312" y="44" fill="#475569">E</text><circle cx="312" cy="110" r="14" fill="#fff" stroke="#94A3B8" stroke-width="1.6"/><text x="312" y="114" fill="#475569">F</text></g><text x="200" y="140" text-anchor="middle" font-size="10.5" fill="#475569">BFS: A → B, C → D → E, F</text></svg>`,
    sport:`<svg viewBox="0 0 400 148" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="400" height="148" fill="#FFFBEB"/><line x1="20" y1="122" x2="380" y2="122" stroke="#92400E" stroke-width="2"/><path d="M52 118 C140 18 260 18 338 104" fill="none" stroke="#2563EB" stroke-width="2.6" stroke-dasharray="7 5"/><circle cx="52" cy="118" r="7" fill="#0F2A52"/><circle cx="196" cy="52" r="7" fill="#2563EB"/><circle cx="338" cy="104" r="7" fill="#fff" stroke="#2563EB" stroke-width="2.4"/><path d="M52 118 L110 78" stroke="#F59E0B" stroke-width="2"/><text x="76" y="70" font-size="11" fill="#92400E" font-weight="700">v₀ · 45°</text><text x="196" y="34" text-anchor="middle" font-size="10.5" fill="#475569">điểm cao nhất</text><text x="330" y="140" font-size="10.5" fill="#475569">điểm rơi</text></svg>`
  };
  return art[kind] || art.algorithms;
}

const LESSONS = [
  {id:"contour", cat:"geography", visual:"geography", level:"beginner", mins:12,
   title:{vi:"Đường đồng mức kể chuyện địa hình", en:"How contour lines tell the story of terrain"},
   desc:{vi:"Đọc bản đồ địa hình như đọc một câu chuyện: nơi nào dốc, nơi nào là thung lũng, và đường đi nào ít tốn sức nhất.", en:"Read a topographic map like a story: where it is steep, where valleys lie, and which route takes the least effort."},
   tags:{vi:["bản đồ","địa hình","độ cao"], en:["maps","terrain","elevation"]},
   objectives:{vi:["Giải thích được đường đồng mức là gì","Nhận biết sườn dốc và thung lũng trên bản đồ","Đề xuất một tuyến đường đi hợp lý và nêu lý do"], en:["Explain what a contour line is","Identify steep slopes and valleys on a map","Propose a sensible walking route and justify it"]},
   concepts:{vi:["Đường đồng mức","Khoảng cao đều","Sườn dốc / thoải"], en:["Contour line","Contour interval","Steep vs gentle slope"]},
   steps:{vi:["Quan sát cụm đường đồng mức dày và thưa trên bản đồ mẫu.","Dự đoán: cụm nào dốc hơn? Vì sao?","Kiểm chứng bằng mặt cắt dọc theo tuyến A–B.","Vẽ tuyến đường của bạn và thuyết minh lựa chọn."], en:["Observe dense and sparse contour clusters on the sample map.","Predict: which cluster is steeper? Why?","Verify with an elevation profile along line A–B.","Draw your route and explain your choice."]},
   checkpoint:{vi:"Hai cụm đường đồng mức cách nhau đều nhau nhưng một cụm dày đặc hơn. Cụm nào dốc hơn, và bạn suy ra điều đó như thế nào?", en:"Two contour clusters have the same interval but one is much denser. Which slope is steeper, and how do you know?"}},
  {id:"pendulum", cat:"physics", visual:"physics", level:"beginner", mins:15,
   title:{vi:"Con lắc và chu kỳ dao động", en:"The pendulum and its period"},
   desc:{vi:"Vì sao con lắc dài đu chậm hơn? Khám phá chu kỳ qua việc thay đổi chiều dài dây và kiểm chứng công thức T = 2π√(l/g).", en:"Why does a longer pendulum swing more slowly? Explore the period by changing string length and testing T = 2π√(l/g)."},
   tags:{vi:["dao động","chu kỳ","trọng lực"], en:["oscillation","period","gravity"]},
   objectives:{vi:["Đo chu kỳ bằng cách đếm nhiều dao động","Chỉ ra yếu tố nào ảnh hưởng tới chu kỳ","Giải thích vì sao khối lượng quả nặng (gần như) không đổi chu kỳ"], en:["Measure a period by timing many swings","Identify which factors affect the period","Explain why the bob's mass (almost) does not change the period"]},
   concepts:{vi:["Chu kỳ T","Chiều dài dây l","Gia tốc trọng trường g"], en:["Period T","String length l","Gravitational acceleration g"]},
   steps:{vi:["Dự đoán chu kỳ khi tăng gấp đôi chiều dài dây.","Mô phỏng/đo với ba chiều dài khác nhau, mỗi lần 10 dao động.","Vẽ đồ thị T theo √l và nhận xét dạng đường.","Đối chiếu với công thức và nêu giới hạn của mô hình."], en:["Predict the period when the string length doubles.","Simulate/measure three lengths, timing 10 swings each.","Plot T against √l and describe the shape.","Compare with the formula and state the model's limits."]},
   checkpoint:{vi:"Nếu tăng chiều dài dây lên 4 lần, chu kỳ thay đổi như thế nào? Giải thích bằng công thức, không chỉ bằng trực giác.", en:"If the string length increases fourfold, how does the period change? Explain using the formula, not just intuition."}},
  {id:"balance", cat:"chemistry", visual:"chemistry", level:"beginner", mins:14,
   title:{vi:"Cân bằng phương trình hoá học", en:"Balancing chemical equations"},
   desc:{vi:"Phản ứng không tạo ra hay làm mất nguyên tử — học cách “kế toán nguyên tử” để cân bằng phương trình một cách có hệ thống.", en:"Reactions never create or destroy atoms — learn to “account for atoms” and balance equations systematically."},
   tags:{vi:["phản ứng","nguyên tử","bảo toàn"], en:["reactions","atoms","conservation"]},
   objectives:{vi:["Phát biểu định luật bảo toàn khối lượng bằng lời của mình","Cân bằng phương trình đơn giản theo từng bước","Phân biệt hệ số và chỉ số trong công thức"], en:["State conservation of mass in your own words","Balance simple equations step by step","Distinguish coefficients from subscripts"]},
   concepts:{vi:["Bảo toàn nguyên tử","Hệ số","Chỉ số"], en:["Atom conservation","Coefficient","Subscript"]},
   steps:{vi:["Liệt kê số nguyên tử mỗi nguyên tố ở hai vế.","Bắt đầu từ nguyên tố xuất hiện ít nhất.","Điều chỉnh hệ số, kiểm tra lại toàn bộ sau mỗi lần.","Thử thách: cân bằng phản ứng đốt cháy metan."], en:["Count atoms of each element on both sides.","Start with the element that appears least often.","Adjust coefficients, rechecking everything each time.","Challenge: balance the combustion of methane."]},
   checkpoint:{vi:"Vì sao ta không được thay đổi chỉ số (ví dụ H₂O thành H₂O₂) để cân bằng phương trình?", en:"Why must we never change a subscript (e.g. H₂O into H₂O₂) to balance an equation?"}},
  {id:"photo", cat:"biology", visual:"biology", level:"intermediate", mins:16,
   title:{vi:"Quang hợp: dòng năng lượng trong lá", en:"Photosynthesis: energy flow in a leaf"},
   desc:{vi:"Đi theo hành trình của một “gói” ánh sáng: từ mặt trời vào lá, thành đường, rồi nuôi cả hệ sinh thái.", en:"Follow one “packet” of sunlight: from the sun into a leaf, into sugar, then feeding a whole ecosystem."},
   tags:{vi:["quang hợp","năng lượng","lục lạp"], en:["photosynthesis","energy","chloroplast"]},
   objectives:{vi:["Viết và giải thích phương trình quang hợp","Phân biệt nguyên liệu và sản phẩm","Liên hệ quang hợp với chuỗi thức ăn"], en:["Write and explain the photosynthesis equation","Distinguish inputs from products","Connect photosynthesis to food chains"]},
   concepts:{vi:["Lục lạp","Glucose","Chuỗi thức ăn"], en:["Chloroplast","Glucose","Food chain"]},
   steps:{vi:["Quan sát sơ đồ lá và đánh dấu nơi ánh sáng đi vào.","Dự đoán điều gì xảy ra khi che một phần lá vài ngày.","Kiểm chứng qua thí nghiệm tư duy với lá có đốm trắng.","Vẽ dòng năng lượng từ mặt trời tới một động vật ăn cỏ."], en:["Study the leaf diagram and mark where light enters.","Predict what happens if part of a leaf is covered for days.","Verify with a thought experiment on a variegated leaf.","Draw the energy flow from sunlight to a herbivore."]},
   checkpoint:{vi:"Một cây trồng trong phòng kín không có ánh sáng nhưng được tưới đầy đủ vẫn héo dần. Quang hợp giúp bạn giải thích điều này như thế nào?", en:"A well-watered plant in a dark closed room still withers. How does photosynthesis explain this?"}},
  {id:"edges", cat:"vision", visual:"vision", level:"intermediate", mins:18,
   title:{vi:"Máy “nhìn” thấy cạnh như thế nào?", en:"How do machines “see” edges?"},
   desc:{vi:"Ảnh với máy tính chỉ là lưới số. Học ý tưởng phát hiện cạnh bằng cách so sánh độ sáng của các pixel kề nhau — thuần túy để hiểu khái niệm.", en:"To a computer an image is just a grid of numbers. Learn the idea of edge detection by comparing neighbouring pixel brightness — purely to understand the concept."},
   tags:{vi:["pixel","cạnh","độ sáng"], en:["pixels","edges","brightness"]},
   objectives:{vi:["Mô tả ảnh số dưới dạng lưới giá trị độ sáng","Tính hiệu độ sáng giữa các pixel kề nhau","Giải thích vì sao cạnh giúp máy nhận ra hình dạng"], en:["Describe a digital image as a grid of brightness values","Compute brightness differences between neighbours","Explain why edges help machines recognise shapes"]},
   concepts:{vi:["Pixel","Độ sáng (grayscale)","Đạo hàm rời rạc / hiệu số"], en:["Pixel","Brightness (grayscale)","Discrete difference"]},
   steps:{vi:["Nhìn một ảnh 6×6 được viết thành bảng số.","Tính hiệu ngang giữa từng cặp pixel liên tiếp.","Đánh dấu nơi hiệu số lớn — đó là ứng viên “cạnh”.","Thảo luận: khi nào cách này bị nhầm (bóng, nhiễu)?"], en:["Look at a 6×6 image written as a table of numbers.","Compute horizontal differences between neighbours.","Mark large differences — these are “edge” candidates.","Discuss: when does this fail (shadows, noise)?"]},
   checkpoint:{vi:"Một vùng ảnh có độ sáng tăng dần đều từ 10 tới 60. Theo cách tính hiệu số, vùng này có chứa cạnh sắc nét không? Vì sao?", en:"A region's brightness rises evenly from 10 to 60. Using differences, does it contain a sharp edge? Why?"}},
  {id:"binsearch", cat:"algorithms", visual:"algorithms", level:"beginner", mins:13,
   title:{vi:"Tìm kiếm nhị phân: chia đôi để tìm nhanh", en:"Binary search: halve to find faster"},
   desc:{vi:"Tìm một số trong danh sách đã sắp xếp bằng cách loại bỏ một nửa sau mỗi lần đoán — và hiểu vì sao nó nhanh hơn hẳn tìm tuần tự.", en:"Find a number in a sorted list by discarding half after every guess — and see why it beats linear search by so much."},
   tags:{vi:["tìm kiếm","chia để trị","độ phức tạp"], en:["searching","divide & conquer","complexity"]},
   objectives:{vi:["Thực hiện tìm kiếm nhị phân bằng tay trên danh sách mẫu","Giải thích điều kiện “đã sắp xếp” vì sao bắt buộc","So sánh số bước với tìm kiếm tuần tự"], en:["Run binary search by hand on a sample list","Explain why the “sorted” precondition is required","Compare step counts with linear search"]},
   concepts:{vi:["lo / mid / hi","Bất biến vòng lặp","O(log n)"], en:["lo / mid / hi","Loop invariant","O(log n)"]},
   steps:{vi:["Quan sát danh sách 9 số đã sắp xếp, mục tiêu 17.","Chọn phần tử giữa, so sánh, loại bỏ một nửa.","Lặp lại và đếm số bước cho tới khi tìm thấy.","Thử danh sách 1.000 phần tử: tối đa bao nhiêu bước?"], en:["Observe a sorted list of 9 numbers, target 17.","Pick the middle, compare, discard one half.","Repeat and count steps until found.","Try 1,000 elements: what is the maximum step count?"]},
   checkpoint:{vi:"Danh sách chưa sắp xếp có dùng được tìm kiếm nhị phân không? Cho một ví dụ cụ thể khiến nó thất bại.", en:"Can binary search run on an unsorted list? Give a concrete example where it fails."}},
  {id:"bfs", cat:"algorithms", visual:"graph", level:"intermediate", mins:17,
   title:{vi:"Duyệt đồ thị theo chiều rộng (BFS)", en:"Breadth-first search on graphs (BFS)"},
   desc:{vi:"Từ một đỉnh, khám phá các đỉnh kề trước, xa sau — như gợn sóng lan trên mặt nước. Nền tảng cho bài toán đường đi ngắn nhất không trọng số.", en:"From one vertex, visit neighbours before going further — like ripples on water. The foundation for unweighted shortest paths."},
   tags:{vi:["đồ thị","hàng đợi","đường ngắn nhất"], en:["graphs","queue","shortest path"]},
   objectives:{vi:["Mô phỏng BFS bằng hàng đợi trên đồ thị mẫu","Giải thích vai trò của tập “đã thăm”","Nêu một bài toán thực tế dùng BFS"], en:["Simulate BFS with a queue on a sample graph","Explain the role of the “visited” set","Name a real problem that uses BFS"]},
   concepts:{vi:["Đỉnh & cạnh","Hàng đợi (queue)","Lớp theo khoảng cách"], en:["Vertex & edge","Queue","Distance layers"]},
   steps:{vi:["Bắt đầu tại A, đưa các đỉnh kề vào hàng đợi.","Lấy ra từng đỉnh, đánh dấu đã thăm, thêm đỉnh kề mới.","Ghi lại lớp của mỗi đỉnh theo khoảng cách từ A.","Đối chiếu thứ tự thăm với duyệt theo chiều sâu (DFS)."], en:["Start at A and enqueue its neighbours.","Dequeue each vertex, mark visited, add new neighbours.","Record each vertex's layer by distance from A.","Contrast the visit order with depth-first search (DFS)."]},
   checkpoint:{vi:"Nếu quên tập “đã thăm”, BFS trên đồ thị có chu trình sẽ gặp vấn đề gì?", en:"If you forget the “visited” set, what goes wrong with BFS on a graph with cycles?"}},
  {id:"projectile", cat:"sport", visual:"sport", level:"intermediate", mins:15,
   title:{vi:"Chuyển động ném xiên trong thể thao", en:"Projectile motion in sport"},
   desc:{vi:"Bóng rổ, bóng đá, ném lao dùng chung một vật lý: tách chuyển động thành hai thành phần độc lập để dự đoán quỹ đạo và điểm rơi.", en:"Basketball, football and javelin share one physics: split motion into two independent components to predict trajectory and landing point."},
   tags:{vi:["quỹ đạo","ném xiên","trọng lực"], en:["trajectory","projectile","gravity"]},
   objectives:{vi:["Tách vận tốc ban đầu thành hai thành phần","Giải thích vì sao thời gian bay chỉ do thành phần đứng quyết định","Dự đoán góc ném cho tầm xa lớn nhất (lý tưởng)"], en:["Split initial velocity into two components","Explain why flight time depends only on the vertical component","Predict the launch angle for maximum ideal range"]},
   concepts:{vi:["Thành phần ngang / đứng","Tầm xa","Góc ném 45° (lý tưởng)"], en:["Horizontal / vertical components","Range","45° launch (ideal)"]},
   steps:{vi:["Quan sát quỹ đạo parabol của một quả bóng mẫu.","Tách v₀ thành v₀x và v₀y tại các góc 30°, 45°, 60°.","So sánh tầm xa dự đoán và thảo luận vai trò của sức cản không khí.","Áp dụng: chọn góc ném cho một tình huống thể thao cụ thể."], en:["Observe the parabolic trajectory of a sample ball.","Split v₀ into v₀x and v₀y at 30°, 45° and 60°.","Compare predicted ranges and discuss air resistance.","Apply: choose a launch angle for a specific sport situation."]},
   checkpoint:{vi:"Hai quả bóng được ném cùng tốc độ, góc 30° và 60°. Trong mô hình lý tưởng, tầm xa của chúng quan hệ thế nào? Vì sao thực tế có thể khác?", en:"Two balls are launched at the same speed, at 30° and 60°. In the ideal model how do their ranges compare? Why might reality differ?"}}
];

let lang = "vi";
let activeFilter = "all";
let query = "";
let lastFocused = null;

const $ = s => document.querySelector(s);
const grid = $("#lessonGrid"), topicGrid = $("#topicGrid"), filterGroup = $("#filterGroup");
const searchInput = $("#searchInput"), emptyState = $("#emptyState"), resultCount = $("#resultCount");
const dialog = $("#detailDialog");

function t(){ return UI[lang]; }
function normalize(str){ return (str||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d"); }
function levelLabel(l){ return l==="beginner" ? t().levelBeginner : t().levelIntermediate; }
function countFor(cat){ return LESSONS.filter(l=>l.cat===cat).length; }

function applyUI(){
  document.documentElement.lang = lang;
  document.title = lang==="vi" ? "ConceptLab — Khám phá khoa học tương tác" : "ConceptLab — Interactive science exploration";
  document.querySelectorAll("[data-i18n]").forEach(el=>{
    const key = el.getAttribute("data-i18n");
    if(t()[key] != null) el.innerHTML = t()[key];
  });
  document.querySelectorAll("[data-i18n-ph]").forEach(el=>{
    const key = el.getAttribute("data-i18n-ph");
    if(t()[key] != null) el.placeholder = t()[key];
  });
  $("#btn-vi").classList.toggle("is-active", lang==="vi");
  $("#btn-en").classList.toggle("is-active", lang==="en");
  $("#btn-vi").setAttribute("aria-pressed", String(lang==="vi"));
  $("#btn-en").setAttribute("aria-pressed", String(lang==="en"));
  renderTopics(); renderFilters(); renderLessons();
}

function renderTopics(){
  topicGrid.innerHTML = TOPICS.map(topic=>{
    const info = t().topics[topic.id];
    const active = activeFilter===topic.id;
    return `<button type="button" role="listitem" class="topic-card ${active?"is-active":""}" data-topic="${topic.id}" aria-pressed="${active}">
      <span class="topic-icon" style="background:${topic.bg};color:${topic.fg}" aria-hidden="true">${topic.icon}</span>
      <span><h3>${info.name}</h3><p>${info.desc}</p></span>
      <span class="topic-count" aria-label="${countFor(topic.id)}">${countFor(topic.id)}</span>
    </button>`;
  }).join("");
  topicGrid.querySelectorAll("[data-topic]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      activeFilter = activeFilter===btn.dataset.topic ? "all" : btn.dataset.topic;
      renderTopics(); renderFilters(); renderLessons();
      document.getElementById("lessons").scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto":"smooth", block:"start"});
    });
  });
}

function renderFilters(){
  const cats = ["all", ...TOPICS.map(x=>x.id)];
  filterGroup.innerHTML = cats.map(id=>{
    const label = id==="all" ? t().all : t().topics[id].name;
    return `<button type="button" class="filter-btn ${activeFilter===id?"is-active":""}" data-filter="${id}" aria-pressed="${activeFilter===id}">${label}</button>`;
  }).join("");
  filterGroup.querySelectorAll("[data-filter]").forEach(btn=>{
    btn.addEventListener("click", ()=>{ activeFilter = btn.dataset.filter; renderTopics(); renderFilters(); renderLessons(); });
  });
}

function filteredLessons(){
  const q = normalize(query.trim());
  return LESSONS.filter(lesson=>{
    if(activeFilter!=="all" && lesson.cat!==activeFilter) return false;
    if(!q) return true;
    const hay = normalize([
      lesson.title.vi, lesson.title.en, lesson.desc.vi, lesson.desc.en,
      ...(lesson.tags.vi||[]), ...(lesson.tags.en||[]),
      t().topics[lesson.cat].name, UI.vi.topics[lesson.cat].name, UI.en.topics[lesson.cat].name
    ].join(" "));
    return q.split(/\s+/).every(word=> hay.includes(word));
  });
}

function renderLessons(){
  const list = filteredLessons();
  const q = query.trim();
  resultCount.textContent = t().results(list.length, q);
  emptyState.hidden = list.length!==0;
  grid.hidden = list.length===0;
  grid.innerHTML = list.map(lesson=>{
    const cat = t().topics[lesson.cat];
    return `<article class="lesson-card">
      <div class="card-visual">${visual(lesson.visual)}</div>
      <div class="card-body">
        <div class="card-top"><span class="pill pill-blue">${cat.name}</span><span class="pill pill-sample">${t().sampleBadge}</span><span class="level">${levelLabel(lesson.level)}</span></div>
        <h3>${lesson.title[lang]}</h3>
        <p>${lesson.desc[lang]}</p>
        <div class="tag-row">${lesson.tags[lang].map(tag=>`<span class="tag">${tag}</span>`).join("")}</div>
        <div class="card-foot"><span class="duration">⏱ ${lesson.mins} ${t().minutes}</span><button type="button" class="btn btn-primary" data-open="${lesson.id}">${t().viewLesson}</button></div>
      </div>
    </article>`;
  }).join("");
  grid.querySelectorAll("[data-open]").forEach(btn=>{
    btn.addEventListener("click", ()=> openDetail(btn.dataset.open, btn));
  });
}

function openDetail(id, trigger){
  const lesson = LESSONS.find(l=>l.id===id);
  if(!lesson) return;
  lastFocused = trigger || document.activeElement;
  $("#dialogVisual").innerHTML = visual(lesson.visual, true);
  $("#dialogCategory").textContent = t().topics[lesson.cat].name;
  $("#dialogMeta").textContent = `${levelLabel(lesson.level)} · ${lesson.mins} ${t().minutes}`;
  $("#dialogTitle").textContent = lesson.title[lang];
  $("#dialogDesc").textContent = lesson.desc[lang];
  $("#dialogObjectives").innerHTML = lesson.objectives[lang].map(x=>`<li>${x}</li>`).join("");
  $("#dialogConcepts").innerHTML = lesson.concepts[lang].map(x=>`<span class="tag">${x}</span>`).join("");
  $("#dialogSteps").innerHTML = lesson.steps[lang].map(x=>`<li>${x}</li>`).join("");
  $("#dialogCheckpoint").textContent = lesson.checkpoint[lang];
  if(typeof dialog.showModal==="function"){ if(!dialog.open) dialog.showModal(); }
  else { dialog.setAttribute("open",""); }
  $("#dialogCloseBtn").focus();
}
function closeDetail(){
  if(dialog.open) dialog.close(); else dialog.removeAttribute("open");
  if(lastFocused) lastFocused.focus();
}

/* events */
$("#btn-vi").addEventListener("click", ()=>{ lang="vi"; applyUI(); });
$("#btn-en").addEventListener("click", ()=>{ lang="en"; applyUI(); });
searchInput.addEventListener("input", e=>{
  query = e.target.value;
  $("#clearSearch").hidden = !query;
  renderLessons();
});
$("#clearSearch").addEventListener("click", ()=>{ query=""; searchInput.value=""; $("#clearSearch").hidden=true; renderLessons(); searchInput.focus(); });
$("#resetFilters").addEventListener("click", ()=>{ activeFilter="all"; query=""; searchInput.value=""; $("#clearSearch").hidden=true; renderTopics(); renderFilters(); renderLessons(); });
$("#dialogCloseBtn").addEventListener("click", closeDetail);
$("#dialogX").addEventListener("click", closeDetail);
dialog.addEventListener("click", e=>{ if(e.target===dialog) closeDetail(); });
dialog.addEventListener("close", ()=>{ if(lastFocused) lastFocused.focus(); });

const navToggle = $("#navToggle"), mobileNav = $("#mobileNav");
navToggle.addEventListener("click", ()=>{
  const open = mobileNav.hidden;
  mobileNav.hidden = !open;
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.setAttribute("aria-label", open ? (lang==="vi"?"Đóng menu":"Close menu") : (lang==="vi"?"Mở menu":"Open menu"));
});
mobileNav.querySelectorAll("a").forEach(a=> a.addEventListener("click", ()=>{ mobileNav.hidden=true; navToggle.setAttribute("aria-expanded","false"); }));

/* nav active state on click */
document.querySelectorAll(".main-nav a, .mobile-nav a").forEach(a=>{
  a.addEventListener("click", ()=>{
    document.querySelectorAll(".main-nav a").forEach(x=>x.classList.remove("is-active"));
    const href=a.getAttribute("href");
    const match=document.querySelector(`.main-nav a[href="${href}"]`);
    if(match) match.classList.add("is-active");
  });
});

applyUI();
