# Muse review: ConceptLab AI (Task A)

Review date: 2026-10-28. Reviewer scope: frontend plus read-only backend inspection.
Backend files were not edited (a parallel reviewer owns the backend). No live AI calls,
no screenshots, and no backend test run were performed by this reviewer. Claims below
cite files actually opened. Where a behaviour was not executed, this file says so.

## Verdict

The product is a coherent, bilingual, source-cited learning platform that faithfully
implements the studio to published-lab flow in [specduan.txt](/E:/ConceptLab/specduan.txt).
The strongest properties are: published-snapshot filtering, provenance and citation
honesty, server-side quiz scoring, and code splitting that keeps heavy chunks out of
the entry bundle. The main gaps for remote classrooms are bundle size of the language
and KaTeX chunks, dependence on JavaScript for every learner action, and no offline
reading in the main UI (Lite addresses reading only). No critical or high frontend
defect was found that this reviewer changed; Lite was added as an isolated variant.

## Method and evidence

Files read in full or in relevant part: [docs/MUSE_HANDOFF.md](/E:/ConceptLab/docs/MUSE_HANDOFF.md),
[specduan.txt](/E:/ConceptLab/specduan.txt), [README.md](/E:/ConceptLab/README.md),
[DESIGN.md](/E:/ConceptLab/DESIGN.md), [docs/BUILD_PLAN.md](/E:/ConceptLab/docs/BUILD_PLAN.md),
[docs/LAB_SPEC.md](/E:/ConceptLab/docs/LAB_SPEC.md), [docs/API.md](/E:/ConceptLab/docs/API.md),
[frontend/src/app/routes.jsx](/E:/ConceptLab/frontend/src/app/routes.jsx:52),
[frontend/src/lib/api.js](/E:/ConceptLab/frontend/src/lib/api.js:55),
[frontend/src/i18n/index.jsx](/E:/ConceptLab/frontend/src/i18n/index.jsx:63),
[frontend/src/features/explorer/SharedLabPage.jsx](/E:/ConceptLab/frontend/src/features/explorer/SharedLabPage.jsx:74),
[frontend/src/features/explorer/Explorer.jsx](/E:/ConceptLab/frontend/src/features/explorer/Explorer.jsx:78),
[frontend/src/features/tutor/TutorPanel.jsx](/E:/ConceptLab/frontend/src/features/tutor/TutorPanel.jsx:126),
[frontend/src/components/layout/Layouts.jsx](/E:/ConceptLab/frontend/src/components/layout/Layouts.jsx:48),
[frontend/src/styles/tokens.css](/E:/ConceptLab/frontend/src/styles/tokens.css:7),
and backend files read only: `backend/app/security.py`, `backend/app/main.py`,
`backend/app/config.py`, `backend/app/services/labs.py`, `backend/app/api/share.py`.

Commands actually run by this reviewer (see the Lite section for the final numbers):
`npm test`, `npm run check:i18n`, and `npm run build` in `frontend/`.
Baseline before Lite: 50 test files, 574 tests passed; i18n reported 3884 keys in vi
and en; the production build succeeded. After Lite: 52 test files, 581 tests passed;
i18n reported 3975 keys in vi and en; the build succeeded with a 22.95 kB Lite chunk
(6.06 kB gzip). These numbers are from this session only.

## Architecture

Strengths:

- One share contract serves both the main learner view and Lite: `GET /api/share/{code}`
  returns the published snapshot only. The server filters it in
  `backend/app/services/labs.py` (`get_published_lab`, `get_shared_source`,
  `get_shared_asset` reject ids outside `published_spec_json`), and the client mirrors
  it in [frontend/src/features/explorer/publicSpec.js](/E:/ConceptLab/frontend/src/features/explorer/publicSpec.js:10)
  (`publicSpec` drops unapproved quiz questions, unvalidated widgets, and unconfirmed
  AI video markers). Learners never receive draft analysis by design.
- Code splitting is real: pages are `lazy()` in
  [frontend/src/app/routes.jsx](/E:/ConceptLab/frontend/src/app/routes.jsx:7), blocks are
  `lazy()` in [frontend/src/features/blocks/registry.js](/E:/ConceptLab/frontend/src/features/blocks/registry.js:22),
  KaTeX loads on first formula in
  [frontend/src/components/ui/RichText.jsx](/E:/ConceptLab/frontend/src/components/ui/RichText.jsx:6),
  and each language is a separate chunk loaded by `ensureDict` in
  [frontend/src/i18n/index.jsx](/E:/ConceptLab/frontend/src/i18n/index.jsx:33).
- The tutor is context-aware without leaking internals: `buildChatContext` in
  `frontend/src/features/tutor/chatUtils.js` bounds block ids, selections, and state
  depth before anything is sent over SSE.

Limits:

- The entry chunk still carries React, the router, KaTeX CSS, and the full UI kit.
  The build lists the main index chunk at about 371 kB (118 kB gzip) and each language
  chunk at about 197 to 233 kB (65 to 67 kB gzip). On 2G this is the dominant cost;
  Lite cannot remove it because Lite shares the same entry. See Performance below.
- There is no service worker in the main app, so a dropped connection mid-lesson
  loses the lab. Lite adds Cache Storage reading for its own route only.

## Security (read-only backend notes, no backend edits)

Positive evidence, cited so the backend reviewer can verify:

- Passwords use argon2id and session tokens are stored as SHA-256 hashes in
  `backend/app/security.py`; the session cookie is HttpOnly with `samesite=lax`.
- CSRF is enforced globally by `CSRFMiddleware`, plus an Origin allow-list; the
  frontend sends `X-CSRF-Token` automatically for unsafe methods in
  [frontend/src/lib/api.js](/E:/ConceptLab/frontend/src/lib/api.js:65).
- IDOR is hidden as 404: `get_lab_for_owner` and `get_source_for_owner` in
  `backend/app/services/labs.py` return "not found" for another owner, and share
  routes check snapshot membership before returning a file.
- AI widgets never enter the app DOM: they are served with a sandbox CSP and loaded
  in `<iframe sandbox="allow-scripts">` (contract in [docs/API.md](/E:/ConceptLab/docs/API.md:137)).
  Lite deliberately does not embed widget iframes; it links to the full view instead.
- Response headers in `backend/app/main.py` (`SecurityHeadersMiddleware`) set
  `nosniff`, a strict CSP for the app, and `no-store` for `/api/`.

Findings (frontend severity; backend items are observations for the backend reviewer):

| ID | Severity | Finding | Evidence | Recommendation |
|---|---|---|---|---|
| R1 | Medium | The anonymous viewer cookie groups quiz and chat by browser, not by learner. A shared classroom device therefore shares one rate-limit bucket and one chat history view. This is documented behaviour, but teachers should know it. | [docs/API.md](/E:/ConceptLab/docs/API.md:10), `backend/app/security.py` (`ensure_viewer_cookie`) | State it in the teacher guide; Lite repeats the same contract and shows the same note. |
| R2 | Low | `localStorage` holds only progress and preferences (`cl.progress.*`, `cl.lang`), never tokens. Good. Lite adds `cl.lite.*` cache metadata with the same rule. | [frontend/src/features/explorer/explorerUtils.js](/E:/ConceptLab/frontend/src/features/explorer/explorerUtils.js:42) | Keep the no-token rule; Lite tests assert no token keys are written. |
| R3 | Low | Upload sniffing and size limits live server-side (`storage.sniff_kind`); the client compresses images before upload in `frontend/src/lib/image.js`. No client-side trust issue was found. | [docs/BUILD_PLAN.md](/E:/ConceptLab/docs/BUILD_PLAN.md:102) | No change. Backend reviewer to confirm limits are enforced on bytes, not headers. |

No critical or high frontend security issue was found. In particular, learner text is
rendered through the safe markdown-lite renderer (no raw HTML injection), and the only
`dangerouslySetInnerHTML` path is KaTeX output with `trust: false`.

## Data and privacy (spec section 16)

- Labs are private until published, and only the snapshot is shared. This matches
  section 16's "private by default".
- Quiz results are aggregates only ("never ranks students") in
  [docs/API.md](/E:/ConceptLab/docs/API.md:83). The quiz UI shows the same honesty:
  the optional display name is capped and described as optional in
  [frontend/src/features/blocks/quiz/QuizBlock.jsx](/E:/ConceptLab/frontend/src/features/blocks/quiz/QuizBlock.jsx:300).
- Media of students needs consent before sharing, and such labs switch analysis to
  Standard mode. The consent gate is a publish-time server rule
  (`consent_required`); this reviewer did not execute it. Backend reviewer to verify.
- Lite stores a cached copy of a published lab on the learner device for offline
  reading. That copy contains only already-published content, but teachers should
  treat a shared device as able to re-open any lab opened on it. Lite shows when the
  copy was saved and offers no cached quiz submission or chat while offline.

## Accessibility

Strengths: a skip link and labelled landmarks in
[frontend/src/components/layout/Layouts.jsx](/E:/ConceptLab/frontend/src/components/layout/Layouts.jsx:81);
visible focus rings and 44 px targets from the token system; the Explorer moves focus
to the opened part after navigation and traps Tab inside the side panel on small
screens ([frontend/src/features/explorer/Explorer.jsx](/E:/ConceptLab/frontend/src/features/explorer/Explorer.jsx:176));
quiz and steps announce changes through `aria-live` regions; reduced motion stops
autoplay and smooth scrolling.

Gaps: the main learner view is still a three-column app screen on wide displays, which
is hard on a projector with glare. The existing projector toggle enlarges type by
125 percent in `explorer.css`, but body text remains the muted colour at about 6.3 to 1
on paper ([frontend/src/styles/tokens.css](/E:/ConceptLab/frontend/src/styles/tokens.css:5)),
below the 7 to 1 Lite target. Lite uses ink for body text and a larger projector scale
to close this for its own route only.

## Bilingual quality

Every visible string goes through `t()` with parity enforced by
`frontend/scripts/check-i18n.mjs`; the baseline check reported 3884 keys in vi and en.
Vietnamese copy reads naturally (for example `explorer.shared.notFoundBody` explains
the code alphabet instead of translating word for word). One risk: new namespaces must
be added to both `locales/vi/index.js` and `locales/en/index.js` or the checker fails;
Lite follows that rule with a `lite` namespace in both languages.

## Educational UX for remote classrooms

What works: class codes avoid look-alike characters (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`
in `backend/app/services/labs.py` and mirrored in
[frontend/src/features/public/classCode.js](/E:/ConceptLab/frontend/src/features/public/classCode.js:9));
progress is remembered per device; the tutor cites sources and labels uncited content;
provenance badges always pair icon with words
([frontend/src/components/ui/Badges.jsx](/E:/ConceptLab/frontend/src/components/ui/Badges.jsx:6)).

What is hard today: the full Explorer downloads the Explorer chunk (about 49 kB) plus
the opened block chunk, the side panel assumes a persistent connection for the tutor,
and video blocks assume streaming bandwidth. Lite's sequential single column, text-first
blocks, and offline reading target exactly this setting. Lite does not simplify the
science: formulas, parameters, and provenance are shown as text rather than hidden.

## Performance on slow networks (observed build output)

From this session's `npm run build` (before Lite): entry about 371 kB (118 kB gzip),
`three.core` about 377 kB (101 kB gzip) as a separate lazy chunk, KaTeX about 259 kB
(78 kB gzip) lazy, each language 65 to 67 kB gzip. Three.js is correctly kept out of
the entry path (it loads only where a 3D lab mounts, gated by
`frontend/src/lib/three/capability.js`). Lite adds one small lazy chunk and never
imports Three.js, charts, or KaTeX; the built Lite chunk is 22.95 kB (6.06 kB gzip),
verified from this session's build output and chunk imports. No network throttling test was
run; all performance statements here are bundle-size observations, not timings.

## Redesign against DESIGN.md and the Hallmark gates (by reading, no screenshots)

Compliant by inspection: tokens only (feature CSS references `--color-*` and `--cl-*`
aliases), one primary action per screen, 44 px targets, no card inside a card in the
learner view, torn bands limited to marketing surfaces, and copy rules (no eyebrows,
no tracked capitals) followed in the Explorer. This reviewer took no screenshots, so
pixel-level gates (grain over text, torn-edge rendering, 3D label sizes) are
unverified here. Lite follows the same tokens and is recorded as a Variants entry in
[DESIGN.md](/E:/ConceptLab/DESIGN.md) rather than overriding the system locally.

## Fidelity to specduan.txt (sections 1 to 17)

| Section | Status | Evidence |
|---|---|---|
| 1 Problem | Done | Problem framing is product copy on the home page; no code contract. |
| 2 Two spaces | Done | `space` on labs; gallery filters; subjects include PE. |
| 3 Common flow | Done | Studio steps sources, analyze, review, build, preview, publish in [frontend/src/app/routes.jsx](/E:/ConceptLab/frontend/src/app/routes.jsx:77). |
| 4 School2Lab inputs | Done | Sources accept PDF, image, video, measured data, and notes ([docs/API.md](/E:/ConceptLab/docs/API.md:53)). |
| 5 Lesson kinds | Done | All eleven block types in [frontend/src/features/blocks/registry.js](/E:/ConceptLab/frontend/src/features/blocks/registry.js:22); unconfirmed sequences warn instead of pretending (StepsBlock). |
| 6 Real objects | Done | SAM selection plus user-provided quantities labelled `user`; Lite shows the same provenance as text. |
| 7 Many subjects | Done | Subject taxonomy in `common.subjects`; simulations cover pendulum, projectile, spring, and compound interest. |
| 8 Physical education | Done | Video markers, field block with keyboard alternatives, no automatic grading (honest limit in the video block). |
| 9 Paper2Explorer | Done with limits | Paper structure, equation explorer, and attention walkthrough exist; a chart image is never claimed to restore original data (spec 9.4). |
| 10 Shared AI | Done | Tutor with context and citations, active learning, scenario compare, voice via `/api/ai/transcribe`, save and share. Lite reuses chat SSE and transcribe on its route. |
| 11 Provenance | Done | Four provenances everywhere; `located: none` is shown honestly, never faked. |
| 12 Meta models | Done | Single adapter `backend/app/ai/client.py`; models named in [README.md](/E:/ConceptLab/README.md:18). Live quality not judged here. |
| 13 Architecture | Done | Frontend, source processor, AI analysis, lab spec, renderer, simulation engine, sandbox, validation, and storage all exist as separate modules. |
| 14 Demos | Done as data | Nine published demo labs are seeded; their classroom effect was not measured by this reviewer. |
| 15 MVP scope | Done | PDF and image upload, short video for PE, page and region selection, editable AI extraction, step diagrams, tested models, sliders and graphs, SAM, field, source links, drafts. |
| 16 Learner data | Partial (by design) | Private by default and consent gating exist; deletion of learner data on shared devices depends on browser storage, which Lite now documents. |
| 17 Competition criteria | Not code | Impact claims need a pilot; no pilot evidence was reviewed. |

## Limitations of this review

Backend behaviour was read, not executed; live AI quality, citation truth, and model
latency belong to the Task B report and the backend reviewer. No browser screenshots
were taken, so visual gates are assessed from CSS and tokens only. Bundle sizes are
from one production build on this machine. The isolated servers on ports 8300 and 5300
were not needed for the frontend work and were not started; no user data was touched.
