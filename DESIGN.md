# Design: ConceptLab AI

The locked system. Every screen, every agent and every new page reads this first and shares it. Change it on purpose; the file is the rule. Built with the Hallmark design skill (`hallmark/skills/hallmark`, MIT) and the img2threejs method (`img2threejs`, procedural Three.js) as references.

## System
- Genre: playful (friendly, never childish: grades 6 to 12, teachers, university students)
- Shape of the first page: Split Studio (`/`); every signed-in screen is an app screen
- Theme: Hum, adapted (deal 3/3): grained cream paper, card stock you can press, blue-black ink, three inks that never blend
- Axes: light/geometric-sans/chromatic-yellow · posture: full-palette (pear, blue, coral, mint each hold one job)
- Face: Lexend (variable, self-hosted, Vietnamese subset) for display and body. Chillax, the theme's face, has no Vietnamese.

## Tokens
`frontend/src/styles/tokens.css` is the source of truth. The `--cl-*` names in feature styles are aliases of these roles.
```css
:root {
  --color-paper: oklch(97% 0.012 95);  --color-paper-2: oklch(94.5% 0.018 95);  --color-paper-3: oklch(91% 0.022 95);
  --color-card: oklch(98.8% 0.007 95);  --color-ink: oklch(20% 0.014 255);  --color-ink-2: oklch(29% 0.014 255);
  --color-muted: oklch(47% 0.014 255);  --color-rule: oklch(87% 0.016 95);  --color-control: oklch(55% 0.014 255);
  --color-accent: oklch(87% 0.175 96);   /* pear: the primary action, the one pear field */
  --color-accent-ink: oklch(20% 0.014 255);
  --color-accent-2: oklch(50% 0.17 250); /* blue: links, focus, what a source says */
  --color-accent-3: oklch(70% 0.2 22);   /* coral: one loud moment a screen (the pendulum bob) */
  --color-mint: oklch(82% 0.15 152);     /* mint: growth, progress, a right answer */
  --color-focus: oklch(50% 0.17 250);
  --font-display: 'Lexend Variable', 'Lexend', ui-rounded, sans-serif;  --font-body: var(--font-display);
  --radius-card: 24px;  --radius-stock: 14px;  --radius-input: 12px;  --radius-pill: 999px;  --rule-hair: 1px;
  --shadow-card: 0 1px 2px oklch(20% 0.014 255 / 0.06), 0 12px 28px -14px oklch(20% 0.014 255 / 0.22);
}
```
Spacing (`--space-3xs` 2px to `--space-4xl` 144px), the type scale (`--text-*`; app screens use the fixed `--app-h1..h4`), easings and durations live in `tokens.css`. Texture: `--grain` (speck, 0.05) and `--fibre` (long wash) as background layers on paper, cards and controls; never over text at more than 0.05.
Two inks for dark ground: `--color-paper-muted` (secondary text on ink, 10.4:1) and `--color-ink-deep` (the press edge of ink card stock).

## Controls
- Primary: pear fill, ink text, a 4px deeper-pear edge below; hover lifts the edge to 5px, active presses it to 1px. One primary per screen. `.btn-primary` (`.btn-accent` and `.btn-paper` are the same recipe).
- Secondary: card fill with a 1px rule and a putty edge, same radius (14px) and height (44px). Ghost for toolbars.
- A chosen pill, tab or segment is ink with paper type. Inputs: 44px, 12px radius, 1px `--color-control` edge, the focus ring is a 2px blue outline drawn over the edge (the field never changes size).
- Labels are sentence case, untracked, the body face a step smaller. Never uppercase, never letter-spaced, never mono (except codes and code).

## Surfaces
- The ladder: whitespace, then a hairline, then a tinted well (`--color-paper-2`, no border), then a card (shadow or border, never both). Never a card inside a card.
- Torn paper (`.torn-band` with `ink` or `pear`, seeded `--torn-top`): marketing bands and the footer only, two a page at most.
- Light comes from the top left: shadows fall down and right, in CSS and in the 3D labs.

## Imagery
- Show the real product. 3D model previews come from `python scripts/capture_visual_previews.py` (`frontend/public/visual-previews`, `paper-previews`); sample covers and home shots from `python scripts/capture_shots.py` (covers: the clean 3D stage of each sample with a 3D view; 2D samples take the booklet cover). Re-run them after any visible change to the learner view.
- No drawn illustrations, no icon tiles over headings, no gradient washes standing in for pictures, no emoji as icons. Lucide icons only, 16/20/24px, `currentColor`.
- 3D only where the visitor handles the thing (a pendulum, a projectile, a spring, a diorama of a system). Pattern in `frontend/src/lib/three`: a procedural `Group` factory per model (primitives, bevelled boxes, tube networks, generated canvas textures, seeded noise), `stage.js` for renderer and light, `capability.js` to skip 3D on 2G, data saver or no WebGL (asked once per page load). Every 3D view has the 2D view as its fallback and never loads in the entry bundle.
- Simulation blocks: `SimLab3D` mounts `pendulumBench`, `projectileField` or `springTrack`; their colours are read from the tokens at runtime; scene labels never render below 11 to 12px; one line under the stage says what is stylised; the 2D/3D choice is kept for the session (`sessionStorage` key `cl.sim.view`). A lab's SAM cut-out (the real object from the class photo) rides on the 3D bob or ball.
- Demo material (`backend/app/seed/assets`) is rendered, never drawn by hand: textbook pages typeset in HTML, figures and photos from procedural 3D scenes (`scripts/render/`), diagrams without printed words so the self-test hides nothing. Each says it is an illustration made for the demo.
- One 3D stage (`.stage3d`): a warm paper radial with a floor band and grain, no border, studio light from the top left. The model fills 0.78 to 0.86 of the stage's limiting side, framed on the largest state a learner can reach, so sliders never zoom the camera. One label style (`kit.createChip`), never below 13px on a page or 18px in the deck. On a slide: one control row under the stage, the explanation in the words column, limits and credits behind "Về mô hình này".
- Covers: without a picture a lab shows the booklet cover (a pattern seeded from the share code on its subject's soft field, the title in ink, never a drawing). An AI cover keeps one house style: crafted and tactile on cream paper, daylight from the top left, one dominant field colour, the Hum inks as accents, no text, no people, no readable charts.
- AI-drawn sheets (the handwriting board) obey the contrast floor: words, numbers and labels are ink or blue on cream; coral, pear and mint only mark (underlines, bullets, arrows, drawings). A sheet is proofread against the teacher-checked text, and the typed Text view is always one tap away.

## Copy
- App and marketing screens: a headline seven words or fewer, a section head six or fewer, about 80 words a screen (Hallmark gate 58, for pages people scan and leave). Lesson content is not held to this budget: see Lesson deck.
- No eyebrow above a heading, no tracked capitals, no em or en dashes in interface copy (a comma, a colon or a full stop instead), no arrows glued to button text, no middle-dot meta strings, no invented numbers, quotes or logos.
- Vietnamese first, English always: every string in `frontend/src/i18n/locales/{vi,en}`, `npm run check:i18n` must pass.

## Lesson deck
- A learner reads the deck alone, on a phone or a laptop, with no teacher talking over it, so each slide carries its own explanation: one idea a slide, explained in full (what it is, why, one example). Counts are tiếng, the space-separated syllables (about 1.1 to an English word).
- The sheet (`.deck-paper`) is a stage with its own scale, `--deck-display/title/lead/body/small`, built from `--su` (1% of a virtual 16:9 slide height). Nothing on it is set below `--deck-small`; emphasis is weight or colour, never a sixth size. The desk is paper-2 with grain; the sheet is a card, so everything on it is at most a well.
- One heading a slide on the top margin, the byline under it at `--deck-small` (beads, the AI label). Headline: the slide's idea as a short statement, 12 tiếng or fewer (14 for the opening question). One lead sentence under it, 25 tiếng or fewer, at `--deck-lead`; the rest at `--deck-body`. Short text is never set large to fill the sheet: a teaching slide under 40 tiếng is missing its why or its example.
- Body: 60 to 100 tiếng beside a figure, up to 160 across the sheet. More goes into a closed "Giải thích thêm" (120 tiếng at most) or onto the next slide; type never shrinks.
- Words always sit beside a picture or a structure (figure, plot, formula with legend, table, contrast pair). A formula is followed by a legend of every symbol with its SI unit, and by a worked example. Formulas wrap after +, = or an arrow on phones; chemical equations are set upright.
- At most one callout a slide: a tinted well (no border, no side stripe, never a card in the card) with a 20px Lucide icon and one of four labels: Ghi nhớ, Mẹo, Lỗi thường gặp, Em có biết? (35 tiếng at most).
- Coral marks the one wrong idea, mint the right one, blue what a source says, pear the slide's own action. Coral and mint mark; text stays ink. Next is ink card stock; the end sheet is ink with paper text.
- Disclosure hides only extras (Giải thích thêm, Gợi ý, Xem lời giải). Every stage and step explanation is on screen when Tiếp reaches it; a graph shows what its curve tells and the first sentence of its explanation, the rest in its Kết quả và giải thích tab.
- Layout: beside a picture the words widen with their length (6 of 12 columns from 300 characters, 7 from 360; flow stages always 7); with no picture, text over 360 characters reads in two columns. A flow slide holds at most 3 stages and about 480 characters. A diagram with more than 5 parts, or over 300 characters of descriptions, shows numbered name chips and one well for the chosen part. Words beside an interactive picture (a graph's reading, a diagram's parts) are set at `--deck-small`.
- Fit: nothing scrolls at 1366x768; on a 390px phone the heading, lead and top of the picture come first and the words scroll once at most. When a part must scroll, the frame belongs to the scroll container (a labelled, focusable region), so the slide edge never cuts it.

## Quiz
- Answers, explanations and per-option feedback reach the learner only with the marked attempt, in every language. Worked examples on slides never reuse a numeric question's inputs or give away its answer.
- Thinking levels are a quiet label, never a score: Nhận biết, Thông hiểu, Vận dụng, Vận dụng cao.
- Voice: a situation from the lesson's own material first (the class photo, measured values, the textbook example), else everyday Vietnamese life with the same names (Lan, Minh, An). Wrong options are real misconceptions, never jokes; each option's feedback names the misconception kindly and says what to re-check, 25 words at most. A hint is asked for, never pushed, and never contains the answer.
- Progress is beads only (44px card-stock pills); after checking, right is mint with a CircleCheck mark and wrong is error-soft with a CircleX.

## Motion
- Character: brisk. `--dur-micro` 120ms (press), `--dur-short` 220ms (hover, menus), `--dur-long` 420ms (dialogs, drawers). Only `transform`, `opacity` (and `translate`, `box-shadow` on card stock). The spring easing on the primary only. Under reduced motion everything ends at once; the labs start paused.

## Floor (never ships broken)
Tokens for every colour and face; `overflow-x: clip` on html and body; a visible `:focus-visible` on every control, appearing instantly; contrast 4.5:1 for text, 3:1 for icons, rings and field edges; 44px touch targets; every animation has a reduced-motion fallback; no horizontal scroll from 320 to 1920px, and no control cut off by the edge at any of those widths; a loaded image never stays under its skeleton (its status follows the current src and is never reset in an effect).

## Variants

### ConceptLab Lite (`/lite`, `/lite/:code`)

An optional learner interface for low-end phones, slow networks and classroom projectors. It never replaces the main UI. Same tokens, larger type, stricter contrast:

- Single column, maximum 44rem (60rem in projector mode), body text in `--color-ink` on `--color-paper` (16.6:1, above the 7:1 Lite target). Secondary text uses `--color-ink-2`, never the muted colour for body copy.
- Type scale: body 1.1875rem, projector 1.5rem with 2.75rem titles. Touch targets are 56px (64px in projector mode), above the 44px floor.
- No Three.js, no KaTeX, no charts in the Lite chunk. Formulas and parameters are shown as text with provenance badges. Interactive blocks link to the full version instead of running heavy simulations.
- Sequential sections only: summary, steps, key formula, simplified blocks, quiz (server-marked), Ask the AI (chat SSE with voice input), feedback and sources. Provenance and citation honesty rules are unchanged. A handwriting board shows its typed text only, with a link to the redrawn sheet.
- Offline reading is opt-in: the current app shell and language, still images and published lesson are stored locally. The reader can delete the lesson copy, sees the saved date and is told that it can be stale or withdrawn. A network 404 removes the saved copy. Quiz, chat, voice and feedback need a connection; the full interactive view is not available offline.

## Exports
`frontend/src/styles/tokens.css` in this project.
