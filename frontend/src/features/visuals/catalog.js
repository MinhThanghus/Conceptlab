import catalog from '../../../../shared/visual_catalog.json'

export const VISUAL_CATALOG = catalog
export const visualName = (item, lang) => item.name[lang] || item.name.vi
export function visualCopy(lang) {
  return lang === 'en' ? {
    label: 'Guided 2D / 3D model', none: 'No additional model', auto: 'Suggest from the reviewed analysis',
    intro: 'Add an interactive model with an observation and a comparison. Physics simulations and sports fields also have their own 3D views.',
    note: 'Built-in teaching models use examples. They do not reconstruct an arbitrary uploaded image. The original image remains available in Sources.',
    preview: 'Preview the model', loading: 'Loading the interactive model…',
    autoRun: 'Create selected parts',
    autoWorking: 'Creating the selected lesson parts…',
  } : {
    label: 'Mô hình 2D / 3D có hướng dẫn', none: 'Không thêm mô hình', auto: 'Đề xuất từ nội dung đã kiểm tra',
    intro: 'Thêm mô hình tương tác kèm hướng quan sát và đối chiếu. Các mô phỏng vật lý và sân thể thao cũng có góc nhìn 3D riêng.',
    note: 'Mô hình học tập dùng các ví dụ có sẵn, không tự dựng lại mọi ảnh tải lên. Bạn vẫn có thể đối chiếu ảnh gốc trong phần Nguồn.',
    preview: 'Xem trước mô hình', loading: 'Đang tải mô hình tương tác…',
    autoRun: 'Tạo các phần đã chọn',
    autoWorking: 'Đang tạo các phần bài học đã chọn…',
  }
}
