"""AI-generated interactive pages ("widgets", spec §9.5 and §13 code sandbox).

* ``generate_widget`` / ``repair_widget``: Muse writes ONE self-contained HTML document
  (inline CSS/JS, SVG/Canvas, no network, no storage). Static safety checks run on every
  result; one automatic repair round is attempted when a check fails.
* ``check_html``: size ≤ 60 KB and a deny-list of network, storage, frame-escape and
  dynamic-code patterns (defence in depth — the real isolation is the sandbox below).
* ``render_response``: the HTML served by the render routes inside
  ``<iframe sandbox="allow-scripts">`` with a sandbox CSP (opaque origin, ``default-src
  'none'``: no network, no cookies, no API key). A harness script injected first reports
  ``{type:'cl-widget', status:'ready'|'error', errors, height}`` to the parent window.
"""

from __future__ import annotations

import html as html_lib
import re
from collections.abc import Callable
from functools import lru_cache
from typing import Any

from fastapi.responses import HTMLResponse

from ..ai import prompts
from ..ai.client import get_ai
from ..ai.outputs import WidgetOutput, clip
from ..errors import AppError
from ..models import Lab
from ..schemas.api import WidgetCheck, WidgetIn, WidgetOut, WidgetRepairIn
from ..security import Actor
from .analysis import call_ctx, choose_mode, effort

MAX_BYTES = 60 * 1024
MAX_STORED_CHARS = 80000

# ``base-uri`` and ``form-action`` do not fall back to ``default-src``: they are set explicitly.
WIDGET_CSP = (
    "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
    "img-src data: blob:; font-src data:; media-src data: blob:; base-uri 'none'; form-action 'none'; "
    "frame-ancestors 'self'"
)

# Namespace URIs are identifiers, not network locations.
ALLOWED_URL_PREFIXES = (
    "http://www.w3.org/2000/svg",
    "http://www.w3.org/1999/xlink",
    "http://www.w3.org/1999/xhtml",
    "http://www.w3.org/1998/math/mathml",
    "http://www.w3.org/2000/xmlns",
)

# (code, pattern, vi message, en message)
FORBIDDEN: list[tuple[str, str, str, str]] = [
    ("network_fetch", r"\bfetch\s*\(", "Không được gọi mạng bằng fetch().", "Network access with fetch() is not allowed."),
    ("network_xhr", r"XMLHttpRequest", "Không được dùng XMLHttpRequest.", "XMLHttpRequest is not allowed."),
    ("network_websocket", r"\bWebSocket\b", "Không được dùng WebSocket.", "WebSocket is not allowed."),
    ("network_eventsource", r"\bEventSource\b", "Không được dùng EventSource.", "EventSource is not allowed."),
    ("network_beacon", r"sendBeacon", "Không được dùng sendBeacon.", "sendBeacon is not allowed."),
    ("network_webrtc", r"\b(?:webkit)?RTCPeerConnection\b|\bWebTransport\b", "Không được mở kết nối mạng (WebRTC/WebTransport).", "WebRTC and WebTransport connections are not allowed."),
    ("dynamic_import", r"\bimport\s*\(", "Không được nạp mã động bằng import().", "Dynamic import() is not allowed."),
    ("external_script", r"<\s*script\b([^>]*)", "Không được nạp script từ tệp ngoài.", "External scripts (<script src>) are not allowed."),
    ("link_tag", r"<\s*link\b", "Không được dùng thẻ <link>.", "<link> tags are not allowed."),
    ("iframe_tag", r"<\s*(?:iframe|frame|frameset)\b", "Không được nhúng <iframe>.", "<iframe> is not allowed."),
    # location.href/host/… = …, location.assign()/replace(), location = … (bare or window./document./self.),
    # location['href'], window['location']
    ("navigation", r"\blocation\s*\.\s*(?:\w+\s*=(?!=)|assign\s*\(|replace\s*\()|(?<![\w$])location\s*=(?!=)"
     r"|\blocation\s*\[|\[\s*['\"`]location['\"`]\s*\]",
     "Không được chuyển trang sang địa chỉ khác.", "Navigating to another page is not allowed."),
    ("object_tag", r"<\s*object\b", "Không được dùng thẻ <object>.", "<object> is not allowed."),
    ("embed_tag", r"<\s*embed\b", "Không được dùng thẻ <embed>.", "<embed> is not allowed."),
    ("form_tag", r"<\s*form\b", "Không được dùng thẻ <form>.", "<form> is not allowed."),
    ("storage_local", r"\blocalStorage\b", "Không được dùng localStorage.", "localStorage is not allowed."),
    ("storage_session", r"\bsessionStorage\b", "Không được dùng sessionStorage.", "sessionStorage is not allowed."),
    ("storage_indexeddb", r"\bindexedDB\b", "Không được dùng indexedDB.", "indexedDB is not allowed."),
    ("cookie_access", r"document\s*\.\s*cookie", "Không được đọc cookie.", "document.cookie is not allowed."),
    ("parent_access", r"window\s*\.\s*parent\b|\bparent\s*\.", "Không được truy cập trang chứa (parent).", "Access to the parent page is not allowed."),
    ("top_access", r"window\s*\.\s*top\b|\btop\s*\.\s*location", "Không được truy cập cửa sổ trên cùng (top).", "Access to the top window is not allowed."),
    ("eval", r"\beval\s*\(", "Không được dùng eval().", "eval() is not allowed."),
    ("new_function", r"\bnew\s+Function\b", "Không được dùng new Function.", "new Function is not allowed."),
    ("service_worker", r"serviceWorker", "Không được dùng service worker.", "Service workers are not allowed."),
    ("post_message", r"postMessage\s*\(", "Không được tự gọi postMessage (khung kiểm tra sẽ tự thêm).", "postMessage is not allowed (the harness adds its own)."),
    ("window_open", r"\bwindow\s*\.\s*open\s*\(", "Không được mở cửa sổ mới.", "Opening windows is not allowed."),
    ("css_import", r"@import\b", "Không được nạp CSS bên ngoài (@import).", "CSS @import is not allowed."),
    ("base_tag", r"<\s*base\b", "Không được dùng thẻ <base>.", "<base> is not allowed."),
    ("meta_refresh", r"<\s*meta\b([^>]*)", "Không được dùng meta http-equiv.", "meta http-equiv is not allowed."),
    ("web_worker", r"\b(?:Shared)?Worker\s*\(|importScripts", "Không được tạo Worker.", "Workers are not allowed."),
]
# Rules about one attribute of an opening tag: the tag pattern above captures the tag's
# attributes (up to the next ">") and this pattern is searched inside them. Two steps keep the
# check linear — a single ``<script[^>]*src=`` regex backtracks quadratically on input such as
# "<script <script <script …" (seconds of CPU for 80 KB).
TAG_ATTRIBUTE_RULES = {"external_script": r"\b(?:src|href|xlink:href)\s*=", "meta_refresh": r"http-equiv"}


def _matcher(code: str, pattern: str) -> Callable[[str], bool]:
    regex = re.compile(pattern, re.IGNORECASE)
    if code not in TAG_ATTRIBUTE_RULES:
        return lambda text: regex.search(text) is not None
    attribute = re.compile(TAG_ATTRIBUTE_RULES[code], re.IGNORECASE)
    return lambda text: any(attribute.search(m.group(1)) for m in regex.finditer(text))


_COMPILED = [(code, _matcher(code, pattern), vi, en) for code, pattern, vi, en in FORBIDDEN]
_URL_RE = re.compile(r"https?://[^\s\"'<>)]+", re.IGNORECASE)
_PROTOCOL_RELATIVE_RE = re.compile(r"\b(?:src|href|action|xlink:href)\s*=\s*[\"']?\s*//", re.IGNORECASE)
_JS_ESCAPE_RE = re.compile(r"\\u\{([0-9a-fA-F]{1,6})\}|\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})")
# Attribute values whose HTML character references the browser decodes into code or URLs.
_CODE_ATTRIBUTE_RE = re.compile(
    r"""\s(?:on\w+|href|xlink:href|src|action|formaction|srcdoc|data)\s*=\s*("[^"]*"|'[^']*')""", re.IGNORECASE
)


def _js_unescape(match: re.Match) -> str:
    code_point = int(match.group(1) or match.group(2) or match.group(3), 16)
    return chr(code_point) if code_point <= 0x10FFFF else match.group(0)


def scan_variants(text: str) -> list[str]:
    """The page as written plus decoded copies: ``\\u0066etch(`` in a script and ``&#102;etch(``
    in an ``onclick`` attribute both run as ``fetch(``, so every rule sees the decoded forms too.
    Character references are decoded only inside event-handler and URL attributes: escaped HTML
    shown as text (``<pre>&lt;iframe&gt;</pre>`` in a lesson about HTML) is not code.
    (Code assembled at run time — ``'fe' + 'tch'`` — cannot be found statically: the sandbox CSP
    is what contains it.)"""
    variants = [text, _JS_ESCAPE_RE.sub(_js_unescape, text)]
    encoded = [m.group(1)[1:-1] for m in _CODE_ATTRIBUTE_RE.finditer(text) if "&" in m.group(1)]
    if encoded:
        attributes = html_lib.unescape("\n".join(encoded))
        variants += [attributes, _JS_ESCAPE_RE.sub(_js_unescape, attributes)]
    return list(dict.fromkeys(variants))


CHECK_TEXT = {
    "size_ok": ("Kích thước {kb} KB (giới hạn 60 KB).", "Size {kb} KB (limit 60 KB)."),
    "size_fail": ("Trang quá lớn: {kb} KB (giới hạn 60 KB).", "The page is too large: {kb} KB (limit 60 KB)."),
    "patterns_ok": ("Không dùng mạng, bộ nhớ trình duyệt hay mã động.", "No network, browser storage or dynamic code."),
    "external_url": ("Có liên kết ra ngoài: {url}", "Contains an external URL: {url}"),
    "external_url_ok": ("Không có liên kết ra ngoài.", "No external URLs."),
    "document": ("Nên là một tài liệu HTML đầy đủ (<html>…</html>).", "Should be a complete HTML document (<html>…</html>)."),
    "viewport": ("Nên có thẻ meta viewport để hiển thị tốt trên điện thoại.", "Should declare a viewport meta tag for phones."),
    "labels": ("Ô nhập nên có nhãn (<label> hoặc aria-label).", "Inputs should have labels (<label> or aria-label)."),
    "empty": ("Trang không có nội dung.", "The page is empty."),
}


def _t(key: str, lang: str, **kwargs: Any) -> str:
    vi, en = CHECK_TEXT[key]
    return (vi if lang == "vi" else en).format(**kwargs)


# ============================================================================ checks
def check_html(html: str, lang: str = "vi") -> list[WidgetCheck]:
    checks: list[WidgetCheck] = []
    text = html or ""
    if not text.strip():
        return [WidgetCheck(code="empty", status="fail", message=_t("empty", lang))]
    size = len(text.encode("utf-8"))
    kb = round(size / 1024, 1)
    checks.append(
        WidgetCheck(code="size", status="pass" if size <= MAX_BYTES else "fail", message=_t("size_ok" if size <= MAX_BYTES else "size_fail", lang, kb=kb))
    )
    variants = scan_variants(text)
    failures = 0
    for code, matches, vi, en in _COMPILED:
        if any(matches(variant) for variant in variants):
            failures += 1
            checks.append(WidgetCheck(code=code, status="fail", message=vi if lang == "vi" else en))
    if not failures:
        checks.append(WidgetCheck(code="forbidden_patterns", status="pass", message=_t("patterns_ok", lang)))
    external = [u for v in variants for u in _URL_RE.findall(v) if not u.lower().startswith(ALLOWED_URL_PREFIXES)]
    if external or any(_PROTOCOL_RELATIVE_RE.search(v) for v in variants):
        url = external[0][:80] if external else "//…"
        checks.append(WidgetCheck(code="external_url", status="fail", message=_t("external_url", lang, url=url)))
    else:
        checks.append(WidgetCheck(code="external_url", status="pass", message=_t("external_url_ok", lang)))
    lower = text.lower()
    if "<html" not in lower:
        checks.append(WidgetCheck(code="document", status="warn", message=_t("document", lang)))
    if 'name="viewport"' not in lower and "name='viewport'" not in lower and "name=viewport" not in lower:
        checks.append(WidgetCheck(code="viewport", status="warn", message=_t("viewport", lang)))
    if re.search(r"<\s*(input|select|textarea)\b", lower) and "<label" not in lower and "aria-label" not in lower:
        checks.append(WidgetCheck(code="labels", status="warn", message=_t("labels", lang)))
    return checks


def status_for(checks: list[WidgetCheck]) -> str:
    return "failed" if any(c.status == "fail" for c in checks) else "validated"


def failed_messages(checks: list[WidgetCheck]) -> list[str]:
    return [f"{c.code}: {c.message}" for c in checks if c.status == "fail"]


@lru_cache(maxsize=64)
def _html_passes(html: str) -> bool:
    return status_for(check_html(html, "en")) == "validated"


def passes_checks(html: str | None) -> bool:
    """Server-side verdict for HTML a client marked as validated (the stored status is only a claim).
    Memoised: a whole class opening the same widget costs one check (~20 ms for 60 KB)."""
    return bool(html and html.strip()) and _html_passes(html)


def shareable_widget(block: dict[str, Any]) -> bool:
    """Learners only ever get approved widgets whose HTML passes the static checks right now."""
    return bool(block.get("approved")) and block.get("status") == "validated" and passes_checks(block.get("html"))


# ============================================================================ normalisation
_FENCE_START_RE = re.compile(r"```(?:html)?", re.IGNORECASE)


def _strip_fences(text: str) -> str:
    """Remove a Markdown code fence around the page (linear time, unlike ``\\s*```$`` with re.sub)."""
    start = _FENCE_START_RE.match(text)
    if start:
        text = text[start.end():].lstrip()
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


def normalize_html(html: str, lang: str) -> str:
    text = (html or "").strip()
    text = _strip_fences(text)
    lower = text.lower()
    start = min([i for i in (lower.find("<!doctype"), lower.find("<html")) if i >= 0], default=-1)
    if start > 0:
        text = text[start:]
    if "<html" not in text.lower():
        text = (
            f'<!doctype html>\n<html lang="{lang}">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n'
            f"{text}\n</body>\n</html>"
        )
    return text[:MAX_STORED_CHARS]


# ============================================================================ generation
def _rules(lab: Lab) -> str:
    return prompts.WIDGET_RULES.format(lang=lab.language, language=prompts.language_name(lab.language))


async def _ask(lab: Lab, actor: Actor | None, user_text: str, feature: str) -> str:
    mode, _ = choose_mode(lab)
    result = await get_ai().chat_json(
        messages=[
            {"role": "system", "content": prompts.system_prompt(lab, role="a careful front-end developer for an education app")},
            {"role": "user", "content": prompts.lesson_context(lab) + "\n\n" + user_text},
        ],
        ctx=call_ctx(feature, actor, lab),
        model_cls=WidgetOutput,
        name="widget",
        mode=mode,
        effort=effort(True),
    )
    return normalize_html(result.data.html, lab.language)


async def _repair_round(lab: Lab, actor: Actor | None, html: str, errors: list[str]) -> str:
    task = prompts.WIDGET_REPAIR_TASK.format(
        errors="\n".join(f"- {clip(e, 1000)}" for e in errors[:20]), rules=_rules(lab), html=html[:MAX_STORED_CHARS]
    )
    return await _ask(lab, actor, task, "widget-repair")


async def generate_widget(lab: Lab, actor: Actor | None, description: str, base_html: str | None) -> WidgetOut:
    task = prompts.WIDGET_TASK.format(description=description.strip()[:3000], rules=_rules(lab))
    if base_html and base_html.strip():
        task += "\n\n" + prompts.WIDGET_MODIFY.format(html=base_html[:MAX_STORED_CHARS])
    html = await _ask(lab, actor, task, "widget")
    checks = check_html(html, lab.language)
    if status_for(checks) == "failed":  # one automatic repair round
        try:
            repaired = await _repair_round(lab, actor, html, failed_messages(checks))
        except AppError:
            repaired = None
        if repaired:
            repaired_checks = check_html(repaired, lab.language)
            if status_for(repaired_checks) == "validated" or len(failed_messages(repaired_checks)) < len(failed_messages(checks)):
                html, checks = repaired, repaired_checks
    return WidgetOut(html=html, checks=checks, status=status_for(checks))


def find_widget(spec: dict[str, Any] | None, block_id: str) -> dict[str, Any]:
    for block in (spec or {}).get("blocks") or []:
        if block.get("id") == block_id and block.get("type") == "widget":
            return block
    raise AppError("not_found", 404, "Widget not found")


async def widget(lab: Lab, actor: Actor, body: WidgetIn) -> WidgetOut:
    base = None
    if body.block_id:
        try:
            base = find_widget(lab.spec_json, body.block_id).get("html") or None
        except AppError:
            base = None
    return await generate_widget(lab, actor, body.description, base)


async def repair(lab: Lab, actor: Actor, body: WidgetRepairIn) -> WidgetOut:
    errors = list(body.errors) + [m for m in failed_messages(check_html(body.html, lab.language)) if m not in body.errors]
    html = await _repair_round(lab, actor, body.html, errors)
    checks = check_html(html, lab.language)
    return WidgetOut(html=html, checks=checks, status=status_for(checks))


# ============================================================================ render
HARNESS = (
    "<script>(function(){var errors=[];var last=null;"
    "function height(){var b=document.body,d=document.documentElement;"
    "return Math.ceil(Math.max(b?b.scrollHeight:0,d?d.scrollHeight:0,b?b.offsetHeight:0));}"
    "function send(status){try{var h=height();var key=status+'|'+errors.length+'|'+h;if(key===last)return;last=key;"
    "parent.postMessage({type:'cl-widget',status:status,errors:errors.slice(0,20),height:h},'*');}catch(e){}}"
    "function current(){return errors.length?'error':'ready';}"
    "window.addEventListener('error',function(e){errors.push(String((e&&e.message)||'Script error')"
    "+(e&&e.lineno?' (line '+e.lineno+')':''));send('error');});"
    "window.addEventListener('unhandledrejection',function(e){var r=e&&e.reason;"
    "errors.push('Unhandled promise rejection: '+String((r&&r.message)||r));send('error');});"
    "window.addEventListener('load',function(){setTimeout(function(){send(current());"
    "if(window.ResizeObserver&&document.body){new ResizeObserver(function(){send(current());}).observe(document.body);}},120);});"
    "})();</script>"
)

_HEAD_RE = re.compile(r"<head\b", re.IGNORECASE)
_HTML_RE = re.compile(r"<html\b", re.IGNORECASE)


def _open_tag_end(html: str, pattern: re.Pattern) -> int | None:
    """Index just after the first complete opening tag matching ``pattern`` (linear time: a
    ``<head[^>]*>`` regex backtracks quadratically on "<head <head …" without a ">")."""
    match = pattern.search(html)
    close = html.find(">", match.end()) if match else -1
    return close + 1 if close != -1 else None


def inject_harness(html: str) -> str:
    """Insert the harness as the very first script of the document."""
    head = '<meta charset="utf-8">' + HARNESS
    end = _open_tag_end(html, _HEAD_RE)
    if end is not None:
        return html[:end] + head + html[end:]
    end = _open_tag_end(html, _HTML_RE)
    if end is not None:
        return html[:end] + "<head>" + head + "</head>" + html[end:]
    return f"<!doctype html><html><head>{head}</head><body>{html}</body></html>"


def render_response(html: str) -> HTMLResponse:
    return HTMLResponse(
        inject_harness(html or ""),
        headers={
            "Content-Security-Policy": WIDGET_CSP,
            "X-Frame-Options": "SAMEORIGIN",
            "X-Content-Type-Options": "nosniff",
            "X-DNS-Prefetch-Control": "off",
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
        },
    )


def published_widget_html(snapshot: dict[str, Any] | None, block_id: str) -> str:
    """Only approved + validated widgets of the published snapshot are ever served to learners —
    and the HTML is checked again here: the stored status is set by the editor (a client)."""
    block = find_widget((snapshot or {}).get("spec"), block_id)
    if not shareable_widget(block):
        raise AppError("not_found", 404, "Widget not found")
    return block["html"]
