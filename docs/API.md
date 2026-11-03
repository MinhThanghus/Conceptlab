# ConceptLab AI — API contract

Base path `/api`. JSON in/out (UTF-8). DTOs live in `backend/app/schemas/api.py`
(names in **bold** below). Errors: `{"error": {"code", "message", "fields"?, ...extra}}` with
stable codes (frontend translates them in `src/i18n/locales/*/errors.js` — **add every new
code to both files**).

Auth: HttpOnly session cookie `cl_session`. Every POST/PUT/PATCH/DELETE sent with a session
cookie must carry `X-CSRF-Token` (value from `GET /api/auth/me` → `csrf_token`); enforced
globally by `CSRFMiddleware`. Anonymous learners get an opaque `cl_viewer` cookie (no identity)
via `security.ensure_viewer_cookie()` — used only for rate limits and grouping quiz/chat.

Permission helpers (backend/app/services/labs.py): `get_lab_for_owner` (owner or admin, else 404),
`get_published_lab(code)`, `get_source_for_owner`, `get_shared_source(code, sid)`,
`get_shared_asset(code, aid)`. Serializers: `lab_out`, `lab_summary`, `shared_lab_out`,
`source_out(src, share_code=None)`, `asset_out(asset, share_code=None)`.
Rate limit AI: `security.ai_rate_limit(actor)`.

Legend: 🔒 signed-in owner/admin · 🌐 public · 👩‍🏫 owner of the lab · 🛡 admin.

## Health & auth (implemented)
| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/health` | → `{status, database, ai_configured}` |
| GET | `/api/auth/me` | → **MeOut** `{user, csrf_token, ai:{configured, default_mode, image_enabled, deep_enabled, models}}` |
| POST | `/api/auth/register` | **RegisterIn** `{email, password(8+), name, role: teacher\|student\|researcher, locale, school?}` → **MeOut** (201) |
| POST | `/api/auth/login` | **LoginIn** → **MeOut**; errors `invalid_credentials` (401), `rate_limited` (429) |
| POST | `/api/auth/logout` | → 204 |
| PATCH | `/api/auth/me` 🔒 | **ProfileUpdate** `{name?, locale?, school?}` → **MeOut** |
| POST | `/api/auth/password` 🔒 | **PasswordChange** → **MeOut** (other sessions revoked) |
| DELETE | `/api/auth/me` 🔒 | **DeleteAccountIn** `{password}` → 204 (deletes labs + files) |

## Labs (implemented)
| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/labs?status&space&q&page&page_size` 🔒 | → **LabList** (own labs) |
| POST | `/api/labs` 🔒 | **LabCreate** → **LabOut** (201) |
| GET | `/api/labs/{id}` 👩‍🏫 | → **LabOut** (spec, analysis, sources, assets, version, has_unpublished_changes) |
| PATCH | `/api/labs/{id}` 👩‍🏫 | **LabUpdate** `{version (required), title?, …, spec?, analysis?, note?}` → **LabOut**; `version_conflict` 409, `invalid_spec`/`invalid_analysis` 422 |
| DELETE | `/api/labs/{id}` 👩‍🏫 | → 204 (files removed) |
| POST | `/api/labs/{id}/duplicate` 👩‍🏫 | → **LabOut** |
| GET | `/api/labs/{id}/versions` 👩‍🏫 | → **VersionOut[]** |
| POST | `/api/labs/{id}/versions/{v}/restore` 👩‍🏫 | → **LabOut** |
| POST | `/api/labs/{id}/validate` 👩‍🏫 | → **ValidationReport** `{ok, checked_at, checks:[{code,status,block_id,message,detail}]}` |
| POST | `/api/labs/{id}/publish` 👩‍🏫 | **PublishIn** `{visibility: link\|public, allow_tutor}` → **PublishOut** `{share_code, share_url, lab, report}`; `validation_failed` 422 (extra.report), `consent_required`, `nothing_to_publish` |
| POST | `/api/labs/{id}/unpublish` 👩‍🏫 | → **LabOut** |

Publishing snapshots `published_spec_json = {spec: public_spec(spec), title, source_ids, asset_ids}`:
unapproved quiz questions, unvalidated/unapproved widgets and unconfirmed AI video markers are
removed. Learners only ever see this snapshot.

## Sources & assets (backend-core implements)
| Method | Path | Body → Response |
|---|---|---|
| POST | `/api/labs/{id}/sources` 👩‍🏫 | multipart: `file`, `title?`, `contains_people` (bool), `consent_confirmed` (bool) → **SourceOut** (201). Type sniffed from bytes: PDF, JPEG/PNG/WebP/HEIC(→reject or convert), MP4/MOV/WebM. Images: EXIF-transposed, metadata stripped (GPS!), max 2400 px, stored as JPEG/PNG. PDFs: page_count, toc. Videos: status `processing` → background transcode to H.264 MP4 (≤720p) + poster + AI proxy (≤480p, ≤20 MB) via `imageio_ffmpeg`; duration/fps/size. Limits from settings; `too_many_sources`, `file_too_large`, `unsupported_file`, `video_too_long`. |
| POST | `/api/labs/{id}/sources/data` 👩‍🏫 | **DataSourceIn** `{title, values:[{symbol,name,value,unit}], note?}` → **SourceOut** (kind `data`; values are provenance "user") |
| POST | `/api/labs/{id}/sources/note` 👩‍🏫 | **NoteSourceIn** `{title, text}` → **SourceOut** |
| PATCH | `/api/sources/{sid}` 👩‍🏫 | **SourceUpdate** → **SourceOut** |
| DELETE | `/api/sources/{sid}` 👩‍🏫 | → 204 (file + derived files deleted) |
| GET | `/api/sources/{sid}` 👩‍🏫 | → **SourceOut** (poll while `processing`) |
| GET | `/api/sources/{sid}/file` 👩‍🏫 | original (pdf/image) or web MP4 (video), Range supported |
| GET | `/api/sources/{sid}/poster` 👩‍🏫 | video poster JPEG |
| GET | `/api/sources/{sid}/pages/{n}.png?scale=1.5` 👩‍🏫 | PDF page render (cached on disk; scale 0.5–3) |
| GET | `/api/sources/{sid}/text?page=n` 👩‍🏫 | `{page, width, height, words:[[x0,y0,x1,y1,text]] normalized, text}` |
| POST | `/api/sources/{sid}/locate` 👩‍🏫 | `{quote, page?}` → `{located: exact\|none, page, rects:[[x0,y0,x1,y1]] normalized}` |
| POST | `/api/labs/{id}/assets` 👩‍🏫 | multipart `file` (PNG/JPEG/WebP ≤ 10 MB), `kind` (cutout\|frame\|page), `source_id?`, `meta?` (JSON string) → **AssetOut** |
| GET | `/api/assets/{aid}/file` 👩‍🏫 | asset bytes |
| DELETE | `/api/assets/{aid}` 👩‍🏫 | → 204 |

Share-scoped read-only twins (🌐, only for published labs and ids in the snapshot):
`GET /api/share/{code}/sources/{sid}/file`, `/poster`, `/pages/{n}.png`, `/text?page=n`,
`GET /api/share/{code}/assets/{aid}/file`.

## Sharing, learners, results (backend-core implements)
| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/public/labs?space&subject&grade&q&page&page_size` 🌐 | → `{items: LabSummary[], total, page, page_size}` — published + visibility `public` only |
| GET | `/api/public/featured` 🌐 | → `LabSummary[]` demo labs (is_demo, published, public) |
| GET | `/api/share/{code}` 🌐 | → **SharedLabOut** (sets `cl_viewer` cookie), the learner copy: quiz questions carry no `answer_index`, `answer_order`, `answer_value`, `tolerance`, `explanation` or `option_feedback` (in every language, `?lang` included), and `order` items come in a fixed permutation that is never the solved order (docs/LAB_SPEC.md, Quiz questions). Unknown/unpublished → 404 |
| POST | `/api/share/{code}/translate` 🌐 | `{target: "en" \| "vi"}` → translated **SharedLabOut**, read from the published snapshot only. English TPEND6 uses its reviewed translation when unchanged; other translations use AI Standard mode. Original source files and quotations remain unchanged. Quiz answers, explanations and option feedback are withheld (the same learner copy as the GET). |
| POST | `/api/share/{code}/quiz-attempts` 🌐 | **QuizAttemptIn** → **QuizAttemptOut** (201; scored on the server against the published snapshot; rate-limited). Answers use the option order learners were shown (an `order` answer lists indices into the shown options). Each result: `{question_id, correct, correct_answer (in the shown order), explanation, option_feedback (mcq one per option, truefalse two, else []), tolerance (numeric, relative)}` |
| POST | `/api/share/{code}/feedback` 🌐 | **FeedbackIn** → **FeedbackOut** (201) |
| POST | `/api/share/{code}/clone` 🔒 | → **LabOut** (copy of the published snapshot into the caller's labs) |

For a translated lesson, append `?lang=en` or `?lang=vi` to its quiz submission and
shared explain-change/prediction-feedback requests. Explanations and option feedback then use the translated
snapshot. Translations are cached in memory by published content; if a machine translation
is no longer cached after a restart or eviction, the request returns `translation_unavailable`
before saving the attempt. Request the translation again and retry. Translations and their
AI output require review; source quotations and files always remain in the original language.
| GET | `/api/labs/{id}/results` 👩‍🏫 | → **ResultsOut** (aggregates only — never ranks students) |
| GET | `/api/labs/{id}/widgets/{block_id}/render` 👩‍🏫 | widget HTML with sandbox CSP (see Widgets) |
| GET | `/api/share/{code}/widgets/{block_id}/render` 🌐 | approved+validated widget from the snapshot only |

## AI (backend-AI implements; all go through `app/ai/client.py`)
Model choice: lab `ai_mode` → `contributor` (muse-spark-1.3-contributor) or `standard`
(muse-spark-1.3); `deep: true` → muse-wonder-1.0. SAM → sam-3.1, image → muse-image-1.0,
speech → muse-voice-transcribe-1.0. Every endpoint: `ai_rate_limit(actor)`, flushes nothing
client-side (the client saves first), returns translated-code errors (`ai_*`).

| Method | Path | Body → Response |
|---|---|---|
| POST | `/api/labs/{id}/ai/analyze` 👩‍🏫 | **AnalyzeIn** `{source_ids, pages?, focus?, deep?}` → **AnalyzeOut** `{analysis, lab}` — topic, objects (+ English `sam_phrase`), formulas (LaTeX + safe `expression`), variables (unit, value, provenance, source_ref), steps, sequence_clear, relations, suggested_blocks, missing_info, assumptions, warnings. Citations resolved: PDF quote search → `exact`; model box → `approximate`; else `none`. Saved to `lab.analysis_json`. |
| POST | `/api/labs/{id}/ai/paper-structure` 👩‍🏫 | **PaperStructureIn** → **AnalyzeOut** (analysis.paper = **PaperStructure**: sections, equations, figures, tables, methods, candidates) |
| POST | `/api/labs/{id}/ai/explore-equation` 👩‍🏫 | **ExploreEquationIn** → **ExploreEquationOut** `{equation, block?, notes}` — block is a ready graph/simulation/algorithm block when feasible; otherwise notes explain what is missing and suggest a diagram |
| POST | `/api/labs/{id}/ai/generate` 👩‍🏫 | **GenerateIn** `{block_types?, replace?, formula_ids?}` → **GenerateOut** `{lab, generated_block_ids, generated_formula_ids, warnings}` — builds blocks from the reviewed analysis. When `graph` is selected, pass up to 8 distinct, confirmed formula IDs with computable expressions to request one graph for each; omitted `formula_ids` preserves the single-graph behavior. Partial failures are reported in warnings and `generated_formula_ids` lists only those actually saved. Results use the confirmed expression and its source references; parameters/ranges without evidence are assumptions. Blocks require review (`ai_generated: true, confirmed: false`); parsing does not validate scientific conditions or units. |
| POST | `/api/labs/{id}/ai/quiz` 👩‍🏫 | **QuizGenIn** `{count 1-10, kinds, block_ids?}` → **QuizGenOut** `{questions (approved: false, with context, hint, cognitive_level, option_feedback when the AI gives them), title, intro}`; `title`/`intro` are suggestions for the set and may be empty |
| POST | `/api/labs/{id}/ai/video-markers` 👩‍🏫 | **VideoMarkersIn** → **VideoMarkersOut** (markers `ai_suggested: true, confirmed: false`; limits mention occlusion/visibility; never grades technique) |
| POST | `/api/labs/{id}/ai/diagram` 👩‍🏫 | **DiagramIn** → **DiagramOut** (Muse proposes parts + boxes; SAM 3.1 box prompts refine them; the server returns raw SAM `masks` keyed by hotspot id and leaves `mask_path` empty — the browser decodes the masks with `@meta-sam/parser` and stores `mask_path` in 0..1000 units) |
| POST | `/api/labs/{id}/ai/segment` 👩‍🏫 | **SegmentIn** (phrase \| points \| box; image source, PDF page, or image asset) → **SegmentOut** `{width, height, phrase_used, objects:[{id, box, mask, confidence}]}`; non-English phrases are translated to a short English noun phrase first; when that phrase matches nothing, Muse looks at the picture and proposes up to 3 concrete phrases that are tried in order (`phrase_used` reports the one that matched) |
| POST | `/api/labs/{id}/ai/segment-frame` 👩‍🏫 | multipart `file` (captured video frame PNG/JPEG) + `phrase?` + `points?` (JSON) → **SegmentOut** |
| POST | `/api/labs/{id}/ai/track` 👩‍🏫 | **TrackIn** `{source_id, phrase}` → **TrackOut** (SAM video tracking on the AI proxy; boxes normalized per frame with `t` seconds) |
| POST | `/api/labs/{id}/ai/widget` 👩‍🏫 | **WidgetIn** → **WidgetOut** (single self-contained HTML; static safety checks) |
| POST | `/api/labs/{id}/ai/widget/repair` 👩‍🏫 | **WidgetRepairIn** → **WidgetOut** |
| POST | `/api/labs/{id}/ai/translate` 👩‍🏫 | **TranslateIn** → **TranslateOut** (translated copy of the spec text + glossary vi/en; teacher reviews before applying) |
| POST | `/api/labs/{id}/ai/cover` 👩‍🏫 | **CoverIn** `{prompt?, style?}` → **AssetOut** (Muse Image, kind `cover`, `ai_generated: true`; sets lab.cover_asset_id). `prompt` (≤ 600) is the teacher's idea, used verbatim; `style` is `auto` (default: chosen from the subject) or a medium: `clay`, `papercut`, `riso`, `specimen`, `cyanotype` (anything else → 422). The prompt (`ai/cover_prompt.py`) adds the lesson's facts (a known model's scene, else the analysed objects or the paper's facts, glossary terms) to one house style; the picture is wordless, shows no people and is stored as a 1280x853 JPEG. `meta`: `{model, style (the resolved medium), prompt_version: 2, prompt}`. On a shared lab the new cover counts as a change (`has_unpublished_changes`): learners see it after the next publish. |
| POST | `/api/labs/{id}/ai/field-scenario` 👩‍🏫 | **FieldScenarioIn** → **FieldScenarioOut** |
| POST | `/api/labs/{id}/ai/explain-change` 👩‍🏫 · `/api/share/{code}/ai/explain-change` 🌐 | **ExplainChangeIn** → **ExplainOut** |
| POST | `/api/labs/{id}/ai/prediction-feedback` 👩‍🏫 · `/api/share/{code}/ai/prediction-feedback` 🌐 | **PredictionFeedbackIn** → **PredictionFeedbackOut** |
| POST | `/api/ai/transcribe` 🌐 (rate-limited) | multipart `audio` (WAV PCM16 mono 16/24 kHz preferred; other formats converted with ffmpeg; at most 10 minutes, else 413 `file_too_large`), `lang?` (vi\|en), `keywords?`, `code?` (share code: required without a session, the lesson must be published with its tutor allowed; 401 without a code, 404 unknown code, 403 `tutor_disabled`) → **TranscribeOut** |

### Chat (AI tutor) — Server-Sent Events
| Method | Path | Body → Response |
|---|---|---|
| POST | `/api/labs/{id}/chat` 👩‍🏫 | **ChatIn** `{message, context?:{block_id, item_id, selection, state, source_ref}}` → `text/event-stream` |
| POST | `/api/share/{code}/chat` 🌐 | same; 403 `tutor_disabled` when `allow_tutor` is false; anonymous rate limit |
| GET | `/api/labs/{id}/chat` 👩‍🏫 · `/api/share/{code}/chat` 🌐 | → **ChatMessageOut[]** (caller's own history) |

Events: `event: delta` `data: {"text": "..."}` (repeated) → `event: done` `data: ChatMessageOut`
(with `citations: [{n, source_id, title, page, bbox, time, quote, located}]`) or
`event: error` `data: {"code", "message"}`. The answer cites `[n]` markers that map to citations;
content beyond the sources is labelled as such.

## Admin 🛡 (backend-core implements)
| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/admin/stats` | → **AdminStatsOut** (real aggregates) |
| GET | `/api/admin/users?q&role&page&page_size` | → **AdminUserList** |
| PATCH | `/api/admin/users/{uid}` | **AdminUserUpdate** `{role?, is_active?}` → **AdminUserOut** (deactivation revokes sessions; cannot demote/deactivate the last admin or yourself; audited) |
| GET | `/api/admin/labs?status&space&q&page&page_size` | → **LabList** (all owners) |
| POST | `/api/admin/labs/{id}/unpublish` | → **LabSummary** (moderation; audited) |
| GET | `/api/admin/ai-calls?feature&status&page&page_size` | → **AICallList** |
| GET | `/api/admin/feedback?page&page_size` | → `{items:[{id, lab_id, lab_title, rating, comment, created_at}], total, page, page_size}` |

## Widgets (AI-generated interfaces, spec §9.5)
Generated HTML is stored in a `widget` block. It is never inserted into the app DOM. It is
served by the render routes with headers:
`Content-Security-Policy: sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; frame-ancestors 'self'`
and loaded in `<iframe sandbox="allow-scripts">` (opaque origin, no network, no cookies, no API
key). A harness script injected at the top posts `{type:'cl-widget', status:'ready'|'error', errors}`
to the parent so the editor can validate it before the teacher approves it.

## Operational notes
- All timestamps are ISO 8601 UTC with an offset (`…+00:00`).
- Registration is rate-limited per IP (`REGISTRATIONS_PER_HOUR`, default 10 — raise it for whole-class sign-up sessions behind one school IP); login per IP and per account (`LOGIN_ATTEMPTS_PER_15MIN`); AI per user/anonymous viewer (`USER_AI_REQUESTS_PER_HOUR`, `ANON_AI_REQUESTS_PER_HOUR`).
- Interactive API docs: `/api/docs` (disabled when `APP_ENV=production`).
