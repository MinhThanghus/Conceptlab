"use strict";
/* ConceptLab green prototype — in-memory only, no network, no storage. */

const UI = {
  vi: {
    skip:"Bỏ qua tới nội dung chính", protoBar:"Bản mẫu thiết kế để duyệt — nội dung là bài học mẫu minh họa, chưa kết nối hệ thống thật.", protoTag:"BẢN MẪU",
    brandSub:"Phòng thí nghiệm khái niệm", navLabel:"Điều hướng chính", navExplore:"Khám phá", navSubjects:"Môn học", navLessons:"Bài học mẫu", navClass:"Mã lớp", navAbout:"Về bản mẫu", headerCta:"Xem bài học mẫu",
    heroKicker:"Đề xuất xanh lá · Học qua khám phá khái niệm", heroTitle:"Một khái niệm, nhìn rõ từ nhiều phía.",
    heroLead:"ConceptLab giúp học sinh đi từ quan sát tới hiểu sâu: tuần hoàn trong cơ thể, địa hình trên bản đồ, hiện tượng khoa học và cách thuật toán suy nghĩ — qua bài học ngắn, hình minh họa có chủ đích và câu hỏi tự kiểm tra.",
    heroPrimary:"Khám phá bài học mẫu", heroSecondary:"Chọn môn học trước",
    step1t:"Quan sát", step1:"Nhìn hình, nêu điều bạn thấy", step2t:"Dự đoán", step2:"Đoán trước khi xem kết quả", step3t:"Kiểm chứng", step3:"Đối chiếu và giải thích lại",
    heroNote:"6 bài học mẫu · 6 hướng khám phá · Chạy ngoại tuyến, không thu thập dữ liệu",
    figureLabel:"Sổ tay khái niệm — hình minh họa", sampleBadge:"Bài học mẫu",
    heroSvgTitle:"Minh họa hệ tuần hoàn, đường đồng mức và quỹ đạo", heroSvgDesc:"Trái tim ở giữa với mạch máu tỏa ra, góc trên là đường đồng mức địa hình, góc dưới là quỹ đạo và các nút thuật toán.",
    figContour:"Địa hình · đường đồng mức", figHeart:"Tuần hoàn", figAlgo:"Thuật toán", figMotion:"Chuyển động", figCaption:"Hình vẽ gốc cho bản mẫu — không phải ảnh chụp, dữ liệu thật hay mô phỏng 3D.", figFoot1:"Các nét vẽ và màu sắc cùng làm rõ mối liên hệ giữa những khái niệm.",
    subjectsKicker:"Điều hướng theo môn học", subjectsTitle:"Chọn môn học bạn muốn khám phá", subjectsSub:"Mỗi hướng có câu hỏi trung tâm, khái niệm cốt lõi và một bài học mẫu tiêu biểu. Chọn một môn trong danh sách để xem chi tiết.", subjectsBadge:"6 hướng · đồng bộ với bộ lọc bài học",
    lessonsKicker:"Khám phá", lessonsTitle:"Bài học mẫu để thử nhịp học", lessonsSub:"Sáu bài mẫu minh họa cách trình bày khái niệm. Tất cả đều ghi nhãn mẫu — không phải bài báo, giáo trình chính thức hay dữ liệu thật.",
    searchLabel:"Tìm kiếm bài học", searchPh:"Tìm theo tên bài, khái niệm, từ khoá…", emptyTitle:"Không tìm thấy bài học phù hợp", emptyText:"Thử từ khoá khác hoặc xoá bộ lọc hướng khám phá.", emptyBtn:"Đặt lại bộ lọc",
    classKicker:"Dành cho lớp học — chỉ ở bản mẫu", classTitle:"Nhập mã lớp mẫu để xem cách kiểm tra hoạt động", classLead:"Ô này chỉ minh họa kiểm tra định dạng ngay trên máy của bạn. Mã không được gửi đi, không tham gia lớp thật và không lưu lại sau khi tải lại trang.",
    classPoint1:"Mã mẫu đúng định dạng sẽ được báo rõ là “mã mẫu”.", classPoint2:"Mã sai định dạng sẽ có hướng dẫn sửa cụ thể.", classPoint3:"Không có tài khoản, máy chủ hay dữ liệu lớp thật ở bản mẫu này.",
    codeLabel:"Mã lớp mẫu", codePh:"Ví dụ: CLAB-DEMO", codeBtn:"Kiểm tra mã", codeHint:"Thử một mã mẫu: CLAB-DEMO · XANH-01 · GREEN-01. Chấp nhận chữ, số và dấu gạch ngang, 4–12 ký tự.", codePrivacy:"Kiểm tra diễn ra hoàn toàn trong trình duyệt. Không gửi, không lưu, không theo dõi.",
    aboutKicker:"Về đề xuất này", aboutTitle:"Bản mẫu này cho thấy điều gì?", aboutLead:"Đây là đề xuất giao diện xanh lá độc lập cho ConceptLab, dùng để duyệt hướng thiết kế trước khi tích hợp. Không có máy chủ, không thu thập dữ liệu, không gọi API.",
    about1t:"Hệ màu xanh lá:", about1:"Xanh rừng cho khung điều hướng, xanh ngọc cho hành động, xanh xám nhạt cho bề mặt phụ và trắng ấm cho vùng đọc.",
    about2t:"Các thao tác:", about2:"Đổi ngôn ngữ cho giao diện và bài học, chọn môn, tìm kiếm, xem chi tiết và kiểm tra mã mẫu ngay trên máy.",
    about3t:"Dễ tiếp cận:", about3:"Điều hướng bằng bàn phím, viền chọn rõ, nút tối thiểu 44px, hỗ trợ giảm chuyển động và màn hình hẹp.",
    principlesTitle:"Nguyên tắc thiết kế", p1t:"Tập trung vào việc học", p1:"Câu hỏi trung tâm và nhịp Quan sát → Dự đoán → Kiểm chứng dẫn dắt bố cục; hình minh họa phục vụ khái niệm.", p2t:"Điều hướng rõ ràng", p2:"Chọn môn học để tìm câu hỏi và bài học phù hợp.", p3t:"Trung thực về dữ liệu", p3:"Mọi bài học đều ghi nhãn mẫu; không thống kê, trích dẫn bài báo hay tài khoản giả.",
    footerTag:"Bản mẫu giao diện xanh lá — để duyệt thiết kế", footerNote:"Mở trực tiếp file index.html trên máy để xem. Không cần cài đặt, không cần mạng.", footerSmall:"Nội dung bài học là ví dụ minh họa phục vụ việc học khái niệm.",
    dlgObjectives:"Bạn sẽ học được gì", dlgConcepts:"Khái niệm cốt lõi", dlgSteps:"Khám phá từng bước", dlgCheckpoint:"Tự kiểm tra", dlgClose:"Đóng chi tiết", dlgNote:"Bản mẫu: đóng chi tiết sẽ không lưu tiến độ.",
    all:"Tất cả", viewLesson:"Xem chi tiết", minutes:"phút", levelBeginner:"Cơ bản", levelIntermediate:"Trung cấp",
    results:(n,q)=> q? `${n} bài học cho “${q}”` : `${n} bài học`,
    exploreLabel:"Bạn sẽ khám phá", featuredLabel:"Bài học mẫu tiêu biểu", openLesson:"Mở bài học mẫu", seeLessons:"Xem bài trong hướng này",
    codeEmpty:"Bạn chưa nhập mã. Hãy nhập một mã mẫu như CLAB-DEMO để thử.",
    codeInvalid:"Mã chưa đúng định dạng. Chỉ dùng chữ cái, số và dấu gạch ngang, dài 4–12 ký tự (ví dụ: XANH-01).",
    codeUnknown:(c)=>`Mã “${c}” đúng định dạng nhưng không nằm trong danh sách mã mẫu của bản mẫu này. Thử CLAB-DEMO, XANH-01 hoặc GREEN-01.`,
    codeSuccess:(c)=>`Đã nhận mã mẫu “${c}”. Đây chỉ là kiểm tra minh họa trên máy của bạn — chưa tham gia lớp thật nào.`,
    subjects:{
      circulation:{name:"Sinh học · Hệ tuần hoàn", short:"Máu đi đâu trong hai vòng tuần hoàn?", desc:"Đi theo một giọt máu qua tim, phổi và cơ thể để hiểu vì sao tim có bốn ngăn và hai vòng tuần hoàn không trộn lẫn.", concepts:["Vòng tuần hoàn lớn","Vòng tuần hoàn nhỏ","Tim bốn ngăn"], points:["Phân biệt máu giàu và nghèo oxy bằng sơ đồ","Giải thích vai trò của van tim","Dự đoán điều gì xảy ra khi một van hoạt động kém"]},
      geography:{name:"Địa lý · Đọc địa hình", short:"Đường đồng mức kể chuyện dốc và thung lũng thế nào?", desc:"Học đọc bản đồ địa hình như một câu chuyện không gian: nơi nào dốc, nơi nào là sống núi, và tuyến đường nào hợp lý.", concepts:["Đường đồng mức","Khoảng cao đều","Mặt cắt địa hình"], points:["Nhận biết sườn dốc từ mật độ đường đồng mức","Vẽ mặt cắt dọc theo một tuyến","Đề xuất tuyến đường và nêu lý do"]},
      science:{name:"Khoa học · Năng lượng sống", short:"Ánh sáng trở thành đường trong lá như thế nào?", desc:"Đi theo hành trình của năng lượng: từ ánh sáng mặt trời vào lá, thành chất hữu cơ, rồi nuôi cả chuỗi thức ăn.", concepts:["Quang hợp","Lục lạp","Dòng năng lượng"], points:["Phân biệt nguyên liệu và sản phẩm của quang hợp","Liên hệ quang hợp với chuỗi thức ăn","Dự đoán tác động khi thiếu ánh sáng"]},
      algorithms:{name:"Thuật toán · Tìm kiếm & đồ thị", short:"Vì sao chia đôi lại tìm nhanh hơn hẳn?", desc:"Từ tìm kiếm nhị phân tới duyệt đồ thị theo chiều rộng: học cách thuật toán loại bỏ khả năng và lan theo lớp.", concepts:["Chia để trị","Hàng đợi","Độ phức tạp"], points:["Thực hiện tìm kiếm nhị phân bằng tay","Mô phỏng BFS bằng hàng đợi","So sánh số bước giữa các chiến lược"]},
      vision:{name:"Thị giác máy tính · Máy nhìn ảnh", short:"Máy tính “thấy” cạnh trong ảnh bằng số như thế nào?", desc:"Ảnh với máy tính chỉ là lưới số. Học ý tưởng phát hiện cạnh bằng hiệu độ sáng — thuần túy để hiểu khái niệm, không phải sản phẩm thật.", concepts:["Pixel","Độ sáng","Phát hiện cạnh"], points:["Đọc ảnh số dưới dạng bảng số","Tính hiệu độ sáng giữa các pixel kề nhau","Thảo luận khi nào cách này bị nhầm"]},
      sport:{name:"Thể thao · Vật lý chuyển động", short:"Góc ném nào cho tầm xa lớn nhất?", desc:"Bóng rổ, bóng đá và ném lao dùng chung một vật lý: tách chuyển động thành hai thành phần độc lập để dự đoán quỹ đạo.", concepts:["Ném xiên","Thành phần vận tốc","Quỹ đạo parabol"], points:["Tách vận tốc thành hai thành phần","Giải thích thời gian bay","Dự đoán góc ném và điểm rơi"]}
    }
  },
  en: {
    skip:"Skip to main content", protoBar:"Design prototype for review — sample illustrative lessons only, not connected to a live system.", protoTag:"PROTOTYPE",
    brandSub:"Concept laboratory", navLabel:"Main navigation", navExplore:"Explore", navSubjects:"Subjects", navLessons:"Sample lessons", navClass:"Class code", navAbout:"About this prototype", headerCta:"Browse sample lessons",
    heroKicker:"Green proposal · Learning by exploring concepts", heroTitle:"One concept, seen clearly from several sides.",
    heroLead:"ConceptLab helps students move from observation to deep understanding: circulation in the body, terrain on a map, natural phenomena and how algorithms think — through short lessons, purposeful illustrations and checkpoint questions.",
    heroPrimary:"Explore sample lessons", heroSecondary:"Choose a subject first",
    step1t:"Observe", step1:"Look at the figure, say what you see", step2t:"Predict", step2:"Guess before seeing the result", step3t:"Verify", step3:"Compare and explain again",
    heroNote:"6 sample lessons · 6 exploration paths · Runs offline, collects no data",
    figureLabel:"Concept notebook — original vector illustrations", sampleBadge:"Sample lesson",
    heroSvgTitle:"Illustration of circulation, contour lines and a trajectory", heroSvgDesc:"A heart in the centre with vessels radiating out, contour lines in the top corner, and a trajectory with algorithm nodes below.",
    figContour:"Terrain · contour lines", figHeart:"Circulation", figAlgo:"Algorithms", figMotion:"Motion", figCaption:"Original artwork for this prototype — not a photograph, real data or a 3D simulation.", figFoot1:"One visual language: deep forest lines, pale sage washes, amber only for the sample label.",
    subjectsKicker:"Navigate by subject", subjectsTitle:"Choose a subject to explore", subjectsSub:"Each path has a central question, core concepts and one featured sample lesson. Choose a subject to see its details.", subjectsBadge:"6 paths · in sync with lesson filters",
    lessonsKicker:"Discover", lessonsTitle:"Sample lessons to try the learning rhythm", lessonsSub:"Six sample lessons showing how a concept is presented. All are labelled as samples — not papers, an official syllabus or real data.",
    searchLabel:"Search lessons", searchPh:"Search by lesson title, concept, keyword…", emptyTitle:"No lessons match your search", emptyText:"Try a different keyword or clear the subject filter.", emptyBtn:"Reset filters",
    classKicker:"For classrooms — prototype only", classTitle:"Enter a sample class code to see how validation works", classLead:"This field only demonstrates format checking on your own device. The code is never sent, joins no real class and is not kept after a reload.",
    classPoint1:"A correctly formatted sample code is clearly reported as a “sample code”.", classPoint2:"A badly formatted code gets specific guidance on how to fix it.", classPoint3:"There are no accounts, servers or real class data in this prototype.",
    codeLabel:"Sample class code", codePh:"e.g. CLAB-DEMO", codeBtn:"Check code", codeHint:"Try a sample code: CLAB-DEMO · XANH-01 · GREEN-01. Letters, numbers and hyphens, 4–12 characters.", codePrivacy:"Checking happens entirely in your browser. Nothing is sent, stored or tracked.",
    aboutKicker:"About this proposal", aboutTitle:"What does this prototype show?", aboutLead:"This is a standalone green interface proposal for ConceptLab, made to review a design direction before any integration. No server, no data collection, no API calls.",
    about1t:"A deep-forest colour system:", about1:"Deep forest for trusted framing, emerald for actions, pale sage for secondary surfaces and warm white for reading — fully replacing the role of the old blue and yellow.",
    about2t:"Real interactions:", about2:"The VI/EN toggle translates the whole interface and lesson content, subject navigation syncs with filters, search combines with filtering, a detail panel and on-device sample-code checking.",
    about3t:"Accessible by default:", about3:"Keyboard navigation, visible focus rings, 44px minimum controls, reduced-motion support and a layout that holds up at 320px.",
    principlesTitle:"Design principles", p1t:"Learning first, decoration second", p1:"A central question and the Observe → Predict → Verify rhythm drive the layout; illustrations serve the concept.", p2t:"Hierarchical navigation", p2:"Choose an exploration path first, then a lesson — instead of a uniform card grid that is hard to scan.", p3t:"Honest about data", p3:"Every lesson is labelled a sample; no fake statistics, paper citations or accounts.",
    footerTag:"Green interface prototype — for design review", footerNote:"Open the index.html file locally to view it. No install, no network needed.", footerSmall:"Lesson content is illustrative and made to support learning concepts.",
    dlgObjectives:"What you will learn", dlgConcepts:"Core concepts", dlgSteps:"Explore step by step", dlgCheckpoint:"Check yourself", dlgClose:"Close details", dlgNote:"Prototype: this button only closes the panel; nothing is saved.",
    all:"All", viewLesson:"View details", minutes:"min", levelBeginner:"Beginner", levelIntermediate:"Intermediate",
    results:(n,q)=> q? `${n} lesson(s) for “${q}”` : `${n} lesson(s)`,
    exploreLabel:"What you will explore", featuredLabel:"Featured sample lesson", openLesson:"Open sample lesson", seeLessons:"See lessons in this path",
    codeEmpty:"You have not entered a code yet. Try a sample code such as CLAB-DEMO.",
    codeInvalid:"The code format is not right yet. Use only letters, numbers and hyphens, 4–12 characters (e.g. XANH-01).",
    codeUnknown:(c)=>`Code “${c}” is well-formed but is not in this prototype's sample list. Try CLAB-DEMO, XANH-01 or GREEN-01.`,
    codeSuccess:(c)=>`Sample code “${c}” accepted. This is only an on-device demonstration — you have not joined any real class.`,
    subjects:{
      circulation:{name:"Biology · Circulation", short:"Where does blood go in the two circuits?", desc:"Follow one drop of blood through the heart, lungs and body to understand why the heart has four chambers and two separate circuits.", concepts:["Systemic circuit","Pulmonary circuit","Four-chamber heart"], points:["Distinguish oxygen-rich and oxygen-poor blood on a diagram","Explain the role of heart valves","Predict what happens when a valve works poorly"]},
      geography:{name:"Geography · Reading terrain", short:"How do contour lines reveal slopes and valleys?", desc:"Learn to read a topographic map as a spatial story: where it is steep, where ridges run, and which route makes sense.", concepts:["Contour line","Contour interval","Elevation profile"], points:["Read slope steepness from contour spacing","Draw a profile along a route","Propose a route and justify it"]},
      science:{name:"Science · Living energy", short:"How does light become sugar in a leaf?", desc:"Follow the journey of energy: from sunlight into a leaf, into organic matter, then feeding a whole food chain.", concepts:["Photosynthesis","Chloroplast","Energy flow"], points:["Distinguish photosynthesis inputs from products","Connect photosynthesis to food chains","Predict the effect of too little light"]},
      algorithms:{name:"Algorithms · Search & graphs", short:"Why is halving so much faster?", desc:"From binary search to breadth-first traversal: learn how algorithms discard possibilities and spread layer by layer.", concepts:["Divide & conquer","Queue","Complexity"], points:["Run binary search by hand","Simulate BFS with a queue","Compare step counts across strategies"]},
      vision:{name:"Computer vision · How machines see", short:"How do computers “see” edges using numbers?", desc:"To a computer an image is just a grid of numbers. Learn edge detection from brightness differences — purely as a concept, not a real product.", concepts:["Pixel","Brightness","Edge detection"], points:["Read a digital image as a table of numbers","Compute brightness differences between neighbours","Discuss when this approach fails"]},
      sport:{name:"Sport · Physics of movement", short:"Which launch angle gives the greatest range?", desc:"Basketball, football and javelin share one physics: split motion into two independent components to predict the trajectory.", concepts:["Projectile motion","Velocity components","Parabolic trajectory"], points:["Split velocity into two components","Explain flight time","Predict launch angle and landing point"]}
    }
  }
};

const SUBJECTS = [
  {id:"circulation", visual:"circulation"},
  {id:"geography", visual:"geography"},
  {id:"science", visual:"science"},
  {id:"algorithms", visual:"algorithms"},
  {id:"vision", visual:"vision"},
  {id:"sport", visual:"sport"}
];
const SAMPLE_CODES = ["CLAB-DEMO","XANH-01","GREEN-01","DEMO-2026"];

/* Original code-drawn visuals — one coherent forest/sage line system */
function visual(kind){
  const art = {
    circulation:`<svg viewBox="0 0 400 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="400" height="180" fill="#EFF5EE"/><circle cx="200" cy="90" r="62" fill="#fff" stroke="#C9D8CB"/><path d="M200 62c-6-11-24-13-30 0-6 11 2 22 11 31l19 17 19-17c9-9 17-20 11-31-6-13-24-11-30 0Z" fill="#EAF3EC" stroke="#0E2E22" stroke-width="2.2" stroke-linejoin="round"/><path d="M200 70v28M200 84c-6-3-11-3-16 0M200 84c6-3 11-3 16 0" fill="none" stroke="#177A5A" stroke-width="2" stroke-linecap="round"/><g fill="none" stroke="#177A5A" stroke-width="2" stroke-linecap="round"><path d="M178 76 C140 58 124 40 116 18"/><path d="M222 76 C260 58 276 40 284 18"/><path d="M182 116 C150 134 140 150 138 168"/><path d="M218 116 C250 134 260 150 262 168"/></g><g fill="#177A5A"><circle cx="116" cy="18" r="5"/><circle cx="284" cy="18" r="5"/><circle cx="138" cy="168" r="5"/><circle cx="262" cy="168" r="5"/></g><g font-size="10.5" fill="#395344" font-weight="700"><text x="52" y="22">phổi / lungs</text><text x="292" y="22">cơ thể / body</text><text x="52" y="172">vòng nhỏ</text><text x="286" y="172">vòng lớn</text></g><path d="M128 34 A58 58 0 0 1 168 42" fill="none" stroke="#2F9E6E" stroke-width="1.6" stroke-dasharray="4 3"/><path d="M272 138 A58 58 0 0 1 232 146" fill="none" stroke="#2F9E6E" stroke-width="1.6" stroke-dasharray="4 3"/></svg>`,
    geography:`<svg viewBox="0 0 400 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="400" height="180" fill="#EFF5EE"/><path d="M0 132 C70 92 120 116 180 72 C240 32 310 58 400 36 L400 180 L0 180Z" fill="#DCE8DD"/><path d="M0 148 C80 108 150 126 220 84 C280 50 340 68 400 52 L400 180 L0 180Z" fill="#C9D8CB"/><g fill="none" stroke="#177A5A" stroke-width="1.7" opacity=".75"><path d="M56 108 C108 70 168 82 206 44"/><path d="M42 122 C102 80 178 94 232 52"/><path d="M76 92 C116 60 162 66 192 36"/></g><circle cx="292" cy="62" r="13" fill="#FFF7E0" stroke="#C17A3A" stroke-width="2"/><path d="M62 156 L338 156" stroke="#0E2E22" stroke-width="1.6"/><path d="M62 156 L62 146 M338 156 L338 146" stroke="#0E2E22" stroke-width="1.6"/><text x="200" y="172" text-anchor="middle" font-size="10.5" fill="#395344" font-weight="700">A ——— mặt cắt ——— B</text><text x="20" y="28" font-size="11" fill="#0E2E22" font-weight="800">▲ 1 240 m</text></svg>`,
    science:`<svg viewBox="0 0 400 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="400" height="180" fill="#EFF5EE"/><circle cx="326" cy="36" r="16" fill="#FFF7E0" stroke="#C17A3A" stroke-width="2"/><g stroke="#C17A3A" stroke-width="2" stroke-linecap="round"><path d="M326 10v-6M326 68v-6M300 36h-6M358 36h-6"/></g><path d="M200 168 C200 118 200 84 200 44" stroke="#0E2E22" stroke-width="3" fill="none"/><path d="M200 108 C156 108 132 82 128 48 C160 50 190 72 200 108Z" fill="#2F9E6E"/><path d="M200 88 C244 88 268 62 272 28 C240 30 210 52 200 88Z" fill="#177A5A"/><g font-size="11" fill="#14532D" font-weight="700"><text x="24" y="40">CO₂ + H₂O</text><text x="24" y="150">→ đường + O₂</text></g><path d="M96 44 L146 76 M96 142 L146 112" stroke="#8FB09A" stroke-width="1.6" stroke-dasharray="4 3"/><ellipse cx="200" cy="168" rx="70" ry="7" fill="#DCE8DD"/></svg>`,
    algorithms:`<svg viewBox="0 0 400 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="400" height="180" fill="#EFF5EE"/><g><rect x="42" y="102" width="34" height="46" rx="6" fill="#DCE8DD" stroke="#C9D8CB"/><rect x="86" y="82" width="34" height="66" rx="6" fill="#C9D8CB"/><rect x="130" y="52" width="34" height="96" rx="6" fill="#177A5A"/><rect x="174" y="90" width="34" height="58" rx="6" fill="#DCE8DD" stroke="#C9D8CB"/><rect x="218" y="66" width="34" height="82" rx="6" fill="#C9D8CB"/><rect x="262" y="38" width="34" height="110" rx="6" fill="#EAF3EC" stroke="#8FB09A"/></g><path d="M52 34 H296" stroke="#0E2E22" stroke-width="1.6" stroke-dasharray="5 4"/><text x="174" y="28" text-anchor="middle" font-size="11" fill="#0E2E22" font-weight="800">mid</text><circle cx="147" cy="52" r="5" fill="#fff" stroke="#177A5A" stroke-width="2.4"/><g font-size="10.5" fill="#395344" text-anchor="middle" font-weight="700"><text x="59" y="164">lo</text><text x="147" y="164">mid</text><text x="279" y="164">hi</text></g><g font-family="ui-monospace,monospace" font-size="10" fill="#5A6B5E"><text x="316" y="66">2 5 8 12</text><text x="316" y="84" font-weight="800" fill="#0E2E22">17 23 31</text><text x="316" y="102">42 56</text></g></svg>`,
    vision:`<svg viewBox="0 0 400 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="400" height="180" fill="#EFF5EE"/><g fill="#fff" stroke="#C9D8CB"><rect x="44" y="28" width="30" height="30"/><rect x="74" y="28" width="30" height="30"/><rect x="104" y="28" width="30" height="30"/><rect x="44" y="58" width="30" height="30"/><rect x="74" y="58" width="30" height="30" fill="#2F9E6E"/><rect x="104" y="58" width="30" height="30" fill="#0E2E22"/><rect x="44" y="88" width="30" height="30"/><rect x="74" y="88" width="30" height="30"/><rect x="104" y="88" width="30" height="30" fill="#8FB09A"/></g><text x="89" y="138" text-anchor="middle" font-size="10.5" fill="#395344" font-weight="700">pixels → số</text><path d="M148 74 H192" stroke="#0E2E22" stroke-width="2"/><path d="M184 66 L194 74 L184 82" fill="none" stroke="#0E2E22" stroke-width="2"/><g fill="none" stroke="#0E2E22" stroke-width="2"><rect x="208" y="36" width="66" height="66" rx="9" stroke="#177A5A"/><circle cx="241" cy="69" r="17" stroke="#177A5A"/></g><text x="241" y="122" text-anchor="middle" font-size="10.5" fill="#0F5C43" font-weight="800">cạnh? / edge?</text><g font-family="ui-monospace,monospace" font-size="10.5" fill="#5A6B5E"><text x="298" y="52">10 12 11</text><text x="298" y="70">11 90 88</text><text x="298" y="88">12 88 90</text></g><text x="298" y="112" font-size="10" fill="#395344">hiệu lớn = cạnh</text></svg>`,
    sport:`<svg viewBox="0 0 400 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="400" height="180" fill="#EFF5EE"/><line x1="20" y1="146" x2="380" y2="146" stroke="#0E2E22" stroke-width="2"/><path d="M52 142 C140 30 260 30 338 126" fill="none" stroke="#177A5A" stroke-width="2.6" stroke-dasharray="7 5"/><circle cx="52" cy="142" r="7" fill="#0E2E22"/><circle cx="196" cy="62" r="7" fill="#177A5A"/><circle cx="338" cy="126" r="7" fill="#fff" stroke="#177A5A" stroke-width="2.4"/><path d="M52 142 L112 96" stroke="#C17A3A" stroke-width="2"/><text x="72" y="88" font-size="11" fill="#7A5510" font-weight="800">v₀ · 45°</text><text x="196" y="42" text-anchor="middle" font-size="10.5" fill="#395344" font-weight="700">điểm cao nhất</text><text x="318" y="164" font-size="10.5" fill="#395344">điểm rơi</text><g stroke="#8FB09A" stroke-width="1.4" stroke-dasharray="3 3"><path d="M196 62 V146 M52 110 H338"/></g></svg>`
  };
  return art[kind] || art.algorithms;
}

const LESSONS = [
  {id:"circulation", cat:"circulation", visual:"circulation", level:"beginner", mins:14,
   title:{vi:"Hệ tuần hoàn: hai vòng, một trái tim", en:"Circulation: two circuits, one heart"},
   desc:{vi:"Đi theo một giọt máu qua tim, phổi và cơ thể — và hiểu vì sao hai vòng tuần hoàn phải tách biệt.", en:"Follow one drop of blood through the heart, lungs and body — and see why the two circuits must stay separate."},
   tags:{vi:["tuần hoàn","tim","oxy"], en:["circulation","heart","oxygen"]},
   objectives:{vi:["Vẽ được sơ đồ hai vòng tuần hoàn","Phân biệt máu giàu oxy và nghèo oxy","Giải thích vai trò của van tim"], en:["Draw a diagram of the two circuits","Distinguish oxygen-rich from oxygen-poor blood","Explain the role of heart valves"]},
   concepts:{vi:["Vòng lớn","Vòng nhỏ","Van tim"], en:["Systemic circuit","Pulmonary circuit","Heart valves"]},
   steps:{vi:["Quan sát sơ đồ tim và đánh dấu đường đi của máu.","Dự đoán: máu từ phổi trở về tim có giàu oxy không?","Kiểm chứng bằng cách đi theo từng ngăn tim theo thứ tự.","Vẽ lại sơ đồ bằng lời của bạn và ghi chú nơi trao đổi khí."], en:["Study the heart diagram and mark the blood's path.","Predict: is blood returning from the lungs oxygen-rich?","Verify by following each chamber in order.","Redraw the diagram in your own words and note where gas exchange happens."]},
   checkpoint:{vi:"Vì sao máu giàu oxy và máu nghèo oxy không nên trộn lẫn trong tim? Điều gì giúp ngăn chúng trộn?", en:"Why should oxygen-rich and oxygen-poor blood not mix in the heart? What keeps them apart?"}},
  {id:"contour", cat:"geography", visual:"geography", level:"beginner", mins:12,
   title:{vi:"Đường đồng mức kể chuyện địa hình", en:"How contour lines tell the story of terrain"},
   desc:{vi:"Đọc bản đồ địa hình như đọc một câu chuyện: nơi nào dốc, nơi nào là thung lũng, và đường đi nào ít tốn sức nhất.", en:"Read a topographic map like a story: where it is steep, where valleys lie, and which route takes the least effort."},
   tags:{vi:["bản đồ","địa hình","độ cao"], en:["maps","terrain","elevation"]},
   objectives:{vi:["Giải thích được đường đồng mức là gì","Nhận biết sườn dốc và thung lũng trên bản đồ","Đề xuất một tuyến đường đi hợp lý và nêu lý do"], en:["Explain what a contour line is","Identify steep slopes and valleys on a map","Propose a sensible walking route and justify it"]},
   concepts:{vi:["Đường đồng mức","Khoảng cao đều","Sườn dốc / thoải"], en:["Contour line","Contour interval","Steep vs gentle slope"]},
   steps:{vi:["Quan sát cụm đường đồng mức dày và thưa trên bản đồ mẫu.","Dự đoán: cụm nào dốc hơn? Vì sao?","Kiểm chứng bằng mặt cắt dọc theo tuyến A–B.","Vẽ tuyến đường của bạn và thuyết minh lựa chọn."], en:["Observe dense and sparse contour clusters on the sample map.","Predict: which cluster is steeper? Why?","Verify with an elevation profile along line A–B.","Draw your route and explain your choice."]},
   checkpoint:{vi:"Hai cụm đường đồng mức cách nhau đều nhau nhưng một cụm dày đặc hơn. Cụm nào dốc hơn, và bạn suy ra điều đó như thế nào?", en:"Two contour clusters have the same interval but one is much denser. Which slope is steeper, and how do you know?"}},
  {id:"photo", cat:"science", visual:"science", level:"intermediate", mins:16,
   title:{vi:"Quang hợp: dòng năng lượng trong lá", en:"Photosynthesis: energy flow in a leaf"},
   desc:{vi:"Đi theo hành trình của một “gói” ánh sáng: từ mặt trời vào lá, thành đường, rồi nuôi cả hệ sinh thái.", en:"Follow one “packet” of sunlight: from the sun into a leaf, into sugar, then feeding a whole ecosystem."},
   tags:{vi:["quang hợp","năng lượng","lục lạp"], en:["photosynthesis","energy","chloroplast"]},
   objectives:{vi:["Viết và giải thích phương trình quang hợp","Phân biệt nguyên liệu và sản phẩm","Liên hệ quang hợp với chuỗi thức ăn"], en:["Write and explain the photosynthesis equation","Distinguish inputs from products","Connect photosynthesis to food chains"]},
   concepts:{vi:["Lục lạp","Glucose","Chuỗi thức ăn"], en:["Chloroplast","Glucose","Food chain"]},
   steps:{vi:["Quan sát sơ đồ lá và đánh dấu nơi ánh sáng đi vào.","Dự đoán điều gì xảy ra khi che một phần lá vài ngày.","Kiểm chứng qua thí nghiệm tư duy với lá có đốm trắng.","Vẽ dòng năng lượng từ mặt trời tới một động vật ăn cỏ."], en:["Study the leaf diagram and mark where light enters.","Predict what happens if part of a leaf is covered for days.","Verify with a thought experiment on a variegated leaf.","Draw the energy flow from sunlight to a herbivore."]},
   checkpoint:{vi:"Một cây trồng trong phòng kín không có ánh sáng nhưng được tưới đầy đủ vẫn héo dần. Quang hợp giúp bạn giải thích điều này như thế nào?", en:"A well-watered plant in a dark closed room still withers. How does photosynthesis explain this?"}},
  {id:"binsearch", cat:"algorithms", visual:"algorithms", level:"beginner", mins:13,
   title:{vi:"Tìm kiếm nhị phân & duyệt theo lớp", en:"Binary search & layer-by-layer traversal"},
   desc:{vi:"Tìm một số trong danh sách đã sắp xếp bằng cách loại bỏ một nửa sau mỗi lần đoán — nền tảng để hiểu BFS lan theo lớp.", en:"Find a number in a sorted list by discarding half after every guess — the foundation for BFS spreading layer by layer."},
   tags:{vi:["tìm kiếm","chia để trị","đồ thị"], en:["searching","divide & conquer","graphs"]},
   objectives:{vi:["Thực hiện tìm kiếm nhị phân bằng tay trên danh sách mẫu","Giải thích điều kiện “đã sắp xếp” vì sao bắt buộc","Mô tả BFS lan theo lớp bằng hàng đợi"], en:["Run binary search by hand on a sample list","Explain why the “sorted” precondition is required","Describe BFS spreading layer by layer with a queue"]},
   concepts:{vi:["lo / mid / hi","Hàng đợi","O(log n)"], en:["lo / mid / hi","Queue","O(log n)"]},
   steps:{vi:["Quan sát danh sách 9 số đã sắp xếp, mục tiêu 17.","Chọn phần tử giữa, so sánh, loại bỏ một nửa.","Lặp lại và đếm số bước cho tới khi tìm thấy.","Mở rộng: BFS thăm đỉnh theo lớp khoảng cách như thế nào?"], en:["Observe a sorted list of 9 numbers, target 17.","Pick the middle, compare, discard one half.","Repeat and count steps until found.","Extend: how does BFS visit vertices by distance layer?"]},
   checkpoint:{vi:"Danh sách chưa sắp xếp có dùng được tìm kiếm nhị phân không? Cho một ví dụ cụ thể khiến nó thất bại.", en:"Can binary search run on an unsorted list? Give a concrete example where it fails."}},
  {id:"edges", cat:"vision", visual:"vision", level:"intermediate", mins:18,
   title:{vi:"Máy “nhìn” thấy cạnh như thế nào?", en:"How do machines “see” edges?"},
   desc:{vi:"Ảnh với máy tính chỉ là lưới số. Học ý tưởng phát hiện cạnh bằng cách so sánh độ sáng của các pixel kề nhau — thuần túy để hiểu khái niệm.", en:"To a computer an image is just a grid of numbers. Learn edge detection by comparing neighbouring pixel brightness — purely to understand the concept."},
   tags:{vi:["pixel","cạnh","độ sáng"], en:["pixels","edges","brightness"]},
   objectives:{vi:["Mô tả ảnh số dưới dạng lưới giá trị độ sáng","Tính hiệu độ sáng giữa các pixel kề nhau","Giải thích vì sao cạnh giúp máy nhận ra hình dạng"], en:["Describe a digital image as a grid of brightness values","Compute brightness differences between neighbours","Explain why edges help machines recognise shapes"]},
   concepts:{vi:["Pixel","Độ sáng","Hiệu số rời rạc"], en:["Pixel","Brightness","Discrete difference"]},
   steps:{vi:["Nhìn một ảnh nhỏ được viết thành bảng số.","Tính hiệu ngang giữa từng cặp pixel liên tiếp.","Đánh dấu nơi hiệu số lớn — đó là ứng viên “cạnh”.","Thảo luận: khi nào cách này bị nhầm (bóng, nhiễu)?"], en:["Look at a small image written as a table of numbers.","Compute horizontal differences between neighbours.","Mark large differences — these are “edge” candidates.","Discuss: when does this fail (shadows, noise)?"]},
   checkpoint:{vi:"Một vùng ảnh có độ sáng tăng dần đều từ 10 tới 60. Theo cách tính hiệu số, vùng này có chứa cạnh sắc nét không? Vì sao?", en:"A region's brightness rises evenly from 10 to 60. Using differences, does it contain a sharp edge? Why?"}},
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
let activeSubject = "circulation";
let activeFilter = "all";
let query = "";
let lastFocused = null;

const $ = s => document.querySelector(s);
const grid = $("#lessonGrid"), subjectList = $("#subjectList"), subjectDetail = $("#subjectDetail"), filterGroup = $("#filterGroup");
const searchInput = $("#searchInput"), emptyState = $("#emptyState"), resultCount = $("#resultCount");
const dialog = $("#detailDialog");

function t(){ return UI[lang]; }
function normalize(str){ return (str||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/đ/g,"d").replace(/Đ/g,"d"); }
function levelLabel(l){ return l==="beginner" ? t().levelBeginner : t().levelIntermediate; }
function featuredLessonFor(cat){ return LESSONS.find(l=>l.cat===cat) || LESSONS[0]; }
function esc(str){ return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;"); }

function applyUI(){
  document.documentElement.lang = lang;
  document.title = lang==="vi" ? "ConceptLab — Khám phá khái niệm" : "ConceptLab — Explore concepts";
  document.querySelectorAll("[data-i18n]").forEach(el=>{
    const key = el.getAttribute("data-i18n");
    if(t()[key] != null) el.textContent = t()[key];
  });
  /* hero title/desc are text nodes inside SVG — textContent is correct there too */
  document.querySelectorAll("[data-i18n-ph]").forEach(el=>{
    const key = el.getAttribute("data-i18n-ph");
    if(t()[key] != null) el.placeholder = t()[key];
  });
  document.querySelectorAll("[data-i18n-aria]").forEach(el=>{
    const key = el.getAttribute("data-i18n-aria");
    if(t()[key] != null) el.setAttribute("aria-label", t()[key]);
  });
  $("#btn-vi").classList.toggle("is-active", lang==="vi");
  $("#btn-en").classList.toggle("is-active", lang==="en");
  $("#btn-vi").setAttribute("aria-pressed", String(lang==="vi"));
  $("#btn-en").setAttribute("aria-pressed", String(lang==="en"));
  renderSubjects(); renderFilters(); renderLessons();
}

function renderSubjects(){
  subjectList.innerHTML = SUBJECTS.map((s,i)=>{
    const info = t().subjects[s.id];
    const active = activeSubject===s.id;
    return `<button type="button" role="listitem" class="subject-btn ${active?"is-active":""}" data-subject="${s.id}" aria-pressed="${active}">
      <span class="subject-num" aria-hidden="true">${String(i+1).padStart(2,"0")}</span>
      <span><span class="subject-name">${esc(info.name)}</span><p>${esc(info.desc)}</p><span class="subject-q">${esc(info.short)}</span></span>
    </button>`;
  }).join("");
  subjectList.querySelectorAll("[data-subject]").forEach(btn=>{
    btn.addEventListener("click", ()=>{ activeSubject = btn.dataset.subject; renderSubjects(); });
  });
  const info = t().subjects[activeSubject];
  const subj = SUBJECTS.find(s=>s.id===activeSubject);
  const feat = featuredLessonFor(activeSubject);
  subjectDetail.innerHTML = `
    <div class="nav-detail-visual">${visual(subj.visual)}</div>
    <div class="nav-detail-body">
      <span class="pill pill-forest" style="align-self:flex-start">${esc(info.name)}</span>
      <h3>${esc(info.short)}</h3>
      <p>${esc(info.desc)}</p>
      <p style="font-weight:700;color:var(--forest-900);font-size:13px;letter-spacing:.05em;text-transform:uppercase">${esc(t().exploreLabel)}</p>
      <ul class="detail-list">${info.points.map(p=>`<li>${esc(p)}</li>`).join("")}</ul>
      <div class="tag-row">${info.concepts.map(c=>`<span class="tag">${esc(c)}</span>`).join("")}</div>
      <p style="font-size:13px;color:var(--muted)"><strong style="color:var(--forest-900)">${esc(t().featuredLabel)}:</strong> ${esc(feat.title[lang])} · ${feat.mins} ${esc(t().minutes)}</p>
      <div class="nav-detail-actions">
        <button type="button" class="btn btn-primary" data-open="${feat.id}">${esc(t().openLesson)}</button>
        <button type="button" class="btn btn-outline" data-see="${activeSubject}">${esc(t().seeLessons)}</button>
      </div>
    </div>`;
  subjectDetail.querySelectorAll("[data-open]").forEach(b=> b.addEventListener("click", ()=> openDetail(b.dataset.open, b)));
  subjectDetail.querySelectorAll("[data-see]").forEach(b=> b.addEventListener("click", ()=>{
    activeFilter = b.dataset.see; renderSubjects(); renderFilters(); renderLessons();
    document.getElementById("lessons").scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto":"smooth", block:"start"});
  }));
}

function renderFilters(){
  const cats = ["all", ...SUBJECTS.map(x=>x.id)];
  filterGroup.innerHTML = cats.map(id=>{
    const label = id==="all" ? t().all : t().subjects[id].name;
    return `<button type="button" class="filter-btn ${activeFilter===id?"is-active":""}" data-filter="${id}" aria-pressed="${activeFilter===id}">${esc(label)}</button>`;
  }).join("");
  filterGroup.querySelectorAll("[data-filter]").forEach(btn=>{
    btn.addEventListener("click", ()=>{ activeFilter = btn.dataset.filter; if(activeFilter!=="all") activeSubject = activeFilter; renderSubjects(); renderFilters(); renderLessons(); });
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
      t().subjects[lesson.cat].name, UI.vi.subjects[lesson.cat].name, UI.en.subjects[lesson.cat].name,
      ...(lesson.concepts.vi||[]), ...(lesson.concepts.en||[])
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
  const showFeatured = activeFilter==="all" && !q;
  grid.innerHTML = list.map((lesson, idx)=>{
    const cat = t().subjects[lesson.cat];
    const featured = showFeatured && idx===0;
    return `<article class="lesson-card ${featured?"featured":""}">
      <div class="card-visual">${visual(lesson.visual)}</div>
      <div class="card-body">
        <div class="card-top"><span class="pill pill-forest">${esc(cat.name)}</span><span class="pill pill-sample">${esc(t().sampleBadge)}</span><span class="level">${esc(levelLabel(lesson.level))}</span></div>
        <h3>${esc(lesson.title[lang])}</h3>
        <p>${esc(lesson.desc[lang])}</p>
        <div class="tag-row">${lesson.tags[lang].map(tag=>`<span class="tag">${esc(tag)}</span>`).join("")}</div>
        <div class="card-foot"><span class="duration">${lesson.mins} ${esc(t().minutes)}</span><button type="button" class="btn btn-primary" data-open="${lesson.id}">${esc(t().viewLesson)}</button></div>
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
  $("#dialogVisual").innerHTML = visual(lesson.visual);
  $("#dialogCategory").textContent = t().subjects[lesson.cat].name;
  $("#dialogMeta").textContent = `${levelLabel(lesson.level)} · ${lesson.mins} ${t().minutes}`;
  $("#dialogTitle").textContent = lesson.title[lang];
  $("#dialogDesc").textContent = lesson.desc[lang];
  $("#dialogObjectives").innerHTML = lesson.objectives[lang].map(x=>`<li>${esc(x)}</li>`).join("");
  $("#dialogConcepts").innerHTML = lesson.concepts[lang].map(x=>`<span class="tag">${esc(x)}</span>`).join("");
  $("#dialogSteps").innerHTML = lesson.steps[lang].map(x=>`<li>${esc(x)}</li>`).join("");
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
$("#resetFilters").addEventListener("click", ()=>{ activeFilter="all"; query=""; searchInput.value=""; $("#clearSearch").hidden=true; renderSubjects(); renderFilters(); renderLessons(); });
$("#dialogCloseBtn").addEventListener("click", closeDetail);
$("#dialogX").addEventListener("click", closeDetail);
dialog.addEventListener("click", e=>{ if(e.target===dialog) closeDetail(); });
dialog.addEventListener("close", ()=>{ if(lastFocused) lastFocused.focus(); });

/* class code — harmless on-device sample validation only */
$("#codeForm").addEventListener("submit", e=>{
  e.preventDefault();
  const input = $("#codeInput"), msg = $("#codeMsg");
  const raw = input.value.trim().toUpperCase();
  input.value = raw;
  msg.className = "code-msg";
  if(!raw){ msg.textContent = t().codeEmpty; msg.classList.add("is-error"); input.focus(); return; }
  if(!/^[A-Z0-9-]{4,12}$/.test(raw) || /^-|-$/.test(raw) || /--/.test(raw)){ msg.textContent = t().codeInvalid; msg.classList.add("is-error"); input.focus(); return; }
  if(SAMPLE_CODES.includes(raw)){ msg.textContent = t().codeSuccess(raw); msg.classList.add("is-success"); }
  else { msg.textContent = t().codeUnknown(raw); msg.classList.add("is-info"); }
});
$("#codeInput").addEventListener("input", ()=>{ const m=$("#codeMsg"); m.textContent=""; m.className="code-msg"; });

const navToggle = $("#navToggle"), mobileNav = $("#mobileNav");
navToggle.addEventListener("click", ()=>{
  const open = mobileNav.hidden;
  mobileNav.hidden = !open;
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.setAttribute("aria-label", open ? (lang==="vi"?"Đóng menu":"Close menu") : (lang==="vi"?"Mở menu":"Open menu"));
});
mobileNav.querySelectorAll("a").forEach(a=> a.addEventListener("click", ()=>{ mobileNav.hidden=true; navToggle.setAttribute("aria-expanded","false"); }));

document.querySelectorAll(".main-nav a, .mobile-nav a").forEach(a=>{
  a.addEventListener("click", ()=>{
    document.querySelectorAll(".main-nav a").forEach(x=>x.classList.remove("is-active"));
    const href=a.getAttribute("href");
    const match=document.querySelector(`.main-nav a[href="${href}"]`);
    if(match) match.classList.add("is-active");
  });
});

applyUI();
