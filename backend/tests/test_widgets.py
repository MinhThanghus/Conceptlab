"""AI widgets (spec §9.5): static safety checks on generated HTML, normalisation, the harness,
and the sandboxed render routes (headers, and who may see which widget)."""

from __future__ import annotations

import pytest

from app.services import share as share_svc
from app.services import widgets
from tests.conftest import create_lab

PAGE = ('<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, '
        'initial-scale=1"><title>w</title></head><body><label for="l">Chiều dài</label><input id="l" type="range">'
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>'
        "<script>/*BODY*/</script></body></html>")

# One minimal sample per forbidden pattern (each must fail with its own code).
FORBIDDEN_SAMPLES = {
    "network_fetch": "fetch('/api/labs')",
    "network_xhr": "var x = new XMLHttpRequest();",
    "network_websocket": "new WebSocket('wss://example.org')",
    "network_eventsource": "new EventSource('/stream')",
    "network_beacon": "navigator.sendBeacon('/b', 'd')",
    "network_webrtc": "var pc = new RTCPeerConnection({});",
    "dynamic_import": "import('./module.js')",
    "external_script": '</script><script src="app.js"></script><script>',
    "link_tag": '</script><link rel="stylesheet" href="a.css"><script>',
    "iframe_tag": "</script><iframe srcdoc='x'></iframe><script>",
    "object_tag": '</script><object data="movie"></object><script>',
    "embed_tag": '</script><embed src="movie"><script>',
    "form_tag": '</script><form action="/x"><button>Gửi</button></form><script>',
    "storage_local": "localStorage.setItem('k', 1)",
    "storage_session": "sessionStorage.k = 1",
    "storage_indexeddb": "indexedDB.open('db')",
    "cookie_access": "var c = document.cookie;",
    "parent_access": "window.parent.document.title = 'x'",
    "top_access": "top.location = 'x'",
    "eval": "eval('1 + 1')",
    "new_function": "var f = new Function('return 1');",
    "service_worker": "navigator.serviceWorker.register('/sw.js')",
    "post_message": "window.postMessage('hi', '*')",
    "window_open": "window.open('page.html')",
    "css_import": "</script><style>@import 'theme.css';</style><script>",
    "base_tag": '</script><base href="/"><script>',
    "meta_refresh": '</script><meta http-equiv="refresh" content="0"><script>',
    "web_worker": "new Worker('worker.js')",
    "navigation": "location.href = 'other.html'",
}


def page(body: str = "") -> str:
    return PAGE.replace("/*BODY*/", body)


def codes(checks, status: str = "fail") -> set[str]:
    return {c.code for c in checks if c.status == status}


# ============================================================================ static checks
def test_every_forbidden_pattern_has_a_sample():
    assert set(FORBIDDEN_SAMPLES) == {code for code, *_ in widgets.FORBIDDEN}


@pytest.mark.parametrize("code", sorted(FORBIDDEN_SAMPLES))
def test_forbidden_pattern_fails_the_page(code):
    checks = widgets.check_html(page(FORBIDDEN_SAMPLES[code]), "en")
    assert code in codes(checks), [c.model_dump() for c in checks]
    assert widgets.status_for(checks) == "failed"
    assert "forbidden_patterns" not in codes(checks, "pass")
    message = next(c.message for c in checks if c.code == code)
    vi_message = next(c.message for c in widgets.check_html(page(FORBIDDEN_SAMPLES[code]), "vi") if c.code == code)
    assert message and vi_message and message != vi_message  # explained in the lab language


def test_clean_page_passes_and_common_code_is_not_flagged():
    body = """
      const slider = document.getElementById('l');
      slider.addEventListener('input', () => { document.body.style.top = '0'; });
      const p = slider.parentNode; const el = document.querySelector('svg').parentElement;
      if (location.href == 'about:srcdoc' || window.location === undefined) { console.log('sandbox'); }
      const topValue = Math.max(1, 2); const importance = 3; const formula = 'T = 2*pi*sqrt(L/g)';
    """
    checks = widgets.check_html(page(body), "vi")
    assert widgets.status_for(checks) == "validated", [c.model_dump() for c in checks if c.status != "pass"]
    assert {c.code for c in checks} == {"size", "forbidden_patterns", "external_url"}
    assert all(c.status == "pass" for c in checks)


@pytest.mark.parametrize(
    "snippet",
    ["window.location = 'https://evil.example'", "location.assign('x')", "location.replace('x')", "document.location='x'",
     "self.location = 'x'"],
)
def test_navigation_variants_are_blocked(snippet):
    assert "navigation" in codes(widgets.check_html(page(snippet)))


def test_external_urls_size_and_empty_pages():
    checks = widgets.check_html(page("var img = 'https://cdn.example.com/a.png';"), "en")
    assert "external_url" in codes(checks) and "cdn.example.com" in next(c.message for c in checks if c.code == "external_url")
    assert "external_url" in codes(widgets.check_html(page('</script><img src="//cdn.example.com/a.png"><script>')))
    assert "external_url" in codes(widgets.check_html(page("</script><a href='http://example.org'>x</a><script>")))
    namespaces = page("var ns = 'http://www.w3.org/2000/svg'; var xl = 'http://www.w3.org/1999/xlink';")
    assert widgets.status_for(widgets.check_html(namespaces)) == "validated"

    big = page("var data = '" + "x" * (61 * 1024) + "';")
    checks = widgets.check_html(big, "en")
    assert "size" in codes(checks) and widgets.status_for(checks) == "failed"
    assert codes(widgets.check_html(" \n ", "en")) == {"empty"}


def test_accessibility_and_document_warnings_do_not_block():
    fragment = "<div><input type='range'></div><script>1</script>"
    checks = widgets.check_html(fragment, "en")
    assert codes(checks, "warn") == {"document", "viewport", "labels"}
    assert widgets.status_for(checks) == "validated"  # warnings inform the teacher, failures block
    assert widgets.failed_messages(checks) == []
    labelled = "<html><head><meta name=viewport content='width=device-width'></head><input aria-label='L'></html>"
    assert codes(widgets.check_html(labelled), "warn") == set()


def test_normalize_html_strips_fences_and_wraps_fragments():
    assert widgets.normalize_html("```html\n" + PAGE + "\n```", "vi") == PAGE
    assert widgets.normalize_html("Here is your page:\n" + PAGE, "vi") == PAGE
    wrapped = widgets.normalize_html("<p>Xin chào</p>", "en")
    assert wrapped.startswith('<!doctype html>\n<html lang="en">') and "<p>Xin chào</p>" in wrapped
    assert 'name="viewport"' in wrapped
    assert len(widgets.normalize_html(PAGE + "x" * 90000, "vi")) == widgets.MAX_STORED_CHARS


def test_harness_is_injected_before_any_widget_script():
    out = widgets.inject_harness(PAGE)
    head = out.index("<head>") + len("<head>")
    assert out[head:].startswith('<meta charset="utf-8"><script>(function(){')
    assert out.index("cl-widget") < out.index("<script>/*BODY*/")
    for marker in ("status:status", "errors:errors.slice(0,20)", "height:h", "addEventListener('error'", "unhandledrejection"):
        assert marker in out
    no_head = widgets.inject_harness("<html><body><p>x</p></body></html>")
    assert no_head.startswith("<html><head><meta charset=\"utf-8\"><script>") and no_head.endswith("</html>")
    bare = widgets.inject_harness("<p>x</p>")
    assert bare.startswith("<!doctype html><html><head>") and bare.endswith("<body><p>x</p></body></html>")


def test_render_response_headers():
    response = widgets.render_response(PAGE)
    assert response.headers["content-security-policy"] == (
        "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
        "img-src data: blob:; font-src data:; media-src data: blob:; base-uri 'none'; form-action 'none'; "
        "frame-ancestors 'self'"
    )
    assert response.headers["x-dns-prefetch-control"] == "off"
    assert response.headers["x-frame-options"] == "SAMEORIGIN"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.media_type == "text/html"


# ============================================================================ render routes
def widget_block(block_id: str, html: str, status: str = "validated", approved: bool = True) -> dict:
    return {"id": block_id, "type": "widget", "title": "Giao diện", "prompt": "…", "html": html, "status": status, "approved": approved}


STEPS = {"id": "b1", "type": "steps", "title": "Các bước", "steps": [{"id": "s1", "title": "Quan sát", "body": "…"}]}


def save_blocks(c, lab_id: str, blocks: list[dict]) -> None:
    version = c.get(f"/api/labs/{lab_id}").json()["version"]
    r = c.patch(f"/api/labs/{lab_id}", json={"version": version, "spec": {"blocks": blocks}})
    assert r.status_code == 200, r.text


def assert_sandboxed(response, widget_script: str) -> None:
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["content-security-policy"] == widgets.WIDGET_CSP
    assert response.headers["x-frame-options"] == "SAMEORIGIN"  # the app's own iframe only (API default is DENY)
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.text.index("cl-widget") < response.text.index(widget_script)  # harness runs first


def test_owner_render_route_shows_any_draft(teacher, other_user, client):
    c, _ = teacher
    o, _ = other_user
    lab = create_lab(c)
    save_blocks(c, lab["id"], [widget_block("w1", page("1 + 1"), status="draft", approved=False),
                               widget_block("w2", page("fetch('/x')"), status="failed", approved=False),
                               widget_block("w3", "   ", status="draft", approved=False), STEPS])
    base = f"/api/labs/{lab['id']}/widgets"
    assert_sandboxed(c.get(f"{base}/w1/render"), "<script>1 + 1")
    assert_sandboxed(c.get(f"{base}/w2/render"), "<script>fetch")  # the editor must run a failing draft to report its errors
    assert c.get(f"{base}/w3/render").json()["error"]["code"] == "not_found"  # nothing to render yet
    assert c.get(f"{base}/b1/render").status_code == 404  # not a widget
    assert c.get(f"{base}/nope/render").status_code == 404
    assert o.get(f"{base}/w1/render").status_code == 404
    assert client.get(f"{base}/w1/render").status_code == 401


def test_share_render_route_serves_only_the_published_approved_widgets(teacher, client, monkeypatch):
    c, _ = teacher
    lab = create_lab(c)
    approved = widget_block("w1", page("/* published */"))
    blocks = [STEPS, approved, widget_block("w2", page("/* unapproved */"), approved=False),
              widget_block("w3", page("/* failed */"), status="failed")]
    save_blocks(c, lab["id"], blocks)
    code = c.post(f"/api/labs/{lab['id']}/publish", json={"visibility": "link", "allow_tutor": True}).json()["share_code"]

    r = client.get(f"/api/share/{code}/widgets/w1/render")
    assert_sandboxed(r, "<script>/* published */")
    for block_id in ("w2", "w3", "b1", "nope"):
        assert client.get(f"/api/share/{code}/widgets/{block_id}/render").status_code == 404, block_id

    # later draft edits never leak: learners keep seeing the published snapshot
    save_blocks(c, lab["id"], [STEPS, {**approved, "html": page("/* draft edit */")}, widget_block("w4", page("/* new */"))])
    r = client.get(f"/api/share/{code}/widgets/w1/render")
    assert "/* published */" in r.text and "/* draft edit */" not in r.text
    assert client.get(f"/api/share/{code}/widgets/w4/render").status_code == 404

    c.post(f"/api/labs/{lab['id']}/unpublish")
    assert client.get(f"/api/share/{code}/widgets/w1/render").status_code == 404

    # unknown codes count towards the per-IP miss budget (no enumeration through this route)
    monkeypatch.setattr(share_svc, "SHARE_MISSES_PER_HOUR", 3)
    statuses = [client.get(f"/api/share/ZZZZZ{i}/widgets/w1/render").status_code for i in range(2, 6)]
    assert statuses[:2] == [404, 404] and statuses[-1] == 429
