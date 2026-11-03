"""Prompt for an AI lesson cover (Muse Image at 1536x1024, stored as a 1280x853 JPEG).

``build_cover_prompt(lab, style="auto", idea=None)`` returns ``(prompt, resolved_style)``. It is
pure: it reads the lab's columns, ``spec_json`` and ``analysis_json`` defensively (a new lab
with nothing analysed still gets a sound prompt) and never touches the network or database.

The prompt joins these blocks, in this order:

1. TOPIC        the lab topic, verbatim, as context that must never be lettered;
2. HERO         what to show: a fixed scene for a known simulation, 3D visual, sport or
                algorithm; otherwise the analysed objects (confirmed first) or a research
                paper's facts as a physical metaphor; then up to six English glossary terms;
3. PRESET       the medium (clay, papercut, riso, specimen, cyanotype); ``auto`` picks one
                from the subject;
4. LEVEL        proportions and number of objects for the grade band;
5. COMPOSITION  one hero inside the box that survives every crop (cards show 16:9 from the
                top, the student home 16:10, thumbnails 1:1);
6. HOUSE        identical on every cover: cream paper, light from the upper left, the Hum
                inks as exact hex values;
7. TEACHER      the teacher's own idea, verbatim;
8. NEGATIVE     wordless, no people, nothing that could pass for evidence, no stock looks.

Facts are clipped and their whitespace collapsed so that the prompt stays within
``MAX_PROMPT_CHARS``: the lesson facts give way first, then the topic, the teacher's idea last.
The picture is decorative and visibly handmade, so it never passes for a source (spec §12).
"""

from __future__ import annotations

import re
from typing import Any

from pydantic import ValidationError

from ..schemas.analysis import LabAnalysis
from .prompts import SUBJECT_NAMES

PROMPT_VERSION = 2
MAX_PROMPT_CHARS = 1800

# ============================================================================ presets (the medium)
# Only the medium changes between presets; light, palette and composition are shared (HOUSE,
# COMPOSITION), so every cover in the gallery belongs to one family.
PRESETS: dict[str, str] = {
    "clay": (
        "A handmade clay miniature, like a museum scale model shot in a small studio: matte clay, soft "
        "bevelled edges, a cream tabletop curving into a seamless backdrop, three-quarter view from "
        "slightly above, soft contact shadows."
    ),
    "papercut": (
        "A layered paper-cut diorama in a shallow shadow box: five to seven layers of matte card stock "
        "with real depth, each casting a soft shadow on the next, slightly irregular cut edges, shot "
        "straight on."
    ),
    "riso": (
        "An editorial risograph print: bold simple shapes in three flat spot inks (pear yellow, clear "
        "blue, coral), a few fine blue-black lines, uncoated cream paper, riso grain, halftone dots."
    ),
    "specimen": (
        "A museum specimen plate: crafted models in paper, painted wood, glass and brass, knolled on "
        "cream card in a precise grid, seen from above, each casting a small soft shadow."
    ),
    "cyanotype": (
        "A cyanotype sun print on cream cotton paper: crisp white silhouettes with a contact print's "
        "soft halo on a hand-brushed deep Prussian-blue field; one small element tinted pear yellow."
    ),
}
STYLES = tuple(PRESETS)

# auto: the medium that suits the subject
AUTO_STYLE = {
    "physics": "clay",
    "engineering": "clay",
    "other": "clay",
    "chemistry": "specimen",
    "pe": "specimen",
    "biology": "papercut",
    "agriculture": "papercut",
    "geography": "papercut",
    "environment": "papercut",
    "math": "riso",
    "informatics": "riso",
    "computer_science": "riso",
    "economics": "riso",
}
PAPER_CYANOTYPE_SUBJECTS = frozenset({"physics", "chemistry", "engineering"})

# ============================================================================ shared blocks
LEVEL = {
    "lower": "Ages 11 to 15: chunky, friendly forms like a fine educational toy; three objects at most.",
    "upper": "Ages 15 to 18: true proportions, a little more detail, like a museum scale model; four objects at most.",
    "university": "University level: refined, only the essential structure, like a journal cover; three forms at most.",
}

COMPOSITION = (
    "Landscape 3:2, full bleed, no frame. One hero, 50-65% of the height, slightly above centre; key "
    "content within the middle 60% of the width and the top 80% of the height. Calm, uncluttered edges."
)

# The Hum tokens (frontend/src/styles/tokens.css) as Chromium renders them in sRGB: paper,
# pear, blue (gamut-mapped), mint, coral (gamut-mapped), kraft, sand and ink.
HOUSE = (
    "House style: crafted, tactile, warm cream paper #F7F5EC with fine grain; soft daylight from the "
    "upper left, shadows down-right. One dominant field colour; solid accents that never blend: pear "
    "yellow #F7D21A, clear blue #0064BF, mint #70E093, coral #FF5E63 only on the key detail, kraft "
    "#AE7D52 and sand #D9AC69 as earth tones, blue-black #12161C only in the smallest darkest "
    "details. Calm, confident, friendly; premium editorial finish; crisp focus on the hero."
)

NEGATIVE = (
    "No text: no letters, numbers, equations, labels, captions, signs, watermarks, logos, brands, "
    "flags. No people, faces, hands, eyes on objects. No maps with borders, readable screens or "
    "charts. No gradients, glow, neon, lens flare, bokeh, vignette, {dark}. No flat vector clip-art, "
    "glossy plastic CGI, stock-photo look, clutter, sparkles, confetti or frames."
)

TEACHER = "Teacher's idea, followed within these rules: {idea}"

# ============================================================================ hero scenes
# Fixed English scenes for the interactive models the app knows: crafted objects, never people.
SIM_SCENES = {
    "pendulum": "a simple pendulum: a round bob on a thin string hanging from a small lab stand, caught mid-swing",
    "projectile": "a small ball launched from a tabletop ramp, caught near the top of its curved flight above a long wooden runway",
    "spring_mass": "a weight hanging from a coiled spring on a lab stand, the spring slightly stretched mid-bounce",
    "compound_interest": "coins stacking into a row of glass jars, each jar fuller than the one before, the stacks rising like a gentle curve",
}
VISUAL_SCENES = {
    "circulation": "a clean anatomical model of the heart with looping blue and coral tubes carrying blood around one simple circuit",
    "enzyme_binding": "an enzyme as a large rounded form with a pocket and a smaller substrate piece fitting into it like a key into a lock",
    "molecular_geometry": "ball-and-stick models of a bent water molecule beside a tetrahedral one, built from smooth wooden balls and rods",
    "solar_globe": "a plain globe without country borders, lit from one side by a small lamp standing in for the sun, half in light and half in shade",
    "water_cycle": "a miniature landscape of a mountain, a lake and the sea, a small cloud raining on the mountain and a river running back to the sea",
    "population_grid": "a tabletop terrain divided into a neat grid of square tiles, tiny houses clustered densely on some tiles and sparsely on others",
    "image_relief": "a square board of small pillars of different heights, like a picture turned into a tabletop relief of pixels",
    "diffusion_process": "a row of four small square tile mosaics, the first a neat pattern of coloured tiles, each next one more scrambled, the last pure random speckle",
    "data_tree": "a tree of round wooden nodes joined by thin rods, branching from one root into several leaves, a few nodes painted to show a visiting order",
    "quadrotor": "a small quadrotor drone hovering just above a landing pad, its four rotors slightly tilted",
    "solar_cell": "a single solar cell tile in a layered cutaway, fine silver grid lines on top and a thin crack across one corner, sunlight falling on it",
    "agriculture_field": "terraced rice paddies with standing water, neat rows of seedlings and a narrow irrigation channel",
    "reaction_diffusion": "a shallow round dish where coloured chemical waves spread out as concentric rings and spots",
    "porous_adsorption": "a cutaway of a porous carbon pellet like a sponge of tiny chambers, small gas molecules settling on the inner walls",
    "semiconductor_chip": "a tiny transistor as a layered scale model: a thin channel bridging two raised contacts, a gate layered on top",
}
SPORT_SCENES = {
    "football": "a football resting on the centre spot of a neat grass pitch, a few training cones and a goal in the distance, no players",
    "futsal": "a futsal ball on a polished indoor court with crisp painted lines and a small goal, no players",
    "volleyball": "a volleyball resting on the court beside a net post, the net stretched across, no players",
    "basketball": "a basketball resting on a wooden court under the hoop, no players",
    "badminton": "a shuttlecock and a racket resting on a court beside the net, no players",
}
_SORT_SCENE = "a row of wooden blocks of different heights being sorted from shortest to tallest, a few already in order"
ALGORITHM_SCENES = {
    "attention": "a row of small wooden tokens linked by threads of different thickness, the thickest threads joining the tokens that matter most to each other",
    "binary_search": "a row of closed boxes ordered by size, the middle box opened with a small lantern beside it",
    "linear_search": "a small lantern moving along a row of closed boxes, one box glimpsed open",
    **{kind: _SORT_SCENE for kind in ("bubble_sort", "selection_sort", "insertion_sort", "quick_sort", "merge_sort",
                                      "heap_sort", "counting_sort", "radix_sort", "bucket_sort")},
}
GENERIC_HERO = "Show one clear hero object that embodies the lesson's central idea, with at most two supporting objects."
PAPER_HERO = "Show the paper's central idea as one physical metaphor made of crafted objects, never a chart, diagram or page."

_WS = re.compile(r"\s+")
_SENTENCE_END = re.compile(r"(?<=[.!?])\s")


def _clean(value: Any) -> str:
    """Text with every run of whitespace (newlines too) collapsed; anything else becomes ''."""
    return _WS.sub(" ", value).strip() if isinstance(value, str) else ""


def _clip(value: Any, limit: int) -> str:
    """At most ``limit`` characters, cut at a word boundary and marked with an ellipsis."""
    text = _clean(value)
    if len(text) <= limit:
        return text
    if limit < 2:
        return ""
    cut = text[: limit - 1]
    space = cut.rfind(" ")
    if space >= limit // 2:
        cut = cut[:space]
    return cut.rstrip(" ,;:.-") + "…"


def _end(text: str) -> str:
    """The text as a sentence: a full stop added unless it already ends like one."""
    return text if not text or text.endswith((".", "!", "?", "…")) else text + "."


def _bare(text: str) -> str:
    """A list item: the text without a trailing full stop, colon or semicolon."""
    return text.rstrip(" .;:") if not text.endswith("…") else text


def resolve_style(style: str | None, subject: str | None, space: str | None = None) -> str:
    """The preset to use: an explicit preset, else the subject's medium (a cyanotype for
    research papers in physics, chemistry and engineering)."""
    if style in PRESETS:
        return style
    if space == "paper2explorer" and subject in PAPER_CYANOTYPE_SUBJECTS:
        return "cyanotype"
    return AUTO_STYLE.get(subject or "other", "clay")


def grade_band(grade: str | None) -> str:
    if grade in ("6", "7", "8", "9"):
        return "lower"
    if grade in ("10", "11", "12"):
        return "upper"
    return "university"


def _analysis(lab: Any) -> LabAnalysis:
    """The stored analysis; when it no longer validates as a whole, each part that still does."""
    raw = getattr(lab, "analysis_json", None)
    raw = raw if isinstance(raw, dict) else {}
    try:
        return LabAnalysis.model_validate(raw)
    except ValidationError:
        pass
    analysis = LabAnalysis()
    for key in ("result", "paper"):
        try:
            setattr(analysis, key, getattr(LabAnalysis.model_validate({key: raw.get(key)}), key))
        except ValidationError:
            continue
    return analysis


def _spec_list(lab: Any, key: str) -> list[dict[str, Any]]:
    spec = getattr(lab, "spec_json", None)
    items = spec.get(key) if isinstance(spec, dict) else None
    return [item for item in items if isinstance(item, dict)] if isinstance(items, list) else []


def _scene(blocks: list[dict[str, Any]]) -> str:
    """A fixed scene for the first known model, by priority: simulation, 3D visual, sport, algorithm."""
    for block_type, key, scenes in (
        ("simulation", "model", SIM_SCENES),
        ("text", "visual3d", VISUAL_SCENES),
        ("field", "sport", SPORT_SCENES),
        ("algorithm", "algorithm", ALGORITHM_SCENES),
    ):
        for block in blocks:
            value = block.get(key)
            if block.get("type") == block_type and isinstance(value, str) and value in scenes:
                return scenes[value]
    return ""


def _objects(analysis: LabAnalysis, limit: int) -> list[tuple[str, str]]:
    """(phrase, description) of the analysed objects, confirmed ones first."""
    if analysis.result is None:
        return []
    out: list[tuple[str, str]] = []
    for obj in sorted(analysis.result.objects, key=lambda o: not o.confirmed):
        phrase = _clip(obj.sam_phrase, 60) or _clip(obj.name, 60)
        if phrase:
            out.append((phrase, _clean(obj.description)))
        if len(out) == limit:
            break
    return out


def _paper_facts(analysis: LabAnalysis) -> list[str]:
    """Title, the summary's first sentence, two figure captions and the method titles."""
    paper = analysis.paper
    if paper is None:
        return []
    facts: list[str] = []
    title = _clip(paper.title, 150)
    if title:
        facts.append(_end(f"Paper: {title}"))
    summary = _clean(paper.summary)
    first = _clip(_SENTENCE_END.split(summary, maxsplit=1)[0], 200) if summary else ""
    if first:
        facts.append(_end(first))
    captions = [c for c in (_bare(_clip(f.caption or f.description, 100)) for f in paper.figures) if c][:2]
    if captions:
        facts.append(_end("Figures: " + "; ".join(captions)))
    methods = [m for m in (_bare(_clip(m.title, 60)) for m in paper.methods) if m][:3]
    if methods:
        facts.append(_end("Methods: " + ", ".join(methods)))
    return facts


def _glossary(lab: Any, skip: set[str]) -> str:
    terms: list[str] = []
    seen = set(skip)
    for term in _spec_list(lab, "glossary"):
        word = _clip(term.get("en"), 40)
        if word and word.casefold() not in seen:
            seen.add(word.casefold())
            terms.append(word)
        if len(terms) == 6:
            break
    return _end("Key ideas, as context only: " + ", ".join(terms)) if terms else ""


def hero_parts(lab: Any, analysis: LabAnalysis | None = None) -> list[str]:
    """The HERO block as sentences, the most important first (the last ones give way first)."""
    analysis = analysis if analysis is not None else _analysis(lab)
    band = grade_band(getattr(lab, "grade", None))
    scene = _scene(_spec_list(lab, "blocks"))
    paper = _paper_facts(analysis) if getattr(lab, "space", None) == "paper2explorer" else []
    parts: list[str] = []
    skip: set[str] = set()
    if scene:
        parts.append(f"Show {scene}.")
        parts += paper[:2]  # the paper's title and main claim give the fixed scene its context
    elif paper:
        parts += [PAPER_HERO, *paper]
    else:
        objects = _objects(analysis, 4 if band == "upper" else 3)
        shown = []
        for phrase, description in objects:
            skip.add(phrase.casefold())
            note = _clip(description, 80)
            shown.append(f"{phrase} ({note})" if note and note.casefold() != phrase.casefold() else phrase)
        parts.append("Show " + "; ".join(shown) + "." if shown else GENERIC_HERO)
    glossary = _glossary(lab, skip)
    if glossary:
        parts.append(glossary)
    return parts


def topic_line(lab: Any, topic: str) -> str:
    _vi, en = SUBJECT_NAMES.get(getattr(lab, "subject", None) or "other", SUBJECT_NAMES["other"])
    grade = getattr(lab, "grade", None)
    level = "university" if grade_band(grade) == "university" else f"grade {grade}"
    subject = "" if en == "Other" else f" {en.lower()}"
    return _end(f"Cover picture for a {level}{subject} lesson titled (context only, never lettered in the image): {topic}")


def build_cover_prompt(lab: Any, style: str | None = "auto", idea: str | None = None) -> tuple[str, str]:
    """``(prompt, resolved_style)`` for a lab's cover. ``lab`` provides ``title``, ``topic``,
    ``subject``, ``grade``, ``space``, ``spec_json`` and ``analysis_json`` (missing ones count as
    empty); ``idea`` is the teacher's own description of the picture, kept verbatim."""
    resolved = resolve_style(style, getattr(lab, "subject", None), getattr(lab, "space", None))
    analysis = _analysis(lab)
    topic_text = (
        _clean(getattr(lab, "topic", None))
        or _clean(analysis.result.topic if analysis.result else "")
        or _clean(getattr(lab, "title", None))
    )
    shared = [PRESETS[resolved], LEVEL[grade_band(getattr(lab, "grade", None))], COMPOSITION, HOUSE]
    negative = NEGATIVE.format(dark="black or night backgrounds" if resolved == "cyanotype" else "dark backgrounds")

    def assemble(topic: str, hero: list[str], idea_part: str) -> str:
        blocks = [topic_line(lab, topic), " ".join(hero), *shared]
        if idea_part:
            blocks.append(TEACHER.format(idea=idea_part))
        blocks.append(negative)
        return "\n\n".join(block for block in blocks if block)

    topic = _clip(topic_text, 200)
    hero = hero_parts(lab, analysis)
    idea_part = _clip(idea, 600)
    prompt = assemble(topic, hero, idea_part)
    # Over the cap, in this order: whole fact sentences (glossary, paper extras), the hero
    # sentence down to 100 characters, the topic down to 40; with a teacher's idea the hero then
    # goes (the idea says what to show), and the idea itself is shortened only last.
    while len(prompt) > MAX_PROMPT_CHARS and len(hero) > 1:
        hero = hero[:-1]
        prompt = assemble(topic, hero, idea_part)
    if len(prompt) > MAX_PROMPT_CHARS:
        hero = [_clip(hero[0], max(100, len(hero[0]) - (len(prompt) - MAX_PROMPT_CHARS)))]
        prompt = assemble(topic, hero, idea_part)
    if len(prompt) > MAX_PROMPT_CHARS:
        topic = _clip(topic, max(40, len(topic) - (len(prompt) - MAX_PROMPT_CHARS)))
        prompt = assemble(topic, hero, idea_part)
    if len(prompt) > MAX_PROMPT_CHARS and idea_part:
        hero = []
        prompt = assemble(topic, hero, idea_part)
    if len(prompt) > MAX_PROMPT_CHARS and idea_part:
        idea_part = _clip(idea_part, max(2, len(idea_part) - (len(prompt) - MAX_PROMPT_CHARS)))
        prompt = assemble(topic, hero, idea_part)
    return prompt, resolved


__all__ = [
    "AUTO_STYLE",
    "MAX_PROMPT_CHARS",
    "PRESETS",
    "PROMPT_VERSION",
    "STYLES",
    "build_cover_prompt",
    "grade_band",
    "hero_parts",
    "resolve_style",
    "topic_line",
]
