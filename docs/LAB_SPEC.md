# Lab specification (`labs.spec_json`)

Source of truth: `backend/app/schemas/spec.py` (Pydantic). The frontend mirrors defaults in
`frontend/src/features/lab/specUtils.js` and renders blocks via `features/blocks/registry.js`.

```jsonc
{
  "schema_version": 1,
  "summary": "…", "objectives": ["…"],
  "glossary": [{ "id": "g1", "vi": "chu kỳ", "en": "period", "note": "" }],
  "assumptions": [{ "id": "a1", "text": "Bỏ qua lực cản không khí", "confirmed": true }],
  "blocks": [ /* Block, see below */ ]
}
```

## Shared shapes
- **SourceRef** `{source_id, page (1-based index in the file), page_label ("Trang 64"), bbox [x0,y0,x1,y1] normalized 0..1, time (s), quote, located: exact|approximate|none}` — never fake a location; `none` must be shown honestly.
- **Quantity** `{symbol, name, unit, value, min, max, step, role: input|output|constant, provenance: document|user|assumption|unknown, source_ref, confirmed}`.
- **ActiveLearning** `{enabled, question, param, from_value, to_value, observe, options[], correct_option, explanation}` — predict → change → run → compare → explain.
- Every block: `{id, type, title, description, source_refs[], confirmed, ai_generated}`.

## Block types
| type | key fields | learner experience |
|---|---|---|
| `steps` | `steps[{id,title,body,source_refs,highlight:SourceRef,check_question}]`, `sequence_confirmed`, `autoplay_seconds` | click/play through steps; highlighted source region per step; ask about a step; banner when order is AI-proposed and unconfirmed |
| `flow` | `layout: cycle\|linear`, `nodes[{id,label,description,source_refs}]`, `edges[{id,source,target,label,description}]` | animated process diagram; click nodes/arrows |
| `diagram` | `image{source_id,page,asset_id}`, `hotspots[{id,label,description_simple,description_detailed,bbox,mask_path,source_refs}]`, `relations[{id,source,target,label,description}]` | click parts; simple/detailed; hide labels to self-test |
| `graph` | `expression` (safe syntax, `services/expr.py` ≡ `lib/expr.js`), `x_var`, `x_min/x_max`, `y_min/y_max`, `params: Quantity[]`, `explanation`, `active` | sliders + numeric inputs, live plot, reset, compare A/B, explain change |
| `simulation` | `model: pendulum\|projectile\|compound_interest\|spring_mass`, `params: Quantity[]`, `object_asset_id` (SAM cut-out), `reference_cases[{inputs,output,expected,tolerance}]`, `active`, `notes` | run/pause/replay, live values, compare two scenarios, graph, "simulation result under stated assumptions — not a measurement from the photo" |
| `algorithm` | `algorithm: attention\|bubble_sort\|selection_sort\|insertion_sort\|binary_search`, `config` (attention: `{tokens[], Q[][], K[][], V[][]}`; sorts: `{array[]}`; search: `{array[], target}`) | step-by-step, heatmap for attention, edit inputs; "partial illustration on small data" |
| `video` | `source_id`, `markers[{id,t,label,note,confirmed,ai_suggested}]`, `compare{source_id,page}`, `tracks[{id,phrase,frames[{t,boxes[]}]}]`, `limits_note` | slow motion, frame step, markers, SAM highlight, side-by-side textbook/model video; no automatic grading |
| `field` | `sport`, `prompt`, `frames[{id,note,players[{id,team,label,x,y}],ball{x,y},arrows[{id,kind:run\|pass,x1,y1,x2,y2}]}]`, `solution_frames` | drag players/ball (pointer + keyboard), draw runs/passes, step frames, replay, compare with the teacher's solution |
| `quiz` | `questions[{id,kind:mcq\|truefalse\|order\|numeric,context,prompt,options,answer_index,answer_order,answer_value,tolerance,unit,hint,cognitive_level,option_feedback,explanation,source_refs,approved}]` | only `approved` questions reach learners, without answers (see below); scored on the server |
| `widget` | `prompt`, `html`, `status: draft\|validated\|failed`, `validation`, `approved` | sandboxed iframe via render route; shown only when validated + approved |
| `text` | `body` (markdown-lite + `$math$`) | teacher note |

## Quiz questions
- **Answer** per kind: `mcq` `answer_index` (0-based); `truefalse` `answer_index` (0 = true, 1 = false, options are the localised "Đúng/Sai" or "True/False"); `order` `answer_order` (the solved sequence as option indices; the editor stores the items solved with `[0, 1, …]`); `numeric` `answer_value` + relative `tolerance` (default 0.02, 0 for an exact zero) + `unit`.
- **Optional, all empty by default** (old lessons render unchanged): `context` (≤ 2000, a one or two sentence situation shown above the prompt: the lesson's own material first, else everyday life), `hint` (≤ 2000, one sentence pointing to the idea to use; never the answer), `cognitive_level` (`recall` Nhận biết, `understand` Thông hiểu, `apply` Vận dụng, `extend` Vận dụng cao, or null), `option_feedback` (≤ 8 notes of ≤ 400: `mcq` one per option in option order, `truefalse` exactly two for answering True then False, `order`/`numeric` none; used only when the counts line up).
- **AI questions** (`POST /api/labs/{id}/ai/quiz` and the quiz of a lesson build) arrive with `approved: false`. The model's answer index is found again by the correct option's text after blank and repeated options are removed (with their feedback); a hint that names the correct option, the final number, the solved sequence or a true/false verdict is dropped. A lesson build asks for `numeric` only when a formula is computable with valued inputs and for `order` only when the analysis states the sequence, and writes the quiz after the other blocks so questions can point at them.
- **Learner copy** (every learner response: `GET /api/share/{code}` in the lab's language and in translations, so also the Lite offline copy) keeps `id, kind, prompt, options, unit, context, hint, cognitive_level, source_refs` (+ `approved: true`) and never carries `answer_index, answer_order, answer_value, tolerance, explanation, option_feedback`. The items of an `order` question are shown in a fixed permutation derived from `sha256(lab_id + ":" + question_id)` that is never the solved order; learners answer with indices into the options as shown, and the marking maps them back. Marking results return `correct_answer` in that shown order plus `explanation`, `option_feedback` and (numeric) `tolerance`. The author's endpoints and the studio preview keep the full question.

## Expression syntax (graphs, formulas)
`+ - * / ^`, implicit multiplication (`2x`, `2(x+1)`, `2πr`), functions `sin cos tan asin acos atan
atan2 sinh cosh tanh sqrt cbrt exp ln log(x[,b]) log10 log2 abs floor ceil round sign min max pow hypot`,
constants `pi π e deg` (shadowed by variables), textbook forms `x² x³ √(…)`. Test vectors:
`shared/expr_cases.json`.
