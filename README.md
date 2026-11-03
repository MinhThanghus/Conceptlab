# ConceptLab AI

**A textbook page becomes a lab. / Trang sách thành phòng thí nghiệm.**

ConceptLab AI turns textbook pages, photos of real objects, practice videos and research papers
into interactive, **source-cited** lessons: step-by-step lessons, clickable diagrams, live graphs,
simulations, algorithm walkthroughs, slow-motion videos with observation markers, an interactive
sports field, self-check quizzes and an AI tutor that answers with citations. It is bilingual
(Tiếng Việt / English) and built for classrooms with slow networks and low-end phones.

Two spaces share one platform:

| Space | For | Inputs | Interactive output |
|---|---|---|---|
| **School2Lab** | Grades 6 to 12 students and teachers (incl. physical education) | Textbook pages, lesson plans, photos of real objects, practice videos, measured values | Step lessons, diagrams, graphs, simulations (pendulum, projectile, compound interest, spring), sports field, quizzes |
| **Paper2Explorer** | University students & researchers | Paper PDFs, figures, equations, supplementary data | Paper map (sections, equations, figures, tables, methods), equation explorer, attention/algorithm walkthroughs, AI-built sandboxed widgets |

Every AI feature uses **Meta models** through `backend/app/ai/client.py`:

| Model | Used for |
|---|---|
| `muse-spark-1.3-contributor` (default) / `muse-spark-1.3` (Standard, private) | Analysis of PDFs/images/videos, lab generation, quizzes, video markers, translation, tutor chat, widget code |
| `muse-wonder-1.0` | Optional "deep analysis" of long or complex documents |
| `sam-3.1` | Selecting objects in photos (text, click or box), diagram parts, tracking objects in video |
| `muse-voice-transcribe-1.0` | Voice questions to the tutor |
| `muse-image-1.0` | Optional decorative lab cover (always labelled as AI illustration) |

Privacy (spec §16): labs are private until published; media showing students needs explicit
consent before sharing; when a lab includes such media the analysis automatically switches to
Standard mode (content not used for training). Videos are never used to identify or rank students.

## Design

The interface follows one locked system, **`DESIGN.md`** (read it before changing any screen). It was
built with the Hallmark design skill (its floor, gates and the Hum theme, adapted to the Lexend face
because Vietnamese needs it) and checked with Hallmark's linter. Pictures show the real product: screens of the
sample labs are captured by `python scripts/capture_shots.py` into `frontend/public/shots` (home)
and `frontend/public/covers` (gallery); re-run it after a visible change to the learner view.

3D labs follow the img2threejs method (procedural `Group` factories from
primitives, bevelled boxes, tubes and generated textures, verified by screenshots): the home hero's
pendulum stand and the simulation blocks' pendulum, projectile and spring scenes live in
`frontend/src/lib/three` and `frontend/src/components/lab3d`. Three.js loads only on screens that
show a 3D lab, never on 2G, with data saver or without WebGL; the 2D view is always there.
The demo materials in `backend/app/seed/assets` (textbook pages, classroom photo, water-cycle
diorama, circulation schematic, volleyball clip) are rendered by `scripts/render/` and
`scripts/make_demo_assets.py`; `python -m app.cli seed-demo --refresh` updates the demo labs in
place without touching learners' data.

## Lite learner view

Choose **Chế độ nhẹ / Lite mode** in the header or from a shared lesson, or open `/lite` and enter a class code. This optional single-column view offers large text, a projector setting, source references, server-marked quizzes, feedback and an AI tutor. Graphs, simulations, videos and other richer interactions link back to the full view.

To read without a network, choose **Save for offline reading** while online. The browser stores the current interface language, lesson and its still images on this device; use **Delete saved copy** to remove the lesson and images. The saved copy can become stale or be withdrawn while offline, so reconnect to check. Opening the full view, submitting quizzes or feedback, and using the tutor or voice require a connection. Saving needs browser storage and service worker support (HTTPS or localhost); browsers can evict stored data. If saving fails, Lite reports it instead of claiming the lesson is saved.

## Visual lessons

`/learn` links to public learning experiences for geography, molecular geometry, image processing,
algorithm traces and data structures. They focus on small inspectable examples, controls and explanations;
they are separate from user-created labs unless the lesson says otherwise. Three.js is loaded only for
3D views, with a 2D alternative when WebGL or data access is restricted.

The geography lesson can optionally load Mapbox GL JS after the learner supplies a **public** Mapbox
token and explicitly opens the map. The educational globe and graph work without an account or token.
Mapbox GL JS is subject to [Mapbox terms](https://www.mapbox.com/legal/tos/) and map use may be billed
by Mapbox; the app does not store the entered token. See [Mapbox documentation](https://docs.mapbox.com/mapbox-gl-js/).
The computer vision lesson illustrates filtering and a mathematical flow path, not a trained image generator.

## Project layout

```
backend/            FastAPI app (Python 3.12), SQLite + Alembic, Meta API adapter
  app/api/          routers (auth, labs, sources, ai, chat, share, admin, health)
  app/services/     business rules, permissions, media (PDF/image/video/audio), AI services
  app/schemas/      DTOs + the Lab specification contract (spec.py, analysis.py)
  app/seed/         demo labs + original demo materials
  tests/            pytest (offline) + live AI tests (RUN_LIVE_AI=1)
frontend/           React 19 + Vite 8 (JavaScript), bilingual UI, interactive blocks
shared/             test vectors shared by Python and JavaScript (expressions, simulations)
docs/               API.md, LAB_SPEC.md, BUILD_PLAN.md, TESTING.md, MUSE_HANDOFF.md
DESIGN.md           the locked visual system (tokens, controls, surfaces, imagery, copy, motion)
e2e/                Playwright browser smoke tests (VI + EN, phone + desktop)
scripts/            dev helpers, demo-material renderers, capture_shots.py, shoot.py, run_muse.ps1
```

## Requirements

- Python 3.11+ (tested 3.12) — `ffmpeg` is bundled through the `imageio-ffmpeg` package.
- Node.js 22.12+ (tested 24) and npm.
- A Meta Model API key for AI features (the app still runs without one; AI buttons explain that AI is not configured).

## Setup (clean machine)

```powershell
# 1. Backend
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
Copy-Item .env.example .env          # then edit .env: set MODEL_API_KEY=... (never commit it)
.venv\Scripts\python -m app.cli init-db
.venv\Scripts\python -m app.cli create-admin --email you@school.edu --name "Your Name"   # prompts for a password
.venv\Scripts\python -m app.cli seed-demo   # 9 published demo labs (--refresh updates them in place)

# 2. Frontend
cd ..\frontend
npm ci
```

(macOS/Linux: `python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt`, `cp .env.example .env`.)

All configuration lives in `backend/.env`; every variable is documented in
`backend/.env.example`. The frontend has no secrets and no `.env`.

## Run (development)

Two terminals:

```powershell
cd backend;  .venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
cd frontend; npm run dev          # http://localhost:5173  (proxies /api to :8000)
```

Or `powershell -File scripts\dev.ps1` to start both.

If ports 8000 or 5173 are already in use, use two other free ports and point Vite at
the matching API. For example, in separate PowerShell terminals:

```powershell
cd E:\ConceptLab\backend
$env:PUBLIC_BASE_URL = 'http://127.0.0.1:5300'
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

```powershell
cd E:\ConceptLab\frontend
$env:API_PROXY_TARGET = 'http://127.0.0.1:8001'
npm.cmd run dev -- --host 127.0.0.1 --port 5300 --strictPort
```

Open `http://127.0.0.1:5300`. The `PUBLIC_BASE_URL` override also makes generated
share links point to that frontend. `npm.cmd` works when the PowerShell execution
policy blocks `npm.ps1`. Port availability can change; choose another free pair if needed.

Demo labs (no account needed): `/s/TPEND6` pendulum (physics 10) · `/s/VBPASS` volleyball
forearm pass (PE 7) · `/s/ATTN24` attention (Paper2Explorer) · `/s/PARAB3` quadratic graphs ·
`/s/HEART8` circulatory system · `/s/WATER6` water cycle · `/s/SWAP42` bubble sort & binary
search · `/s/SAVE25` compound interest · `/s/JUMP45` projectile motion.

## Run (production, single origin)

```powershell
cd frontend; npm run build                     # → frontend/dist (served by FastAPI)
cd ..\backend
# backend/.env: APP_ENV=production, COOKIE_SECURE=true, PUBLIC_BASE_URL=https://your.domain,
#               ALLOWED_ORIGINS=https://your.domain
.venv\Scripts\python -m app.cli init-db
.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers
```

Put it behind an HTTPS reverse proxy. Back up `backend/data/` (database) and `backend/storage/`
(uploaded files) together. Health check: `GET /api/health`.

Operational limits (by design for a single-instance deployment): rate limits are in-process;
video transcoding runs as an in-process background task (a restart marks unfinished videos as
failed so they can be uploaded again); SQLite suits one server — use PostgreSQL and a job
queue before scaling out.

## Tests

```powershell
cd backend;  .venv\Scripts\python -m pytest                       # offline: API, permissions, media, validation, AI with a fake transport
$env:RUN_LIVE_AI="1"; .venv\Scripts\python -m pytest -m live      # real Meta API calls (costs a little)
cd ..\frontend; npm test; npm run check:i18n; npm run build
cd ..; python e2e\smoke.py --base http://localhost:5173            # browser smoke, VI + EN, phone + desktop
```

See `docs/TESTING.md` for the latest results and what each suite covers.

## Accounts and roles

Sign-up creates **teacher**, **student** or **researcher** accounts. There is no default admin
and no public way to become one: create the first administrator with
`python -m app.cli create-admin` (password prompted, or `ADMIN_PASSWORD` env for automation).
Learners can open shared labs with a 6-character class code (no account needed).
