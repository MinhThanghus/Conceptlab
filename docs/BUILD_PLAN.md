# ConceptLab AI — build plan & conventions (for every implementer)

Product brief: `specduan.txt` (Vietnamese, authoritative). Model facts: `thongtinai.txt`.
Contracts: `docs/API.md`, `docs/LAB_SPEC.md`, `backend/app/schemas/*.py`.

ConceptLab AI turns textbook pages, photos of real objects, practice videos and research papers
into interactive, **source-cited** lessons. Two spaces: **School2Lab** (grades 6–12, teachers;
PE lives here) and **Paper2Explorer** (university students/researchers). It must work well for
teachers and students in **remote areas**: slow networks, low-end Android phones, shared
classroom projectors, mixed Vietnamese/English vocabulary. Every AI feature calls **Meta models**
through `backend/app/ai/client.py` only (Muse Spark 1.3 contributor/standard, Muse Wonder,
SAM 3.1, Muse Image, Muse Voice Transcribe).

## Design direction (all UI)
- Friendly, calm, professional *learning notebook*: warm paper background, white cards, teal
  primary (School2Lab), indigo (Paper2Explorer), coral (sport), sunflower highlight. Tokens in
  `frontend/src/styles/tokens.css`; components in `components.css`/`layout.css`. Reuse the
  classes (`card`, `btn btn-primary`, `badge`, `prov prov-document`, `alert alert-info`, `stack`,
  `row`, `grid-auto`, `table`, `tabs`, `stepper`…) and the React kit `src/components/ui`.
  Add feature-specific CSS in a `*.css` file **next to your feature** (imported by your component),
  using the tokens; never hard-code new brand colours.
- Plain, encouraging language for 11–18 year-olds and teachers who are not technical. Short
  sentences, concrete verbs, no jargon without a gloss. Vietnamese copy must read naturally
  (not a literal translation of English) and use correct diacritics.
- Mobile first: works at 320–375 px; touch targets ≥ 44 px; no horizontal page scroll (only
  inside canvases/tables); large readable numbers in simulations; keyboard operable everything
  (drag-and-drop always has a keyboard alternative); visible focus; `prefers-reduced-motion`
  respected (animations pause/skip); colour never the only signal.
- Honest states: loading skeletons, empty states with a next action, inline errors that say how
  to fix, "AI-generated — needs review" labels, provenance badges (document/user/assumption/
  unknown), "location could not be determined" instead of fake citations, "simulation under the
  stated assumptions — not a measurement" notes, privacy notes for contributor mode.
- Low bandwidth: no external fonts/CDNs; code-split heavy features; compress images on the
  client before upload (`src/lib/image.js`); avoid autoplaying video; lazy-load media.

## Frontend conventions (React 19 + Vite 8, JavaScript `.jsx`)
- Routes are fixed in `src/app/routes.jsx` (do not edit). Each page file you own must
  `export default` the page component.
- i18n: `const { t, lang, fmt, tr, bilingual } = useT()` from `src/i18n/index.jsx`.
  **Every user-visible string** goes through `t('<namespace>.<key>')`. Write each key in BOTH
  `src/i18n/locales/vi/<ns>.js` and `.../en/<ns>.js` (only in namespaces you own). Use
  `fmt.number()` for numbers (Vietnamese decimal comma), `fmt.date/relative/bytes/duration`.
  Run `npm run check:i18n` — it fails on missing/extra keys or unknown literal keys.
- API: `import { get, post, patch, del, upload, stream, ApiError } from 'src/lib/api.js'`.
  CSRF is automatic. Show errors with `<ErrorMessage error={err} onRetry={…} />` or
  `useErrorText()`; add new error codes to `errors.js` (vi + en) — coordinate by only adding,
  never renaming.
- Auth: `useAuth()` → `{ user, ai, ready, login, register, logout, refresh, updateProfile, isAdmin }`.
  `ai.configured` false ⇒ AI buttons explain that AI is not configured (don't hide features silently).
- Studio: pages under `/app/labs/:labId/*` live inside `LabStudioLayout` → use `useLab()`
  (`lab, saveState, updateSpec, updateBlock, addBlock, removeBlock, moveBlock, updateAnalysis,
  updateFields, flush, saveNow, replaceLab, reload, sourceById, assetById`) and `useStudio()`
  (`openSource(ref)`). **Call `await flush()` before any AI call** that reads the lab on the
  server, then `replaceLab(response.lab)` when the endpoint returns the updated lab.
- Blocks: each block component `export default function XBlock({ block, mode, onChange })`.
  `mode === 'edit'` → editor UI (call `onChange(nextBlock)` with an immutable copy);
  `mode === 'view'` → learner UI wrapped in `<BlockFrame block={block}>`. Read the environment
  with `useBlockEnv()` (`aiPath(name)`, `openSource`, `ask`, `reportState`, `sources`, `assets`,
  `sourceById`, `assetById`, `labId`, `shareCode`, `language`, `level`, `aiAvailable`, `glossary`).
  Call `env.reportState(block.id, {...})` with the live interactive state (params, outputs,
  current step, selected part) so the AI tutor answers "why did the graph change?" correctly.
  Show `<SourceRefChips refs=… />` for citations. AI-generated & unconfirmed content shows
  `<AIBadge/>` in edit mode and the teacher can toggle `confirmed`.
- Shared libs you may use: `src/lib/expr.js` (safe expressions), `src/lib/sam.js` (SAM masks),
  `src/features/lab/specUtils.js` (`newId`, `blankBlock`, `paramValues`, `refLabel`),
  `src/components/ui` (Button, IconButton, LinkButton, TextField, TextArea, SelectField,
  Checkbox, Switch, SliderField, Segmented, Alert, Spinner, LoadingBlock, EmptyState,
  ErrorMessage, ProgressBar, Dialog, ConfirmDialog, Drawer, Tabs/TabPanel/TabsWithPanels,
  Badge, ProvenanceBadge, LocatedBadge, SubjectBadge, StatusBadge, SpaceBadge, AIBadge,
  useToast, MathTex, RichText).
- Icons: `lucide-react` (all names verified to exist: FlaskConical, BookOpen, FileText, Image,
  Video, Mic, Upload, Camera, Sparkles, WandSparkles, Play, Pause, RotateCcw, ChevronLeft/Right/Down,
  Check, CircleCheck, X, Plus, Trash2, Pencil, Eye, EyeOff, Share2, QrCode, Globe, Languages,
  User, Users, Settings, GraduationCap, Atom, Calculator, Leaf, Dna, Earth, Recycle, Cpu, Code2,
  Trophy, Dumbbell, Volleyball, Activity, ChartLine, Network, Workflow, ListOrdered, CircleHelp,
  Lightbulb, TriangleAlert, Info, Lock, Search, Filter, Copy, ExternalLink, Send, MessageCircle,
  Bot, Layers, Target, Ruler, Timer, Gauge, SlidersHorizontal, ScanSearch, Crosshair,
  MousePointer2, MoveRight, ArrowRight, ArrowLeft, Undo2, Redo2, Save, Download, History,
  ShieldCheck, School, Library, Microscope, Sigma, Brain, Zap, Star, Clock, Menu, Maximize2,
  ZoomIn, ZoomOut, SkipBack, SkipForward, StepBack, StepForward, Rewind, FastForward, Shuffle,
  GripVertical, Move, Hand, PenLine, Eraser, Square, Circle, Type, Puzzle, Scissors, Tag,
  Bookmark, Link, LoaderCircle, RefreshCw, House, Footprints, Goal, CircleDot).
- No new npm dependencies (everything needed is installed: react, react-router-dom, katex,
  lucide-react, qrcode, @meta-sam/parser, @fontsource/be-vietnam-pro; dev: vitest, jsdom,
  @testing-library/react).
- Never use `dangerouslySetInnerHTML` (except KaTeX inside `MathTex`), `eval`, `new Function`
  or `innerHTML` with data. AI widgets only run in the sandboxed render route iframe.
- Tests: Vitest files `src/**/*.test.js(x)` for pure logic (expressions, simulations, scoring,
  geometry). `npx vitest run` must pass. `npx vite build` must pass.
- Do NOT start dev servers on ports 5173/8000 during the build phase (integration happens later).

## Backend conventions (FastAPI 0.162, SQLAlchemy 2.1, Pydantic 2, Python 3.12)
- Python: `backend/.venv/Scripts/python.exe` (Windows). Run tests: `cd backend && .venv/Scripts/python.exe -m pytest`.
  Live AI tests: `RUN_LIVE_AI=1` (key already in `backend/.env` — never print or log it).
- Routers in `app/api/<module>.py` export `router` (already included by `app/main.py`; don't edit
  main.py). Business rules/permissions in `app/services/*`. DTOs in `app/schemas/api.py` (you
  may append new DTOs at the end of the file in a clearly marked section for your package; do
  not change existing ones). Errors: `raise AppError(code, status, message, fields?, extra?)`.
- Permissions: always via `services/labs.py` helpers (`get_lab_for_owner`, `get_published_lab`,
  `get_source_for_owner`, `get_shared_source`, `get_shared_asset`). Hide others' resources as 404.
  Use `Depends(require_user)` / `Depends(get_actor)` / `Depends(require_admin)` from `app/security.py`.
- Never trust client ids/roles/owner/scores; validate sizes/types from bytes (`storage.sniff_kind`).
- Media helpers: `app/services/media.py` (images, PDFs, video, audio) — already implemented & tested.
- DB models are fixed (`app/models.py`); no schema changes in this phase. Use JSON columns
  (`meta_json`, `analysis_json`, `spec_json`) for extra data.
- Tests use the fixtures in `tests/conftest.py` (`client`, `teacher`, `other_user`, `make_client`,
  `create_lab`, `register`, `make_admin`) and sample files in `tests/fixtures/`.

## Work packages and file ownership
Only create/modify files you own. Read anything. If you need a change elsewhere, note it in
your final report instead of editing.

| Package | Owns |
|---|---|
| **BE-CORE** | `app/api/sources.py`, `app/api/share.py`, `app/api/admin.py`, `app/services/sources.py`, `app/services/share.py`, `app/services/admin.py`, `app/services/validation.py` (replace stub), `app/services/simulations.py`, `shared/sim_cases.json`, `tests/test_sources.py`, `tests/test_share.py`, `tests/test_admin.py`, `tests/test_validation.py`, `tests/test_simulations.py` |
| **BE-AI** | `app/api/ai.py`, `app/api/chat.py`, `app/ai/prompts.py`, `app/ai/outputs.py` (AI-facing structured-output models), `app/services/analysis.py`, `app/services/generation.py`, `app/services/paper.py`, `app/services/quiz_gen.py`, `app/services/video_ai.py`, `app/services/segmentation.py`, `app/services/widgets.py`, `app/services/translate.py`, `app/services/tutor.py`, `app/services/learning.py`, `tests/test_ai_offline.py`, `tests/test_ai_live.py`, `tests/test_widgets.py` |
| **FE-PAGES** | `features/public/*`, `features/auth/LoginPage.jsx`, `features/auth/RegisterPage.jsx`, `features/labs/*`, `features/account/*`, `features/admin/*`, i18n: `home, auth, gallery, guide, join, labs, account, admin` |
| **FE-STUDIO** | `features/studio/SourcesStep.jsx`, `AnalyzeStep.jsx`, `ReviewStep.jsx`, `BuildStep.jsx` (+ helper components under `features/studio/`), `features/sources/*` (except `SourceRefChips.jsx`), `features/sam/*`, `src/lib/image.js`, i18n: `sources, analyze, review, build, sam` |
| **FE-INTERACTIVE** | `features/blocks/graph/*`, `features/blocks/simulation/*`, `features/blocks/algorithm/*`, `features/sim/*`, `src/components/charts/*`, i18n: `graph, sim, algorithm` |
| **FE-LESSON** | `features/blocks/steps/*`, `features/blocks/flow/*`, `features/blocks/diagram/*`, `features/blocks/quiz/*`, i18n: `steps, flow, diagram, quiz` |
| **FE-SPORT** | `features/blocks/video/*`, `features/blocks/field/*`, i18n: `video, field` |
| **FE-PAPER** | `features/paper/*`, `features/blocks/widget/*`, i18n: `paper, widget` |
| **FE-EXPLORER** | `features/explorer/*`, `features/tutor/*`, `features/studio/PreviewStep.jsx`, `PublishStep.jsx`, `ResultsStep.jsx`, `src/lib/audio.js`, i18n: `explorer, tutor, publish, results` |

Foundation (owned by the lead — read, don't edit): `app/main.py, config.py, db.py, models.py,
errors.py, security.py, storage.py, cli.py, ai/client.py, ai/sam.py, services/labs.py,
services/expr.py, services/media.py, schemas/spec.py, schemas/analysis.py, api/auth.py,
api/labs.py, api/health.py`, frontend `src/app/*, src/main.jsx, src/styles/*, src/i18n/index.jsx,
src/i18n/locales/*/{common,errors,nav,studio,blocks,text,index}.js, src/lib/{api,expr,sam}.js,
src/components/ui/*, src/components/layout/*, src/features/auth/AuthContext.jsx,
src/features/lab/*, src/features/blocks/{BlockEnv,BlockRenderer,registry}.js(x),
src/features/blocks/text/*, src/features/sources/SourceRefChips.jsx, src/features/studio/LabStudioLayout.jsx`.
Exception: anyone may **append** new error codes to `errors.js` (vi + en) — append only.

## Definition of done (each package)
1. Every capability in your section below works end-to-end against the real API contract.
2. Backend: `pytest` passes (offline); live tests pass with `RUN_LIVE_AI=1` where relevant.
3. Frontend: `npx vite build` passes, `npx vitest run` passes, `npm run check:i18n` passes.
4. All states designed (loading/empty/error/success/disabled), keyboard + 375 px usable.
5. Final report: what was built, files, tests run with results, known gaps (be honest).
