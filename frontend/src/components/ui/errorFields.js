// Backend validation details use stable field identifiers and English reason codes.
// Render known details in Vietnamese; use a neutral fallback for unknown messages so
// a server exception cannot introduce English into the Vietnamese interface.
const viFields = {
  email: 'Email', password: 'Mật khẩu', current_password: 'Mật khẩu hiện tại',
  title: 'Tiêu đề', text: 'Nội dung', data: 'Dữ liệu', file: 'Tệp',
  phrase: 'Mô tả', pages: 'Trang', source_id: 'Nguồn', equation_id: 'Phương trình',
  points: 'Điểm chọn', values: 'Giá trị', value: 'Giá trị', symbol: 'Ký hiệu',
  kind: 'Loại', meta: 'Thông tin bổ sung', answers: 'Câu trả lời', block_types: 'Loại phần tương tác',
}
const viReasons = {
  required: 'bắt buộc', invalid: 'không hợp lệ', empty: 'không được để trống',
  duplicate: 'bị trùng', taken: 'đã được sử dụng', wrong: 'không đúng',
  'not found': 'không tìm thấy', 'too large': 'quá lớn', 'invalid JSON': 'JSON không hợp lệ',
  'must be text': 'phải là văn bản', 'must be true or false': 'phải là đúng hoặc sai',
  'must be an object': 'phải là một đối tượng', 'must be a finite number': 'phải là số hữu hạn',
  'add at least one value': 'hãy thêm ít nhất một giá trị',
  'only data sources have values': 'chỉ nguồn dữ liệu mới có giá trị',
  'only notes and data sources have text': 'chỉ ghi chú và nguồn dữ liệu mới có nội dung văn bản',
  'no matching questions': 'không có câu hỏi tương ứng',
}

export function displayErrorField(field, message, lang, index) {
  if (lang !== 'vi') return { field, message: String(message) }
  const parts = String(field).split('.')
  const names = parts.filter((part) => !/^\d+$/.test(part)).map((part) => viFields[part]).filter(Boolean)
  const label = names.length ? names.join(' · ') : `Mục ${index + 1}`
  const raw = String(message)
  const limit = /^at most (\d+) characters$/.exec(raw)
  const reason = viReasons[raw] || (limit ? `tối đa ${limit[1]} ký tự` : 'không hợp lệ')
  return { field: label, message: reason }
}
