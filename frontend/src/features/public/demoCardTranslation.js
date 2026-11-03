// Reviewed card labels for the original built-in demonstrations. They do not
// translate the lab itself; edited content and other people's labs stay untouched.
const DEMO_EN = {
  TPEND6: ['Con lắc đơn — chu kỳ dao động', 'Bài 12. Con lắc đơn', 'The simple pendulum and its period', 'Lesson 12. The simple pendulum'],
  VBPASS: ['Đệm bóng thấp tay — Bóng chuyền', 'Kỹ thuật đệm bóng thấp tay bằng hai tay', 'Forearm pass in volleyball', 'The two-handed forearm passing technique'],
  ATTN24: ['Scaled Dot-Product Attention', 'Công thức (1) — attention có chia √dₖ', 'Scaled Dot-Product Attention', 'Equation (1): attention scaled by √dₖ'],
  PARAB3: ['Hàm số bậc hai và parabol', 'Đồ thị hàm số y = ax² + bx + c', 'Quadratic functions and parabolas', 'Graph of y = ax² + bx + c'],
  HEART8: ['Hệ tuần hoàn của người', 'Cấu tạo tim và hai vòng tuần hoàn', 'The human circulatory system', 'The heart and its two circulation loops'],
  WATER6: ['Vòng tuần hoàn của nước', 'Các giai đoạn của vòng tuần hoàn nước', 'The water cycle', 'Stages of the water cycle'],
  SWAP42: ['Sắp xếp nổi bọt và tìm kiếm nhị phân', 'Thuật toán sắp xếp và tìm kiếm', 'Bubble sort and binary search', 'Sorting and searching algorithms'],
  SAVE25: ['Lãi đơn và lãi kép', 'Ứng dụng cấp số nhân: gửi tiết kiệm', 'Simple and compound interest', 'Applying geometric sequences to savings'],
  JUMP45: ['Chuyển động ném xiên', 'Quỹ đạo, tầm xa và độ cao cực đại', 'Projectile motion', 'Trajectory, range and maximum height'],
}

export function demoCardText(lab, lang) {
  if (lab?.display_language === lang && lab.display_title) return { title: lab.display_title, topic: lab.display_topic || '', language: lang }
  if (lang !== 'en' || !lab?.is_demo) return null
  const entry = DEMO_EN[String(lab.share_code || '').toUpperCase()]
  if (!entry || lab.title !== entry[0] || lab.topic !== entry[1]) return null
  return { title: entry[2], topic: entry[3], language: 'en' }
}
