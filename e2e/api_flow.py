"""End-to-end acceptance flow over real HTTP with the REAL Meta models.

Runs the whole teacher → learner → teacher loop against a running stack (through the
Vite proxy, so cookies/CSRF behave like the browser):

  teacher registers → creates a School2Lab lab → uploads a textbook page, a photo and
  measured data → AI analysis (Muse) → SAM selects the bob → AI generates blocks →
  validation → publish → anonymous learner opens the class code → quiz attempt (scored
  by the server) → asks the AI tutor (SSE, citations) → voice question (ASR) → feedback
  → teacher sees class results. Plus a Paper2Explorer lab: PDF → paper map → equation.

    python e2e/api_flow.py --base http://127.0.0.1:5190
Prints a step table with timings; exits non-zero on the first failure.
"""

from __future__ import annotations

import argparse
import json
import secrets
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "backend" / "app" / "seed" / "assets"
FIXTURES = ROOT / "backend" / "tests" / "fixtures"
RESULTS: list[tuple[str, str, float, str]] = []


class Client:
    def __init__(self, base: str):
        self.http = httpx.Client(base_url=base, timeout=httpx.Timeout(300, connect=15), headers={"Origin": base})
        self.csrf: str | None = None

    def req(self, method: str, path: str, **kw):
        headers = kw.pop("headers", {})
        if method in ("POST", "PUT", "PATCH", "DELETE") and self.csrf:
            headers["X-CSRF-Token"] = self.csrf
        r = self.http.request(method, path, headers=headers, **kw)
        if r.headers.get("content-type", "").startswith("application/json"):
            body = r.json()
            if isinstance(body, dict) and "csrf_token" in body and body.get("csrf_token"):
                self.csrf = body["csrf_token"]
        return r


def step(name: str):
    def deco(fn):
        def run(*a, **kw):
            t = time.time()
            try:
                out = fn(*a, **kw)
            except Exception as exc:
                RESULTS.append((name, "FAIL", time.time() - t, str(exc)[:300]))
                report()
                sys.exit(1)
            RESULTS.append((name, "ok", time.time() - t, out if isinstance(out, str) else ""))
            return out

        return run

    return deco


def ok(r: httpx.Response, *codes: int):
    if r.status_code not in (codes or (200,)):
        raise AssertionError(f"{r.request.method} {r.request.url.path} → {r.status_code}: {r.text[:300]}")
    return r.json() if r.content and r.headers.get("content-type", "").startswith("application/json") else None


def report() -> None:
    print(f"\n{'step':48s} {'result':6s} {'secs':>6s}  detail")
    for name, res, secs, detail in RESULTS:
        print(f"{name:48s} {res:6s} {secs:6.1f}  {detail}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:5190")
    args = ap.parse_args()
    t = Client(args.base)
    email = f"e2e-{secrets.token_hex(4)}@example.com"
    state: dict = {}

    @step("teacher registers")
    def register():
        body = ok(t.req("POST", "/api/auth/register", json={"email": email, "password": "e2e-" + secrets.token_hex(8), "name": "Cô Thu (E2E)", "role": "teacher", "locale": "vi"}), 201)
        assert body["ai"]["configured"], "AI is not configured on the server"
        return body["user"]["email"]

    @step("create School2Lab lab")
    def create():
        lab = ok(t.req("POST", "/api/labs", json={"space": "school2lab", "title": "Con lắc đơn (E2E)", "subject": "physics", "grade": "10", "language": "vi", "goal": "view_graph", "level": "simple"}), 201)
        state["lab"] = lab
        return lab["id"]

    @step("upload textbook page + photo + data")
    def upload():
        lid = state["lab"]["id"]
        page = ok(t.req("POST", f"/api/labs/{lid}/sources", files={"file": ("trang64.png", (ASSETS / "pendulum_textbook_page.png").read_bytes(), "image/png")}, data={"title": "Trang 64"}), 201)
        photo = ok(t.req("POST", f"/api/labs/{lid}/sources", files={"file": ("anh.jpg", (ASSETS / "pendulum_classroom_photo.jpg").read_bytes(), "image/jpeg")}, data={"title": "Ảnh con lắc"}), 201)
        data = ok(t.req("POST", f"/api/labs/{lid}/sources/data", json={"title": "Số đo nhóm 1", "values": [{"symbol": "L", "name": "Chiều dài dây", "value": 0.8, "unit": "m"}]}), 201)
        state.update(page=page, photo=photo, data=data)
        return f"{page['width']}x{page['height']} image, photo, data"

    @step("AI analyze (Muse Spark)")
    def analyze():
        lid = state["lab"]["id"]
        body = ok(t.req("POST", f"/api/labs/{lid}/ai/analyze", json={"source_ids": [state["page"]["id"], state["photo"]["id"], state["data"]["id"]]}))
        res = body["analysis"]["result"]
        exprs = [f["expression"] for f in res["formulas"]]
        assert res["formulas"], "no formula found"
        located = sorted({r["located"] for v in res["variables"] for r in ([v["source_ref"]] if v.get("source_ref") else [])})
        state["analysis"] = body["analysis"]
        state["lab"] = body["lab"]
        return f"topic={res['topic'][:40]!r} formulas={exprs} vars={[v['symbol'] for v in res['variables']]} located={located}"

    @step("SAM 3.1 select 'quả nặng' in photo")
    def segment():
        lid = state["lab"]["id"]
        body = ok(t.req("POST", f"/api/labs/{lid}/ai/segment", json={"source_id": state["photo"]["id"], "phrase": "quả nặng màu đỏ"}))
        note = f"phrase_used={body.get('phrase_used')!r} found={len(body['objects'])}"
        if not body["objects"]:  # a learner would then click the object
            body = ok(t.req("POST", f"/api/labs/{lid}/ai/segment", json={"source_id": state["photo"]["id"], "points": [{"x": 725, "y": 573}]}))
            note += " → click"
        assert body["objects"], "SAM found nothing"
        return f"{note} box={body['objects'][0]['box']}"

    @step("review: confirm every item, save")
    def review():
        lab = state["lab"]
        analysis = json.loads(json.dumps(lab["analysis"]))
        for section in ("objects", "formulas", "variables", "steps", "relations", "assumptions"):
            for item in analysis["result"].get(section) or []:
                item["confirmed"] = True
        analysis["result"]["sequence_clear"] = True
        lab = ok(t.req("PATCH", f"/api/labs/{lab['id']}", json={"version": lab["version"], "analysis": analysis}))
        state["lab"] = lab
        return f"version {lab['version']}"

    @step("AI generate blocks")
    def generate():
        lid = state["lab"]["id"]
        body = ok(t.req("POST", f"/api/labs/{lid}/ai/generate", json={"block_types": ["steps", "simulation", "graph", "quiz"], "replace": True}))
        state["lab"] = body["lab"]
        types = [b["type"] for b in body["lab"]["spec"]["blocks"]]
        assert "quiz" in types, f"no quiz generated: {types} warnings={body.get('warnings')}"
        return f"blocks={types} warnings={len(body.get('warnings') or [])}"

    @step("teacher approves quiz + confirms blocks")
    def approve():
        lab = state["lab"]
        spec = json.loads(json.dumps(lab["spec"]))
        for b in spec["blocks"]:
            b["confirmed"] = True
            if b["type"] == "quiz":
                for q in b["questions"]:
                    q["approved"] = True
            if b["type"] == "steps":
                b["sequence_confirmed"] = True
        lab = ok(t.req("PATCH", f"/api/labs/{lab['id']}", json={"version": lab["version"], "spec": spec}))
        state["lab"] = lab
        return f"{sum(len(b.get('questions', [])) for b in spec['blocks'] if b['type'] == 'quiz')} questions approved"

    @step("validate + publish")
    def publish():
        lid = state["lab"]["id"]
        report_ = ok(t.req("POST", f"/api/labs/{lid}/validate"))
        fails = [c["code"] for c in report_["checks"] if c["status"] == "fail"]
        r = t.req("POST", f"/api/labs/{lid}/publish", json={"visibility": "link", "allow_tutor": True})
        if r.status_code != 200:
            raise AssertionError(f"publish {r.status_code}: fails={fails} {r.text[:300]}")
        body = r.json()
        state["code"] = body["share_code"]
        warns = [c["code"] for c in report_["checks"] if c["status"] == "warn"]
        return f"code={body['share_code']} warns={warns}"

    learner = Client(args.base)

    @step("learner opens class code (no account)")
    def open_share():
        lab = ok(learner.req("GET", f"/api/share/{state['code']}"))
        state["shared"] = lab
        assert "analysis" not in lab, "draft analysis leaked to learners"
        return f"{len(lab['spec']['blocks'])} blocks, {len(lab['sources'])} sources"

    @step("learner quiz attempt (server scoring)")
    def quiz():
        quiz = next(b for b in state["shared"]["spec"]["blocks"] if b["type"] == "quiz")
        answers = []
        for q in quiz["questions"]:
            if q["kind"] in ("mcq", "truefalse"):
                answers.append({"question_id": q["id"], "answer": 0})
            elif q["kind"] == "order":
                answers.append({"question_id": q["id"], "answer": list(range(len(q["options"])))})
            else:
                answers.append({"question_id": q["id"], "answer": 1.0})
        body = ok(learner.req("POST", f"/api/share/{state['code']}/quiz-attempts", json={"block_id": quiz["id"], "phase": "pre", "answers": answers}), 200, 201)
        return f"score {body['score']}/{body['total']}"

    @step("learner asks AI tutor (SSE + citations)")
    def chat():
        blocks = state["shared"]["spec"]["blocks"]
        sim = next((b for b in blocks if b["type"] == "simulation"), blocks[0])
        payload = {"message": "Vì sao dây dài hơn thì con lắc dao động chậm hơn?", "context": {"block_id": sim["id"], "state": {"params": {"L": 0.8, "g": 9.81}}}}
        text, done = "", None
        with learner.http.stream("POST", f"/api/share/{state['code']}/chat", json=payload, headers={"Accept": "text/event-stream"}) as r:
            if r.status_code != 200:
                raise AssertionError(f"chat {r.status_code}: {r.read()[:300]!r}")
            event = None
            for line in r.iter_lines():
                if line.startswith("event:"):
                    event = line[6:].strip()
                elif line.startswith("data:"):
                    data = json.loads(line[5:].strip())
                    if event == "delta":
                        text += data.get("text", "")
                    elif event == "done":
                        done = data
                    elif event == "error":
                        raise AssertionError(f"chat error event {data}")
        assert done and text.strip(), "no answer"
        return f"{len(text)} chars, citations={[c['n'] for c in done.get('citations', [])]}"

    @step("learner voice question (Muse Voice Transcribe)")
    def voice():
        r = learner.req("POST", "/api/ai/transcribe", files={"audio": ("q.wav", (FIXTURES / "speech_en.wav").read_bytes(), "audio/wav")}, data={"lang": "en", "code": state["code"]})
        body = ok(r)
        assert "pendulum" in body["transcript"].lower(), body
        return repr(body["transcript"][:60])

    @step("learner explain-change (share route)")
    def explain():
        sim = next((b for b in state["shared"]["spec"]["blocks"] if b["type"] in ("simulation", "graph")), None)
        body = ok(learner.req("POST", f"/api/share/{state['code']}/ai/explain-change", json={"block_id": sim["id"], "before": {"params": {"L": 0.25}, "outputs": {"period": 1.003}}, "after": {"params": {"L": 1.0}, "outputs": {"period": 2.006}}}))
        return body["explanation"][:70].replace("\n", " ")

    @step("learner feedback")
    def feedback():
        ok(learner.req("POST", f"/api/share/{state['code']}/feedback", json={"rating": 5, "comment": "Mô phỏng dễ hiểu!"}), 201)
        return "5★"

    @step("teacher sees class results")
    def results():
        body = ok(t.req("GET", f"/api/labs/{state['lab']['id']}/results"))
        assert body["attempts_total"] >= 1 and body["feedback_count"] >= 1 and body["tutor_questions"] >= 1, body
        return f"attempts={body['attempts_total']} feedback_avg={body['feedback_avg']} tutor_q={body['tutor_questions']}"

    @step("Paper2Explorer: PDF → paper map")
    def paper():
        lab = ok(t.req("POST", "/api/labs", json={"space": "paper2explorer", "title": "Attention (E2E)", "subject": "computer_science", "grade": "university", "language": "vi", "goal": "explore_paper", "level": "detailed"}), 201)
        src = ok(t.req("POST", f"/api/labs/{lab['id']}/sources", files={"file": ("attention.pdf", (ASSETS / "attention_excerpt.pdf").read_bytes(), "application/pdf")}), 201)
        body = ok(t.req("POST", f"/api/labs/{lab['id']}/ai/paper-structure", json={"source_id": src["id"]}))
        paper_ = body["analysis"]["paper"]
        state["paper_lab"], state["paper"] = body["lab"], paper_
        exact = sum(1 for e in paper_["equations"] for r in e["source_refs"] if r["located"] == "exact")
        return f"equations={len(paper_['equations'])} (exact refs {exact}) figures={len(paper_['figures'])} tables={len(paper_['tables'])}"

    @step("Paper2Explorer: explore equation (1)")
    def equation():
        eq = state["paper"]["equations"][0]
        body = ok(t.req("POST", f"/api/labs/{state['paper_lab']['id']}/ai/explore-equation", json={"equation_id": eq["id"]}))
        return f"block={body['block']['type'] if body.get('block') else None} vars={[v['symbol'] for v in body['equation']['variables']][:6]}"

    for fn in (register, create, upload, analyze, segment, review, generate, approve, publish, open_share, quiz, chat, voice, explain, feedback, results, paper, equation):
        fn()
    report()


if __name__ == "__main__":
    main()
