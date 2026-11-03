import { describe, expect, it } from 'vitest'
import { demoCardText } from './demoCardTranslation.js'

describe('translated sample lesson card metadata', () => {
  it.each([
    ['TPEND6', 'Con lắc đơn — chu kỳ dao động', 'Bài 12. Con lắc đơn', 'The simple pendulum and its period'],
    ['VBPASS', 'Đệm bóng thấp tay — Bóng chuyền', 'Kỹ thuật đệm bóng thấp tay bằng hai tay', 'Forearm pass in volleyball'],
    ['ATTN24', 'Scaled Dot-Product Attention', 'Công thức (1) — attention có chia √dₖ', 'Scaled Dot-Product Attention'],
    ['PARAB3', 'Hàm số bậc hai và parabol', 'Đồ thị hàm số y = ax² + bx + c', 'Quadratic functions and parabolas'],
    ['HEART8', 'Hệ tuần hoàn của người', 'Cấu tạo tim và hai vòng tuần hoàn', 'The human circulatory system'],
    ['WATER6', 'Vòng tuần hoàn của nước', 'Các giai đoạn của vòng tuần hoàn nước', 'The water cycle'],
    ['SWAP42', 'Sắp xếp nổi bọt và tìm kiếm nhị phân', 'Thuật toán sắp xếp và tìm kiếm', 'Bubble sort and binary search'],
    ['SAVE25', 'Lãi đơn và lãi kép', 'Ứng dụng cấp số nhân: gửi tiết kiệm', 'Simple and compound interest'],
    ['JUMP45', 'Chuyển động ném xiên', 'Quỹ đạo, tầm xa và độ cao cực đại', 'Projectile motion'],
  ])('recognises the unchanged %s example', (share_code, title, topic, english) => {
    const lab = { is_demo: true, share_code, title, topic }
    expect(demoCardText(lab, 'en')?.title).toBe(english)
    expect(demoCardText({ ...lab, topic: `${topic} changed` }, 'en')).toBeNull()
  })
})
