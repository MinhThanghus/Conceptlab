"""Generate the demo teaching materials used by `python -m app.cli seed-demo`.

Every picture is an original illustration made for the demos (not a copy of any textbook):
both textbook pages are typeset in HTML/CSS, the classroom photo, the water-cycle diorama and the
practice clip are procedural Three.js scenes, the circulation diagram is an SVG of the real system.
They are rendered in headless Chromium by scripts/render/render.py, which also measures what the
lessons cite (quote boxes on the pages, part regions in *_regions.json). This script writes the
study-excerpt PDF and then runs those render jobs. Output: backend/app/seed/assets/.

    python scripts/make_demo_assets.py                 # the PDF and every picture
    python scripts/make_demo_assets.py --pdf-only

After the photo or the clip changes, re-run the real SAM 3.1 steps with the backend venv
(scripts/make_sam_cutout.py, scripts/make_sam_track.py), then update a running dev database
in place: (in backend) python -m app.seed.demo --refresh
Needs PyMuPDF, plus what scripts/render/render.py needs (Playwright, Pillow, numpy, opencv-python,
imageio-ffmpeg).
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "backend" / "app" / "seed" / "assets"
OUT.mkdir(parents=True, exist_ok=True)


# --------------------------------------------------------------------------- attention paper (PDF)
def attention_paper() -> None:
    doc = pymupdf.open()
    p1 = doc.new_page(width=595, height=842)
    title = "Scaled Dot-Product Attention — a study excerpt"
    p1.insert_text((56, 70), title, fontsize=16, fontname="helv")
    p1.insert_text((56, 92), "Classroom excerpt adapted for Paper2Explorer (based on Vaswani et al., 2017)", fontsize=9, fontname="helv", color=(0.35, 0.35, 0.4))
    body1 = (
        "1 Introduction\n"
        "Sequence models compute a representation of every token by looking at other tokens.\n"
        "An attention function maps a query and a set of key-value pairs to an output, where\n"
        "the query, keys, values and output are all vectors. The output is a weighted sum of\n"
        "the values; the weight of each value comes from a compatibility function of the query\n"
        "with the corresponding key.\n\n"
        "2 Method\n"
        "2.1 Scaled Dot-Product Attention\n"
        "The input consists of queries and keys of dimension d_k and values of dimension d_v.\n"
        "We compute the dot products of the query with all keys, divide each by sqrt(d_k),\n"
        "and apply a softmax function to obtain the weights on the values. In practice the\n"
        "queries, keys and values are packed into matrices Q, K and V:\n\n"
        "        Attention(Q, K, V) = softmax( Q K^T / sqrt(d_k) ) V                       (1)\n\n"
        "For large d_k the dot products grow large in magnitude, pushing the softmax into\n"
        "regions with extremely small gradients. Scaling by 1/sqrt(d_k) counteracts this.\n\n"
        "2.2 Step-by-step procedure\n"
        "Step 1. Compute the score matrix S = Q K^T (one score per query-key pair).\n"
        "Step 2. Scale the scores: S' = S / sqrt(d_k).\n"
        "Step 3. Normalise each row with softmax so the weights of one query sum to 1.\n"
        "Step 4. Multiply the weights by V to obtain the output for each query.\n"
    )
    p1.insert_textbox(pymupdf.Rect(56, 112, 540, 640), body1, fontsize=10, fontname="helv")
    # Figure 1: block diagram (vector drawing)
    teal, indigo, ink = (0.04, 0.43, 0.41), (0.26, 0.22, 0.79), (0.2, 0.2, 0.25)

    def box(x, y, w, h, label, color):
        p1.draw_rect(pymupdf.Rect(x, y, x + w, y + h), color=color, width=1.3)
        p1.insert_text((x + (w - len(label) * 5.0) / 2, y + h / 2 + 3.5), label, fontsize=9.5, fontname="helv")

    def link(x1, y1, x2, y2):
        p1.draw_line(pymupdf.Point(x1, y1), pymupdf.Point(x2, y2), color=ink, width=1)

    x0, y0 = 200, 530
    box(x0, y0, 40, 22, "Q", teal)
    box(x0 + 60, y0, 40, 22, "K", teal)
    box(x0 + 190, y0, 40, 22, "V", teal)
    box(x0 + 20, y0 + 44, 60, 22, "MatMul", indigo)
    link(x0 + 20, y0 + 22, x0 + 40, y0 + 44)
    link(x0 + 80, y0 + 22, x0 + 60, y0 + 44)
    box(x0 - 5, y0 + 86, 110, 22, "Scale 1/sqrt(d_k)", indigo)
    link(x0 + 50, y0 + 66, x0 + 50, y0 + 86)
    box(x0 + 20, y0 + 128, 60, 22, "Softmax", indigo)
    link(x0 + 50, y0 + 108, x0 + 50, y0 + 128)
    box(x0 + 110, y0 + 170, 60, 22, "MatMul", indigo)
    link(x0 + 50, y0 + 150, x0 + 125, y0 + 170)
    link(x0 + 210, y0 + 22, x0 + 155, y0 + 170)
    link(x0 + 140, y0 + 192, x0 + 140, y0 + 204)
    p1.insert_text((x0 + 122, y0 + 216), "Output", fontsize=9.5, fontname="helv")
    p1.insert_text((56, y0 + 245), "Figure 1: Scaled Dot-Product Attention. Q and K are multiplied, scaled by 1/sqrt(d_k),", fontsize=9, fontname="helv")
    p1.insert_text((56, y0 + 257), "normalised with softmax, and the resulting weights are applied to V.", fontsize=9, fontname="helv")
    p1.insert_text((290, 815), "1", fontsize=9, fontname="helv")

    p2 = doc.new_page(width=595, height=842)
    body2 = (
        "2.3 Multi-Head Attention\n"
        "Instead of a single attention function with d_model-dimensional keys, values and\n"
        "queries, we linearly project them h times with different learned projections:\n\n"
        "        MultiHead(Q, K, V) = Concat(head_1, ..., head_h) W^O                       (2)\n"
        "        where head_i = Attention(Q W_i^Q, K W_i^K, V W_i^V)\n\n"
        "We use h = 8 heads with d_k = d_v = d_model / h = 64.\n\n"
        "3 Analysis\n"
        "Table 1 compares layer types by computational complexity per layer, where n is the\n"
        "sequence length and d the representation dimension.\n\n"
        "Table 1: Complexity per layer and number of sequential operations.\n"
        "   Layer type        Complexity per layer     Sequential operations\n"
        "   Self-attention    O(n^2 * d)               O(1)\n"
        "   Recurrent         O(n * d^2)               O(n)\n"
        "   Convolutional     O(k * n * d^2)           O(1)\n\n"
        "4 Worked example (for students)\n"
        "Take three tokens with d_k = 2: Q = K = [[1, 0], [0, 1], [1, 1]] and\n"
        "V = [[1, 0], [0, 1], [0.5, 0.5]]. The score of token 3 with itself is 2, which\n"
        "after scaling by 1/sqrt(2) becomes about 1.41. A larger score gives a larger weight\n"
        "after softmax, so each output mixes the values it attends to most.\n\n"
        "5 Limitations of this excerpt\n"
        "This excerpt explains one component only. It does not reproduce training,\n"
        "datasets or experimental results of the original paper.\n"
    )
    p2.insert_textbox(pymupdf.Rect(56, 60, 540, 760), body2, fontsize=10, fontname="helv")
    p2.insert_text((290, 815), "2", fontsize=9, fontname="helv")
    doc.save(OUT / "attention_excerpt.pdf", garbage=3, deflate=True)


if __name__ == "__main__":
    attention_paper()
    if "--pdf-only" not in sys.argv:
        jobs = ["page-pendulum", "page-volleyball", "photo", "water", "heart", "video"]
        subprocess.run([sys.executable, str(ROOT / "scripts" / "render" / "render.py"), *jobs], check=True)
    for path in sorted(OUT.iterdir()):
        print(f"{path.name:36s} {path.stat().st_size:>9,d} bytes")
