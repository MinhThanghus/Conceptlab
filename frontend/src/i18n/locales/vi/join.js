// Namespace join (vi). Keys must match the other language file.
export default {
  meta: { title: 'Vào lớp bằng mã' },
  title: 'Vào lớp bằng mã',
  lead: 'Nhập mã lớp giáo viên viết trên bảng hoặc gửi cho bạn. Bài học của lớp sẽ mở ngay, không cần đăng ký.',
  codeLabel: 'Mã lớp',
  placeholder: 'K7M2QX',
  submit: 'Vào lớp',
  hint: 'Mã gồm {length} ký tự, gõ chữ hoa hay chữ thường đều được. Ví dụ: K7M2QX.',
  lookAlikeTitle: 'Mã lớp không bao giờ dùng:',
  lookAlikeSpoken: 'Mã lớp không bao giờ dùng chữ O, số 0, chữ I, số 1 và chữ L, để tránh đọc nhầm.',
  errors: {
    empty: 'Hãy nhập mã lớp.',
    short: 'Mã lớp có {length} ký tự. Hãy kiểm tra xem bạn đã nhập đủ chưa.',
    ambiguous: 'Mã lớp không có ký tự {chars}: các ký tự dễ nhầm O, 0, I, 1, L không bao giờ được dùng. Hãy xem lại mã giáo viên đưa.',
    invalid: 'Mã lớp chỉ gồm chữ cái và chữ số. Hãy bỏ ký tự: {chars}',
    notFound: 'Không tìm thấy bài học nào có mã {code}. Có thể mã bị gõ nhầm, hoặc giáo viên chưa chia sẻ hay đã ngừng chia sẻ bài học này.',
  },
  tipsTitle: 'Mẹo nhỏ',
  tips: {
    noAccount: {
      title: 'Không cần tài khoản',
      body: 'Học sinh vào lớp chỉ bằng mã, không phải đăng ký hay đăng nhập.',
    },
    qr: {
      title: 'Giáo viên chiếu mã QR?',
      body: 'Mở ứng dụng máy ảnh trên điện thoại và hướng vào mã QR, bài học sẽ tự mở.',
    },
    ask: {
      title: 'Chưa hiểu chỗ nào, hỏi chỗ đó',
      body: 'Trong bài học, bạn có thể hỏi trợ lý AI về bước hay hình đang xem (nếu giáo viên bật tính năng này).',
    },
  },
  noCode: 'Chưa có mã?',
  browseGallery: 'Xem các bài học công khai trong thư viện',
}
