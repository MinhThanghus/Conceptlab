"""Reviewed English display text for the original TPEND6 demo.

This is a presentation copy only. Source quotations and source files stay untouched;
the caller must check that the lab is the system-owned demo before using it.
Every replacement is checked against the current seed text so edited lessons cannot
silently receive a translation for different content.
"""
from __future__ import annotations

from copy import deepcopy

from .demo import Ctx
from .content import build_pendulum


class PendulumTranslationUnavailable(ValueError):
    """The demo no longer matches the reviewed translation."""


def _template():
    c = Ctx()
    c.src = {"page": "page", "photo": "photo", "data": "data"}
    c.asset = {"bob": "bob"}
    return build_pendulum(c)[0]


# Paths and text are paired with the Vietnamese template at runtime; exact matching
# means no English text is substituted for a teacher's later edits.
TEXT = {
    ("summary",): "At a small angle, the period of a simple pendulum depends only on the string length and gravitational acceleration, not on the bob. The lesson goes from page 64 of Physics 10 to a photo of the classroom pendulum and group 3's measurements to see why.",
    ("objectives", 0): "Describe the parts of a simple pendulum.",
    ("objectives", 1): r"Use $T = 2\pi\sqrt{L/g}$ to calculate the period.",
    ("objectives", 2): "Explain why the period does not depend on the mass of the bob.",
    ("glossary", 0, "note"): "The time the pendulum takes to make one complete oscillation, measured in seconds (s).",
    ("glossary", 1, "note"): "A small object hanging from the end of an inextensible string whose mass is negligible.",
    ("glossary", 2, "note"): "The distance from the pivot to the centre of the bob, written L and measured in metres (m).",
    ("glossary", 3, "note"): "The acceleration of a freely falling object due to Earth's pull, written g; near the ground, g = 9.81 m/s².",
    ("glossary", 4, "note"): "The largest displacement of the object from equilibrium; for a pendulum, the largest angle.",
    ("glossary", 5, "note"): "Where the object rests when it is not pulled aside: the string hangs straight down.",
    ("glossary", 6, "note"): "Back-and-forth motion about the equilibrium position in which the displacement changes with time like a sine function.",
    ("assumptions", 0, "text"): "The angle is small (less than 10°), as stated in the textbook.",
    ("assumptions", 1, "text"): "Air resistance is neglected.",
    ("assumptions", 2, "text"): "The string does not stretch and its mass is negligible.",
    ("blocks", 0, "title"): "How does a simple pendulum work?",
    ("blocks", 0, "description"): "From the parts of a pendulum and how to measure its period in class to formula (12.1) on page 64.",
    ("blocks", 0, "steps", 0, "title"): "A simple pendulum: a small bob on an inextensible string",
    ("blocks", 0, "steps", 0, "body"): "A simple pendulum is **a small object** of mass $m$ hanging from an **inextensible string** of length $L$ whose other end is fixed. Because the string does not stretch, the distance from the pivot to the object stays equal to $L$ while it swings. In the classroom photo, the red ball is the object $m$, and group 3 measured the string at $L = 0.80$ m.",
    ("blocks", 0, "steps", 0, "check_question"): "If the string were replaced by a rubber band, what would happen to the length L as the object swings?",
    ("blocks", 0, "steps", 1, "title"): "Pull aside less than 10°, then let go gently",
    ("blocks", 0, "steps", 1, "body"): "Pull the object away from equilibrium by a **small angle, less than 10°**, then **let go gently** so the pendulum swings on its own. The textbook's period formula holds only for small angles like this. Then a pull of 5° or 8° gives almost the same period. With group 3's 0.80 m string, an angle of 10° moves the ball about 14 cm sideways.",
    ("blocks", 0, "steps", 1, "check_question"): "Why must you let go gently instead of pushing the bob?",
    ("blocks", 0, "steps", 2, "title"): "Time 10 oscillations, then divide by 10",
    ("blocks", 0, "steps", 2, "body"): r"**The period $T$** is the time for **one complete oscillation**: from one end of the swing to the other and back again. Each time you press the stopwatch, your hand may be slightly early or late. Timing 10 oscillations and dividing by 10 makes that error 10 times smaller. Group 3 measured 18.1 s for 10 oscillations, so $T = 18.1 / 10 = 1.81$ s.",
    ("blocks", 0, "steps", 2, "check_question"): "How could group 3 measure T even more accurately?",
    ("blocks", 0, "steps", 3, "title"): "The period depends only on string length and g",
    ("blocks", 0, "steps", 3, "body"): r"For a small angle with air resistance neglected, the period follows formula (12.1):\n$$T = 2\pi\sqrt{\frac{L}{g}}$$\nWhere: $T$ is the period (s), $L$ is the string length (m) and $g$ is the gravitational acceleration (m/s²); near the ground, $g = 9.81$ m/s².\n\nFor example, with $L = 1$ m: $\sqrt{\frac{1}{9.81}} \approx 0.3193$ s, and multiplying by $2\pi$ gives $T \approx 2.01$ s, just as in the textbook example.",
    ("blocks", 0, "steps", 4, "title"): "The longer the string, the slower the swing",
    ("blocks", 0, "steps", 4, "body"): r"The textbook makes two observations: the period **does not depend on the mass $m$**, and at small angles it is **almost independent of the amplitude**. In one place $g$ stays the same, so only the string length changes the period. But $T$ is proportional to $\sqrt{L}$, not to $L$: a string 9 times as long gives a period only $\sqrt{9} = 3$ times as long.",
    ("blocks", 0, "steps", 4, "check_question"): "Why does doubling the string length not double the period?",
    ("blocks", 1, "title"): "Pendulum simulation with the bob from the photograph",
    ("blocks", 1, "description"): "The bob was cut out of the classroom photo with SAM 3.1. The period follows formula (12.1), starting with group 3's 0.80 m string.",
    ("blocks", 1, "params", 0, "name"): "String length",
    ("blocks", 1, "params", 1, "name"): "Gravitational acceleration",
    ("blocks", 1, "params", 2, "name"): "Initial angle",
    ("blocks", 1, "active", "question"): "If the string length increases from 0.25 m to 1 m (four times as long), how does period T change?",
    ("blocks", 1, "active", "options", 0): "T becomes four times as large",
    ("blocks", 1, "active", "options", 1): "T doubles",
    ("blocks", 1, "active", "options", 2): "T stays the same",
    ("blocks", 1, "active", "options", 3): "T is halved",
    ("blocks", 1, "active", "explanation"): r"Because $T = 2\pi\sqrt{L/g}$, T is proportional to $\sqrt{L}$. Multiplying L by 4 doubles $\sqrt{L}$ and thus T: from about 1.00 s to 2.01 s, matching the textbook example.",
    ("blocks", 1, "notes"): "The result is a simulation under the chosen assumptions (small angle and no air resistance), not a measurement taken from the photograph. L = 0.80 m was measured by the students. At a large angle (for example 40°), the actual period is slightly longer than the small-angle formula predicts.",
    ("blocks", 2, "title"): "Graph of period T against string length L",
    ("blocks", 2, "description"): "Each point on the curve is the period of a pendulum of length L.",
    ("blocks", 2, "params", 0, "name"): "Gravitational acceleration",
    ("blocks", 2, "explanation"): r"The curve rises but flattens out, because $T$ is proportional to $\sqrt{L}$. When the string is short, adding a piece makes $T$ grow quickly; when it is already long, adding the same piece makes $T$ grow more slowly. And $g$ sits in the denominator, under the square root, so changing $g$ raises or lowers the whole curve.",
    ("blocks", 2, "active", "question"): "On the Moon (g ≈ 1.62 m/s²), is the period of a 1 m pendulum longer or shorter than on Earth?",
    ("blocks", 2, "active", "options", 0): "Longer",
    ("blocks", 2, "active", "options", 1): "Shorter",
    ("blocks", 2, "active", "options", 2): "The same",
    ("blocks", 2, "active", "explanation"): "A smaller g makes L/g larger, so T is longer: about 4.94 s compared with about 2.01 s on Earth.",
    ("blocks", 3, "title"): "Check your understanding",
    ("blocks", 3, "description"): "Try five questions about the pendulum from your own classroom.",
    ("blocks", 3, "questions", 0, "context"): "Group 3 wants the pendulum in the photo to swing more slowly. Minh plans to swap the red ball for a heavier one, while Lan wants a longer string.",
    ("blocks", 3, "questions", 0, "prompt"): "Which quantities determine the period of a simple pendulum at a small angle?",
    ("blocks", 3, "questions", 0, "hint"): "Read formula (12.1) on the textbook page again: which quantities appear in it?",
    ("blocks", 3, "questions", 0, "options", 0): "The bob's mass m",
    ("blocks", 3, "questions", 0, "options", 1): "String length L and gravitational acceleration g",
    ("blocks", 3, "questions", 0, "options", 2): "Angular amplitude at a small angle",
    ("blocks", 3, "questions", 0, "options", 3): "The bob's mass m and string length L",
    ("blocks", 3, "questions", 0, "option_feedback", 0): "The mass m is not in T = 2π√(L/g): swap the red ball for a heavier one and the period stays the same.",
    ("blocks", 3, "questions", 0, "option_feedback", 1): "Formula (12.1) contains only L and g, so to slow the pendulum down you must change one of them.",
    ("blocks", 3, "questions", 0, "option_feedback", 2): "Below 10°, the period hardly depends on the amplitude. Look again at the Observations step.",
    ("blocks", 3, "questions", 0, "option_feedback", 3): "Lan is right about the string length, but the mass m does not affect the period, while g does.",
    ("blocks", 3, "questions", 0, "explanation"): r"According to formula (12.1), $T = 2\pi\sqrt{L/g}$ contains only L and g. A longer string slows the pendulum down; a heavier bob does not.",
    ("blocks", 3, "questions", 1, "context"): "An shortens group 3's string to 40 cm to make the pendulum swing faster.",
    ("blocks", 3, "questions", 1, "prompt"): "With L = 0.40 m and g = 9.81 m/s², what is the period T of the new pendulum in seconds?",
    ("blocks", 3, "questions", 1, "hint"): "Substitute L (in metres) and g into formula (12.1); take the square root of L/g before multiplying by 2π.",
    ("blocks", 3, "questions", 1, "explanation"): r"Substitute into formula (12.1): $\sqrt{\frac{0.40}{9.81}} \approx 0.2019$ s, and multiplying by $2\pi$ gives $T \approx 1.27$ s. The string is shorter, so An's pendulum swings faster than group 3's 0.80 m pendulum (about 1.79 s).",
    ("blocks", 3, "questions", 2, "context"): "Minh replaces the red ball in the photo with an iron ball twice as heavy and keeps the 0.80 m string.",
    ("blocks", 3, "questions", 2, "prompt"): "With the iron ball twice as heavy, the period of the pendulum also doubles.",
    ("blocks", 3, "questions", 2, "hint"): "Look for the mass m in formula (12.1). If it is not there, what does that tell you?",
    ("blocks", 3, "questions", 2, "options", 0): "True",
    ("blocks", 3, "questions", 2, "options", 1): "False",
    ("blocks", 3, "questions", 2, "option_feedback", 0): "Many people expect a heavier bob to swing more slowly, but m is not in T = 2π√(L/g), so the period stays the same.",
    ("blocks", 3, "questions", 2, "option_feedback", 1): "The period does not depend on mass: the iron ball and the red ball on the same 0.80 m string have the same period.",
    ("blocks", 3, "questions", 2, "explanation"): "False. According to the textbook, the period does not depend on the bob's mass m; only the string length L and gravitational acceleration g change it.",
    ("blocks", 3, "questions", 3, "context"): "Group 3 measured L = 0.80 m and timed 10 oscillations at 18.1 s, so T ≈ 1.81 s. The simulation with the same string length gives T ≈ 1.79 s.",
    ("blocks", 3, "questions", 3, "prompt"): "Why do the two results differ slightly?",
    ("blocks", 3, "questions", 3, "hint"): "Compare the two methods: one is timed by hand, the other is calculated from a formula with ideal assumptions.",
    ("blocks", 3, "questions", 3, "options", 0): "Timing error and the model's assumptions (small angle and no air resistance)",
    ("blocks", 3, "questions", 3, "options", 1): "The textbook formula is wrong",
    ("blocks", 3, "questions", 3, "options", 2): "The bob's mass increases the period",
    ("blocks", 3, "questions", 3, "options", 3): "The simulation measures the photograph directly and is less accurate",
    ("blocks", 3, "questions", 3, "option_feedback", 0): "Timing by hand always has some error, and the model assumes a small angle and no air resistance. A gap of about 1% is reasonable.",
    ("blocks", 3, "questions", 3, "option_feedback", 1): "A difference of about 1% is not enough to call the formula wrong. Think about measurement error first.",
    ("blocks", 3, "questions", 3, "option_feedback", 2): "The period does not depend on the mass m, so the bob cannot make the period longer.",
    ("blocks", 3, "questions", 3, "option_feedback", 3): "The simulation calculates from the formula with the L = 0.80 m the group measured; it does not measure anything in the photo.",
    ("blocks", 3, "questions", 3, "explanation"): "The model uses ideal assumptions; the real measurement has timing error. A difference of about 1% is reasonable.",
    ("blocks", 3, "questions", 4, "context"): "This is the question at the end of page 64. At home, Lan tries it straight away: she ties a bunch of keys to a 25 cm thread, then switches to a 1 m thread.",
    ("blocks", 3, "questions", 4, "prompt"): "If the string length increases fourfold, by what factor does the period increase?",
    ("blocks", 3, "questions", 4, "hint"): "The period is proportional to the square root of L, not to L itself.",
    ("blocks", 3, "questions", 4, "unit"): "times",
    ("blocks", 3, "questions", 4, "explanation"): r"T is proportional to $\sqrt{L}$, and $\sqrt{4} = 2$: the period doubles, from about 1.00 s to about 2.01 s, as in the textbook example.",
}

# Source templates carry escaped backslashes, but the renderer expects actual line
# breaks and a single TeX backslash. Preserve the formulas while rendering them correctly.
TEXT = {path: text.replace(chr(92) + "n", chr(10)) for path, text in TEXT.items()}


def _at(value, path):
    for part in path:
        value = value[part]
    return value


def _set(value, path, text):
    _at(value, path[:-1])[path[-1]] = text


def translate_pendulum(lab_out):
    """Return an English SharedLabOut copy or raise if its reviewed text changed."""
    from ..services.translate import extract_strings

    original = _template()
    out = lab_out.model_copy(deep=True)
    try:
        if out.title != "Con lắc đơn — chu kỳ dao động" or out.topic != "Bài 12. Con lắc đơn":
            raise PendulumTranslationUnavailable("The demo title or topic has changed")
        # New or changed teaching text must be translated afresh, not silently left in
        # Vietnamese. The graph axes contain only invariant symbols and units.
        invariant = {("blocks", 2, "x_label"), ("blocks", 2, "y_label")}
        current = {path: text for path, text, _ in extract_strings(out.spec)}
        expected = {path: text for path, text, _ in extract_strings(original)}
        if current != expected or set(current) - set(TEXT) - invariant:
            raise PendulumTranslationUnavailable("The demo text has changed")
        for path, translated in TEXT.items():
            if _at(out.spec, path) != _at(original, path):
                raise PendulumTranslationUnavailable(f"The demo content has changed at {path}")
            _set(out.spec, path, translated)
    except (KeyError, IndexError, TypeError) as error:
        raise PendulumTranslationUnavailable("The demo structure has changed") from error
    out.title = "The simple pendulum and its period"
    out.topic = "Lesson 12. The simple pendulum"
    out.language = "en"
    # Titles describe the source; the underlying documents and verbatim quotations remain Vietnamese.
    source_titles = {
        "Vật lý 10, Bài 12: Con lắc đơn, trang 64 (trang sách minh họa dựng cho bản mẫu)": "Physics 10, Lesson 12: Simple pendulum, page 64 (Vietnamese textbook illustration made for the demo)",
        "Ảnh con lắc trong lớp (ảnh dựng 3D minh họa cho bản mẫu)": "Classroom pendulum photograph (3D illustration made for the demo)",
        "Số đo của nhóm 3": "Group 3 measurements",
    }
    for source in out.sources:
        if source.title not in source_titles:
            raise PendulumTranslationUnavailable("A demo source title has changed")
        source.title = source_titles[source.title]
        if source.kind == "data" and isinstance(source.data, list):
            for item in source.data:
                if isinstance(item, dict):
                    item["name"] = {"Chiều dài dây": "String length", "Thời gian 10 dao động": "Time for 10 oscillations"}.get(item.get("name"), item.get("name"))
    return out


def translate_pendulum_explanation(text: str) -> str:
    """Translate an unchanged seeded quiz explanation after server-side grading."""
    template = _template()
    for path, translated in TEXT.items():
        if len(path) == 5 and path[:3] == ("blocks", 3, "questions") and path[-1] == "explanation":
            if _at(template, path) == text:
                return translated
    return text
