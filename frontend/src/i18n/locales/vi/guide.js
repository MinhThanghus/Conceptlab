// Namespace guide (vi). Keys must match the other language file.
export default {
  meta: { title: 'Hướng dẫn sử dụng' },
  title: 'Dạy và học với ConceptLab AI',
  lead: 'Hướng dẫn ngắn gọn, thực tế cho giáo viên và học sinh, từ chụp trang sách đến chia sẻ bài học trong lớp.',
  toc: {
    label: 'Mục lục',
    teachers: 'Cho giáo viên',
    students: 'Cho học sinh',
    faq: 'Câu hỏi thường gặp',
  },
  teachers: {
    title: 'Dành cho giáo viên',
    lead: 'Hãy bắt đầu nhỏ: một trang sách, một hình hoặc một công thức là đủ cho bài học đầu tiên.',
    stepsTitle: 'Tạo một bài học từng bước',
    steps: {
      create: {
        title: 'Tạo bài học',
        body: 'Chọn School2Lab hoặc Paper2Explorer, môn học, lớp, mục tiêu và mức độ giải thích. Chọn chế độ AI Tiêu chuẩn nếu nguồn có hình ảnh học sinh.',
      },
      sources: {
        title: 'Thêm nguồn',
        body: 'Tải PDF hoặc ảnh trang sách, ảnh vật thật, video ngắn; nhập số liệu đã đo hoặc ghi chú. Đánh dấu nguồn có học sinh và xác nhận đã có sự đồng ý.',
      },
      analyze: {
        title: 'Cho AI phân tích',
        body: 'Chọn nguồn và trang cần phân tích. Bật phân tích sâu (Muse Wonder) khi tài liệu dài hoặc phức tạp.',
      },
      review: {
        title: 'Kiểm tra kết quả',
        body: 'Đọc lại công thức, biến, đơn vị, các bước, giả định và thông tin còn thiếu. Sửa trực tiếp rồi đánh dấu đã kiểm tra.',
      },
      build: {
        title: 'Tạo trải nghiệm',
        body: 'Để AI tạo các phần tương tác từ bản phân tích đã kiểm tra, sau đó chỉnh sửa, sắp xếp lại hoặc thêm phần mới.',
      },
      preview: {
        title: 'Xem như học sinh',
        body: 'Thử bài học đúng như học sinh sẽ thấy: kéo thanh trượt, chạy mô phỏng, làm câu hỏi.',
      },
      share: {
        title: 'Chia sẻ',
        body: 'Hệ thống tự kiểm tra trước khi tạo mã lớp. Bạn chọn “chỉ người có mã” hoặc “công khai trong thư viện”, và bật hay tắt trợ lý AI.',
      },
      results: {
        title: 'Xem kết quả lớp',
        body: 'Số liệu tổng hợp: tỉ lệ trả lời đúng từng câu, phản hồi và những câu học sinh đã hỏi. Không xếp hạng học sinh.',
      },
    },
    tipsTitle: 'Mẹo để AI hiểu đúng tài liệu của bạn',
    tips: {
      pages: {
        title: 'Chụp trang sách rõ nét',
        items: {
          flat: 'Đặt sách phẳng, đè nhẹ gáy sách để trang không bị cong.',
          light: 'Chụp nơi đủ sáng, tránh bóng tay và vệt lóa của đèn.',
          parallel: 'Giữ điện thoại song song với trang, lấy trọn công thức và hình.',
          onePage: 'Mỗi ảnh một trang; nhiều trang thì nên dùng tệp PDF.',
          check: 'Phóng to ảnh để kiểm tra: chữ đọc được thì AI mới đọc đúng.',
        },
      },
      objects: {
        title: 'Chụp vật thật',
        items: {
          background: 'Đặt vật trên nền trơn, khác màu với vật.',
          whole: 'Chụp trọn vật, không bị che khuất, ngang tầm vật.',
          measure: 'Tự đo rồi nhập số liệu (chiều dài, khối lượng…): ảnh không đo chính xác được. Giá trị bạn nhập mang nhãn “Người dùng cung cấp”.',
          select: 'Dùng SAM để chọn vật trong ảnh, rồi xem và chỉnh lại vùng chọn.',
        },
      },
      videos: {
        title: 'Video thực hành ngắn và an toàn',
        items: {
          short: 'Quay ngắn, tối đa 5 phút; mỗi video tập trung vào một kỹ thuật.',
          steady: 'Đặt máy cố định, quay ngang, đủ sáng và thấy trọn động tác.',
          safe: 'Khởi động kỹ, tập ở nơi an toàn, không yêu cầu động tác vượt sức học sinh.',
          consent: 'Chỉ quay học sinh khi có sự đồng ý của các em và phụ huynh theo quy định của trường; hạn chế quay cận mặt.',
          standard: 'Với video có học sinh, hãy dùng chế độ AI Tiêu chuẩn để nội dung không được dùng huấn luyện mô hình.',
        },
      },
      review: {
        title: 'Kiểm tra kết quả AI',
        items: {
          formula: 'So công thức và số liệu với sách: AI có thể đọc nhầm chỉ số, dấu hoặc đơn vị.',
          order: 'Xác nhận thứ tự các bước khi tài liệu không nói rõ.',
          assumptions: 'Ghi rõ giả định (ví dụ bỏ qua lực cản) để học sinh biết giới hạn của mô hình.',
          unknown: 'Mục “Chưa xác định” cần được bổ sung hoặc bỏ đi trước khi chia sẻ.',
          quiz: 'Duyệt từng câu hỏi và đáp án; câu chưa duyệt sẽ không đến với học sinh.',
        },
      },
      share: {
        title: 'Chia sẻ trong lớp',
        items: {
          code: 'Viết mã 6 ký tự lên bảng; học sinh mở trang “Vào lớp bằng mã”.',
          qr: 'Hoặc chiếu mã QR để học sinh quét bằng điện thoại.',
          projector: 'Chiếu bài học lên máy chiếu và phóng to trình duyệt để cả lớp cùng quan sát.',
          weak: 'Mạng ở lớp yếu? Mở sẵn bài học trên máy chiếu trước giờ học.',
          update: 'Học sinh chỉ thấy phiên bản đã chia sẻ. Sửa xong, hãy chia sẻ lại để cập nhật.',
        },
      },
    },
  },
  students: {
    title: 'Dành cho học sinh và sinh viên',
    lead: 'Bài học là để bạn thử, đoán, sai và hiểu ra. Không có gì bị hỏng khi bạn bấm thử.',
    explore: {
      title: 'Khám phá bài học',
      items: {
        click: 'Bấm từng bước, từng bộ phận trên hình để xem giải thích.',
        sliders: 'Kéo thanh trượt hoặc nhập số để thay đổi thông số, rồi quan sát đồ thị và mô phỏng.',
        run: 'Chạy, tạm dừng, chạy lại; so sánh hai kịch bản cạnh nhau.',
        hide: 'Ẩn nhãn trên sơ đồ để tự kiểm tra xem mình nhớ được bao nhiêu.',
      },
    },
    active: {
      title: 'Học chủ động: đoán trước, kiểm tra sau',
      steps: {
        predict: 'Dự đoán kết quả',
        change: 'Thay đổi thông số',
        run: 'Chạy mô hình',
        compare: 'So sánh với dự đoán',
        explain: 'Đọc giải thích và nguồn',
      },
      note: 'Đoán sai cũng không sao: đó thường là lúc bạn học được nhiều nhất.',
    },
    ask: {
      title: 'Hỏi trợ lý AI',
      items: {
        speak: 'Gõ hoặc nói câu hỏi, ví dụ: “Tại sao đồ thị thay đổi?”',
        context: 'Hỏi ngay tại bước hay hình đang xem để AI biết bạn đang nói về phần nào.',
        citations: 'Các số như [1] trong câu trả lời dẫn tới đoạn tài liệu được dùng; phần nằm ngoài tài liệu được ghi rõ.',
        wrong: 'AI có thể sai. Hãy mở nguồn để kiểm tra và hỏi lại thầy cô khi chưa chắc.',
      },
    },
    sources: {
      title: 'Kiểm tra nguồn',
      lead: 'Mỗi thông tin có một nhãn cho biết nó đến từ đâu:',
      note: 'Bấm vào nhãn hoặc trích dẫn để mở đúng trang tài liệu. Nếu thấy “Không xác định được vị trí chính xác”, nghĩa là ứng dụng không tìm được vị trí đáng tin cậy, hãy tự tìm trong tài liệu.',
    },
  },
  faq: {
    title: 'Câu hỏi thường gặp',
    lead: 'Những giới hạn mà bạn nên biết, nói thẳng và rõ ràng.',
    items: {
      wrong: {
        q: 'AI có thể sai không?',
        a: 'Có. AI có thể đọc nhầm công thức, hiểu sai hình hoặc trả lời chưa chính xác. Vì vậy nội dung AI tạo luôn mang nhãn cần kiểm tra, giáo viên xác nhận trước khi chia sẻ, và câu trả lời luôn kèm nguồn để đối chiếu.',
      },
      grading: {
        q: 'Ứng dụng có chấm điểm động tác hay phát hiện chấn thương từ video không?',
        a: 'Không. Phiên bản hiện tại không tự chấm điểm động tác, không đo góc khớp chính xác và không chẩn đoán nguy cơ chấn thương. AI chỉ gợi ý thời điểm cần quan sát; giáo viên vẫn là người đánh giá và hướng dẫn thực hành.',
      },
      simulation: {
        q: 'Kết quả mô phỏng có phải số đo thật không?',
        a: 'Không. Mô phỏng là mô hình chạy theo những giả định đã nêu (ví dụ góc nhỏ, bỏ qua lực cản). Kết quả giúp hiểu xu hướng, không thay cho phép đo hay thí nghiệm thật. Các bước kiểm tra tự động giúp phát hiện lỗi nhưng không chứng minh mô hình đúng trong mọi điều kiện.',
      },
      modes: {
        q: 'Chế độ AI Đóng góp và Tiêu chuẩn khác nhau thế nào?',
        a: 'Ở chế độ Đóng góp, nội dung gửi tới AI có thể được Meta dùng để huấn luyện mô hình trong tương lai, đổi lại chi phí thấp hơn. Ở chế độ Tiêu chuẩn, nội dung không được dùng để huấn luyện. Hãy dùng Tiêu chuẩn cho ảnh, video có học sinh và tài liệu riêng tư. Mỗi bài học có thể chọn một chế độ.',
      },
      account: {
        q: 'Học sinh có cần tài khoản không?',
        a: 'Để vào lớp và khám phá bài học thì không cần. Học sinh chỉ cần tài khoản khi muốn tự tạo bài học. Học sinh dưới 16 tuổi nên đăng ký khi có sự đồng ý của thầy cô hoặc cha mẹ.',
      },
      visibility: {
        q: 'Ai xem được bài học của tôi?',
        a: 'Bài học là bản nháp riêng tư cho đến khi bạn chia sẻ. Khi chia sẻ, bạn chọn “chỉ người có mã hoặc đường dẫn” hay “công khai trong thư viện”, và có thể ngừng chia sẻ bất cứ lúc nào.',
      },
      delete: {
        q: 'Làm sao để xóa dữ liệu?',
        a: 'Bạn có thể xóa từng nguồn khi chỉnh sửa bài học, xóa cả bài học trong trang “bài học của tôi”, và xóa toàn bộ tài khoản trong trang Tài khoản. Khi xóa, các tệp đã tải lên cũng bị xóa khỏi máy chủ của ứng dụng.',
      },
      offline: {
        q: 'Không có mạng thì có dùng được không?',
        a: 'Cần kết nối mạng để mở bài học và dùng các tính năng AI. Ứng dụng được làm nhẹ để vẫn chạy khi mạng chậm; nếu mạng ở lớp yếu, hãy mở sẵn bài học trên máy chiếu trước giờ học.',
      },
      ranking: {
        q: 'Kết quả lớp có xếp hạng học sinh không?',
        a: 'Không. Giáo viên chỉ thấy số liệu tổng hợp, như tỉ lệ trả lời đúng của từng câu hỏi. Ứng dụng không xếp hạng học sinh và không dùng video để nhận diện ai.',
      },
    },
  },
  cta: {
    title: 'Sẵn sàng thử chưa?',
    body: 'Bắt đầu với trang sách bạn đang dạy, hoặc mở một bài học mẫu để xem học sinh sẽ trải nghiệm thế nào.',
    create: 'Tạo bài học đầu tiên',
    gallery: 'Xem bài học mẫu',
  },
}
