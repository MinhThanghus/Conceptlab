"""Correct exact legacy demo strings without rebuilding labs or touching user content."""

from sqlalchemy import select

from ..models import Lab, Source, User
from .demo import DEMO_EMAIL


# Exact old text only: teacher edits and material belonging to other accounts are left alone.
REPLACEMENTS = {
    "Từ trang sách Vật lý 10 (Bài 12), ảnh con lắc chụp trong lớp và chiều dài dây do nhóm học sinh đo, Lab này giúp em khám phá chu kỳ của con lắc đơn: xem từng bước, chạy mô phỏng với chính quả nặng trong ảnh, vẽ đồ thị và đối chiếu với ví dụ trong sách.":
        "Từ trang sách Vật lý 10 (Bài 12), ảnh con lắc chụp trong lớp và chiều dài dây do nhóm học sinh đo, bài học này giúp em khám phá chu kỳ của con lắc đơn: xem từng bước, chạy mô phỏng với chính quả nặng trong ảnh, vẽ đồ thị và đối chiếu với ví dụ trong sách.",
    "Vật lý 10, Bài 12: Con lắc đơn, trang 64 (trang sách minh họa dựng cho bản demo; illustration made for the demo)":
        "Vật lý 10, Bài 12: Con lắc đơn, trang 64 (trang sách minh họa dựng cho bản mẫu)",
    "Ảnh con lắc trong lớp (ảnh dựng 3D minh họa cho bản demo; 3D illustration made for the demo)":
        "Ảnh con lắc trong lớp (ảnh dựng 3D minh họa cho bản mẫu)",
    "GDTC 7, Bóng chuyền: kỹ thuật đệm bóng, trang 38 (trang sách minh họa dựng cho bản demo; illustration made for the demo)":
        "GDTC 7, Bóng chuyền: kỹ thuật đệm bóng, trang 38 (trang sách minh họa dựng cho bản mẫu)",
    "Video động tác đệm bóng (hoạt hình minh họa dựng cho bản demo; animation made for the demo)":
        "Video động tác đệm bóng (hoạt hình minh họa dựng cho bản mẫu)",
    "Sơ đồ hệ tuần hoàn (sơ đồ minh họa dựng cho bản demo; diagram made for the demo)":
        "Sơ đồ hệ tuần hoàn (sơ đồ minh họa dựng cho bản mẫu)",
    "Mô hình vòng tuần hoàn của nước (hình 3D minh họa dựng cho bản demo; 3D illustration made for the demo)":
        "Mô hình vòng tuần hoàn của nước (hình 3D minh họa dựng cho bản mẫu)",
    "Khám phá công thức Scaled Dot-Product Attention trong một trích đoạn bài báo: xem quy trình 4 bước, chạy ví dụ ma trận nhỏ với heatmap, và tìm hiểu vì sao phải chia cho √dₖ. Mọi giải thích đều dẫn về đúng dòng trong PDF.":
        "Khám phá công thức Scaled Dot-Product Attention trong một trích đoạn bài báo: xem quy trình 4 bước, chạy ví dụ ma trận nhỏ với bản đồ nhiệt, và tìm hiểu vì sao phải chia cho √dₖ. Mọi giải thích đều dẫn về đúng dòng trong PDF.",
    "Tính tay attention cho một ví dụ nhỏ và đối chiếu với heatmap.":
        "Tính tay cơ chế chú ý cho một ví dụ nhỏ và đối chiếu với bản đồ nhiệt.",
    "Thay đổi Q, K, V để xem heatmap trọng số thay đổi.":
        "Thay đổi Q, K, V để xem bản đồ nhiệt của trọng số thay đổi.",
    "**Attention** giúp mỗi token (query) tìm xem nên chú ý vào những token nào (keys) và lấy thông tin (values) tương ứng. Đầu ra là **tổng có trọng số của các value** [1].\n\n$$\\mathrm{Attention}(Q,K,V) = \\mathrm{softmax}\\left(\\frac{QK^\\top}{\\sqrt{d_k}}\\right)V$$\n\nLab này chỉ minh họa **một thành phần** với dữ liệu nhỏ — trích đoạn cũng nói rõ không tái hiện quá trình huấn luyện hay kết quả thí nghiệm.":
        "**Cơ chế chú ý** giúp mỗi đơn vị truy vấn tìm xem nên chú ý vào những đơn vị khóa nào và lấy các giá trị tương ứng. Đầu ra là **tổng có trọng số của các giá trị** [1].\n\n$$\\mathrm{Attention}(Q,K,V) = \\mathrm{softmax}\\left(\\frac{QK^\\top}{\\sqrt{d_k}}\\right)V$$\n\nBài học này chỉ minh họa **một thành phần** với dữ liệu nhỏ — trích đoạn cũng nói rõ không tái hiện quá trình huấn luyện hay kết quả thí nghiệm.",
    "Quy trình tính attention (Hình 1)": "Quy trình tính cơ chế chú ý (Hình 1)",
    "Ma trận query, key và value của các token (mỗi hàng là một token).":
        "Ma trận truy vấn, khóa và giá trị của các đơn vị đầu vào (mỗi hàng là một đơn vị).",
    "Bước 1: tính điểm tương đồng giữa mỗi query và mọi key bằng tích vô hướng.":
        "Bước 1: tính điểm tương đồng giữa mỗi truy vấn và mọi khóa bằng tích vô hướng.",
    "Bước 4: lấy tổng có trọng số của các value để được đầu ra cho từng query.":
        "Bước 4: lấy tổng có trọng số của các giá trị để được đầu ra cho từng truy vấn.",
    "Với hai key, trọng số softmax của key 1 phụ thuộc vào chênh lệch điểm thô giữa hai key.":
        "Với hai khóa, trọng số softmax của khóa 1 phụ thuộc vào chênh lệch điểm thô giữa hai khóa.",
    "Trọng số của key 1": "Trọng số của khóa 1",
    "dₖ (số chiều của key)": "dₖ (số chiều của khóa)",
    "Khi $d_k$ lớn, tích vô hướng thô thường lớn (cỡ $\\sqrt{d_k}$). Nếu không chia, softmax gần như chỉ cho 0 hoặc 1 (bão hòa) và gradient rất nhỏ [1]. Chia cho $\\sqrt{d_k}$ giữ đường cong thoải hơn. Đây là minh họa với hai key (giả định), không phải số liệu trong bài báo.":
        "Khi $d_k$ lớn, tích vô hướng thô thường lớn (cỡ $\\sqrt{d_k}$). Nếu không chia, softmax gần như chỉ cho 0 hoặc 1 (bão hòa) và đạo hàm rất nhỏ [1]. Chia cho $\\sqrt{d_k}$ giữ đường cong thoải hơn. Đây là minh họa với hai khóa (giả định), không phải số liệu trong bài báo.",
    "Để tích vô hướng không quá lớn khiến softmax bão hòa và gradient rất nhỏ":
        "Để tích vô hướng không quá lớn khiến softmax bão hòa và đạo hàm rất nhỏ",
    "Bài báo nêu: khi dₖ lớn, tích vô hướng lớn đẩy softmax vào vùng có gradient cực nhỏ.":
        "Bài báo nêu: khi dₖ lớn, tích vô hướng lớn đẩy softmax vào vùng có đạo hàm cực nhỏ.",
    "Trích đoạn giải thích attention dạng tích vô hướng có chia √dₖ, multi-head attention, bảng độ phức tạp và một ví dụ nhỏ.":
        "Trích đoạn giải thích cơ chế chú ý dựa trên tích vô hướng có chia √dₖ, cơ chế chú ý nhiều đầu, bảng độ phức tạp và một ví dụ nhỏ.",
    "Attention ánh xạ query và các cặp key-value thành đầu ra.":
        "Cơ chế chú ý ánh xạ truy vấn và các cặp khóa–giá trị thành đầu ra.",
    "Scaled dot-product attention, quy trình 4 bước, multi-head.":
        "Cơ chế chú ý theo tích vô hướng có chia tỉ lệ, quy trình 4 bước và chú ý nhiều đầu.",
    "Định nghĩa scaled dot-product attention.": "Định nghĩa cơ chế chú ý theo tích vô hướng có chia tỉ lệ.",
    "Ghép nhiều đầu attention song song.": "Ghép nhiều đầu chú ý song song.",
    "số chiều của key": "số chiều của khóa",
    "Ma trận query": "Ma trận truy vấn",
    "Ma trận key": "Ma trận khóa",
    "Ma trận value": "Ma trận giá trị",
    "Số chiều của key": "Số chiều của khóa",
    "Sắp xếp các bước tính attention.": "Sắp xếp các bước tính cơ chế chú ý.",
    "Sau softmax, các trọng số của một query có tổng bằng 1.":
        "Sau softmax, các trọng số của một truy vấn có tổng bằng 1.",
}

DEMO_CODES = frozenset({"TPEND6", "VBPASS", "ATTN24", "HEART8", "WATER6"})
# A citation or source excerpt must remain verbatim, even when it exactly matches a
# translatable description elsewhere. Preserve entire subtrees under these names.
SOURCE_TEXT_KEYS = frozenset({"quote", "excerpt", "original", "original_text", "source_text", "raw_text", "text_content"})


def _replace_exact(value):
    if isinstance(value, str):
        return REPLACEMENTS.get(value, value)
    if isinstance(value, list):
        return [_replace_exact(item) for item in value]
    if isinstance(value, dict):
        return {key: item if key in SOURCE_TEXT_KEYS else _replace_exact(item) for key, item in value.items()}
    return value


def localize_existing(db):
    """Update matching current/snapshot strings only; never rebuild or remove records."""
    labs = db.scalars(
        select(Lab).join(User, Lab.owner_id == User.id).where(
            User.email == DEMO_EMAIL, User.is_system.is_(True), Lab.is_demo.is_(True),
            Lab.share_code.in_(DEMO_CODES),
        )
    ).all()
    lab_changes = source_changes = 0
    for lab in labs:
        changed = False
        for field in ("spec_json", "analysis_json", "published_spec_json"):
            old = getattr(lab, field)
            new = _replace_exact(old)
            if new != old:
                setattr(lab, field, new)
                changed = True
        for source in db.scalars(select(Source).where(Source.lab_id == lab.id)):
            title = REPLACEMENTS.get(source.title, source.title)
            if title != source.title:
                source.title = title
                source_changes += 1
        lab_changes += int(changed)
    db.commit()
    return lab_changes, source_changes
