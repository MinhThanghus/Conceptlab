# ConceptLab — Đề xuất giao diện xanh lá (Green Interface Proposal)

Bản mẫu thiết kế độc lập để duyệt hướng giao diện mới cho **ConceptLab** — nền tảng học tập tương tác cho học sinh khám phá khái niệm khoa học, địa lý, tuần hoàn, thuật toán, thị giác máy tính và thể thao. Đây **không phải** bản tích hợp vào ứng dụng thật.

## Cách mở xem (offline, không cần cài đặt)

1. Giữ nguyên 4 file `index.html`, `styles.css`, `app.js`, `README.md` cạnh nhau trong thư mục này.
2. Nhấp đúp vào **`index.html`** để mở bằng trình duyệt (Chrome, Edge, Firefox, Safari đều được).
3. Không cần máy chủ, không cần mạng, không cần cài thêm gì. Mở trực tiếp bằng `file://` vẫn hoạt động đầy đủ.

> Tuỳ chọn: nếu muốn dùng máy chủ tĩnh, chạy `python -m http.server 8000` rồi mở `http://localhost:8000` — hoàn toàn không bắt buộc.

## Nội dung bản mẫu

| Khu vực | Mô tả |
|---|---|
| Header + điều hướng | Logo lá, menu Khám phá / Môn học / Bài học mẫu / Mã lớp / Về bản mẫu, nút chuyển VI/EN |
| Hero “Sổ tay khái niệm” | Tiêu đề serif biên tập, nhịp học 01 Quan sát → 02 Dự đoán → 03 Kiểm chứng, hình vector gốc gồm tuần hoàn, đường đồng mức, quỹ đạo và nút thuật toán |
| Điều hướng môn học | Danh sách 6 hướng khám phá + khung chi tiết đồng bộ: câu hỏi trung tâm, khái niệm cốt lõi, bài học mẫu tiêu biểu — thay cho lưới thẻ đồng dạng |
| Bài học mẫu | 6 thẻ bài học có hình SVG riêng theo khái niệm, thẻ đầu tiên nổi bật khi chưa lọc, mức độ, thời lượng, từ khoá |
| Panel chi tiết | Mục tiêu học tập, khái niệm cốt lõi, các bước khám phá, câu hỏi tự kiểm tra; mở/đóng bằng nút, phím `Esc`, bấm ra ngoài |
| Mã lớp mẫu | Ô nhập mã lớp với kiểm tra định dạng vô hại ngay trên máy; mã mẫu: `CLAB-DEMO`, `XANH-01`, `GREEN-01` |
| Giới thiệu bản mẫu | Nguyên tắc thiết kế và bảng màu rừng sâu / emerald / sage / trắng ấm để đội ngũ duyệt |

Mọi bài học đều ghi rõ **“Bài học mẫu”**. Không có trích dẫn bài báo, thống kê người dùng, tài khoản hay hành động giả; hình minh họa được ghi rõ là hình vẽ gốc, không phải ảnh chụp, dữ liệu thật hay mô phỏng 3D. Không gọi API và không lưu hay gửi dữ liệu.

## Tương tác hoạt động thật (in-memory)

- **Chuyển VI/EN:** dịch toàn bộ giao diện *và* nội dung từng bài học ngay lập tức, không tải lại trang. Mặc định: **Tiếng Việt**.
- **Điều hướng môn học:** chọn một hướng ở danh sách để xem chi tiết; nút “Xem bài trong hướng này” đồng bộ với bộ lọc bài học bên dưới.
- **Lọc + tìm kiếm:** lọc theo hướng khám phá kết hợp tìm kiếm theo tên bài, khái niệm hoặc từ khoá (hỗ trợ gõ không dấu, ví dụ `tuan hoan`, `tim kiem nhi phan`).
- **Xem chi tiết:** mở hộp thoại bài học, đóng bằng nút Đóng, dấu ✕, phím `Esc` hoặc bấm ra ngoài; focus trở về thẻ vừa mở.
- **Mã lớp mẫu:** kiểm tra rỗng / sai định dạng / đúng định dạng nhưng không phải mã mẫu / mã mẫu hợp lệ, với thông báo cụ thể cho từng trường hợp. Không gửi đi đâu.
- **Menu di động:** nút hamburger ở màn hình hẹp.

## Đánh giá bản xanh dương trước đó (`../muse-blue/`) và cách bản này cải thiện

Bản xanh dương bị đánh giá là “làm kém” là có cơ sở. Đọc mã và ảnh chụp của nó cho thấy các vấn đề sau:

1. **Lưới thẻ đồng dạng chiếm toàn bộ trang.** Bảy thẻ chủ đề giống hệt nhau (cùng khung, cùng icon ô vuông, cùng số đếm) rồi tới tám thẻ bài học giống hệt nhau nữa. Mắt không biết nhìn vào đâu trước; “điều hướng môn học” thực chất chỉ là một hàng nút lọc được vẽ to lên. → *Bản xanh lá tách hẳn hai tầng: danh sách hướng khám phá dạng mục lục có số thứ tự + khung chi tiết thay đổi theo lựa chọn (câu hỏi trung tâm, khái niệm, bài tiêu biểu), rồi mới tới lưới bài học. Khi chưa lọc, thẻ bài học đầu tiên được làm nổi bật và nằm ngang để tạo điểm neo thị giác.*

2. **Hero chung chung, không nói lên tính học thuật.** Eyebrow chữ hoa + tiêu đề lớn + hai nút + ba dòng tích xanh là mẫu hero gặp ở mọi trang SaaS; hình minh họa tìm kiếm nhị phân bị nhét trong khung cửa sổ giả với ba chấm macOS và hai “chip” nổi trang trí — đẹp kiểu mẫu sẵn nhưng không liên quan tới phần lớn lĩnh vực của ConceptLab. → *Hero mới là bố cục biên tập lệch trái với tiêu đề serif, nhịp học ba bước được đánh số làm thành phần cấu trúc (không phải trang trí), và một “sổ tay khái niệm” duy nhất gộp tuần hoàn — địa hình — chuyển động — thuật toán trong cùng một ngôn ngữ nét vẽ, có ghi rõ là minh họa gốc.*

3. **Hình minh họa bài học nhỏ, rời rạc và không cùng hệ.** Mỗi thẻ xanh dương có một SVG nhỏ 148px với bảng màu riêng (vàng ở thể thao, tím ở hoá học), trông như icon phóng to hơn là “hình bài học”. → *Cả sáu hình bài học và hình trong panel chi tiết dùng chung một hệ: nền sage `#EFF5EE`, nét rừng đậm 2–2.6px, mảng emerald, hổ phách chỉ dành cho nhãn mẫu/điểm đo. Hình trong panel được phóng lớn ở cột trái 310px để học sinh thực sự “quan sát” trước khi đọc bước.*

4. **Trải nghiệm “vào lớp / bắt đầu học” trống rỗng.** Bản xanh dương chỉ có nút cuộn trang; không có bất kỳ bề mặt nào cho giáo viên/lớp học, dù đối tượng gồm cả giáo viên. Các nút đều dẫn tới cùng một lưới thẻ. → *Bản mới có mục Mã lớp mẫu với kiểm tra định dạng thật (rỗng, sai định dạng, đúng định dạng nhưng không phải mã mẫu, mã mẫu hợp lệ) và nói thẳng rằng không tham gia lớp thật — một tương tác hữu ích cho việc duyệt luồng lớp học mà không giả mạo hệ thống.*

5. **Thứ bậc chữ yếu và khoảng trắng chưa có chủ đích.** Tiêu đề mục 28px, tiêu đề thẻ 17.5px, nhãn pill 12.5px chênh nhau ít; các section nối nhau bằng nền trắng/xám-xanh gần như phẳng, khiến trang dài mà đơn điệu. → *Bản mới dùng thang chữ rõ hơn (hero serif 46px → tiêu đề mục serif 30px → tiêu đề chi tiết 24–25px → thân 14–15px), xen kẽ nhịp nền trắng ấm / sage / rừng đậm (mục mã lớp) để chia chương, và dành khoảng trắng lớn quanh khung điều hướng môn học.*

6. **Màu chỉ là “xanh dương thay vàng”.** Tài liệu của bản cũ tự nhận thay vai trò màu vàng bằng navy/sky; cấu trúc trang không đổi theo màu. → *Bản xanh lá dùng màu theo vai trò học thuật: rừng đậm cho khung và điều hướng, emerald chỉ cho hành động chính và trạng thái chọn, sage cho bề mặt đọc phụ, hổ phách bị giới hạn nghiêm ngặt ở nhãn “Bài học mẫu / PROTOTYPE” để báo hiệu trạng thái bản mẫu.*

## Lý do thiết kế (Design rationale)

- **Hệ màu rừng sâu, tương phản mạnh:** rừng `#0E2E22` trên trắng ấm `#FFFEFB`, emerald `#177A5A` cho hành động (đậm hơn khi hover `#0F5C43`), sage `#DCE8DD / #EFF5EE` cho bề mặt phụ, hổ phách chỉ cho nhãn mẫu. Không xanh neon, không hiệu ứng phát sáng.
- **Chữ có bản sắc:** tiêu đề dùng serif hệ thống (Iowan/Palatino/Georgia) tạo cảm giác sách học thuật; thân bài dùng sans hệ thống; mono chỉ cho số thứ tự, mã lớp và nhãn kỹ thuật — không tải font ngoài.
- **Một nhịp học lặp lại:** mọi hướng và bài học đều theo Quan sát → Dự đoán → Kiểm chứng, giúp học sinh quen cấu trúc và giáo viên dễ dự đoán bố cục bài mới.
- **Trung thực về dữ liệu:** số “6 bài học · 6 hướng” là đếm thật của bản mẫu; thời lượng là nhãn mô tả, không phải thống kê người dùng.

## Truy cập & responsive

- Markup ngữ nghĩa: `header / nav / main / section / article / footer / dialog`, có skip-link và `aria-live` cho số kết quả, thông báo mã lớp và khung chi tiết môn học.
- Focus hiển thị rõ (viền lá 3px), mọi nút/điều khiển tối thiểu **44px**, điều hướng được hoàn toàn bằng bàn phím, panel chi tiết dùng `<dialog>` gốc với `Esc` và trả focus về nút đã mở.
- Tôn trọng `prefers-reduced-motion`, tương phản chữ đạt mức đọc thoải mái.
- Bố cục co giãn: hero và khung điều hướng xếp dọc ở màn hình hẹp, lưới bài học 3 cột → 2 cột → 1 cột; kiểm tra ở **320px, 375px** và desktop (thanh lọc cuộn ngang, panel chi tiết toàn chiều rộng).

## Công nghệ

HTML + CSS + JavaScript thuần, **không** thư viện, font ngoài, ảnh ngoài hay lời gọi mạng. Toàn bộ hình minh họa là SVG/CSS vẽ bằng mã trong repo này.

## Giới hạn của bản mẫu

- Dữ liệu nằm trong bộ nhớ trang; tải lại trang sẽ đặt lại bộ lọc/ngôn ngữ/mã lớp.
- Chưa kết nối backend, đăng nhập, lưu tiến độ hay nội dung thật — các nút không thực hiện hành động ngoài những gì ghi trên nhãn.
- Nội dung bài học là ví dụ minh họa phục vụ việc học khái niệm, không phải giáo trình chính thức, bài báo khoa học hay mô phỏng 3D.
