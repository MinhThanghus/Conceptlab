"""Hand-written, reviewed lesson content for the demo labs (Vietnamese, curriculum-aligned)."""

from __future__ import annotations

import json
from pathlib import Path

from .demo import ASSETS, AssetDef, Ctx, DemoDef, SourceDef, bbox_px, q, question

NOW = "2026-10-28T00:00:00+00:00"


def blk(bid, btype, title, description="", refs=None, **extra):
    return {"id": bid, "type": btype, "title": title, "description": description, "source_refs": refs or [], "confirmed": True,
            "ai_generated": False, **extra}


def step(sid, title, body, refs=None, highlight=None, check=None):
    return {"id": sid, "title": title, "body": body, "source_refs": refs or [], "highlight": highlight, "check_question": check}


def term(tid, vi, en, note=""):
    return {"id": tid, "vi": vi, "en": en, "note": note}


def assume(aid, text):
    return {"id": aid, "text": text, "confirmed": True}


# ============================================================================ 1. Con lắc đơn (Demo 1)
def build_pendulum(c: Ctx):
    # Boxes measured on the rendered page (scripts/render/render.py page-pendulum finds each quote in the DOM).
    page = lambda bbox, quote: c.ref("page", page=1, page_label="64", bbox=bbox, quote=quote, exact=True)  # noqa: E731
    r_struct = page([0.0831, 0.2156, 0.6209, 0.2799], "Con lắc đơn gồm một vật nhỏ khối lượng m treo vào đầu một sợi dây không dãn, khối lượng không đáng kể, có chiều dài L.")
    r_small = page([0.0831, 0.3848, 0.6161, 0.4284], "Kéo vật lệch khỏi vị trí cân bằng một góc nhỏ (dưới 10°) rồi thả nhẹ.")
    r_formula = page([0.0831, 0.4523, 0.6331, 0.5296], "T = 2π √(L/g)   (12.1)")
    r_vars = page([0.0831, 0.5336, 0.6164, 0.598], "T là chu kỳ dao động (s); L là chiều dài dây (m); g là gia tốc trọng trường (m/s²). Ở gần mặt đất lấy g = 9,81 m/s².")
    r_notes = page([0.0831, 0.6336, 0.6064, 0.6772], "Chu kỳ không phụ thuộc vào khối lượng m của vật. Khi góc lệch nhỏ, chu kỳ gần như không phụ thuộc biên độ.")
    r_example = page([0.1024, 0.7359, 0.6099, 0.7795], "Với g = 9,81 m/s²: L = 1 m thì T ≈ 2,01 s; L = 0,25 m thì T ≈ 1,00 s.")
    r_question = page([0.6766, 0.8176, 0.8886, 0.8768], "Nếu tăng chiều dài dây lên 4 lần thì chu kỳ dao động thay đổi thế nào?")
    sam = json.loads((ASSETS / "pendulum_bob_sam.json").read_text(encoding="utf-8"))
    x1, y1, x2, y2 = sam["box"]
    r_bob = c.ref("photo", bbox=bbox_px(x1, y1, x2 + 1, y2 + 1, sam["image_width"], sam["image_height"]), quote="Quả nặng (SAM 3.1: red ball)")
    r_data = c.ref("data", quote="L = 0,80 m; thời gian 10 dao động = 18,1 s")

    spec = {
        "schema_version": 1,
        "summary": "Khi góc lệch nhỏ, chu kỳ của con lắc đơn chỉ phụ thuộc chiều dài dây và gia tốc trọng trường, không phụ thuộc quả nặng. Bài học đi từ trang 64 sách Vật lý 10 đến ảnh con lắc trong lớp và số đo của nhóm 3 để hiểu vì sao.",
        "objectives": [
            "Nêu được cấu tạo của con lắc đơn.",
            r"Vận dụng công thức $T = 2\pi\sqrt{L/g}$ để tính chu kỳ.",
            "Giải thích vì sao chu kỳ không phụ thuộc khối lượng quả nặng.",
        ],
        "glossary": [
            term("g1", "chu kỳ", "period", "Thời gian con lắc thực hiện một dao động toàn phần, đo bằng giây (s)."),
            term("g2", "con lắc đơn", "simple pendulum", "Một vật nhỏ treo vào đầu sợi dây không dãn, khối lượng dây không đáng kể."),
            term("g3", "chiều dài dây", "string length", "Khoảng cách từ điểm treo đến tâm quả nặng, ký hiệu L, đo bằng mét (m)."),
            term("g4", "gia tốc trọng trường", "gravitational acceleration",
                 "Gia tốc của vật rơi tự do do Trái Đất hút, ký hiệu g; gần mặt đất lấy g = 9,81 m/s²."),
            term("g5", "biên độ", "amplitude", "Độ lệch lớn nhất của vật khỏi vị trí cân bằng; với con lắc là góc lệch lớn nhất."),
            term("g6", "vị trí cân bằng", "equilibrium position", "Vị trí vật đứng yên khi không bị kéo lệch: dây treo thẳng đứng."),
            term("g7", "dao động điều hòa", "simple harmonic motion",
                 "Dao động qua lại quanh vị trí cân bằng, trong đó độ lệch thay đổi theo thời gian như một hàm sin."),
        ],
        "assumptions": [
            assume("a1", "Góc lệch nhỏ (dưới 10°), theo sách."),
            assume("a2", "Bỏ qua lực cản của không khí."),
            assume("a3", "Dây không dãn, khối lượng dây không đáng kể."),
        ],
        "blocks": [
            blk("b1", "steps", "Con lắc đơn hoạt động thế nào?", "Từ cấu tạo con lắc, cách đo chu kỳ trong lớp đến công thức (12.1) ở trang 64.", [r_struct, r_formula],
                steps=[
                    step("s1", "Con lắc đơn: vật nhỏ treo vào dây không dãn", "Con lắc đơn gồm **một vật nhỏ** khối lượng $m$ treo vào **sợi dây không dãn** dài $L$, đầu dây kia giữ cố định. Dây không dãn nên khoảng cách từ điểm treo đến vật luôn bằng $L$ trong lúc đung đưa. Trong ảnh chụp ở lớp, quả cầu đỏ là vật $m$, còn sợi dây nhóm 3 đo được dài $L = 0{,}80$ m.",
                         [r_struct], r_struct, "Nếu thay sợi dây bằng dây chun, chiều dài L sẽ thế nào khi vật đung đưa?"),
                    step("s2", "Kéo lệch dưới 10° rồi thả nhẹ tay", "Kéo vật lệch khỏi vị trí cân bằng một góc **nhỏ, dưới 10°**, rồi **thả nhẹ** để con lắc tự dao động. Công thức chu kỳ trong sách chỉ đúng với góc nhỏ như vậy. Khi đó, kéo lệch 5° hay 8° thì chu kỳ gần như bằng nhau. Với dây 0,80 m của nhóm 3, góc 10° ứng với quả cầu lệch sang ngang khoảng 14 cm.",
                         [r_small], r_small, "Vì sao phải thả nhẹ tay mà không được đẩy quả nặng?"),
                    step("s3", "Bấm giờ 10 dao động rồi chia cho 10", "**Chu kỳ $T$** là thời gian của **một dao động toàn phần**: từ biên này sang biên kia rồi quay về chỗ cũ. Mỗi lần bấm đồng hồ, tay em có thể sớm hoặc muộn một chút. Đo 10 dao động rồi chia cho 10 thì sai lệch đó cũng nhỏ đi 10 lần. Nhóm 3 đo được 18,1 s cho 10 dao động, nên $T = 18{,}1 : 10 = 1{,}81$ s.",
                         [r_data], r_bob, "Muốn đo T chính xác hơn nữa, nhóm 3 có thể làm thế nào?"),
                    step("s4", "Chu kỳ chỉ phụ thuộc chiều dài dây và g", "Khi góc lệch nhỏ và bỏ qua lực cản, chu kỳ tính theo công thức (12.1):\n$$T = 2\\pi\\sqrt{\\frac{L}{g}}$$\nTrong đó: $T$ là chu kỳ (s), $L$ là chiều dài dây (m), $g$ là gia tốc trọng trường (m/s²); gần mặt đất lấy $g = 9{,}81$ m/s².\n\nVí dụ, dây dài $L = 1$ m: $\\sqrt{\\frac{1}{9{,}81}} \\approx 0{,}3193$ s, nhân với $2\\pi$ được $T \\approx 2{,}01$ s, đúng như ví dụ trong sách.",
                         [r_formula, r_vars, r_example], r_formula),
                    step("s5", "Dây càng dài, con lắc dao động càng chậm", "Sách nêu hai nhận xét: chu kỳ **không phụ thuộc khối lượng $m$**, và khi góc nhỏ thì **gần như không phụ thuộc biên độ**. Ở cùng một nơi, $g$ không đổi nên chỉ chiều dài dây làm chu kỳ thay đổi. Nhưng $T$ tỉ lệ với $\\sqrt{L}$ chứ không tỉ lệ với $L$: dây dài gấp 9 lần thì chu kỳ chỉ gấp $\\sqrt{9} = 3$ lần.",
                         [r_notes, r_example], r_notes, "Vì sao dây dài gấp đôi mà chu kỳ không gấp đôi?"),
                ],
                sequence_confirmed=True, autoplay_seconds=8),
            blk("b2", "simulation", "Mô phỏng con lắc với quả nặng trong ảnh",
                "Quả nặng được tách từ ảnh chụp trong lớp bằng SAM 3.1. Chu kỳ tính theo công thức (12.1), bắt đầu với dây 0,80 m của nhóm 3.",
                [r_formula, r_data, r_bob],
                model="pendulum",
                params=[
                    q("L", "Chiều dài dây", "m", 0.8, 0.1, 2.5, 0.01, "input", "user", r_data),
                    q("g", "Gia tốc trọng trường", "m/s²", 9.81, 1.6, 24.8, 0.01, "constant", "document", r_vars),
                    q("theta0", "Góc lệch ban đầu", "°", 8, 2, 60, 1, "input", "assumption"),
                ],
                object_asset_id=c.asset["bob"],
                reference_cases=[
                    {"inputs": {"L": 1, "g": 9.81}, "output": "period", "expected": 2.006, "tolerance": 0.01},
                    {"inputs": {"L": 0.25, "g": 9.81}, "output": "period", "expected": 1.003, "tolerance": 0.01},
                ],
                active={
                    "enabled": True,
                    "question": "Nếu tăng chiều dài dây từ 0,25 m lên 1 m (gấp 4 lần) thì chu kỳ T thay đổi thế nào?",
                    "param": "L", "from_value": 0.25, "to_value": 1.0, "observe": "period",
                    "options": ["T tăng gấp 4 lần", "T tăng gấp 2 lần", "T không đổi", "T giảm một nửa"],
                    "correct_option": 1,
                    "explanation": "Vì $T = 2\\pi\\sqrt{L/g}$ nên T tỉ lệ với $\\sqrt{L}$. L tăng 4 lần thì $\\sqrt{L}$ tăng 2 lần, nên T tăng gấp đôi: từ khoảng 1,00 s lên khoảng 2,01 s, khớp với ví dụ trong sách.",
                },
                notes="Kết quả là mô phỏng theo các giả định đã chọn (góc nhỏ, bỏ qua lực cản), không phải phép đo trực tiếp từ bức ảnh. L = 0,80 m là số đo của nhóm học sinh. Khi góc lệch lớn (ví dụ 40°), chu kỳ thực tế lớn hơn công thức góc nhỏ một chút."),
            blk("b3", "graph", "Đồ thị chu kỳ T theo chiều dài L", "Mỗi điểm trên đường cong là chu kỳ của một con lắc có chiều dài L.", [r_formula, r_vars],
                expression="2*pi*sqrt(L/g)", x_var="L", x_min=0, x_max=2.5, y_min=0, y_max=3.4, x_label="L (m)", y_label="T (s)",
                params=[q("g", "Gia tốc trọng trường", "m/s²", 9.81, 1.6, 24.8, 0.01, "constant", "document", r_vars)],
                explanation="Đường cong đi lên nhưng thoải dần, vì $T$ tỉ lệ với $\\sqrt{L}$. Khi dây còn ngắn, nối thêm một đoạn làm $T$ tăng nhanh; khi dây đã dài, nối thêm đúng đoạn ấy thì $T$ tăng chậm hơn. Còn $g$ nằm ở mẫu số, dưới dấu căn, nên đổi $g$ thì cả đường cong cao lên hoặc thấp xuống.",
                active={
                    "enabled": True,
                    "question": "Trên Mặt Trăng (g ≈ 1,62 m/s²), con lắc dài 1 m có chu kỳ lớn hơn hay nhỏ hơn trên Trái Đất?",
                    "param": "g", "from_value": 9.81, "to_value": 1.62, "observe": "y",
                    "options": ["Lớn hơn", "Nhỏ hơn", "Bằng nhau"], "correct_option": 0,
                    "explanation": "g nhỏ hơn thì L/g lớn hơn nên T lớn hơn: khoảng 4,94 s so với khoảng 2,01 s trên Trái Đất.",
                }),
            blk("b4", "quiz", "Tự kiểm tra", "Thử sức với năm câu hỏi về chính con lắc của lớp mình.", [r_formula],
                questions=[
                    question("q1", "mcq", "Chu kỳ của con lắc đơn (góc nhỏ) phụ thuộc vào những đại lượng nào?",
                             ["Khối lượng m của quả nặng", "Chiều dài dây L và gia tốc trọng trường g", "Biên độ góc (khi góc nhỏ)", "Khối lượng m và chiều dài dây L"],
                             answer_index=1, cognitive_level="recall",
                             context="Nhóm 3 muốn con lắc trong ảnh dao động chậm lại. Minh định thay quả cầu đỏ bằng một quả nặng hơn, còn Lan muốn nối dài sợi dây.",
                             hint="Đọc lại công thức (12.1) trên trang sách: những đại lượng nào có mặt trong công thức?",
                             option_feedback=[
                                 "Khối lượng m không có trong T = 2π√(L/g): thay quả cầu đỏ bằng quả nặng hơn, chu kỳ vẫn như cũ.",
                                 "Công thức (12.1) chỉ chứa L và g, nên muốn con lắc chậm lại thì phải đổi một trong hai đại lượng này.",
                                 "Khi góc lệch dưới 10°, chu kỳ gần như không phụ thuộc biên độ. Xem lại bước Nhận xét trong bài.",
                                 "Lan nói đúng về chiều dài dây, nhưng khối lượng m không ảnh hưởng tới chu kỳ, còn g thì có.",
                             ],
                             explanation="Theo công thức (12.1), $T = 2\\pi\\sqrt{L/g}$ chỉ chứa L và g. Vì vậy nối dài dây làm con lắc chậm lại, còn thay quả nặng thì không.",
                             refs=[r_formula, r_notes]),
                    # q2 asked for T at L = 0,25 m, which the textbook example on the page (shown on the step slides)
                    # already gives. A replaced question takes a new id, so stored attempts never point at other text.
                    question("q6", "numeric", "Với L = 0,40 m và g = 9,81 m/s², chu kỳ T của con lắc mới bằng bao nhiêu giây?",
                             answer_value=1.269, tolerance=0.03, unit="s", cognitive_level="apply",
                             context="An cắt ngắn sợi dây của nhóm 3 còn 40 cm để con lắc dao động nhanh hơn.",
                             hint="Thay L (tính bằng mét) và g vào công thức (12.1); lấy căn bậc hai của L/g trước rồi mới nhân với 2π.",
                             explanation="Thay số vào công thức (12.1): $\\sqrt{\\frac{0{,}40}{9{,}81}} \\approx 0{,}2019$ s, nhân với $2\\pi$ được $T \\approx 1{,}27$ s. Dây ngắn hơn nên con lắc của An dao động nhanh hơn con lắc 0,80 m của nhóm 3 (khoảng 1,79 s).",
                             refs=[r_formula, r_vars]),
                    question("q3", "truefalse", "Với quả cầu sắt nặng gấp đôi, chu kỳ của con lắc cũng tăng gấp đôi.", ["Đúng", "Sai"], answer_index=1,
                             cognitive_level="understand",
                             context="Minh thay quả cầu đỏ trong ảnh bằng một quả cầu sắt nặng gấp đôi, vẫn giữ sợi dây dài 0,80 m.",
                             hint="Tìm khối lượng m trong công thức (12.1). Nếu không thấy m, điều đó cho em biết gì?",
                             option_feedback=[
                                 "Nhiều bạn nghĩ quả nặng hơn sẽ đung đưa chậm hơn, nhưng m không có trong T = 2π√(L/g), nên chu kỳ giữ nguyên.",
                                 "Chu kỳ không phụ thuộc khối lượng: quả cầu sắt và quả cầu đỏ treo cùng sợi dây 0,80 m có cùng chu kỳ.",
                             ],
                             explanation="Sai. Theo trang sách, chu kỳ không phụ thuộc khối lượng m của vật; chỉ chiều dài dây L và gia tốc trọng trường g làm chu kỳ thay đổi.",
                             refs=[r_notes]),
                    question("q4", "mcq", "Vì sao hai kết quả chênh nhau một chút?",
                             ["Sai số khi bấm giờ và các giả định của mô hình (góc nhỏ, bỏ qua lực cản)", "Công thức trong sách bị sai", "Khối lượng quả nặng làm chu kỳ tăng", "Mô phỏng đo trực tiếp từ ảnh nên kém chính xác"],
                             answer_index=0, cognitive_level="extend",
                             context="Nhóm 3 đo được L = 0,80 m và bấm giờ 10 dao động hết 18,1 s, tức T ≈ 1,81 s. Mô phỏng với cùng chiều dài dây cho T ≈ 1,79 s.",
                             hint="So sánh hai cách làm: một bên bấm giờ bằng tay, một bên tính từ công thức với những giả định lý tưởng.",
                             option_feedback=[
                                 "Bấm giờ bằng tay luôn có sai số, còn mô hình coi góc là nhỏ và bỏ qua lực cản. Chênh khoảng 1% là hợp lý.",
                                 "Chênh lệch khoảng 1% chưa đủ để nói công thức sai. Hãy nghĩ tới sai số của phép đo trước đã.",
                                 "Chu kỳ không phụ thuộc khối lượng m, nên quả nặng không thể làm chu kỳ dài thêm.",
                                 "Mô phỏng tính từ công thức với L = 0,80 m mà nhóm đã đo; nó không đo gì trên bức ảnh.",
                             ],
                             explanation="Mô hình dùng các giả định lý tưởng; phép đo thực có sai số bấm giờ. Chênh lệch khoảng 1% là hợp lý.", refs=[r_data]),
                    question("q5", "numeric", "Nếu tăng chiều dài dây lên 4 lần thì chu kỳ tăng lên bao nhiêu lần?",
                             answer_value=2, tolerance=0.01, unit="lần", cognitive_level="apply",
                             context="Đây là câu hỏi cuối trang 64. Ở nhà, Lan thử ngay: buộc chùm chìa khóa vào sợi chỉ dài 25 cm, rồi đổi sang sợi dài 1 m.",
                             hint="Chu kỳ tỉ lệ với căn bậc hai của L, không tỉ lệ với chính L.",
                             explanation="T tỉ lệ với $\\sqrt{L}$, mà $\\sqrt{4} = 2$: chu kỳ tăng gấp đôi, từ khoảng 1,00 s lên khoảng 2,01 s như ví dụ trong sách.",
                             refs=[r_question]),
                ]),
        ],
    }
    analysis = {
        "status": "done", "model": "muse-spark-1.3", "mode": "standard", "created_at": NOW,
        "source_ids": [c.src["page"], c.src["photo"], c.src["data"]],
        "result": {
            "topic": "Con lắc đơn — chu kỳ dao động với góc nhỏ",
            "summary": "Trang sách mô tả cấu tạo con lắc đơn, điều kiện góc nhỏ và công thức chu kỳ T = 2π√(L/g). Ảnh cho thấy con lắc trong lớp; nhóm học sinh cung cấp chiều dài dây L = 0,80 m.",
            "objects": [{"id": "o1", "name": "Quả nặng (vật nhỏ m)", "description": "Quả cầu đỏ treo ở đầu dây.", "sam_phrase": "red ball",
                         "asset_id": c.asset["bob"], "source_id": c.src["photo"], "source_refs": [r_bob], "confirmed": True}],
            "formulas": [{"id": "f1", "latex": r"T = 2\pi\sqrt{\frac{L}{g}}", "expression": "2*pi*sqrt(L/g)", "output_symbol": "T",
                          "description": "Chu kỳ con lắc đơn khi góc nhỏ.", "variables": ["L", "g"], "source_refs": [r_formula], "confirmed": True}],
            "variables": [
                {**q("T", "Chu kỳ dao động", "s", None, None, None, None, "output", "document", r_vars)},
                {**q("L", "Chiều dài dây", "m", 0.8, 0.1, 2.5, 0.01, "input", "user", r_data)},
                {**q("g", "Gia tốc trọng trường", "m/s²", 9.81, 1.6, 24.8, 0.01, "constant", "document", r_vars)},
            ],
            "steps": [
                {"id": "st1", "title": "Kéo lệch góc nhỏ", "description": "Kéo vật lệch khỏi vị trí cân bằng góc dưới 10°.", "source_refs": [r_small], "confirmed": True},
                {"id": "st2", "title": "Thả nhẹ", "description": "Thả nhẹ để con lắc dao động điều hòa.", "source_refs": [r_small], "confirmed": True},
            ],
            "sequence_clear": True,
            "relations": [],
            "suggested_blocks": [
                {"type": "steps", "reason": "Trang sách trình bày theo trình tự.", "feasibility": "ready", "model": None, "algorithm": None},
                {"type": "simulation", "reason": "Có công thức và đủ thông số.", "feasibility": "ready", "model": "pendulum", "algorithm": None},
                {"type": "graph", "reason": "T phụ thuộc L theo công thức.", "feasibility": "ready", "model": None, "algorithm": None},
                {"type": "quiz", "reason": "Có ví dụ và câu hỏi cuối bài.", "feasibility": "ready", "model": None, "algorithm": None},
            ],
            "missing_info": [{"id": "m1", "text": "Chiều dài dây không đo chính xác được từ ảnh — cần số đo thực tế.", "symbol": "L", "resolved": True}],
            "assumptions": [assume("a1", "Góc lệch nhỏ (dưới 10°)."), assume("a2", "Bỏ qua lực cản của không khí.")],
            "warnings": [],
        },
        "paper": None,
    }
    return spec, analysis


# ============================================================================ 2. Đệm bóng (Demo 2)
def build_volleyball(c: Ctx):
    # Boxes measured on the rendered page (scripts/render/render.py page-volleyball); a panel's box is the whole panel.
    page = lambda bbox, quote: c.ref("page", page=1, page_label="38", bbox=bbox, quote=quote, exact=True)  # noqa: E731
    r_intro = page([0.1236, 0.1525, 0.4833, 0.1753], "Động tác gồm bốn giai đoạn liên tiếp")
    r_s1 = page([0.1218, 0.2024, 0.4965, 0.2639], "Hai chân rộng bằng vai, khuỵu gối, trọng tâm dồn ra trước, hai tay đưa ra trước, mắt quan sát hướng bóng bay đến.")
    r_s2 = page([0.5589, 0.2024, 0.9275, 0.2639], "Hai bàn tay úp chồng lên nhau, hai ngón cái song song, duỗi thẳng khuỷu tay để tạo mặt phẳng ở hai cẳng tay.")
    r_s3 = page([0.1218, 0.2933, 0.4876, 0.3549], "Bóng chạm phần cẳng tay phía trên cổ tay. Duỗi chân đẩy người lên, tay không vung quá vai.")
    r_s4 = page([0.5589, 0.2933, 0.9315, 0.3549], "Theo đà đưa người ra trước, hướng bóng tới mục tiêu, nhanh chóng trở về tư thế chuẩn bị.")
    panel_boxes = [[0.0831, 0.3614, 0.2964, 0.6146], [0.298, 0.3614, 0.5113, 0.6146], [0.5129, 0.3614, 0.7262, 0.6146], [0.7278, 0.3614, 0.9411, 0.6146]]
    panels = [page(panel_boxes[i], f"Hình 5 — H{i + 1}") for i in range(4)]
    r_safety = page([0.1024, 0.6595, 0.8862, 0.7031], "An toàn: khởi động kỹ cổ tay, khớp gối; tập trên sân bằng phẳng; không đệm bóng bằng bàn tay hay đầu ngón tay.")
    track = json.loads((ASSETS / "volleyball_ball_track.json").read_text(encoding="utf-8"))

    def player(pid, team, label, x, y):
        return {"id": pid, "team": team, "label": label, "x": x, "y": y}

    team_b = [player("b1", "B", "1", 0.86, 0.82), player("b2", "B", "2", 0.6, 0.8), player("b3", "B", "3", 0.58, 0.5),
              player("b4", "B", "4", 0.6, 0.2), player("b5", "B", "5", 0.84, 0.2), player("b6", "B", "6", 0.82, 0.5)]
    base_a = {"a1": (0.2, 0.8), "a2": (0.38, 0.78), "a3": (0.44, 0.5), "a4": (0.38, 0.22), "a5": (0.2, 0.2), "a6": (0.14, 0.5)}

    def team_a(moves=None):
        pos = dict(base_a)
        pos.update(moves or {})
        return [player(pid, "A", pid[1], x, y) for pid, (x, y) in pos.items()]

    def arrow(aid, kind, x1, y1, x2, y2):
        return {"id": aid, "kind": kind, "x1": x1, "y1": y1, "x2": x2, "y2": y2}

    frames = [
        {"id": "f1", "note": "Đội B phát bóng sang sân đội A. Cả đội A ở tư thế chuẩn bị, mắt theo bóng.",
         "players": team_a() + [player("b1", "B", "1", 0.97, 0.85)] + team_b[1:], "ball": {"x": 0.97, "y": 0.85},
         "arrows": [arrow("ar1", "pass", 0.97, 0.85, 0.18, 0.62)]},
        {"id": "f2", "note": "Số 6 di chuyển tới điểm rơi và đệm bóng lên cao về phía lưới, nơi số 3 (chuyền hai) đứng.",
         "players": team_a({"a6": (0.18, 0.6)}) + team_b, "ball": {"x": 0.18, "y": 0.62},
         "arrows": [arrow("ar2", "run", 0.14, 0.5, 0.18, 0.6), arrow("ar3", "pass", 0.18, 0.62, 0.43, 0.52)]},
        {"id": "f3", "note": "Số 3 chuyền hai cho số 4 lên đà đập bóng.",
         "players": team_a({"a6": (0.18, 0.6), "a4": (0.36, 0.26)}) + team_b, "ball": {"x": 0.43, "y": 0.52},
         "arrows": [arrow("ar4", "pass", 0.43, 0.52, 0.45, 0.2), arrow("ar5", "run", 0.36, 0.26, 0.44, 0.21)]},
    ]

    spec = {
        "schema_version": 1,
        "summary": "Đệm bóng thấp tay là cách đỡ bóng bằng mặt phẳng của hai cẳng tay để chuyền cho đồng đội. Theo trang 38 sách Giáo dục thể chất 7, động tác gồm bốn giai đoạn liên tiếp. Lực đẩy bóng đến từ đôi chân, không từ cú vung tay.",
        "objectives": [
            "Mô tả đúng bốn giai đoạn của kỹ thuật đệm bóng thấp tay.",
            "Nhận ra vị trí tiếp xúc bóng đúng trên cẳng tay.",
            "Vận dụng đệm bóng trong tình huống đỡ bước một và chuyền cho đồng đội.",
        ],
        "glossary": [
            term("g1", "đệm bóng thấp tay", "forearm pass (bump)", "Kỹ thuật đỡ bóng bằng mặt phẳng của hai cẳng tay, đưa bóng lên cao về phía đồng đội."),
            term("g2", "mặt đệm", "platform", "Mặt phẳng tạo bởi hai cẳng tay duỗi thẳng, áp sát nhau, là chỗ bóng chạm vào."),
            term("g3", "cẳng tay", "forearm", "Phần tay từ khuỷu tay đến cổ tay; khi đệm bóng, bóng chạm phần phía trên cổ tay."),
            term("g4", "tư thế chuẩn bị", "ready position", "Tư thế đứng chờ bóng: hai chân rộng bằng vai, khuỵu gối, trọng tâm dồn ra trước."),
            term("g5", "chuyền hai", "set", "Đường chuyền thứ hai của đội, đưa bóng lên gần lưới để đồng đội đập bóng."),
            term("g6", "đập bóng", "spike", "Cú đánh mạnh bằng một tay từ trên cao, đưa bóng cắm xuống sân đối phương."),
        ],
        "assumptions": [assume("a1", "Video là hoạt hình minh họa để luyện quan sát, không phải mẫu kỹ thuật đã được xác thực.")],
        "blocks": [
            blk("b1", "steps", "Bốn giai đoạn của động tác", "Bốn giai đoạn liên tiếp ở trang 38: chuẩn bị, tạo mặt đệm, tiếp xúc bóng và kết thúc động tác.", [r_intro],
                steps=[
                    step("s1", "Tư thế chuẩn bị: khuỵu gối, mắt theo bóng", "Hai chân rộng bằng vai, **khuỵu gối**, trọng tâm dồn ra trước, hai tay đưa ra trước và **mắt quan sát hướng bóng** bay đến. Gối khuỵu giúp em hạ thấp người, bước nhanh tới chỗ bóng rơi và sẵn sàng duỗi chân lấy lực. Khi đội bạn chuẩn bị phát bóng, em đứng sẵn tư thế này nên kịp di chuyển tới điểm bóng rơi.",
                         [r_s1], panels[0], "Nếu đứng thẳng chân chờ bóng, em sẽ gặp khó khăn gì khi bóng rơi xa?"),
                    step("s2", "Tạo mặt đệm phẳng bằng hai cẳng tay", "Hai bàn tay úp chồng lên nhau, **hai ngón cái song song**. Duỗi thẳng khuỷu tay để hai cẳng tay tạo thành **một mặt phẳng**. Mặt đệm phẳng thì bóng bật ra đều và đi đúng hướng; hai tay lệch nhau thì bóng dễ bay chéo. Khi bóng phát vừa qua lưới, em đã ghép tay xong, chỉ còn việc đưa mặt đệm vào đường bóng.",
                         [r_s2], panels[1]),
                    step("s3", "Tiếp xúc bóng: lực đến từ đôi chân", "Bóng chạm **phần cẳng tay phía trên cổ tay**, nơi hai cẳng tay áp sát nhau thành mặt phẳng. Lực đưa bóng lên đến từ việc **duỗi chân đẩy người lên**; hai tay chỉ giữ mặt đệm, **không vung quá vai** để bóng đi đúng hướng. Bóng phát tới thấp ngang hông thì em khuỵu gối sâu hơn, đưa mặt đệm xuống dưới bóng rồi mới duỗi chân.",
                         [r_s3], panels[2], "Nếu bóng chạm vào bàn tay thì điều gì có thể xảy ra?"),
                    step("s4", "Kết thúc: theo đà hướng bóng tới mục tiêu", "Sau khi chạm bóng, em **theo đà đưa người ra trước** và hướng mặt đệm về **mục tiêu**, thường là người chuyền hai. Mặt đệm hướng về đâu thì bóng bay về đó. Ví dụ, số 6 đệm bóng lên cao về phía lưới, nơi số 3 chuyền hai đang đứng. Xong động tác, em **nhanh chóng trở về tư thế chuẩn bị** để đón pha bóng tiếp theo.",
                         [r_s4], panels[3], "Nếu người chuyền hai đứng lệch sang bên trái em, em hướng mặt đệm thế nào?"),
                ],
                sequence_confirmed=True, autoplay_seconds=7),
            blk("b2", "video", "Xem chậm động tác mẫu", "Video hoạt hình có bốn mốc, ứng với bốn giai đoạn trong sách.", [r_s3],
                source_id=c.src["video"],
                markers=[
                    {"id": "m1", "t": 0.5, "label": "Tư thế chuẩn bị", "note": "Gối khuỵu, mắt nhìn theo bóng.", "confirmed": True, "ai_suggested": False},
                    {"id": "m2", "t": 1.25, "label": "Tạo mặt đệm", "note": "Hạ thấp trọng tâm, hai tay duỗi thẳng ra trước.", "confirmed": True, "ai_suggested": False},
                    {"id": "m3", "t": 2.0, "label": "Tiếp xúc bóng", "note": "Bóng chạm cẳng tay; duỗi chân đẩy người lên.", "confirmed": True, "ai_suggested": False},
                    {"id": "m4", "t": 2.6, "label": "Kết thúc", "note": "Bóng bay lên cao về phía mục tiêu.", "confirmed": True, "ai_suggested": False},
                ],
                compare={"source_id": c.src["page"], "page": None, "asset_id": None},
                tracks=[{"id": "t1", "phrase": "quả bóng", "frames": track["frames"]}],
                limits_note="Video là hoạt hình minh họa do nhóm ConceptLab dựng. Khi dạy, hãy dùng video thật do giáo viên quay (có sự đồng ý của người trong video)."),
            blk("b3", "field", "Tình huống đỡ bước một", "Tình huống đỡ bước một: đệm bóng phát về người chuyền hai để đội tổ chức tấn công.", [],
                sport="volleyball",
                prompt="Đội A nhận bóng phát. Em hãy kéo cầu thủ số 6 tới điểm bóng rơi, vẽ đường đệm bóng tới người chuyền hai (số 3) và giải thích vì sao em chọn hướng đó.",
                frames=frames, solution_frames=frames),
            blk("b4", "quiz", "Tự kiểm tra", "Bốn câu hỏi về động tác đệm bóng em vừa xem trong sách và video.", [r_intro],
                questions=[
                    question("q1", "order", "Sắp xếp các giai đoạn của kỹ thuật đệm bóng theo đúng thứ tự.",
                             ["Tư thế chuẩn bị", "Tạo mặt đệm", "Tiếp xúc bóng", "Kết thúc động tác"], answer_order=[0, 1, 2, 3],
                             cognitive_level="understand",
                             context="Đội bạn phát bóng sang, quả bóng đang bay về phía em.",
                             hint="Hình dung động tác từ lúc bóng còn ở sân bên kia cho tới khi bóng đã bay về phía đồng đội.",
                             explanation="Sách mô tả bốn giai đoạn liên tiếp theo đúng thứ tự này: chuẩn bị trước khi bóng tới, tạo mặt đệm, đón bóng bằng cẳng tay rồi theo đà hướng bóng tới mục tiêu.",
                             refs=[r_intro]),
                    question("q2", "mcq", "Khi đệm bóng, bóng nên chạm vào phần nào?",
                             ["Lòng bàn tay", "Phần cẳng tay phía trên cổ tay", "Khuỷu tay", "Các đầu ngón tay"], answer_index=1,
                             cognitive_level="recall",
                             context="Ở buổi tập đầu tiên, nhiều bạn để bóng chạm vào bàn tay nên bóng bay lệch hướng.",
                             hint="Xem lại hình H3 trong sách: hai tay tạo thành mặt đệm phẳng ở đâu?",
                             option_feedback=[
                                 "Lòng bàn tay mềm và không phẳng nên bóng dễ bật lệch; sách dặn không đệm bóng bằng bàn tay.",
                                 "Hai cẳng tay duỗi thẳng tạo mặt đệm phẳng, rộng ngay phía trên cổ tay, nên bóng đi đúng hướng.",
                                 "Khuỷu tay là chỗ gập, không phẳng; bóng chạm vào đó sẽ bật đi khó kiểm soát.",
                                 "Đệm bằng đầu ngón tay dễ đau tay và bóng đi lệch; sách dặn không đệm bóng bằng đầu ngón tay.",
                             ],
                             explanation="Mặt đệm là hai cẳng tay; bóng chạm phần phía trên cổ tay.", refs=[r_s3]),
                    question("q3", "truefalse", "Khi tiếp xúc bóng nên vung tay thật mạnh lên quá vai.", ["Đúng", "Sai"], answer_index=1,
                             cognitive_level="understand",
                             context="Nam muốn bóng bay thật cao nên mỗi lần đệm đều vung mạnh hai tay lên quá đầu.",
                             hint="Theo sách, lực đẩy bóng lên chủ yếu đến từ bộ phận nào của cơ thể?",
                             option_feedback=[
                                 "Vung tay quá vai làm bóng bay lệch, khó kiểm soát. Sách dặn lực đến từ việc duỗi chân, tay không vung quá vai.",
                                 "Lực đến từ việc duỗi chân đẩy người lên; hai tay chỉ giữ mặt đệm và không vung quá vai.",
                             ],
                             explanation="Sai. Lực đến từ việc duỗi chân; tay không vung quá vai.", refs=[r_s3]),
                    question("q4", "mcq", "Việc nào giúp tập đệm bóng an toàn?",
                             ["Khởi động kỹ cổ tay và khớp gối", "Chỉ khởi động hai tay vì đệm bóng dùng tay", "Đệm bóng bằng đầu ngón tay", "Đeo đồng hồ khi tập để canh giờ"],
                             answer_index=0, cognitive_level="recall",
                             context="Tiết thể dục buổi sáng, trời se lạnh, cả lớp chuẩn bị tập đệm bóng.",
                             hint="Trời lạnh, cơ và khớp còn cứng: trước khi đỡ những quả bóng mạnh, cơ thể cần chuẩn bị thế nào?",
                             option_feedback=[
                                 "Cổ tay và khớp gối chịu lực nhiều nhất khi đệm bóng, nên khởi động kỹ giúp tránh chấn thương.",
                                 "Đệm bóng dùng cả chân: gối khuỵu rồi duỗi để đẩy người lên, nên khớp gối cũng cần khởi động.",
                                 "Đầu ngón tay dễ bị đau khi bóng đập vào; sách dặn không đệm bóng bằng bàn tay hay đầu ngón tay.",
                                 "Đồng hồ có thể làm trầy cẳng tay và làm bóng đi lệch; hãy tháo đồng hồ, vòng tay trước khi tập.",
                             ],
                             explanation="Sách nhắc khởi động kỹ cổ tay, khớp gối và tập trên sân bằng phẳng.", refs=[r_safety]),
                ]),
        ],
    }
    return spec, None


# ============================================================================ 3. Attention (Demo 3)
def build_attention(c: Ctx):
    pr = lambda quote, page=None: c.pdf_ref("paper", quote, page)  # noqa: E731
    r_def = pr("An attention function maps a query and a set of key-value pairs to an output", 1)
    r_eq1 = pr("Attention(Q, K, V) = softmax( Q K^T / sqrt(d_k) ) V", 1)
    r_large = pr("For large d_k the dot products grow large in magnitude", 1)
    r_scale = pr("Scaling by 1/sqrt(d_k) counteracts this.", 1)
    r_step1 = pr("Step 1. Compute the score matrix S = Q K^T", 1)
    r_step2 = pr("Step 2. Scale the scores: S' = S / sqrt(d_k).", 1)
    r_step3 = pr("Step 3. Normalise each row with softmax so the weights of one query sum to 1.", 1)
    r_step4 = pr("Step 4. Multiply the weights by V to obtain the output for each query.", 1)
    r_fig = pr("Figure 1: Scaled Dot-Product Attention.", 1)
    r_mh = pr("MultiHead(Q, K, V) = Concat(head_1, ..., head_h) W^O", 2)
    r_dk = pr("We use h = 8 heads with d_k = d_v = d_model / h = 64.", 2)
    r_example = pr("Take three tokens with d_k = 2", 2)
    r_example2 = pr("after scaling by 1/sqrt(2) becomes about 1.41", 2)
    r_limits = pr("It does not reproduce training", 2)
    r_table = pr("Table 1: Complexity per layer and number of sequential operations.", 2)

    def node(nid, label, desc, refs):
        return {"id": nid, "label": label, "description": desc, "source_refs": refs}

    def edge(eid, s, t, label=""):
        return {"id": eid, "source": s, "target": t, "label": label, "description": "", "source_refs": []}

    spec = {
        "schema_version": 1,
        "summary": "Explore scaled dot-product attention in a study excerpt: follow four steps, run a small matrix example with a heat map, and discover why scores are divided by √dₖ. The explanations refer to the relevant lines in the PDF.",
        "objectives": [
            "Understand equation (1) and the roles of Q, K and V.",
            "Calculate attention for a small example and compare it with the heat map.",
            "Explain why the dot products are divided by √dₖ.",
        ],
        "glossary": [],
        "assumptions": [assume("a1", "This small example illustrates one part of the algorithm; it does not reproduce the full model or the paper's experiments.")],
        "blocks": [
            blk("b1", "text", "The main idea", "", [r_def, r_eq1, r_limits],
                body="**Attention** helps each query determine which keys to attend to and use their corresponding values. The output is a **weighted sum of values** [1].\n\n$$\\mathrm{Attention}(Q,K,V) = \\mathrm{softmax}\\left(\\frac{QK^\\top}{\\sqrt{d_k}}\\right)V$$\n\nThis lesson illustrates **one component** with a small example. The excerpt does not reproduce training or experimental results."),
            blk("b2", "flow", "Computing attention (Figure 1)", "Select each step to see the corresponding line in the excerpt.", [r_fig],
                layout="linear",
                nodes=[
                    node("n1", "Q, K, V", "Query, key and value matrices for the input tokens (one token per row).", [r_def]),
                    node("n2", "S = QKᵀ", "Step 1: use dot products to calculate similarity scores between each query and every key.", [r_step1]),
                    node("n3", "Divide by √dₖ", "Step 2: divide the scores by √dₖ to prevent large values when dₖ is large.", [r_step2, r_large]),
                    node("n4", "Row-wise softmax", "Step 3: turn each row of scores into positive weights that sum to 1.", [r_step3]),
                    node("n5", "Multiply by V", "Step 4: take a weighted sum of values to obtain an output for each query.", [r_step4]),
                ],
                edges=[edge("e1", "n1", "n2", "MatMul"), edge("e2", "n2", "n3", "Scale"), edge("e3", "n3", "n4", "Softmax"), edge("e4", "n4", "n5", "MatMul")]),
            blk("b3", "algorithm", "A small matrix example (section 4)", "Change Q, K and V to see how the weights change on the heat map.", [r_example, r_example2],
                algorithm="attention",
                config={"tokens": ["token 1", "token 2", "token 3"], "Q": [[1, 0], [0, 1], [1, 1]], "K": [[1, 0], [0, 1], [1, 1]],
                        "V": [[1, 0], [0, 1], [0.5, 0.5]]},
                explanation="The example comes from section 4 of the excerpt: three tokens, $d_k = 2$ and $Q = K$. Token 3's score with itself is 2; after division by $\\sqrt{2}$ it is approximately 1.41, so token 3 attends most to itself."),
            blk("b4", "graph", "Why divide by √dₖ?", "For two keys, the first key's softmax weight depends on the difference between their raw scores.", [r_large, r_scale, r_dk],
                expression="1/(1+exp(-x/sqrt(d)))", x_var="x", x_min=-40, x_max=40, y_min=0, y_max=1,
                x_label="Difference in raw scores q·k₁ − q·k₂", y_label="Weight of key 1",
                params=[q("d", "dₖ (key dimension)", "", 64, 1, 512, 1, "input", "document", r_dk)],
                explanation="When $d_k$ is large, raw dot products tend to be large (on the order of $\\sqrt{d_k}$). Without scaling, softmax can saturate near 0 or 1 and its gradients become very small [1]. Dividing by $\\sqrt{d_k}$ makes the curve less steep. This two-key example is an illustration, not data from the paper.",
                active={
                    "enabled": True,
                    "question": "Keep the raw score difference fixed. If dₖ increases from 4 to 256 while still dividing by √dₖ, what happens to the curve?",
                    "param": "d", "from_value": 4, "to_value": 256, "observe": "y",
                    "options": ["It becomes flatter", "It becomes steeper", "It stays the same"], "correct_option": 0,
                    "explanation": "Dividing by a larger number makes the softmax input smaller, so the weight changes more slowly and the curve becomes flatter.",
                }),
            blk("b5", "quiz", "Check your understanding", "Reviewed questions.", [r_eq1],
                questions=[
                    question("q1", "mcq", "According to the excerpt, why are dot products multiplied by 1/√dₖ?",
                             ["To prevent large dot products from saturating softmax and causing tiny gradients", "To reduce the number of matrix multiplications", "To make each row of V sum to 1", "To make Q and K have the same dimensions"],
                             answer_index=0, explanation="The excerpt says that large dot products can push softmax into regions with very small gradients when dₖ is large.", refs=[r_large, r_scale]),
                    question("q2", "numeric", "In the section 4 example (dₖ = 2), approximately what is token 3's score with itself after division by √2?",
                             answer_value=1.414, tolerance=0.02, explanation="$2/\\sqrt{2} = \\sqrt{2} \\approx 1.41$.", refs=[r_example2]),
                    question("q3", "order", "Put the attention calculation steps in order.", ["Compute S = QKᵀ", "Divide S by √dₖ", "Apply softmax to each row", "Multiply the weights by V"],
                             answer_order=[0, 1, 2, 3], explanation="This is the order in section 2.2 of the excerpt.", refs=[r_step1, r_step4]),
                    question("q4", "truefalse", "After softmax, the weights for one query sum to 1.", ["True", "False"], answer_index=0,
                             explanation="True. Softmax normalizes each row into a probability distribution.", refs=[r_step3]),
                ]),
        ],
    }
    paper = {
        "title": "Scaled Dot-Product Attention — a study excerpt",
        "summary": "The excerpt explains scaled dot-product attention, multi-head attention, a complexity table and a small example.",
        "sections": [
            {"id": "sec1", "title": "1 Introduction", "page_start": 1, "page_end": 1, "summary": "Attention maps a query and key–value pairs to an output."},
            {"id": "sec2", "title": "2 Method", "page_start": 1, "page_end": 2, "summary": "Scaled dot-product attention, the four-step calculation and multi-head attention."},
            {"id": "sec3", "title": "3 Analysis", "page_start": 2, "page_end": 2, "summary": "A complexity comparison by layer type."},
            {"id": "sec4", "title": "4 Worked example", "page_start": 2, "page_end": 2, "summary": "An example with three tokens and dₖ = 2."},
            {"id": "sec5", "title": "5 Limitations of this excerpt", "page_start": 2, "page_end": 2, "summary": "Training and experiments are not reproduced."},
        ],
        "equations": [
            {"id": "eq1", "label": "(1)", "latex": r"\mathrm{Attention}(Q,K,V)=\mathrm{softmax}\left(\frac{QK^\top}{\sqrt{d_k}}\right)V", "expression": "",
             "context": "Definition of scaled dot-product attention.",
             "variables": [
                 {"symbol": "Q", "meaning": "Query matrix", "unit": "", "known_value": None, "provenance": "document"},
                 {"symbol": "K", "meaning": "Key matrix", "unit": "", "known_value": None, "provenance": "document"},
                 {"symbol": "V", "meaning": "Value matrix", "unit": "", "known_value": None, "provenance": "document"},
                 {"symbol": "d_k", "meaning": "Key dimension", "unit": "", "known_value": 64, "provenance": "document"},
             ],
             "conditions": "Q and K have the same dimension dₖ.", "missing": ["Specific values of Q, K and V (use the small example in section 4)."],
             "explorable": True, "suggestion": "algorithm", "algorithm": "attention", "source_refs": [r_eq1]},
            {"id": "eq2", "label": "(2)", "latex": r"\mathrm{MultiHead}(Q,K,V)=\mathrm{Concat}(\mathrm{head}_1,\dots,\mathrm{head}_h)W^O", "expression": "",
             "context": "Concatenating multiple parallel attention heads.", "variables": [{"symbol": "h", "meaning": "Number of heads", "unit": "", "known_value": 8, "provenance": "document"}],
             "conditions": "", "missing": ["The learned projection matrices W_i^Q, W_i^K, W_i^V and W^O."], "explorable": False, "suggestion": "diagram", "algorithm": None,
             "source_refs": [r_mh]},
        ],
        "figures": [{"id": "fig1", "label": "Figure 1", "caption": "Scaled Dot-Product Attention.", "description": "Block diagram: Q, K → MatMul → Scale → Softmax → MatMul with V → Output.", "source_refs": [r_fig]}],
        "tables": [{"id": "tab1", "label": "Table 1", "caption": "Complexity per layer and number of sequential operations.",
                    "columns": ["Layer type", "Complexity per layer", "Sequential operations"],
                    "rows": [["Self-attention", "O(n^2 * d)", "O(1)"], ["Recurrent", "O(n * d^2)", "O(n)"], ["Convolutional", "O(k * n * d^2)", "O(1)"]],
                    "source_refs": [r_table]}],
        "methods": [{"id": "me1", "title": "Four-step calculation", "summary": "Compute QKᵀ, divide by √dₖ, apply row-wise softmax and multiply by V.", "source_refs": [r_step1, r_step4]}],
        "candidates": [
            {"id": "c1", "kind": "equation", "ref_id": "eq1", "title": "Run equation (1) on a small example", "reason": "Section 4 contains a numerical example.", "suggestion": "algorithm"},
            {"id": "c2", "kind": "figure", "ref_id": "fig1", "title": "Turn Figure 1 into a flow diagram", "reason": "The figure describes sequential steps.", "suggestion": "flow"},
            {"id": "c3", "kind": "table", "ref_id": "tab1", "title": "Compare complexity", "reason": "The table uses O() notation but has no numerical data to plot.", "suggestion": "none"},
        ],
        "warnings": [],
    }
    analysis = {"status": "done", "model": "muse-spark-1.3", "mode": "standard", "created_at": NOW, "source_ids": [c.src["paper"]], "result": None, "paper": paper}
    return spec, analysis


# ============================================================================ 4. Hàm số bậc hai
NOTE_QUADRATIC = (
    "Hàm số bậc hai y = ax² + bx + c (a ≠ 0). Đồ thị là một parabol có đỉnh I(−b/2a; −Δ/4a) với Δ = b² − 4ac, "
    "trục đối xứng là đường thẳng x = −b/2a. Nếu a > 0 thì parabol có bề lõm hướng lên trên; nếu a < 0 thì bề lõm hướng xuống dưới. "
    "Parabol cắt trục tung tại điểm (0; c)."
)


def build_quadratic(c: Ctx):
    r_note = c.ref("note", quote="Đồ thị là một parabol có đỉnh I(−b/2a; −Δ/4a)")
    r_sign = c.ref("note", quote="Nếu a > 0 thì parabol có bề lõm hướng lên trên; nếu a < 0 thì bề lõm hướng xuống dưới.")
    spec = {
        "schema_version": 1,
        "summary": "Đồ thị của hàm số bậc hai y = ax² + bx + c là một parabol. Chỉ từ ba hệ số a, b, c, em biết parabol quay lên hay xuống, đỉnh và trục đối xứng ở đâu, và cắt các trục tại những điểm nào.",
        "objectives": ["Nhận biết ảnh hưởng của dấu hệ số a tới bề lõm.", "Xác định đỉnh và trục đối xứng của parabol.", "Liên hệ biệt thức Δ với số giao điểm với trục hoành."],
        "glossary": [
            term("g1", "parabol", "parabola", "Đường cong là đồ thị của hàm số bậc hai, đối xứng qua một đường thẳng đứng."),
            term("g2", "đỉnh", "vertex", "Điểm thấp nhất (khi a > 0) hoặc cao nhất (khi a < 0) của parabol, nằm trên trục đối xứng."),
            term("g3", "trục đối xứng", "axis of symmetry", "Đường thẳng x = −b/2a đi qua đỉnh, chia parabol thành hai nửa giống hệt nhau."),
            term("g4", "biệt thức", "discriminant", "Số Δ = b² − 4ac, cho biết phương trình ax² + bx + c = 0 có hai, một hay không có nghiệm."),
            term("g5", "hệ số", "coefficient", "Các số a, b, c trong y = ax² + bx + c; a đứng trước x², b đứng trước x, c là số hạng tự do."),
        ],
        "assumptions": [],
        "blocks": [
            blk("b1", "graph", "Khám phá parabol y = ax² + bx + c", "Dấu của a quyết định bề lõm; a và b định vị trục đối xứng; c cho biết điểm cắt trục tung.", [r_note],
                expression="a*x^2 + b*x + c", x_var="x", x_min=-6, x_max=6, y_min=-10, y_max=10, x_label="x", y_label="y",
                params=[q("a", "Hệ số a", "", 1, -3, 3, 0.1), q("b", "Hệ số b", "", -2, -6, 6, 0.1), q("c", "Hệ số c", "", -3, -6, 6, 0.1)],
                explanation="Đường cong là parabol, đối xứng qua đường thẳng $x = -\\frac{b}{2a}$ và có đỉnh $I\\left(-\\frac{b}{2a}; -\\frac{\\Delta}{4a}\\right)$ nằm trên đường thẳng ấy. $|a|$ càng lớn, parabol càng hẹp; đổi $b$ thì đỉnh và trục đối xứng dời đi; đổi $c$ thì cả parabol trượt lên hoặc xuống. Biệt thức $\\Delta = b^2 - 4ac$ quyết định số giao điểm với trục hoành: hai khi $\\Delta > 0$, một (chính là đỉnh) khi $\\Delta = 0$, không có khi $\\Delta < 0$.",
                active={"enabled": True, "question": "Nếu đổi a từ 1 thành −1 (giữ nguyên b, c), parabol thay đổi thế nào?", "param": "a", "from_value": 1, "to_value": -1, "observe": "y",
                        "options": ["Bề lõm quay xuống dưới", "Chỉ dịch sang phải", "Không thay đổi", "Hẹp lại nhưng vẫn quay lên"], "correct_option": 0,
                        "explanation": "Dấu của a quyết định bề lõm: a < 0 thì parabol quay bề lõm xuống dưới."}),
            blk("b2", "steps", "Các bước vẽ parabol", "Làm mẫu với parabol y = x² − 4x + 3: từ dấu của a đến đường cong hoàn chỉnh.", [r_note],
                steps=[
                    step("s1", "Dấu của a quyết định bề lõm", "Xét dấu của $a$ trước tiên: $a > 0$ thì parabol có bề lõm hướng lên, $a < 0$ thì hướng xuống. Lý do là khi $|x|$ lớn dần, số hạng $ax^2$ lấn át $bx + c$, nên hai nhánh parabol đi theo dấu của $a$. Ví dụ, $y = x^2 - 4x + 3$ có $a = 1 > 0$, nên parabol quay lên và đỉnh là điểm thấp nhất.",
                         [r_sign]),
                    step("s2", "Đỉnh là điểm thấp nhất hoặc cao nhất", "Đỉnh $I$ là điểm thấp nhất (khi $a > 0$) hoặc cao nhất (khi $a < 0$) của parabol. Tính hoành độ $x_I = -\\frac{b}{2a}$, rồi thay $x_I$ vào hàm số để được tung độ $y_I$. Với $y = x^2 - 4x + 3$: $x_I = -\\frac{-4}{2 \\cdot 1} = 2$ và $y_I = 2^2 - 4 \\cdot 2 + 3 = -1$, nên đỉnh là $I(2; -1)$. Cẩn thận với dấu: ở đây $b = -4$ nên $-b = 4$.",
                         [r_note], check="Vì sao đỉnh luôn nằm trên trục đối xứng?"),
                    step("s3", "Trục đối xứng đi qua đỉnh", "Trục đối xứng là đường thẳng đứng $x = -\\frac{b}{2a}$, đi qua đỉnh $I$. Hai điểm của parabol đối xứng nhau qua trục này thì có cùng tung độ, nên vẽ được một nửa là suy ra nửa kia. Với $y = x^2 - 4x + 3$, trục đối xứng là đường thẳng $x = 2$, nên $x = 1$ và $x = 3$ cho cùng một giá trị $y$.",
                         [r_note]),
                    step("s4", "Δ cho biết số giao điểm với trục hoành", "Parabol cắt trục tung tại điểm $(0; c)$. Giao điểm với trục hoành là nghiệm của $ax^2 + bx + c = 0$, nên số giao điểm do $\\Delta = b^2 - 4ac$ quyết định:\n- $\\Delta > 0$: cắt trục hoành tại hai điểm;\n- $\\Delta = 0$: chạm trục hoành tại đỉnh;\n- $\\Delta < 0$: không cắt trục hoành.\n\nVí dụ, $y = x^2 - 4x + 3$ cắt trục tung tại $(0; 3)$, có $\\Delta = 16 - 12 = 4 > 0$ nên cắt trục hoành tại hai điểm $x = 1$ và $x = 3$.",
                         [r_note]),
                    step("s5", "Lấy điểm đối xứng rồi nối thành đường cong", "Lấy thêm vài điểm và điểm đối xứng của chúng qua trục, rồi nối tất cả bằng một đường cong trơn, không gấp khúc. Với $y = x^2 - 4x + 3$, điểm $(0; 3)$ đối xứng với điểm $(4; 3)$ qua trục $x = 2$. Cùng với đỉnh $I(2; -1)$ và hai điểm $(1; 0)$, $(3; 0)$, em có năm điểm để vẽ parabol.",
                         check="Nếu đổi thành y = −x² + 4x − 3, năm điểm vừa tìm sẽ thay đổi thế nào?"),
                ], sequence_confirmed=True),
            blk("b3", "quiz", "Tự kiểm tra", "Ba câu hỏi nhỏ: nhìn các hệ số, đoán hình dạng parabol.", [r_note],
                questions=[
                    question("q1", "mcq", "Parabol y = −2x² + 4x + 1 có bề lõm hướng về đâu?",
                             ["Lên trên, vì b = 4 dương", "Xuống dưới, vì a = −2 âm", "Lên trên, vì c = 1 dương", "Xuống dưới, vì đỉnh nằm dưới trục hoành"],
                             answer_index=1, cognitive_level="understand",
                             context="Ở phần đồ thị, Minh kéo các thanh trượt về a = −2, b = 4 và c = 1.",
                             hint="Trong ba hệ số, chỉ một hệ số quyết định bề lõm. Xem lại bước đầu tiên trong “Các bước vẽ parabol”.",
                             option_feedback=[
                                 "Hệ số b cùng với a cho biết trục đối xứng x = −b/2a, không quyết định bề lõm.",
                                 "Chỉ dấu của a quyết định bề lõm; b và c dương cũng không làm parabol quay lên.",
                                 "c = 1 chỉ cho biết parabol cắt trục tung tại (0; 1); bề lõm do dấu của a quyết định.",
                                 "Đúng hướng nhưng sai lý do: đỉnh I(1; 3) nằm phía trên trục hoành. Bề lõm hướng xuống vì a < 0.",
                             ],
                             explanation="Chỉ dấu của a quyết định bề lõm: a = −2 < 0 nên parabol quay bề lõm xuống dưới, dù đỉnh I(1; 3) nằm phía trên trục hoành.",
                             refs=[r_sign]),
                    # q2 asked for the vertex of the graph's opening curve, which the graph slide now states on arrival.
                    # A replaced question takes a new id, so stored attempts never point at other text. b = 8 is past
                    # the b slider (-6 to 6) on purpose: the vertex has to be worked out, not read off the graph.
                    question("q4", "numeric", "Hoành độ đỉnh của parabol $y = 2x^2 + 8x + 1$ là bao nhiêu?", answer_value=-2, tolerance=0.001,
                             cognitive_level="apply",
                             context="Ở phần đồ thị, Lan muốn kéo các thanh trượt về a = 2, b = 8 và c = 1, nhưng thanh trượt b chỉ kéo được tới 6.",
                             hint="Dùng công thức hoành độ đỉnh x = −b/2a ở bước thứ hai trong “Các bước vẽ parabol”. Chú ý dấu: lần này b dương nên −b là số âm.",
                             explanation="$x_I = -\\frac{b}{2a} = -\\frac{8}{2 \\cdot 2} = -\\frac{8}{4} = -2$. Thay vào hàm số được $y_I = 2 \\cdot (-2)^2 + 8 \\cdot (-2) + 1 = 8 - 16 + 1 = -7$, nên đỉnh là $I(-2; -7)$. Vì $a$ và $b$ cùng dương nên đỉnh nằm bên trái trục tung.",
                             refs=[r_note]),
                    question("q3", "truefalse", "Parabol y = x² + 1 cắt trục hoành tại hai điểm.", ["Đúng", "Sai"], answer_index=1,
                             cognitive_level="apply",
                             context="Lan khẳng định: “Phương trình bậc hai nào cũng có hai nghiệm, nên parabol nào cũng cắt trục hoành tại hai điểm.”",
                             hint="Tính biệt thức Δ = b² − 4ac rồi xem Δ âm, bằng 0 hay dương.",
                             option_feedback=[
                                 "Không phải parabol nào cũng cắt trục hoành. Ở đây Δ = −4 < 0 nên đồ thị nằm hẳn phía trên trục hoành.",
                                 "Δ = −4 < 0 nên phương trình x² + 1 = 0 vô nghiệm: parabol không cắt trục hoành điểm nào.",
                             ],
                             explanation="Δ = 0 − 4 = −4 < 0 nên phương trình x² + 1 = 0 vô nghiệm. Parabol có đỉnh (0; 1), bề lõm hướng lên, nên nằm hẳn phía trên trục hoành."),
                ]),
        ],
    }
    return spec, None


# ============================================================================ 5. Hệ tuần hoàn
def build_circulation(c: Ctx):
    # Regions measured on the rendered schematic: each part drawn alone and traced
    # (scripts/render/render.py heart → assets/circulatory_diagram_regions.json).
    parts = json.loads((ASSETS / "circulatory_diagram_regions.json").read_text(encoding="utf-8"))["parts"]
    img = lambda part, quote: c.ref("diagram", bbox=parts[part]["bbox"], quote=quote, exact=True)  # noqa: E731

    def hs(hid, label, simple, detailed):
        return {"id": hid, "label": label, "description_simple": simple, "description_detailed": detailed, "bbox": parts[hid]["bbox"],
                "mask_path": parts[hid]["mask_path"], "source_refs": []}

    hotspots = [
        hs("lungs", "Phổi", "Nơi máu nhận O₂ từ không khí và thải CO₂ ra ngoài.",
           "Trong phổi có rất nhiều túi khí nhỏ gọi là phế nang, bao quanh bởi mao mạch. Máu nghèo oxy từ động mạch phổi đi qua đây, nhận O₂ và thải CO₂. "
           "Máu trở thành máu giàu oxy rồi theo tĩnh mạch phổi về tim."),
        hs("organs", "Các cơ quan", "Nơi máu đưa O₂ và chất dinh dưỡng tới tế bào.",
           "Ở mao mạch trong các cơ quan, máu trao O₂ và chất dinh dưỡng cho tế bào, nhận lại CO₂ và chất thải. Tế bào dùng O₂ để tạo năng lượng, "
           "nên máu ra khỏi đây đã nghèo oxy. Trên sơ đồ, mạch máu đổi dần từ đỏ sang xanh."),
        hs("ra", "Tâm nhĩ phải", "Nhận máu nghèo oxy từ khắp cơ thể về.",
           "Tâm nhĩ phải nhận máu nghèo oxy từ tĩnh mạch chủ, kết thúc vòng tuần hoàn lớn. Nó đẩy máu xuống tâm thất phải ngay bên dưới; "
           "quãng đường ngắn nên thành tâm nhĩ mỏng."),
        hs("la", "Tâm nhĩ trái", "Nhận máu giàu oxy từ phổi về.",
           "Tâm nhĩ trái nhận máu giàu oxy theo tĩnh mạch phổi, kết thúc vòng tuần hoàn nhỏ. Sau đó nó đẩy máu xuống tâm thất trái, nơi vòng tuần hoàn lớn bắt đầu."),
        hs("rv", "Tâm thất phải", "Bơm máu nghèo oxy lên phổi.",
           "Tâm thất phải co bóp, đẩy máu nghèo oxy vào động mạch phổi, mở đầu vòng tuần hoàn nhỏ. Phổi ở ngay cạnh tim nên thành tâm thất phải "
           "mỏng hơn thành tâm thất trái."),
        hs("lv", "Tâm thất trái", "Bơm máu giàu oxy vào động mạch chủ.",
           "Tâm thất trái co bóp, đẩy máu giàu oxy vào động mạch chủ, mở đầu vòng tuần hoàn lớn. Nó có thành cơ dày nhất trong bốn ngăn tim "
           "vì phải đẩy máu đi xa nhất, tới tận đầu ngón chân."),
        hs("pa", "Động mạch phổi", "Dẫn máu nghèo oxy từ tâm thất phải lên phổi.",
           "Động mạch là mạch đưa máu ra khỏi tim. Động mạch phổi đưa máu nghèo oxy từ tâm thất phải lên phổi, nên đây là động mạch duy nhất "
           "mang máu nghèo oxy. Trên sơ đồ, nó là ống màu xanh chia đôi đi lên hai lá phổi."),
        hs("pv", "Tĩnh mạch phổi", "Dẫn máu giàu oxy từ phổi về tâm nhĩ trái.",
           "Tĩnh mạch là mạch đưa máu về tim. Tĩnh mạch phổi mang máu giàu oxy từ phổi về tâm nhĩ trái, khác với các tĩnh mạch còn lại "
           "đều mang máu nghèo oxy. Trên sơ đồ, đó là hai ống màu đỏ đi xuống từ phổi."),
        hs("ao", "Động mạch chủ", "Dẫn máu giàu oxy từ tâm thất trái đi khắp cơ thể.",
           "Động mạch chủ là động mạch lớn nhất, xuất phát từ tâm thất trái. Nó chia thành nhiều nhánh nhỏ dần, mang máu giàu oxy tới não, tay, chân "
           "và mọi cơ quan."),
        hs("vc", "Tĩnh mạch chủ", "Dẫn máu nghèo oxy từ khắp cơ thể về tim.",
           "Tĩnh mạch chủ gom máu nghèo oxy từ các cơ quan, cả phần trên lẫn phần dưới cơ thể, đổ về tâm nhĩ phải. Máu này mang nhiều CO₂ "
           "và sắp được đưa lên phổi để thải ra ngoài."),
    ]

    def rel(rid, s, t, label, desc):
        return {"id": rid, "source": s, "target": t, "label": label, "description": desc}

    r_small = img("pulmonary", "Vòng tuần hoàn nhỏ: tim → phổi → tim")
    r_big = img("systemic", "Vòng tuần hoàn lớn: tim → các cơ quan → tim")
    spec = {
        "schema_version": 1,
        "summary": "Tim bơm máu đi theo hai vòng nối tiếp nhau. Vòng tuần hoàn nhỏ đưa máu lên phổi để nhận O₂ và thải CO₂. Vòng tuần hoàn lớn mang máu giàu oxy tới mọi cơ quan rồi đưa máu nghèo oxy về tim.",
        "objectives": ["Gọi tên bốn ngăn tim và các mạch máu chính.", "Mô tả đường đi của máu trong hai vòng tuần hoàn.", "Phân biệt máu giàu oxy và máu nghèo oxy."],
        "glossary": [
            term("g1", "tâm nhĩ", "atrium", "Ngăn tim phía trên, nhận máu từ tĩnh mạch đổ về rồi đẩy xuống tâm thất."),
            term("g2", "tâm thất", "ventricle", "Ngăn tim phía dưới, thành cơ dày, co bóp đẩy máu vào động mạch."),
            term("g3", "động mạch", "artery", "Mạch máu dẫn máu từ tim đi tới phổi hoặc tới các cơ quan."),
            term("g4", "tĩnh mạch", "vein", "Mạch máu dẫn máu từ phổi hoặc từ các cơ quan trở về tim."),
            term("g5", "mao mạch", "capillary", "Mạch máu rất nhỏ, thành mỏng, nơi máu trao đổi khí và chất với tế bào."),
            term("g6", "vòng tuần hoàn nhỏ", "pulmonary circulation", "Đường máu đi từ tâm thất phải lên phổi rồi về tâm nhĩ trái, để nhận O₂ và thải CO₂."),
            term("g7", "vòng tuần hoàn lớn", "systemic circulation",
                 "Đường máu đi từ tâm thất trái tới các cơ quan rồi về tâm nhĩ phải, mang O₂ và chất dinh dưỡng."),
        ],
        "assumptions": [assume("a1", "Sơ đồ đơn giản hóa; vị trí các ngăn tim được vẽ theo quy ước sơ đồ, không theo tỉ lệ giải phẫu.")],
        "blocks": [
            blk("b1", "diagram", "Sơ đồ hệ tuần hoàn", "Bốn ngăn tim, các mạch máu chính, phổi và các cơ quan: mỗi bộ phận giữ một việc trên đường đi của máu.", [],
                image={"source_id": c.src["diagram"], "page": None, "asset_id": None}, hotspots=hotspots,
                relations=[
                    rel("r1", "rv", "lungs", "Vòng tuần hoàn nhỏ", "Máu nghèo oxy từ tâm thất phải theo động mạch phổi lên phổi."),
                    rel("r2", "lungs", "la", "Trở về tim", "Máu giàu oxy theo tĩnh mạch phổi về tâm nhĩ trái."),
                    rel("r3", "lv", "organs", "Vòng tuần hoàn lớn", "Máu giàu oxy từ tâm thất trái theo động mạch chủ tới các cơ quan."),
                    rel("r4", "organs", "ra", "Trở về tim", "Máu nghèo oxy theo tĩnh mạch chủ về tâm nhĩ phải."),
                ]),
            blk("b2", "steps", "Đường đi của máu", "Máu đi hai vòng nối tiếp: vòng nhỏ lên phổi lấy oxy, vòng lớn mang oxy đi nuôi cơ thể.", [r_small, r_big],
                steps=[
                    step("s1", "Tâm thất phải đẩy máu nghèo oxy lên phổi", "Vòng tuần hoàn nhỏ bắt đầu khi **tâm thất phải** co lại, đẩy **máu nghèo oxy** vào **động mạch phổi** để lên phổi. Máu này vừa đi khắp cơ thể về nên đã nhường bớt oxy cho tế bào và mang nhiều CO₂. Trên sơ đồ, máu nghèo oxy tô màu xanh, máu giàu oxy tô màu đỏ.",
                         [r_small], r_small),
                    step("s2", "Ở phổi, máu nhận O₂ và thải CO₂", "Động mạch phổi chia nhỏ dần thành **mao mạch** bao quanh các phế nang, những túi khí nhỏ trong phổi. Không khí trong phế nang nhiều O₂ hơn máu, nên O₂ đi vào máu. Ngược lại, máu nhiều CO₂ hơn nên CO₂ đi ra phế nang để em thở ra. Máu rời phổi đã thành **máu giàu oxy**: trên sơ đồ, nhánh xanh trong phổi nối sang nhánh đỏ.",
                         [r_small], r_small, "Nếu không khí em hít vào ít oxy, máu rời phổi sẽ thay đổi thế nào?"),
                    step("s3", "Máu giàu oxy theo tĩnh mạch phổi về tim", "Máu giàu oxy rời phổi theo **tĩnh mạch phổi** về **tâm nhĩ trái**, rồi xuống **tâm thất trái**. Đến đây, vòng tuần hoàn nhỏ khép lại: máu đi từ tim lên phổi rồi trở về tim. Vòng này ngắn vì phổi ở ngay cạnh tim, nhưng nó nạp oxy cho máu trước khi máu đi nuôi cơ thể.",
                         [r_small], r_small),
                    step("s4", "Tâm thất trái mở đầu vòng tuần hoàn lớn", "Vòng tuần hoàn lớn bắt đầu khi **tâm thất trái** co lại, đẩy máu giàu oxy vào **động mạch chủ**. Động mạch chủ chia nhánh tới não, tay, chân và mọi cơ quan, nên tâm thất trái phải đẩy mạnh nhất. Khi em ngồi viết bài, chính dòng máu này mang oxy tới các cơ ở bàn tay.",
                         [r_big], r_big),
                    step("s5", "Máu nghèo oxy theo tĩnh mạch chủ về tim", "Ở **mao mạch** trong các cơ quan, máu nhường O₂ và chất dinh dưỡng cho tế bào, rồi nhận CO₂ và chất thải. Máu nghèo oxy theo **tĩnh mạch chủ** về **tâm nhĩ phải**, khép lại vòng tuần hoàn lớn. Từ tâm nhĩ phải, máu xuống tâm thất phải và lại lên phổi: hai vòng nối tiếp nhau không ngừng.",
                         [r_big], r_big, "Từ tâm nhĩ phải, một hồng cầu đi qua những đâu rồi mới trở lại tâm nhĩ phải?"),
                ], sequence_confirmed=True),
            blk("b3", "quiz", "Tự kiểm tra", "Ba câu hỏi theo chân dòng máu đi qua tim và phổi.", [],
                questions=[
                    question("q1", "mcq", "Ngăn tim nào bơm máu đi khắp cơ thể?", ["Tâm nhĩ phải", "Tâm thất phải", "Tâm nhĩ trái", "Tâm thất trái"], answer_index=3,
                             cognitive_level="recall",
                             context="Chạy hết một vòng sân trường, em thấy tim đập thình thịch: tim đang đẩy máu giàu oxy tới đôi chân.",
                             hint="Trên sơ đồ, tìm ngăn tim nối với động mạch chủ.",
                             option_feedback=[
                                 "Tâm nhĩ phải chỉ nhận máu nghèo oxy từ tĩnh mạch chủ rồi đẩy xuống tâm thất phải.",
                                 "Tâm thất phải bơm máu lên phổi, mở đầu vòng tuần hoàn nhỏ, không bơm đi khắp cơ thể.",
                                 "Tâm nhĩ trái nhận máu giàu oxy từ phổi rồi chuyển xuống tâm thất trái; nó không đẩy máu đi xa.",
                                 "Tâm thất trái có thành cơ dày nhất, đẩy máu giàu oxy vào động mạch chủ tới khắp cơ thể.",
                             ],
                             explanation="Tâm thất trái đẩy máu giàu oxy vào động mạch chủ, bắt đầu vòng tuần hoàn lớn. Thành cơ của nó dày nhất vì phải đẩy máu đi xa nhất."),
                    question("q2", "truefalse", "Động mạch phổi mang máu giàu oxy.", ["Đúng", "Sai"], answer_index=1, cognitive_level="understand",
                             context="Minh ghi vào vở: “Động mạch nào cũng mang máu giàu oxy, tĩnh mạch nào cũng mang máu nghèo oxy.”",
                             hint="Động mạch phổi xuất phát từ ngăn tim nào, và máu trong ngăn đó vừa từ đâu trở về?",
                             option_feedback=[
                                 "Minh cũng nghĩ vậy, nhưng động mạch phổi là ngoại lệ: nó dẫn máu nghèo oxy từ tâm thất phải lên phổi.",
                                 "Động mạch là mạch đưa máu ra khỏi tim. Động mạch phổi đưa máu nghèo oxy lên phổi để nhận thêm oxy.",
                             ],
                             explanation="Sai. Động mạch là mạch dẫn máu đi ra khỏi tim, không nhất thiết giàu oxy. Động mạch phổi mang máu nghèo oxy từ tâm thất phải lên phổi; máu giàu oxy trở về tim theo tĩnh mạch phổi."),
                    question("q3", "order", "Sắp xếp đường đi của máu trong vòng tuần hoàn nhỏ.", ["Tâm thất phải", "Động mạch phổi", "Mao mạch phổi", "Tĩnh mạch phổi", "Tâm nhĩ trái"],
                             answer_order=[0, 1, 2, 3, 4], cognitive_level="understand",
                             context="Một hồng cầu vừa rời tim, đang chở nhiều CO₂ và rất ít oxy.",
                             hint="Hồng cầu phải tới nơi trao đổi khí trước, rồi mới theo mạch máu trở về tim.",
                             explanation="Tâm thất phải đẩy máu vào động mạch phổi; ở mao mạch phổi, máu nhận O₂ và thải CO₂; máu giàu oxy theo tĩnh mạch phổi về tâm nhĩ trái."),
                ]),
            blk("b4", "text", "Khám phá hệ tuần hoàn 3D", "Mô hình 3D đơn giản của tim và hai vòng tuần hoàn, để xem đường đi của máu từ nhiều phía.", [r_small, r_big],
                body="Mô hình đơn giản hóa để học đường đi của máu; không thể hiện chính xác tỉ lệ hay vị trí giải phẫu. Màu xanh biểu thị máu nghèo oxy, màu đỏ biểu thị máu giàu oxy.",
                visual3d="circulation"),
        ],
    }
    return spec, None


# ============================================================================ 6. Chu trình nước
def build_water(c: Ctx):
    from .visual_extensions import add_visual
    # Regions measured on the rendered diorama: each stage drawn alone with the picture's own camera,
    # then traced (scripts/render/render.py water → assets/water_cycle_regions.json).
    parts = json.loads((ASSETS / "water_cycle_regions.json").read_text(encoding="utf-8"))["parts"]
    box = lambda part, quote: c.ref("image", bbox=parts[part]["bbox"], quote=quote, exact=True)  # noqa: E731
    refs = {part: box(part, quote) for part, quote in (("evaporation", "1. Bốc hơi"), ("condensation", "2. Ngưng tụ"), ("rain", "3. Mưa"),
                                                       ("runoff", "4. Dòng chảy"), ("infiltration", "5. Thấm"), ("sun", "Mặt Trời"))}
    r_evap, r_cond, r_rain, r_flow, r_inf = (refs[k] for k in ("evaporation", "condensation", "rain", "runoff", "infiltration"))

    def node(nid, label, desc, refs):
        return {"id": nid, "label": label, "description": desc, "source_refs": refs}

    def edge(eid, s, t, label, desc):
        return {"id": eid, "source": s, "target": t, "label": label, "description": desc, "source_refs": []}

    def hs(hid, label, simple, detailed, part):
        return {"id": hid, "label": label, "description_simple": simple, "description_detailed": detailed, "bbox": refs[part]["bbox"],
                "mask_path": parts[part]["mask_path"], "source_refs": [refs[part]]}

    spec = {
        "schema_version": 1,
        "summary": "Nước trên Trái Đất đi mãi một vòng: bốc hơi, ngưng tụ thành mây, rơi thành mưa, chảy và thấm rồi lại về biển. Năng lượng Mặt Trời đưa nước lên cao, sức hút của Trái Đất kéo nước trở xuống.",
        "objectives": ["Kể tên và sắp xếp các giai đoạn của vòng tuần hoàn nước.", "Giải thích vai trò của Mặt Trời trong vòng tuần hoàn."],
        "glossary": [
            term("g1", "bốc hơi", "evaporation", "Nước chuyển từ thể lỏng thành hơi nước (thể khí), nhanh hơn khi được Mặt Trời làm nóng."),
            term("g2", "ngưng tụ", "condensation", "Hơi nước gặp lạnh chuyển lại thành những giọt nước nhỏ, tức thể lỏng."),
            term("g3", "giáng thủy (mưa)", "precipitation", "Nước từ mây rơi xuống mặt đất dưới dạng mưa, tuyết hoặc mưa đá."),
            term("g4", "dòng chảy", "runoff", "Nước chảy trên mặt đất theo chỗ dốc, gom thành suối, sông rồi ra biển."),
            term("g5", "thấm", "infiltration", "Nước ngấm qua đất, đá xuống dưới mặt đất, trở thành nước ngầm."),
        ],
        "assumptions": [assume("a1", "Sơ đồ đơn giản: chưa thể hiện thoát hơi nước từ thực vật và băng tuyết.")],
        "blocks": [
            blk("b1", "flow", "Vòng tuần hoàn của nước",
                "Nhờ năng lượng Mặt Trời và sức hút của Trái Đất, nước đi mãi một vòng: từ biển lên mây, rơi xuống đất rồi lại về biển.", [r_evap],
                layout="cycle",
                nodes=[
                    node("n1", "Bốc hơi", "Nắng Mặt Trời sưởi nóng nước ở biển, sông, hồ, cho nước năng lượng để bốc hơi thành hơi nước bay vào không khí. "
                         "Mặt Trời cấp năng lượng cho cả vòng tuần hoàn: trời càng nắng, nước bốc hơi càng nhanh.", [r_evap]),
                    node("n2", "Ngưng tụ", "Hơi nước bay lên cao, nơi không khí lạnh hơn, rồi ngưng tụ quanh những hạt bụi nhỏ thành giọt nước li ti. "
                         "Vô số giọt như vậy tạo thành mây. Hơi nước đọng thành giọt dưới nắp nồi canh cũng là ngưng tụ.", [r_cond]),
                    node("n3", "Mưa", "Trong mây, các giọt nước li ti va vào nhau, nhập lại thành giọt lớn hơn. "
                         "Khi giọt đủ nặng, không khí không đỡ được nữa nên chúng rơi xuống thành mưa; nơi rất lạnh thì rơi thành tuyết.", [r_rain]),
                    node("n4", "Dòng chảy", "Nước mưa trên mặt đất chảy từ chỗ cao xuống chỗ thấp vì bị Trái Đất hút. Các dòng nhỏ gom thành suối, "
                         "suối đổ vào sông, sông đổ ra biển. Sau cơn mưa, nước trên sân trường cũng chảy theo chỗ dốc xuống rãnh.", [r_flow]),
                    node("n5", "Thấm", "Một phần nước mưa ngấm qua lớp đất xốp và khe đá, thành nước ngầm. Nước ngầm chảy rất chậm dưới mặt đất, "
                         "cấp nước cho giếng, suối và cuối cùng cũng ra biển. Đất càng xốp, nước thấm xuống càng nhiều.", [r_inf]),
                ],
                edges=[
                    edge("e1", "n1", "n2", "bay lên cao", "Hơi nước nhẹ và ấm nên bay lên cao, nơi không khí lạnh hơn làm nó ngưng tụ."),
                    edge("e2", "n2", "n3", "lớn dần, đủ nặng", "Các giọt nước trong mây nhập lại thành giọt lớn, và khi đủ nặng thì rơi xuống thành mưa."),
                    edge("e3", "n3", "n4", "chảy theo dốc", "Nước mưa rơi xuống đất bị Trái Đất hút nên chảy từ chỗ cao xuống chỗ thấp, thành suối, sông."),
                    edge("e4", "n4", "n5", "ngấm xuống", "Trên đường chảy, một phần nước ngấm qua đất xốp và khe đá nên trở thành nước ngầm."),
                    edge("e5", "n5", "n1", "ra biển", "Nước ngầm và nước sông cuối cùng đều ra biển, nên nắng lại làm nước bốc hơi và vòng tuần hoàn lặp lại."),
                ]),
            blk("b2", "diagram", "Sơ đồ vòng tuần hoàn nước", "Năm giai đoạn trên mô hình và Mặt Trời, nguồn năng lượng làm nước chuyển động không ngừng.", [],
                image={"source_id": c.src["image"], "page": None, "asset_id": None},
                hotspots=[
                    hs("h1", "Bốc hơi", "Nắng làm nước ở biển, sông, hồ thành hơi nước.",
                       "Mặt Trời chiếu xuống làm nước bề mặt nóng lên và bốc hơi. Hơi nước là nước ở thể khí, mắt không nhìn thấy được. "
                       "Hơi nước nhẹ nên bay lên cao, mang theo nước từ biển vào bầu trời.", "evaporation"),
                    hs("h2", "Ngưng tụ", "Hơi nước gặp lạnh tạo thành mây.",
                       "Càng lên cao, không khí càng lạnh. Hơi nước gặp lạnh ngưng tụ quanh những hạt bụi nhỏ thành giọt nước li ti. "
                       "Vô số giọt như vậy tụ lại thành đám mây trắng em thấy trên mô hình.", "condensation"),
                    hs("h3", "Mưa", "Giọt nước trong mây đủ nặng thì rơi xuống.",
                       "Trong mây, các giọt nước li ti va vào nhau, nhập lại và lớn dần. Khi đủ nặng, luồng không khí không đỡ nổi nên giọt nước rơi xuống "
                       "thành mưa, như đám mây xám đang mưa trên núi. Nơi rất lạnh, nước rơi xuống thành tuyết.", "rain"),
                    hs("h4", "Dòng chảy", "Nước mưa chảy theo dốc về sông, ra biển.",
                       "Nước mưa trên mặt đất chảy từ chỗ cao xuống chỗ thấp vì bị Trái Đất hút. Trên mô hình, dòng nước chảy từ sườn núi qua làng "
                       "rồi đổ ra biển, đưa nước trở về nơi bắt đầu.", "runoff"),
                    hs("h5", "Thấm", "Một phần nước mưa ngấm xuống đất thành nước ngầm.",
                       "Nước mưa ngấm qua lớp đất xốp và khe nứt của đá, tạo thành nước ngầm. Nước ngầm chảy chậm dưới mặt đất, cấp nước cho giếng và sông, "
                       "rồi dần dần cũng ra biển.", "infiltration"),
                    hs("h6", "Mặt Trời", "Nguồn năng lượng giữ cho vòng tuần hoàn chạy mãi.",
                       "Mặt Trời sưởi nóng nước ở biển, sông, hồ, cho nước năng lượng để bốc hơi và bay lên cao. Nếu không có năng lượng này, nước không lên "
                       "được bầu trời nên không có mây, không có mưa. Mặt Trời chiếu sáng mỗi ngày, nên vòng tuần hoàn diễn ra liên tục.", "sun"),
                ], relations=[]),
            blk("b3", "quiz", "Tự kiểm tra", "Ba câu hỏi theo chân một giọt nước, từ biển lên mây rồi trở về.", [],
                questions=[
                    question("q1", "order", "Sắp xếp các giai đoạn bắt đầu từ biển.", ["Bốc hơi", "Ngưng tụ", "Mưa", "Dòng chảy"], answer_order=[0, 1, 2, 3],
                             cognitive_level="understand",
                             context="Theo chân một giọt nước biển Nha Trang trong một ngày hè nắng gắt.",
                             hint="Nước bay lên trời ở thể nào, và rơi xuống mặt đất ở thể nào?",
                             explanation="Nắng làm nước biển bốc hơi; hơi nước lên cao gặp lạnh, ngưng tụ thành mây; mây cho mưa; nước mưa theo dòng chảy trở về biển."),
                    question("q2", "mcq", "Điều gì cung cấp năng lượng cho vòng tuần hoàn của nước?",
                             ["Gió", "Mặt Trời", "Trọng lực của Trái Đất", "Hơi nóng từ lòng đất"], answer_index=1, cognitive_level="recall",
                             context="Mùa hè, chậu nước để ngoài sân cạn nhanh hơn hẳn mùa đông, kể cả những hôm lặng gió.",
                             hint="Trên sơ đồ, tìm thứ làm nước ở biển, sông, hồ nóng lên trước khi bốc hơi.",
                             option_feedback=[
                                 "Gió đưa hơi nước và mây đi xa, nhưng không làm nước nóng lên để bốc hơi. Chậu nước vẫn cạn cả khi lặng gió.",
                                 "Nhiệt từ Mặt Trời làm nước bốc hơi và giữ cho vòng tuần hoàn diễn ra liên tục.",
                                 "Trọng lực kéo mưa rơi xuống và nước chảy về biển, nhưng không đưa được nước lên cao. Việc đó cần nhiệt.",
                                 "Hơi nóng từ lòng đất chỉ thoát ra ở vài nơi như suối nước nóng; biển, sông, hồ bốc hơi chủ yếu nhờ nắng.",
                             ],
                             explanation="Nhiệt từ Mặt Trời làm nước bốc hơi. Mùa hè nắng mạnh hơn nên chậu nước cạn nhanh hơn, và cả vòng tuần hoàn cũng bắt đầu từ bước này."),
                    question("q3", "truefalse", "Mây được tạo thành từ hơi nước ngưng tụ.", ["Đúng", "Sai"], answer_index=0, cognitive_level="understand",
                             context="Rót nước đá vào cốc, chỉ một lúc sau mặt ngoài cốc đã đọng đầy những giọt nước nhỏ.",
                             hint="Những giọt nước bám ngoài cốc đến từ đâu, và vì sao chỉ thấy chúng khi cốc lạnh?",
                             option_feedback=[
                                 "Hơi nước gặp lạnh ngưng tụ thành giọt li ti, giống giọt nước ngoài cốc đá. Vô số giọt như vậy trên cao tạo thành mây.",
                                 "Mây không phải khói hay hơi nước vô hình: đó là vô số giọt nước li ti, do hơi nước gặp lạnh ngưng tụ lại.",
                             ],
                             explanation="Đúng. Không khí bốc lên cao lạnh đi, hơi nước ngưng tụ quanh những hạt bụi nhỏ thành giọt nước li ti; rất nhiều giọt như vậy tạo thành mây."),
                ]),
        ],
    }
    add_visual(spec, 'WATER6', [r_evap, r_cond, r_rain, r_flow, r_inf], 'vi')
    return spec, None


# ============================================================================ 7. Sắp xếp nổi bọt (Tin học 7)
def build_sorting(c: Ctx):
    r_note = c.ref("note", quote="So sánh hai phần tử liền kề, nếu sai thứ tự thì đổi chỗ")
    spec = {
        "schema_version": 1,
        "summary": "Xem từng bước của thuật toán sắp xếp nổi bọt và tìm kiếm nhị phân trên dãy số nhỏ. Có thể tự nhập dãy số để thử.",
        "objectives": ["Mô tả ý tưởng sắp xếp nổi bọt.", "Đếm số lần so sánh và đổi chỗ.", "Giải thích vì sao tìm kiếm nhị phân cần dãy đã sắp xếp."],
        "glossary": [term("g1", "thuật toán", "algorithm"), term("g2", "sắp xếp nổi bọt", "bubble sort"), term("g3", "đổi chỗ", "swap"),
                     term("g4", "tìm kiếm nhị phân", "binary search"), term("g5", "phần tử", "element")],
        "assumptions": [],
        "blocks": [
            blk("b1", "steps", "Ý tưởng sắp xếp nổi bọt", "", [r_note],
                steps=[
                    step("s1", "So sánh hai phần tử liền kề", "Bắt đầu từ đầu dãy, so sánh từng cặp phần tử đứng cạnh nhau.", [r_note]),
                    step("s2", "Đổi chỗ nếu sai thứ tự", "Nếu phần tử đứng trước lớn hơn phần tử đứng sau thì đổi chỗ hai phần tử.", [r_note]),
                    step("s3", "Phần tử lớn nhất nổi về cuối", "Sau một lượt, phần tử lớn nhất đã về đúng vị trí cuối dãy — giống bọt khí nổi lên.", [r_note]),
                    step("s4", "Lặp lại với phần còn lại", "Lặp lại các lượt cho phần chưa sắp xếp cho tới khi không còn lần đổi chỗ nào."),
                ], sequence_confirmed=True),
            blk("b2", "algorithm", "Chạy sắp xếp nổi bọt", "Bấm Tiếp để xem từng phép so sánh.", [r_note], algorithm="bubble_sort", config={"array": [7, 3, 9, 1, 5, 2]},
                explanation="Màu nổi bật cho biết hai phần tử đang được so sánh; khi đổi chỗ, bộ đếm đổi chỗ tăng lên."),
            blk("b3", "algorithm", "Tìm kiếm nhị phân", "Tìm số 23 trong dãy đã sắp xếp.", [], algorithm="binary_search",
                config={"array": [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], "target": 23},
                explanation="Mỗi bước so sánh với phần tử ở giữa rồi bỏ đi một nửa dãy, nên chỉ cần rất ít bước."),
            blk("b4", "quiz", "Tự kiểm tra", "", [],
                questions=[
                    question("q1", "mcq", "Sau lượt thứ nhất của sắp xếp nổi bọt (sắp tăng dần), phần tử nào chắc chắn đúng vị trí?",
                             ["Phần tử nhỏ nhất ở đầu dãy", "Phần tử lớn nhất ở cuối dãy", "Phần tử ở giữa", "Không phần tử nào"], answer_index=1,
                             explanation="Phần tử lớn nhất được đổi chỗ dần về cuối dãy."),
                    question("q2", "truefalse", "Tìm kiếm nhị phân dùng được cho dãy chưa sắp xếp.", ["Đúng", "Sai"], answer_index=1,
                             explanation="Sai. Cần dãy đã sắp xếp để biết bỏ đi nửa nào."),
                    question("q3", "numeric", "Dãy có 16 phần tử đã sắp xếp. Tìm kiếm nhị phân cần tối đa bao nhiêu lần so sánh?", answer_value=5, tolerance=0.001,
                             explanation="16 → 8 → 4 → 2 → 1: tối đa $\\log_2 16 + 1 = 5$ lần so sánh."),
                ]),
        ],
    }
    return spec, None


# ============================================================================ 8. Lãi kép
def build_interest(c: Ctx):
    r_note = c.ref("note", quote="A = P(1 + r/n)^(n·t)")
    spec = {
        "schema_version": 1,
        "summary": "So sánh lãi đơn và lãi kép khi gửi tiết kiệm: thay đổi số tiền gửi, lãi suất, số kỳ ghép lãi và số năm để xem số tiền tăng thế nào.",
        "objectives": ["Áp dụng công thức lãi kép.", "Giải thích vì sao ghép lãi nhiều kỳ hơn cho số tiền lớn hơn.", "Liên hệ lãi kép với cấp số nhân."],
        "glossary": [term("g1", "lãi kép", "compound interest"), term("g2", "lãi đơn", "simple interest"), term("g3", "kỳ hạn", "compounding period"),
                     term("g4", "lãi suất", "interest rate"), term("g5", "cấp số nhân", "geometric sequence")],
        "assumptions": [assume("a1", "Lãi suất không đổi trong suốt thời gian gửi."), assume("a2", "Không rút tiền giữa chừng, bỏ qua thuế và phí.")],
        "blocks": [
            blk("b1", "simulation", "Mô phỏng tiền gửi tiết kiệm", "Đơn vị tiền: nghìn đồng.", [r_note], model="compound_interest",
                params=[q("P", "Số tiền gửi ban đầu", "nghìn đồng", 10000, 1000, 100000, 500), q("r", "Lãi suất", "%/năm", 6, 0, 15, 0.1),
                        q("n", "Số lần ghép lãi mỗi năm", "lần/năm", 12, 1, 365, 1), q("t", "Thời gian gửi", "năm", 10, 1, 40, 1)],
                reference_cases=[{"inputs": {"P": 1000, "r": 5, "n": 12, "t": 10}, "output": "amount", "expected": 1647.0095, "tolerance": 0.001}],
                active={"enabled": True, "question": "Giữ lãi suất 6%/năm. Nếu chuyển từ ghép lãi 1 lần/năm sang 12 lần/năm, số tiền sau 10 năm thay đổi thế nào?",
                        "param": "n", "from_value": 1, "to_value": 12, "observe": "amount", "options": ["Tăng thêm một chút", "Tăng gấp đôi", "Không đổi", "Giảm đi"],
                        "correct_option": 0, "explanation": "Ghép lãi thường xuyên hơn thì lãi được tính trên lãi sớm hơn, nên số tiền tăng — nhưng chỉ tăng thêm khoảng 1–2%."},
                notes="Mô phỏng theo công thức với các giả định đã nêu; lãi suất thực tế do ngân hàng quy định."),
            blk("b2", "graph", "Số tiền theo thời gian", "", [r_note], expression="P*(1 + r/100/n)^(n*t)", x_var="t", x_min=0, x_max=30, y_min=0, y_max=60000,
                x_label="t (năm)", y_label="A (nghìn đồng)",
                params=[q("P", "Số tiền gửi", "nghìn đồng", 10000, 1000, 50000, 500), q("r", "Lãi suất", "%/năm", 6, 0, 15, 0.1), q("n", "Số kỳ ghép lãi/năm", "lần/năm", 12, 1, 365, 1)],
                explanation="Đồ thị cong lên ngày càng nhanh vì mỗi kỳ lãi được cộng vào gốc — đây là hàm mũ (liên hệ cấp số nhân)."),
            blk("b3", "quiz", "Tự kiểm tra", "Hai câu hỏi: tính số tiền tiết kiệm và chọn cách ghép lãi có lợi nhất.", [r_note],
                questions=[
                    question("q1", "numeric", "Với lãi suất 5%/năm, ghép lãi hằng tháng, sau 10 năm An nhận được khoảng bao nhiêu nghìn đồng?",
                             answer_value=1647.01, tolerance=0.005, unit="nghìn đồng", cognitive_level="apply",
                             context="Tết năm nay, An gửi tiết kiệm 1 triệu đồng tiền mừng tuổi và hứa sẽ không rút trong 10 năm.",
                             hint="Ghép lãi hằng tháng nghĩa là n = 12. Đổi 1 triệu đồng sang nghìn đồng và 5% thành 0,05 trước khi thay vào công thức lãi kép.",
                             explanation="Với P = 1000 nghìn đồng, r = 0,05, n = 12 và t = 10: $A = 1000(1 + 0{,}05/12)^{120} \\approx 1647{,}01$ nghìn đồng, tức khoảng 1,65 triệu đồng.",
                             refs=[r_note]),
                    question("q2", "mcq", "Với cùng lãi suất, cách ghép lãi nào cho số tiền lớn nhất sau 5 năm?", ["1 lần/năm", "4 lần/năm", "12 lần/năm", "365 lần/năm"], answer_index=3,
                             cognitive_level="understand",
                             context="Bốn gói tiết kiệm cùng lãi suất 6%/năm, chỉ khác số lần ghép lãi mỗi năm.",
                             hint="Lãi kép tính lãi trên cả phần lãi đã nhập vào gốc. Phần lãi đó bắt đầu sinh lãi sớm nhất khi nào?",
                             option_feedback=[
                                 "Mỗi năm ghép lãi một lần thì tiền lãi phải chờ cả năm mới vào gốc, nên số tiền tăng chậm nhất.",
                                 "Ghép theo quý có lợi hơn ghép theo năm, nhưng tiền lãi vẫn vào gốc chậm hơn ghép theo tháng hay theo ngày.",
                                 "Ghép theo tháng đã rất gần mức cao nhất, nhưng ghép theo ngày còn đưa lãi vào gốc sớm hơn nữa.",
                                 "Ghép lãi hằng ngày đưa lãi vào gốc sớm nhất nên số tiền lớn nhất, dù chỉ nhỉnh hơn ghép theo tháng một chút.",
                             ],
                             explanation="Ghép lãi càng thường xuyên, số tiền càng lớn, nhưng mức tăng thêm nhỏ dần. Gửi 1000 nghìn đồng với lãi suất 6%/năm trong 5 năm: ghép theo năm được khoảng 1338 nghìn đồng, ghép theo ngày khoảng 1350 nghìn đồng."),
                ]),
        ],
    }
    return spec, None


# ============================================================================ 9. Ném xiên
def build_projectile(c: Ctx):
    r_note = c.ref("note", quote="tầm xa L = v₀² sin 2α / g")
    spec = {
        "schema_version": 1,
        "summary": "Mô phỏng chuyển động ném xiên: thay đổi vận tốc ban đầu, góc ném và độ cao để xem quỹ đạo, tầm bay xa và độ cao cực đại.",
        "objectives": ["Mô tả quỹ đạo parabol của vật ném xiên.", "Tìm góc ném cho tầm xa lớn nhất khi ném từ mặt đất.", "Tính thời gian bay và tầm xa bằng công thức."],
        "glossary": [term("g1", "ném xiên", "projectile motion"), term("g2", "quỹ đạo", "trajectory"), term("g3", "tầm xa", "range"),
                     term("g4", "độ cao cực đại", "maximum height"), term("g5", "vận tốc ban đầu", "initial velocity")],
        "assumptions": [assume("a1", "Bỏ qua lực cản của không khí."), assume("a2", "Gia tốc trọng trường không đổi g = 9,81 m/s².")],
        "blocks": [
            blk("b1", "simulation", "Ném quả bóng", "So sánh hai góc ném bằng chế độ so sánh.", [r_note], model="projectile",
                params=[q("v0", "Vận tốc ban đầu", "m/s", 12, 1, 40, 0.5), q("angle", "Góc ném", "°", 45, 5, 85, 1),
                        q("g", "Gia tốc trọng trường", "m/s²", 9.81, 1.6, 24.8, 0.01, "constant", "assumption"), q("h0", "Độ cao ban đầu", "m", 0, 0, 20, 0.5)],
                reference_cases=[{"inputs": {"v0": 20, "angle": 45, "g": 9.81, "h0": 0}, "output": "range", "expected": 40.7747, "tolerance": 0.001}],
                active={"enabled": True, "question": "Ném từ mặt đất với cùng vận tốc. Đổi góc từ 30° sang 60° thì tầm xa thay đổi thế nào?",
                        "param": "angle", "from_value": 30, "to_value": 60, "observe": "range", "options": ["Không đổi", "Tăng gấp đôi", "Giảm một nửa", "Bằng 0"],
                        "correct_option": 0, "explanation": "Tầm xa tỉ lệ với sin 2α, mà sin 60° = sin 120°, nên hai góc phụ nhau cho cùng tầm xa (khi h₀ = 0)."},
                notes="Mô phỏng theo các giả định đã chọn; thực tế lực cản không khí làm tầm xa nhỏ hơn."),
            blk("b2", "graph", "Tầm xa theo góc ném", "", [r_note], expression="v0^2*sin(2*a*deg)/g", x_var="a", x_min=0, x_max=90, y_min=0, y_max=60,
                x_label="Góc ném α (°)", y_label="Tầm xa (m)",
                params=[q("v0", "Vận tốc ban đầu", "m/s", 12, 1, 25, 0.5), q("g", "Gia tốc trọng trường", "m/s²", 9.81, 1.6, 24.8, 0.01, "constant", "assumption")],
                explanation="Đồ thị đạt cực đại tại α = 45° và đối xứng: hai góc có tổng 90° cho cùng tầm xa."),
            blk("b3", "quiz", "Tự kiểm tra", "", [r_note],
                questions=[
                    question("q1", "mcq", "Ném từ mặt đất, bỏ qua lực cản. Góc ném nào cho tầm xa lớn nhất?", ["30°", "45°", "60°", "90°"], answer_index=1,
                             explanation="sin 2α lớn nhất khi 2α = 90°, tức α = 45°."),
                    question("q2", "numeric", "v₀ = 20 m/s, α = 45°, g = 9,81 m/s², ném từ mặt đất. Tầm xa bằng bao nhiêu mét?", answer_value=40.77, tolerance=0.01, unit="m",
                             explanation="$L = v_0^2 \\sin 2\\alpha / g = 400/9{,}81 \\approx 40{,}8$ m.", refs=[r_note]),
                ]),
        ],
    }
    return spec, None


# ============================================================================ registry
DEMOS: list[DemoDef] = [
    DemoDef("TPEND6", "school2lab", "Con lắc đơn — chu kỳ dao động", "physics", "10", "Bài 12. Con lắc đơn", "view_graph", "simple",
            sources=[SourceDef("page", "image", "Vật lý 10, Bài 12: Con lắc đơn, trang 64 (trang sách minh họa dựng cho bản mẫu)", file="pendulum_textbook_page.png"),
                     SourceDef("photo", "image", "Ảnh con lắc trong lớp (ảnh dựng 3D minh họa cho bản mẫu)", file="pendulum_classroom_photo.jpg"),
                     SourceDef("data", "data", "Số đo của nhóm 3", data=[{"symbol": "L", "name": "Chiều dài dây", "value": 0.8, "unit": "m"},
                                                                       {"symbol": "t10", "name": "Thời gian 10 dao động", "value": 18.1, "unit": "s"}],
                               text="Đo bằng thước dây và đồng hồ bấm giây.")],
            assets=[AssetDef("bob", "cutout", "pendulum_bob_cutout.png", "photo", {"phrase": "red ball", "tool": "SAM 3.1"})],
            build=build_pendulum),
    DemoDef("VBPASS", "school2lab", "Đệm bóng thấp tay — Bóng chuyền", "pe", "7", "Kỹ thuật đệm bóng thấp tay bằng hai tay", "practice", "simple",
            sources=[SourceDef("page", "image", "GDTC 7, Bóng chuyền: kỹ thuật đệm bóng, trang 38 (trang sách minh họa dựng cho bản mẫu)", file="volleyball_textbook_page.png"),
                     SourceDef("video", "video", "Video động tác đệm bóng (hoạt hình minh họa dựng cho bản mẫu)", file="volleyball_practice.mp4")],
            build=build_volleyball),
    DemoDef("ATTN24", "paper2explorer", "Scaled Dot-Product Attention", "computer_science", "university", "Equation (1) — attention scaled by √dₖ", "explore_paper", "detailed",
            sources=[SourceDef("paper", "pdf", "Scaled Dot-Product Attention — study excerpt", file="attention_excerpt.pdf")],
            build=build_attention, language="en"),
    DemoDef("PARAB3", "school2lab", "Hàm số bậc hai và parabol", "math", "10", "Đồ thị hàm số y = ax² + bx + c", "view_graph", "simple",
            sources=[SourceDef("note", "note", "Tóm tắt kiến thức (giáo viên nhập)", text=NOTE_QUADRATIC)], build=build_quadratic),
    DemoDef("HEART8", "school2lab", "Hệ tuần hoàn của người", "biology", "8", "Cấu tạo tim và hai vòng tuần hoàn", "understand_process", "simple",
            sources=[SourceDef("diagram", "image", "Sơ đồ hệ tuần hoàn (sơ đồ minh họa dựng cho bản mẫu)", file="circulatory_diagram.png")], build=build_circulation),
    DemoDef("WATER6", "school2lab", "Vòng tuần hoàn của nước", "geography", "6", "Các giai đoạn của vòng tuần hoàn nước", "understand_process", "simple",
            sources=[SourceDef("image", "image", "Mô hình vòng tuần hoàn của nước (hình 3D minh họa dựng cho bản mẫu)", file="water_cycle.png")], build=build_water),
    DemoDef("SWAP42", "school2lab", "Sắp xếp nổi bọt và tìm kiếm nhị phân", "informatics", "7", "Thuật toán sắp xếp và tìm kiếm", "understand_process", "simple",
            sources=[SourceDef("note", "note", "Mô tả thuật toán (giáo viên nhập)",
                               text="Sắp xếp nổi bọt: So sánh hai phần tử liền kề, nếu sai thứ tự thì đổi chỗ. Lặp lại cho đến khi không còn lần đổi chỗ nào. "
                                    "Tìm kiếm nhị phân: chỉ dùng cho dãy đã sắp xếp; so sánh với phần tử ở giữa rồi bỏ đi một nửa dãy.")],
            build=build_sorting),
    DemoDef("SAVE25", "school2lab", "Lãi đơn và lãi kép", "math", "11", "Ứng dụng cấp số nhân: gửi tiết kiệm", "view_graph", "simple",
            sources=[SourceDef("note", "note", "Công thức lãi kép (giáo viên nhập)",
                               text="Lãi kép: A = P(1 + r/n)^(n·t), trong đó P là số tiền gửi, r là lãi suất năm, n là số lần ghép lãi mỗi năm, t là số năm. Lãi đơn: A = P(1 + r·t).")],
            build=build_interest),
    DemoDef("JUMP45", "school2lab", "Chuyển động ném xiên", "physics", "10", "Quỹ đạo, tầm xa và độ cao cực đại", "view_graph", "simple",
            sources=[SourceDef("note", "note", "Công thức ném xiên (giáo viên nhập)",
                               text="Vật ném xiên từ mặt đất với vận tốc v₀ hợp với phương ngang góc α: thời gian bay t = 2v₀ sin α / g; tầm xa L = v₀² sin 2α / g; độ cao cực đại H = v₀² sin² α / (2g).")],
            build=build_projectile),
]

# Supplemental research and sport lessons live separately to keep the original
# examples intact. Normal seeding only adds codes that do not already exist.
from .research_natural import RESEARCH_NATURAL_DEMOS
from .research_computing import RESEARCH_COMPUTING_DEMOS
from .sports import SPORT_DEMOS

DEMOS.extend(RESEARCH_NATURAL_DEMOS)
DEMOS.extend(RESEARCH_COMPUTING_DEMOS)
DEMOS.extend(SPORT_DEMOS)

from .research_deep_study import DEEP_STUDY_DEMOS
DEMOS.extend(DEEP_STUDY_DEMOS)
