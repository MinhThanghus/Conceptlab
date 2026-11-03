# Handoff to Muse Code: ConceptLab AI

You are taking over a working, tested full-stack project to (1) **evaluate** it, (2) **test every
AI feature end-to-end** against the real Meta Model API, and (3) **build two optional alternative
user interfaces** (Task C: ConceptLab Lite; Task D: ConceptLab Diorama). Work only inside
`E:\ConceptLab`. Read this whole file first.

## 1. What the product is
`specduan.txt` (Vietnamese) is the authoritative product spec; `thongtinai.txt` documents the
Meta models. ConceptLab AI turns textbook pages, photos of real objects, practice videos and
research papers into interactive, source-cited lessons for students and teachers, including in
remote areas with slow networks, low-end phones and classroom projectors. Two spaces:
School2Lab (grades 6 to 12, including physical education) and Paper2Explorer (university).

Read next: `README.md` (setup, run, test), `docs/API.md` (every endpoint), `docs/LAB_SPEC.md`
(the lesson data model), `docs/BUILD_PLAN.md` (conventions, file layout), `docs/TESTING.md`
(what is already verified) and **`DESIGN.md`** (the locked visual system: every screen follows it).
The engineering skill the project follows is installed for you as the user skill **fullstack-web**
(source: `C:\Users\admin\Desktop\skills\skills\fullstack-web\SKILL.md` + `references/`): follow it.

### Design references (the user asked for these; use them for Task C and Task D)
The whole UI was redesigned because the user found the first version "really ugly, the images
too". The redesign followed these local, third-party references (read-only, do not edit them):
- `hallmark/`: **the main design reference.** A design skill that refuses the AI-generated look.
  `hallmark/skills/hallmark/SKILL.md` (the Floor), `references/gates.md` (every gate by tier),
  `references/craft.md`, `references/layout.md`, `references/imagery.md`, `references/flow.md`
  (section App screens), `references/redesign.md`, and `references/themes/hum.md` + `hum.jpg` (the
  theme the product uses, adapted to Lexend because Chillax has no Vietnamese glyphs). Its scripts
  (`scripts/sloplint.mjs`, `scripts/theme.mjs`) run with Node; the files have CRLF line endings, so
  copy the skill folder into `.muse/` and convert to LF before running them.
- `img2threejs/`: procedural Three.js reconstruction (demo: https://img2threejs.io/#/demo/snowy-village).
  Read `SKILL.md` (Core Promise, Implementation Rules) and `grimoire/build/geometry_patterns.md`.
  The product's 3D labs follow it: `frontend/src/lib/three/` (`capability.js`, `stage.js`,
  `pendulumBench.js`, models) and `frontend/src/components/lab3d/`.
- `ui-ux-pro-max-skill/`: a searchable UI/UX knowledge base. Its CLI is stdlib Python:
  `python -E -s ui-ux-pro-max-skill/src/ui-ux-pro-max/scripts/search.py "<query>" --design-system`,
  and `--stack react`, `--stack threejs`, `--domain ux` (never `--persist` outside `.muse/`).
- `typeui/`: design-system authoring. `DESIGN.md` (the skill.md blueprint) and
  `skills/fundamentals/*.md` (UI, UX, spacing, typography and accessibility principles).

## 2. Ground rules
- Never print, log, commit or copy the API key in `backend/.env`. Do not edit `backend/.env`.
- Python: `backend\.venv\Scripts\python.exe`. Node 24 / npm. Windows + PowerShell.
- Keep everything that works working: `pytest`, `npm test`, `npm run check:i18n`, `npm run build`
  must stay green. Run them before you finish.
- Bilingual is mandatory: every visible string goes through `t()` with keys in
  `frontend/src/i18n/locales/vi/*.js` and `en/*.js` (same keys).
- Accessibility and honesty rules from `docs/BUILD_PLAN.md` apply (keyboard, focus, contrast,
  provenance labels, no fake data, no fake citations).
- Visual rules from `DESIGN.md` apply to everything you add: its tokens only (no raw colours),
  no eyebrows, no tracked capitals, no em or en dashes in interface copy, no arrows glued to
  button text, no icon tiles, no card inside a card, one primary action per screen, 44px targets,
  reduced-motion fallbacks. A UI that needs something else amends `DESIGN.md` with a
  `## Variants` section instead of overriding it locally.
- Do not delete user data, do not touch files outside `E:\ConceptLab`, no git push.
- If you start servers, use ports 8300 (API) and 5300 (web) with an isolated database:
  `DATABASE_URL=sqlite:///E:/ConceptLab/.muse/db.sqlite`, `STORAGE_DIR=E:/ConceptLab/.muse/storage`,
  then `python -m app.cli init-db` and `python -m app.cli seed-demo`; run Vite with
  `API_PROXY_TARGET=http://127.0.0.1:8300 npx vite --port 5300 --strictPort`. Stop them when done.
  Never stop or kill any other process (ports 5173, 5190, 8000 and 8190 belong to others).

## 3. Task A: Evaluate (write `docs/MUSE_REVIEW.md`)
Review architecture, code quality, security (auth, CSRF, permissions and IDOR, uploads, widget
sandbox), data and privacy (spec §16), accessibility, bilingual quality (natural Vietnamese),
educational UX for remote classrooms, performance on slow networks, the redesign against
`DESIGN.md` and the Hallmark gates (with screenshots), and fidelity to `specduan.txt` (go section
by section §1 to §17 and mark each requirement: done, partial or missing, with evidence: file
paths, endpoints, screenshots). List concrete findings with severity (critical, high, medium,
low), file:line and a recommended fix. Fix critical and high issues you are confident about
(with tests) and record what you changed.

## 4. Task B: Test every AI feature (write `docs/MUSE_AI_TEST_REPORT.md`)
1. Run the offline suite, then the live suite: `RUN_LIVE_AI=1 pytest -m live -v` in `backend`.
2. Independently exercise every AI endpoint of `docs/API.md` §AI and §Chat against your isolated
   server (create a teacher account, labs, upload the demo materials in
   `backend/app/seed/assets` and `backend/tests/fixtures`), in **both** lab languages (vi, en):
   analyze (image + photo + measured data; also a PDF; also deep mode), paper-structure,
   explore-equation, generate (every block type), quiz, video-markers, track, segment (phrase in
   Vietnamese and English, point, box, PDF page), segment-frame, diagram, widget + repair + render
   route headers, translate, cover image, field-scenario, explain-change, prediction-feedback
   (owner and share routes), transcribe (WAV and a non-WAV file), chat SSE (owner and share,
   citations, tutor_disabled), privacy switch to Standard mode for media with students,
   rate-limit behaviour.
3. For each: model used, latency, pass or fail, and a short judgement of the output's educational
   quality and correctness (are citations real? are numbers right? is the Vietnamese natural?).
   Fix bugs you find (with tests).

## 5. Task C: Build optional UI 1, ConceptLab Lite (classroom and low-bandwidth mode)
An optional learner interface, reachable from a visible "Chế độ nhẹ / Lite" link (header and
shared-lab page) and at `/lite` (enter class code) and `/lite/:code` (the lab). It must not
replace or break the main UI. Goals: works on a low-end Android phone on 2G/3G and on a
classroom projector.
- Single column, very large type and touch targets, high contrast (7:1 or more for body text),
  projector toggle (extra large), minimal JavaScript: code-split, no heavy libraries on first load
  (never Three.js).
- Uses the same backend contract (`GET /api/share/{code}`, quiz attempts, feedback, chat SSE,
  `/api/ai/transcribe`); no backend changes unless strictly required (then add tests).
- Shows the lesson as simple sequential sections: summary, steps (text + highlighted image),
  key formula, a lightweight version of the main interactive (reuse existing block components
  where they are light enough, otherwise a simplified renderer), quiz, and "Ask the AI" with
  voice input. Respect provenance labels and source citations.
- Offline-friendly: cache the last opened lab and its images for reading offline (a small
  service worker or Cache Storage, with a clear "saved for offline" indicator); explain limits.
- Fully bilingual (vi and en keys), accessible, responsive; Vitest tests for its logic and
  Playwright screenshots (phone + projector, vi + en) in `e2e/output/lite/`.
- Lite is a `## Variants` entry in `DESIGN.md` (same tokens, larger type, 7:1 contrast).

## 6. Task D: Build optional UI 2, ConceptLab Diorama (3D)
An optional, playful way into a lab, built from the design references above: the lab becomes a
small paper-craft island in the Hum palette (in the spirit of the img2threejs snowy-village
diorama), each part of the lesson a station on it. Reachable from a "Xem dạng 3D / See it in 3D"
link on the shared-lab page (`/s/:code`) and at `/d/:code`. It must not replace or slow the main UI.
- Plan it first as a Hallmark build: read the references, decide the screen, and write the plan
  in `docs/MUSE_DIORAMA_PLAN.md` in the typeui blueprint shape (mission, foundations, components,
  states, accessibility acceptance criteria, anti-patterns, QA checklist). Use the ui-ux-pro-max
  CLI (`--stack threejs`, `--domain ux`) for 3D UX, performance and accessibility guidance and
  cite what you used.
- 3D with the img2threejs method: one procedural `Group` factory per landmark (primitives,
  bevelled boxes, tubes, lathe, instancing, canvas textures, seeded noise), for example a book
  for a step-by-step part, the pendulum stand (reuse `pendulumBench.js`) for a simulation, a court
  for a field part, a screen for a video, a board for a quiz; light from the top left; verify each
  model with screenshots and say honestly what is stylised. Reuse `stage.js` and `capability.js`.
- Interaction: choose a station by click or tap, or from an always-visible accessible list of the
  parts (keyboard and screen-reader users never need the canvas); the part opens in a sheet that
  renders the real block (reuse `BlockRenderer` and the share API); progress shows in mint; the AI
  tutor stays one tap away. Camera moves are short and skippable; reduced motion means cuts.
- Budgets: Three.js and the scene load only on `/d/:code` (lazy chunk); on 2G, data saver or no
  WebGL the route shows a clear notice and a link to the normal lab; 60 fps target on a mid-range
  phone, rendering paused when hidden; no new runtime dependency besides `three` (already there).
- Fully bilingual, accessible, responsive (375 and 1366), Vitest tests for its pure logic,
  Playwright screenshots (phone + desktop, vi + en) in `e2e/output/diorama/`.
- Run the Hallmark linter where it applies and walk the gates by eye; record findings and fixes.
  Add its `## Variants` entry in `DESIGN.md`.

## 7. Deliverables checklist
- `docs/MUSE_REVIEW.md`, `docs/MUSE_AI_TEST_REPORT.md`, `docs/MUSE_CHANGES.md`,
  `docs/MUSE_DIORAMA_PLAN.md`.
- Code changes with tests; all suites green (paste the real command outputs in MUSE_CHANGES.md).
- A short final summary of what you verified, what you changed, and what remains.
