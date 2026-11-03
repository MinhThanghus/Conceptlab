# ConceptLab — Bản mẫu giao diện xanh dương (Blue Interface Proposal)

Bản mẫu thiết kế độc lập để duyệt hướng giao diện mới cho **ConceptLab** — nền tảng học tập tương tác cho học sinh và giáo viên khám phá khái niệm khoa học, thuật toán và thể thao. Đây **không phải** bản tích hợp vào ứng dụng thật.

## Cách mở xem (offline, không cần cài đặt)

1. Tải/thư mục này về máy (giữ nguyên 3 file `index.html`, `styles.css`, `app.js` cạnh nhau).
2. Nhấp đúp vào **`index.html`** để mở bằng trình duyệt (Chrome, Edge, Firefox, Safari đều được).
3. Không cần máy chủ, không cần mạng, không cần cài thêm gì.

> Nếu muốn dùng máy chủ tĩnh tuỳ chọn: `python -m http.server 8000` rồi mở `http://localhost:8000` — hoàn toàn không bắt buộc.

## Nội dung bản mẫu

| Khu vực | Mô tả |
|---|---|
| Header + điều hướng | Logo, menu Khám phá / Chủ đề / Bài học / Về bản mẫu, nút chuyển VI/EN |
| Hero | Câu hỏi dẫn nhập, 3 điểm giá trị học tập, hình minh hoạ tìm kiếm nhị phân vẽ bằng SVG |
| Chủ đề | 7 lĩnh vực: Địa lý, Vật lý, Hoá học, Sinh học, Thị giác máy tính, Thuật toán, Thể thao & chuyển động |
| Bài học mẫu | 8 thẻ bài học có hình vẽ riêng bằng mã (SVG), mức độ, thời lượng, từ khoá |
| Panel chi tiết | Mục tiêu học tập, khái niệm cốt lõi, các bước khám phá, câu hỏi tự kiểm tra |
| Giới thiệu bản mẫu | Nguyên tắc thiết kế và bảng màu để đội ngũ duyệt |

Mọi bài học đều ghi rõ **“Bài học mẫu”**. Không có trích dẫn bài báo, thống kê người dùng, tài khoản hay hành động giả; không gọi API và không lưu dữ liệu.

## Tương tác hoạt động thật (in-memory)

- **Chuyển VI/EN:** dịch toàn bộ giao diện *và* nội dung từng bài học ngay lập tức, không tải lại trang. Mặc định: **Tiếng Việt**.
- **Lọc theo lĩnh vực:** bấm thẻ chủ đề hoặc nút lọc — có thể bấm lại để bỏ lọc.
- **Tìm kiếm:** gõ theo tên bài, khái niệm hoặc từ khoá (hỗ trợ gõ không dấu, ví dụ `tim kiem nhi phan`). Lọc và tìm kiếm kết hợp với nhau.
- **Xem chi tiết:** mở hộp thoại bài học, đóng bằng nút Đóng, dấu ✕, phím `Esc` hoặc bấm ra ngoài; focus trở về thẻ vừa mở.
- **Menu di động:** nút hamburger ở màn hình hẹp.

## Lý do thiết kế (Design rationale)

- **Hệ màu xanh dương mới, không chỉ “đổi màu vàng”:** navy sâu `#0B2447` tạo nền tin cậy cho header/footer, xanh hành động `#2563EB` chỉ dùng cho nút chính và trạng thái chọn, xanh bầu trời `#38BDF8` làm điểm nhấn phụ, nền đọc trắng pha xám-xanh `#EAF1FB / #F4F7FB`. Màu vàng chỉ còn xuất hiện rất ít ở nhãn “Prototype/Bài học mẫu” để báo hiệu trạng thái bản mẫu — không còn là màu thương hiệu.
- **Thứ bậc chữ rõ:** tiêu đề hero lớn và đậm, tiêu đề mục nhỏ hơn một bậc, nhãn pill nhỏ và đều; khoảng trắng rộng giữa các khối giúp trang “thở” và đọc như một sản phẩm học tập đáng tin cậy.
- **Thẻ bài học dễ quét:** mỗi thẻ có hình minh hoạ riêng theo lĩnh vực (đường đồng mức, con lắc, phân tử nước, lá quang hợp, lưới pixel, cột tìm kiếm, đồ thị BFS, quỹ đạo ném) — tất cả vẽ bằng SVG trong mã, không dùng ảnh ngoài hay ô placeholder trống.
- **Một nhịp học lặp lại:** mọi lĩnh vực đều theo Quan sát → Dự đoán → Kiểm chứng, giúp học sinh quen cấu trúc và giáo viên dễ dự đoán bố cục bài mới.
- **Trung thực về dữ liệu:** số “8 bài học · 7 lĩnh vực” là đếm thật của bản mẫu; thời lượng là nhãn mô tả, không phải thống kê người dùng.

## Truy cập & responsive

- Markup ngữ nghĩa: `header / nav / main / section / article / footer / dialog`, có skip-link.
- Focus hiển thị rõ (viền xanh bầu trời 3px), mọi nút/điều khiển tối thiểu **44px**, điều hướng được hoàn toàn bằng bàn phím.
- Tôn trọng `prefers-reduced-motion`, tương phản chữ đạt mức đọc thoải mái.
- Bố cục co giãn: 3 cột → 2 cột → 1 cột; kiểm tra tốt ở **320px** (thanh lọc cuộn ngang, hero xếp dọc, panel chi tiết toàn chiều rộng).

## Công nghệ

HTML + CSS + JavaScript thuần, **không** thư viện, font ngoài, ảnh ngoài hay lời gọi mạng. Mở file trực tiếp (`file://`) vẫn hoạt động đầy đủ.

## Giới hạn của bản mẫu

- Dữ liệu nằm trong bộ nhớ trang; tải lại trang sẽ đặt lại bộ lọc/ngôn ngữ.
- Chưa kết nối backend, đăng nhập, lưu tiến độ hay nội dung thật — các nút không thực hiện hành động ngoài những gì ghi trên nhãn.
- Nội dung bài học là ví dụ minh hoạ phục vụ việc học khái niệm, không phải giáo trình chính thức.
