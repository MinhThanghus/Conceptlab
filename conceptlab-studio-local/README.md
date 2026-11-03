# ConceptLab Studio — bản xem trước cục bộ

Phiên bản giao diện riêng cho ConceptLab, bao gồm School2Lab và Paper2Explorer. Không thay đổi frontend, backend, cơ sở dữ liệu hay tệp người dùng của ứng dụng cũ.

## Chạy

Từ thư mục này, chạy `python -m http.server 5301 --bind 127.0.0.1`, sau đó mở http://127.0.0.1:5301. Cũng có thể mở `index.html` trực tiếp bằng trình duyệt hiện đại.

## Phạm vi

- Tám bài mẫu được chọn từ `backend/app/seed/content.py` và `shared/paper_study_batch.json`; hình xem trước được sao chép từ `frontend/public`.
- Bộ lọc, tìm kiếm không dấu, chi tiết bài và danh sách đã lưu hoạt động cục bộ. Danh sách lưu nằm trong localStorage của trình duyệt.
- Đây là prototype giao diện, chưa kết nối API, đăng nhập, AI, bài học tương tác hoặc dữ liệu người dùng. Mã trong chi tiết tương ứng bài mẫu của ứng dụng gốc.
- Backend hiện hữu dùng FastAPI, SQLite, xác thực phiên và API `/api/share/{code}` cho nội dung đã xuất bản. Muốn tích hợp thật cần thực hiện trong một bước phát triển riêng; bản này không gọi hay sửa backend.
