"""Các bài học thể thao tương tác; dữ liệu mẫu do ConceptLab biên soạn.

Tình huống trên sân là ví dụ dạy học, không phải dữ liệu thu được trong bài báo.
"""

from __future__ import annotations

from .demo import Ctx, DemoDef, SourceDef, q, question


FUTSAL_PAPER = (
    "A systematic review of collective tactical behaviour in futsal using positional data "
    "(2021), Biology of Sport, DOI: 10.5114/biolsport.2020.96321. "
    "https://pmc.ncbi.nlm.nih.gov/articles/PMC7996382/\n"
    "Tổng quan 12 nghiên cứu, xem xét các biến khoảng cách và diện tích trên sân futsal. "
    "Không có tọa độ hay đáp án của tình huống minh họa trong bài học này."
)
BASKETBALL_PAPER = (
    "Influence of Jump and Ball Release Parameters on Shooting Accuracy in Basketball "
    "Under Varying Constraints (2025), Journal of Functional Morphology and Kinesiology, "
    "DOI: 10.3390/jfmk10040459. https://pmc.ncbi.nlm.nih.gov/articles/PMC12641682/\n"
    "Nghiên cứu 18 vận động viên, so sánh đặc điểm bật nhảy và thả bóng giữa các lần ném. "
    "Mô hình ném xiên là minh họa lý tưởng, không tái hiện dữ liệu hay dự đoán tỷ lệ ném thành công."
)


def _player(pid, team, label, x, y):
    return {"id": pid, "team": team, "label": label, "x": x, "y": y}


def _frame(fid, note, players, ball, arrows=()):
    return {"id": fid, "note": note, "players": players, "ball": {"x": ball[0], "y": ball[1]},
            "arrows": [{"id": f"a{i}", "kind": kind, "x1": x1, "y1": y1, "x2": x2, "y2": y2}
                       for i, (kind, x1, y1, x2, y2) in enumerate(arrows)]}


def _block(bid, typ, title, description="", refs=(), **data):
    return {"id": bid, "type": typ, "title": title, "description": description,
            "source_refs": list(refs), "confirmed": True, "ai_generated": False, **data}


# The self-check question of the ball sports: wrong options are real beginner habits
# (watching only the ball, passing to the nearest player), never joke answers.
PASS_QUESTION = {
    "prompt": "Trước khi quyết định chuyền, nên quan sát điều gì?",
    "options": ["Vị trí đồng đội, đối phương và khoảng trống", "Chỉ vị trí quả bóng", "Chỉ người đồng đội đứng gần nhất"],
    "context": "Số 1 đội A đang giữ bóng, hai cầu thủ đội B đứng chắn phía trước.",
    "hint": "Hãy nghĩ xem một đường chuyền có thể hỏng vì những lý do nào.",
    "option_feedback": [
        "Cần thấy cả người nhận, người có thể chặn bóng và khoảng trống thì mới chọn được đường chuyền an toàn.",
        "Chỉ nhìn bóng là lỗi hay gặp: em sẽ không thấy đối phương đang chờ cắt đường chuyền.",
        "Người đứng gần nhất có thể đang bị kèm sát; đồng đội ở khoảng trống xa hơn thường an toàn hơn.",
    ],
}
SHOT_QUESTION = {
    "prompt": "Trước khi chọn điểm đánh cầu, nên quan sát điều gì?",
    "options": ["Vị trí hai đối thủ và khoảng trống trên sân", "Chỉ vị trí quả cầu", "Chỉ đối thủ đứng gần lưới"],
    "context": "Đội A vừa đỡ được cầu ở bên trái; hai đối thủ đang đứng lệch về một phía sân.",
    "hint": "Cầu rơi vào đâu thì đối thủ khó đỡ kịp nhất?",
    "option_feedback": [
        "Biết hai đối thủ đứng đâu thì mới thấy khoảng trống, nơi cầu rơi xuống mà đối thủ khó đỡ kịp.",
        "Chỉ nhìn quả cầu là lỗi hay gặp: em sẽ đánh cầu về đúng chỗ đối thủ đang chờ.",
        "Đối thủ ở cuối sân cũng có thể đỡ cầu; cần nhìn cả hai người mới thấy khoảng trống thật sự.",
    ],
}


def _lesson(c: Ctx, sport: str, focus: str, prompt: str, players, solution, answer: str, research: str = "",
            quiz: dict | None = None):
    quiz = quiz or PASS_QUESTION
    ref = c.ref("source")
    base = _frame("f1", "Tình huống giả định: quan sát vị trí trước khi đề xuất phương án.", players, (0.31, 0.48))
    solved = _frame("f1", "Một phương án tham khảo; các cách khác vẫn có thể hợp lý.", solution,
                    (0.31, 0.48), [("pass", 0.31, 0.48, 0.62, 0.68)])
    blocks = []
    if research:
        blocks.append(_block("research", "text", "Nghiên cứu tham khảo", refs=[ref], body=research))
    blocks.extend([
        _block("field", "field", "Thử trên sân", "Kéo người chơi, vẽ hướng chuyền và giải thích lựa chọn.",
               sport=sport, prompt=prompt, frames=[base], solution_frames=[solved]),
        _block("quiz", "quiz", "Tự kiểm tra", questions=[
            question("q1", "mcq", quiz["prompt"], list(quiz["options"]), answer_index=0, explanation=answer,
                     cognitive_level="understand", context=quiz["context"], hint=quiz["hint"],
                     option_feedback=list(quiz["option_feedback"])),
        ]),
    ])
    return {"schema_version": 1, "summary": focus,
            "objectives": ["Quan sát vị trí người chơi và khoảng trống.",
                           "Thử một phương án trên sân và giải thích lựa chọn."],
            "assumptions": [{"id": "a1", "text": "Sơ đồ và tọa độ do ConceptLab tạo để học; không phải dữ liệu đo trong trận đấu.", "confirmed": True}],
            "blocks": blocks}, None


def build_football(c: Ctx):
    a = [_player("a1", "A", "1", .31, .48), _player("a2", "A", "2", .48, .68),
         _player("a3", "A", "3", .53, .25), _player("b1", "B", "1", .53, .48),
         _player("b2", "B", "2", .71, .34)]
    b = [_player("a1", "A", "1", .31, .48), _player("a2", "A", "2", .62, .68),
         _player("a3", "A", "3", .53, .25), _player("b1", "B", "1", .53, .48),
         _player("b2", "B", "2", .71, .34)]
    return _lesson(c, "football", "Bóng đá: tìm khoảng trống và đường chuyền trong tình huống ba đấu hai.",
                   "Đội A tấn công về phía phải. Kéo số 2 vào khoảng trống, vẽ đường chuyền và giải thích cách tránh đối phương.",
                   a, b, "Quan sát đồng đội, đối phương và khoảng trống giúp chọn đường chuyền phù hợp.")


def build_futsal(c: Ctx):
    a = [_player("a1", "A", "1", .31, .48), _player("a2", "A", "2", .44, .70),
         _player("a3", "A", "3", .48, .22), _player("b1", "B", "1", .51, .50),
         _player("b2", "B", "2", .72, .34)]
    b = [_player("a1", "A", "1", .31, .48), _player("a2", "A", "2", .62, .68),
         _player("a3", "A", "3", .48, .22), _player("b1", "B", "1", .51, .50),
         _player("b2", "B", "2", .72, .34)]
    return _lesson(c, "futsal", "Futsal: quan sát khoảng cách giữa cầu thủ và khoảng trống khi chuyền.",
                   "Đội A tấn công về phía phải. Di chuyển số 2 tạo góc chuyền, sau đó vẽ đường chuyền. Khoảng cách đến đối thủ thay đổi ra sao?",
                   a, b, "Quan sát khoảng cách và vị trí của cả hai đội trước khi chọn hướng chuyền.",
                   "Tổng quan năm 2021 phân tích 12 nghiên cứu về chiến thuật futsal, trong đó có các biến khoảng cách giữa cầu thủ, bóng và khoảng trống. "
                   "Tình huống dưới đây được tạo để tập quan sát; không phải trận đấu hay kết quả thực nghiệm của các tác giả.\n\n"
                   "Nguồn [1] · DOI: 10.5114/biolsport.2020.96321 · https://pmc.ncbi.nlm.nih.gov/articles/PMC7996382/")


def build_basketball(c: Ctx):
    a = [_player("a1", "A", "1", .31, .48), _player("a2", "A", "2", .46, .68),
         _player("a3", "A", "3", .50, .25), _player("b1", "B", "1", .53, .48),
         _player("b2", "B", "2", .73, .33)]
    b = [_player("a1", "A", "1", .31, .48), _player("a2", "A", "2", .62, .68),
         _player("a3", "A", "3", .50, .25), _player("b1", "B", "1", .53, .48),
         _player("b2", "B", "2", .73, .33)]
    spec, _ = _lesson(c, "basketball", "Bóng rổ: chuyền vào khoảng trống và tìm hiểu quỹ đạo bóng khi ném.",
                      "Đội A tấn công về phía phải. Di chuyển số 2 để tạo góc nhận bóng và vẽ đường chuyền.",
                      a, b, "Cần quan sát cả đồng đội, đối phương và vị trí trống.",
                      "Nghiên cứu năm 2025 khảo sát 18 vận động viên, đo các đặc điểm bật nhảy và thả bóng khi ném rổ. "
                      "Các lần ném thành công có độ cao thả bóng lớn hơn trong mẫu nghiên cứu; không thể suy ra mọi người đều có cùng kết quả.\n\n"
                      "Nguồn [1] · DOI: 10.3390/jfmk10040459 · https://pmc.ncbi.nlm.nih.gov/articles/PMC12641682/")
    spec["assumptions"].append({"id": "a2", "text": "Mô hình ném xiên bỏ qua lực cản không khí, độ xoáy và tương tác với rổ; không dự đoán bóng vào rổ.", "confirmed": True})
    spec["blocks"].insert(1, _block("throw", "simulation", "Khám phá quỹ đạo ném", "Thử thay góc ném, vận tốc và độ cao thả bóng; xem mô hình 3D.",
        model="projectile", params=[q("v0", "Vận tốc ban đầu", "m/s", 8, 1, 20, .5),
        q("angle", "Góc ném", "°", 50, 5, 85, 1), q("g", "Gia tốc trọng trường", "m/s²", 9.81, 1.6, 24.8, .01, "constant", "assumption"),
        q("h0", "Độ cao thả bóng", "m", 2, 0, 4, .1)],
        notes="Đây là mô hình vật lý lý tưởng minh họa ảnh hưởng của tham số, không phải phép tái hiện thí nghiệm hay dự đoán khả năng ném trúng."))
    return spec, None


def build_badminton(c: Ctx):
    a = [_player("a1", "A", "1", .31, .48), _player("a2", "A", "2", .20, .70),
         _player("b1", "B", "1", .68, .48), _player("b2", "B", "2", .75, .27)]
    b = [_player("a1", "A", "1", .31, .48), _player("a2", "A", "2", .20, .70),
         _player("b1", "B", "1", .68, .48), _player("b2", "B", "2", .75, .27)]
    return _lesson(c, "badminton", "Cầu lông đôi: quan sát khoảng trống và chọn điểm đánh cầu.",
                   "Đội A ở bên trái. Vẽ hướng đánh cầu sang khoảng trống bên phải và giải thích lựa chọn; cầu lông không dùng quỹ đạo bóng lý tưởng.",
                   a, b, "Quan sát khoảng trống và vị trí của cả hai đối thủ để chọn điểm đánh cầu.", quiz=SHOT_QUESTION)


SPORT_DEMOS = [
    DemoDef("SPFTBA", "school2lab", "Bóng đá — tìm khoảng trống", "pe", "7", "Chuyền bóng", "practice", "simple",
            [SourceDef("source", "note", "Tình huống học tập do ConceptLab biên soạn", text="Sơ đồ bóng đá là tình huống giả định do ConceptLab tạo.")], build_football),
    DemoDef("SPFUTS", "school2lab", "Futsal — khoảng cách và đường chuyền", "pe", "7", "Chiến thuật futsal", "practice", "simple",
            [SourceDef("source", "note", "Tổng quan chiến thuật futsal (2021)", text=FUTSAL_PAPER)], build_futsal),
    DemoDef("SPBASK", "school2lab", "Bóng rổ — đường chuyền và quỹ đạo ném", "pe", "7", "Chuyền và ném rổ", "practice", "simple",
            [SourceDef("source", "note", "Nghiên cứu chuyển động ném rổ (2025)", text=BASKETBALL_PAPER)], build_basketball),
    DemoDef("SPBDMT", "school2lab", "Cầu lông đôi — chọn khoảng trống", "pe", "7", "Chiến thuật cầu lông đôi", "practice", "simple",
            [SourceDef("source", "note", "Tình huống học tập do ConceptLab biên soạn", text="Sơ đồ cầu lông là tình huống giả định do ConceptLab tạo.")], build_badminton),
]
