# Guitar Pal — Interview & Technical Notes

> This file is maintained alongside development. Each entry covers one milestone or significant feature.
> Structure per entry: Technical Highlights · Product Lens · One-liner · Follow-up Angles

---

## Fingerpicking Milestone (Issues #66–#68)

### Technical Highlights

- **Independent audio hook (`useFingerpickAudioEngine`):** Built as a fully separate hook from the strum engine rather than extending `useAudioEngine`. Key decision: avoided coupling two different scheduling models (pattern-based strum vs. precomputed timeline) into one abstraction.
- **Precomputed `ScheduleEvent[]` timeline:** All note timings are computed once before playback starts via `fingerpickPatternToScheduleEvents()`, avoiding per-tick recalculation inside the scheduler loop. Trade-off accepted: timeline must be recomputed on BPM/pattern change.
- **Per-string voice stealing via `VoiceHandle`:** Each string tracks its own active source node. New note on the same string cancels the previous one. `VoiceHandle` is duck-typed so tests can inject mocks without a real `AudioContext`.
- **`allSourcesRef` Set with `onended` auto-pruning:** All active `AudioBufferSourceNode`s are tracked in a Set. Each node removes itself on `onended`, so pause/stop/unmount cancellation is always clean with no stale reference leaks.
- **Exponential smoothing for playback cursor** (`renderedX += (targetX - renderedX) * (1 - Math.exp(-λ·Δt))`): Frame-rate-independent, eliminates per-note velocity resets. Rejected alternative: per-segment `easeInOutCubic` caused visible stutter at note boundaries.
- **Shared `metronomeSubdivision.ts`:** Pure function extracted so both strum and fingerpick pages derive click timing from one source. Ensures subdivision behaviour stays consistent across features.
- **Mobile `AudioContext` lifecycle:** Fresh context created on each `start()` call (closing existing first) to avoid zombie-context suspension after idle/backgrounding. Chrome caps ~6 concurrent contexts per page — this pattern stays within that budget.
- **BPM drag-pause-then-resume pattern:** Slider interaction pauses playback, updates BPM ref, then resumes — avoids audio glitches from mid-playback scheduler clock drift.
- **TAB partial last-row fix:** Final rows with fewer measures than `perRow` use fixed per-measure width instead of stretch-to-fill, matching standard notation conventions.

### Bugs Resolved During Build

- `schedulePass()` pre-scheduling bug — fixed via `allSourcesRef` tracking
- Muted-string MIDI resolution bug — `fret` resolved from slot when non-null
- Loop-gap not propagating through `computeLoopOffset()` after pause refactor
- Metronome mid-playback enable — now takes effect from next upcoming beat, not next loop

### Product Lens

- Fingerpicking is the second core playback mode after strumming. The two-mode architecture (strum + fingerpick) validates the product's expandability — new instrument techniques can be added as independent hooks without touching the audio core.
- Controls parity with the strum page (BPM, tap tempo, metronome, volume, Play Once, spacebar) was a deliberate UX decision: users switching between modes face zero relearning cost.
- Cursor motion with row-transition auto-scroll accounts for the mobile fixed-bottom controls bar — a detail that matters disproportionately for the target audience (mobile-first self-taught guitarists).

### One-liner (Interview)

"Designed and shipped an independent fingerpicking audio engine with precomputed scheduling, per-string voice stealing, and a frame-rate-independent exponential cursor — all without modifying the existing strum engine, maintaining strict separation of concerns."

### Follow-up Angles

- Why precompute the timeline instead of scheduling on the fly? (answer: deterministic timing, easier pause/resume, testable without AudioContext)
- How does voice stealing differ from the strum engine's approach? (answer: strum cancels all strings together; fingerpick cancels per-string independently)
- Why exponential smoothing over easing functions for the cursor? (answer: easing resets velocity at each note boundary causing stutter; exponential is stateless and frame-rate-independent)
- How do you test Web Audio code without a browser? (answer: duck-typed VoiceHandle interface + jsdom + mock AudioContext)

---

<!-- New entries appended below by CC after each feature completion -->

## Fingerpicking Notation Scope: Considered and Deferred

**触发场景：** 上传了一张商业排版的完整歌曲独奏移调谱（含 bend/vibrato/
tremolo picking/let ring 等高级记谱法），追问 VexFlow 能否渲染这类记号。

**技术结论：** VexFlow 核心 API 对 bend（含自定义幅度标签与 bend-release）、
vibrato（含 harsh 变体）、hammer-on/pull-off、slide、闷音、预推目标音括号
（TabNote.setGhost）均有一等公民级别的 modifier 支持，不需要换库。但
tremolo picking 锯齿符号、"let ring" 虚线括号、拨片方向箭头、精细连音分组
等装饰性记号没有现成 modifier，需要在 Annotation/Articulation 等通用绘图
原语上手工拼装，工作量和最终精致度都达不到商业排版软件的水平。

**范围决策：不扩展 `Technique` 类型。** 当前 Fingerpicking 数据模型只有
hammer-on / pull-off / slide-up / slide-down 四种技法，覆盖初学到中级自
学者的实际需求。本次讨论源于"以后想商业化、扩大用户圈层"的设想，但判断
"完整歌曲独奏谱"不是合适的破圈路径，原因有二：

1. **版权风险是实质性的，不是技术问题。** 完整歌曲的逐音符移调谱属于受
   版权保护的演绎作品，Ultimate Guitar / Songsterr 等平台能合法展示是因
   为持有正式的机械复制授权（mechanical license）。个人项目一旦从"结构
   化练习模板"跨到"展示真实歌曲完整移调谱"并商业化，直接面临版权风险，
   风险量级远高于此前 RAG 功能里讨论过的"引用摘要需要改写"。

2. **赛道无差异化空间。** 该赛道已被拥有正版曲库和成熟排版引擎的平台占
   据，个人开发者既无内容优势（无版权曲库）也无技术优势（排版精细度难
   以追平），投入产出比低。这与此前"是否自建通用文档 RAG 对抗 NotebookLM"
   的判断逻辑相同。

**如果未来真要扩大用户圈层，更合适的方向：** 中级技巧专项练习（仍用现有
四种 Technique，只是组合复杂度提升，不涉及 bend/vibrato）；或围绕现有原
创和弦库做"歌曲弹唱简化版"（用和弦进行而非逐音符独奏谱，完全规避版权和
记谱复杂度）。两者都不需要扩展当前数据模型或引入版权风险。

**面试话术：** "我评估过把 Fingerpicking 技法扩展到支持完整歌曲独奏谱的
可能性，判断这不是合适的破圈路径——不是因为技术做不到，而是因为版权风险
和赛道差异化空间都不支持。我把这个决策和替代方向写了下来，但没有让它影
响当前里程碑的数据模型范围。"

---

## Fingerpicking Page — Mobile Controls & Cursor Polish (Issues #70, fixes)

### Technical Highlights

- **Unified drawer architecture:** Replaced the initial two-element design (separate fixed sheet + fixed bottom bar) with a single `fixed bottom-0` container housing a collapsible panel above a persistent main bar. The panel animates via `transition-[max-height]` with an iOS-style cubic-bezier curve (`0.32, 0.72, 0, 1`) — more physically convincing than a linear or ease-out curve.
- **BPM popover as fixed-positioned portal:** The BPM vertical slider popover was initially `absolute bottom-full` inside the drawer, causing overflow clipping in the collapsed state. Resolved by reading `getBoundingClientRect()` on click and rendering the popover as a `fixed` element anchored to viewport coordinates — a lightweight portal pattern without ReactDOM.createPortal.
- **Scroll isolation on drawer:** `onWheel` and `onTouchMove` with `stopPropagation()` on the drawer container prevents scroll events from bubbling to the TAB viewer. A z-20 transparent backdrop intercepts TAB clicks when the drawer is open, preventing accidental seek.
- **Drag-to-close with pull-to-refresh prevention:** `touch-action: none` on the drag handle combined with `setPointerCapture` suppresses Chrome's native pull-to-refresh gesture while still tracking the downward drag to close the drawer.
- **Cursor drift fix for single-note measures:** The interpolation logic previously used `nextEvent.time - t0` as note duration, causing whole-note measures to move the cursor extremely slowly. Fixed by reading `t0Event.duration` (the actual scheduled duration in seconds) directly from the ScheduleEvent.
- **`isLastNoteInMeasure` branch:** Added an explicit check before note-to-note interpolation — when the current note is the last in its measure, the cursor drifts linearly to the measure's right edge using the stave data attributes, matching standard notation playback behaviour.
- **userStoppedRef guard (partial):** Investigated scroll-to-top on natural playback end; root cause traced to `lastScrolledRowRef` reset in `isPlaying` cleanup triggering `scrollIntoView` on row 0. Full fix deferred as a filed bug — the guard approach was reverted after failing to resolve on mobile.
- **Haptic feedback:** `navigator.vibrate?.(10)` on all slider interactions and tap tempo — feature-detected so iOS and desktop silently skip it. A small detail that meaningfully improves perceived quality on Android.

### Product Lens

- The drawer interaction model (persistent main controls + swipe-up secondary controls) mirrors native music app patterns (Songsterr, GarageBand) — lowers the learning curve for the target audience.
- Keeping Play/Stop flush-right in the main bar matches thumb-reach ergonomics on phones held in one hand.
- The BPM slider in the drawer panel means users can adjust tempo without closing the drawer — reduces interaction cost for a frequent action during practice.
- Haptic feedback on sliders is a low-effort, high-signal-quality detail — the kind of thing users feel rather than notice, but miss when absent.

### Bugs Filed (not fixed this session)

- `bug(fingerpick): page scrolls to top on natural playback end (mobile)` — root cause identified (lastScrolledRowRef reset in isPlaying cleanup), fix attempts reverted. Tracked as open GitHub issue.

### One-liner (Interview)

"Designed a unified mobile drawer with spring animation, scroll isolation, and pull-to-refresh suppression, while fixing cursor drift on single-note measures by replacing time-gap interpolation with the event's actual scheduled duration."

### Follow-up Angles

- Why a unified drawer over a separate sheet overlay? (answer: overlay hides main controls; drawer keeps them always visible, matching native music app conventions)
- How did you prevent the drawer scroll from moving the TAB behind it? (answer: stopPropagation on wheel/touchMove + z-20 transparent backdrop that intercepts clicks)
- How did you fix the BPM popover clipping? (answer: lightweight portal pattern — read getBoundingClientRect on open, render as fixed with viewport coordinates)
- Why does the cursor stall on whole-note measures without the fix? (answer: interpolation denominator was next-event gap, not note duration — a 3-second whole note followed by a gap of different length caused wrong velocity)

---

## Fingerpicking Page — Cursor Rest-Slot Fix & Auto-Scroll Polish

### Technical Highlights

- **`MeasureBoundary` + boundary-aware `getProgressAtTime`:** Added `computeMeasureBoundaries()` to `fingerpickScheduler.ts` — precomputes each measure's absolute start time in seconds. Updated `getProgressAtTime()` with an optional `boundaries?` parameter: when elapsed has crossed into a later measure than the last fired event (e.g. a measure starting with a rest), it returns `{ measureIndex, slotIndex: 0 }` for that measure rather than holding the previous measure's last event. This decouples cursor position reporting from audio event firing.
- **Rest-slot cursor drift in RAF tick:** When `getProgressAtTime` returns a slot with no DOM element (GhostNote/rest), the RAF tick previously returned early and froze the cursor. Fixed with a fallback branch that: (1) snaps cursor to measure left edge on measure transition, (2) interpolates linearly toward the first non-rest note's x position over the rest slot's duration using `getBoundingClientRect` on the upcoming note element. The same exponential smoothing (`CURSOR_LAMBDA = 20`) is applied so the drift is visually continuous.
- **Auto-scroll does not trigger hide-on-scroll:** `isAutoScrollingRef` flag set to `true` before `scrollIntoView` and cleared after 500ms via `setTimeout`. Both the page-level scroll listener and NavBar's scroll listener check this flag and skip the hide logic. NavBar is notified via `CustomEvent('fingerpick-autoscroll-start/end')` — same cross-component signalling pattern used for `fingerpick-controls-restore`.
- **Dead code removal:** The `firstEventInNewMeasure` snap block in the measure-transition branch of the RAF tick was rendered redundant by the noteEl null fallback and removed (19 lines).

### Product Lens

- Rest slots at the start of a measure are a real notation pattern (pickup bars, rests before a fill). Freezing the cursor at the previous measure's right edge during a rest looks broken to musicians — the fix makes Guitar Pal's playhead behave like professional notation software.
- The auto-scroll / hide-on-scroll separation ensures the UI doesn't fight itself: the page scrolls to follow the player's position without hiding the controls they need to interact with.
- Cross-component signalling via `CustomEvent` keeps the hide-on-scroll logic decoupled — NavBar doesn't need to know about the fingerpick page's RAF loop internals.

### One-liner (Interview)

"Fixed cursor stalling on rest-opening measures by extending the scheduler's progress function with measure boundary awareness and adding a drift interpolation fallback for GhostNote slots in the RAF loop."

### Follow-up Angles

- Why not just add a ScheduleEvent for rest slots? (answer: rest slots produce GhostNotes with no audio; adding fake events would corrupt the timing data used for BPM reschedule and seek — cleaner to handle the display layer separately)
- How does the rest-slot drift know where to drift toward? (answer: queries the first non-rest note's DOM element via getBoundingClientRect at runtime — no precomputation needed, no layout dependency)
- How do you prevent auto-scroll from triggering hide-on-scroll? (answer: isAutoScrollingRef flag + CustomEvent to NavBar, both checked at the top of the scroll listener before any hide logic runs)

---

## Issue #29 — Custom SVG Chord Diagram Renderer with Note Toggle

### What was built

Replaced third-party library vexchords with a custom SVG renderer, added a three-mode note display toggle, root note highlighting, full-fretboard mode, and a voicing detail modal.

### Technical highlights

**Why we dropped vexchords:**

- `fingers` param is typed `number[]` — no way to render custom text (note names) inside dots
- Barre renders as a single bar with no per-string dot overlay support
- No extensibility for root highlighting or fretboard mode
- Custom SVG is zero-dependency and fully controllable

**ChordDiagramSVG design:**

- Pure SVG React component, `size="regular" | "compact"`
- Three-mode prop: `"fingers"` / `"noteNames"` / `"fretboard"`
- Note name calculation: `(OPEN_STRING_MIDI[stringIndex] + absoluteFret) % 12`, standard tuning MIDI offsets [40,45,50,55,59,64]
- Barre span: find the finger number that repeats across strings at barreFret in the `fingers[]` array — only those strings get the barre bar. Prevents incorrectly grouping independent fingers that happen to share the same fret (a data quality issue in tombatossals/chords-db)
- Root highlight: `rootMidi % 12 === notePitchClass` → denim blue fill
- Fretboard mode: non-fretted cells get white dot + dark gray text, subordinate to dark fretted dots

**Data layer cleanup:**

- Removed VexChordDef conversion logic from `chordVoicingToVexChords.ts`, kept `selectStandardVoicing()`, renamed file to `selectStandardVoicing.ts`
- Removed vexchords from package.json and deleted `vexchords.d.ts`
- Removed vexchords attribution from chords layout footer

**Voicing detail modal:**

- Click any voicing card to open a full-screen blurred modal with enlarged diagram
- Three-mode toggle maintains its own independent state
- Keyboard: ArrowLeft/Right to navigate voicings, Escape to close
- Touch swipe: horizontal delta > 50px and vertical < 30px triggers navigation
- Spacebar triggers playback; button shows playing state until `onended`
- Pure Tailwind + CSS transitions, no framer-motion

**Data quality finding:**

- tombatossals/chords-db marks `barre_fret` on voicings where multiple strings share a fret position but are played with independent fingers — not a true barre
- Handled at render layer via finger number repeat validation; no DB changes needed

### Rejected approaches

- **Type coercion on vexchords fingers**: pass strings as `unknown as number[]` → rejected, dot size too small for two-character note names (e.g. F#)
- **Note name row below diagram**: render a span row under each diagram → rejected, forces eye movement between diagram and labels, feels disconnected
- **Global min-width**: fix narrow-screen layout issues → rejected, sub-375px devices are negligible; component-level responsive fixes are more appropriate

### Product perspective

- Build vs buy: vexchords hit its ceiling for an educational use case; self-rendering cost is low (chord diagrams have a small set of primitives), long-term maintainability is higher
- Three-mode toggle (123/ABC/Grid) reduces cognitive load — users opt in to note names rather than having them forced on
- Voicing modal addresses the information density problem of the compact browse grid — users can inspect any voicing in detail without leaving the page
- Ripple hover effect signals card interactivity, reducing friction in the discovery path

### One-liner for interviews

"We replaced vexchords with a custom SVG renderer to unlock three-mode note display and root highlighting — and in the process discovered and handled a barre misclassification issue in the upstream chord database at the render layer, keeping our data clean without any DB migrations."

### Follow-up questions to expect

- Why SVG over Canvas? (SVG DOM is React-state-driven; no manual clearRect/redraw cycle needed)
- How does the barre span validation work exactly?
- Does fretboard mode account for capo? (Not yet — capo shifts the open string pitch, note names would be off)
- How does swipe navigation avoid conflicting with page scroll? (30px vertical threshold filters scroll intent)

---

## Issue #88 — TAB Data Model Expansion

**What was built:**
Extended `fingerpickTypes.ts` with 17 new Technique values, 4 new Duration values,
8 new optional StringFret fields, and `isGraceNote` on BeatSlot.
Updated `fingerpickScheduler.ts` with exact fractional beat durations for dotted/triplet/32nd values.
Updated `fingerpickToVexFlow.ts` with VexFlow duration string mappings and GraceNote support.
22 new tests added; 416 total passing.

**PM decision & rationale:**
Data model expansion was deliberately sequenced _before_ the AI TAB recognition epic.
The type system is the schema contract between AI output and VexFlow rendering —
any technique the AI recognizes but the schema can't represent gets silently dropped.
Doing this first eliminates that class of data loss entirely.

**Key technical decisions:**

- `bendTarget?: number` uses semitone units (full=2, half=1, quarter=0.5) rather than
  string labels — keeps the field machine-readable for future audio pitch-shifting use.
- Grace note slots use a fixed 1/32-beat scheduling duration and do not advance
  `currentTime`, preserving barline alignment of subsequent slots.
- New Technique values are silent pass-through in `fingerpickToVexFlow.ts` —
  rendering deferred to Issue B, but the adapter never throws on unknown values.
- `slotNoteIndex[]` mapping introduced to keep `notes[]` and connector/tuplet loops
  aligned when grace note slots (which produce no TabNote) are interspersed.
- `jsonb` storage means zero database migration needed — new StringFret fields
  serialize naturally when user-created pattern storage is built later.

**Rejected approaches:**

- Considered adding technique rendering (bend arrows, vibrato brackets) in this same
  issue — rejected to keep the PR small and avoid blocking on VexFlow BendAnnotation
  API experimentation, which carries real unknowns.
- Considered string labels for bendTarget ("full"/"half") — rejected in favor of
  numeric semitones for machine-readability.

**AI TAB recognition dependency note:**
During the TAB recognition epic, the AI prompt should instruct the model to return
an `"unknown"` marker (not silently omit) for any TAB symbol it cannot map to the
current schema. This creates a visible backlog of missing symbols rather than
silent data loss.

**Interview talking points:**

- Sequencing: why data model before AI feature (schema contract argument)
- Build vs. buy judgment: chose numeric bendTarget over string labels for
  forward compatibility with audio pitch-shifting
- Zero-migration jsonb strategy for schema evolution

**Potential interview follow-up questions:**

- "How would you handle a TAB symbol the AI recognizes but your schema doesn't support yet?"
- "Why not build the VexFlow rendering at the same time?"
- "How does jsonb affect your ability to query or validate data at the database level?"

---

## Issue #83 + #91 — Strum Page Mobile Redesign & Chord Picker Modal

### What was built
Redesigned the strum page mobile UI to match the fingerpick page's fixed-bottom drawer pattern, and added a chord picker modal allowing users to select any chord from the library and hear it played with the current strum pattern.

### Technical highlights

**Fixed-bottom drawer (mobile):**
- Two-layer structure: persistent main bar (BPM tap popover, Loop/Once pill, Metronome toggle, Play/Stop) + collapsible panel (Tap Tempo, BPM slider, volumes, Accent, Loop Gap)
- max-height CSS transition with cubic-bezier(0.32, 0.72, 0, 1) for smooth panel animation
- controlsVisibleRef pattern mirrors state for use inside scroll listener closure — avoids stale closure issues
- Hide-on-scroll: translateY(100%) on scroll down, restored on scroll up or StepGridCard tap
- touch-action: none + setPointerCapture on drag handle suppresses Chrome pull-to-refresh
- navigator.vibrate?.(10) haptic feedback on Play/Pause toggle

**BPM slider improvements:**
- Tick dot color: denim blue for ticks ≤ current BPM, lighter gray for ticks > current BPM — visual filled-track metaphor without a native range input
- Magnetic snap-to-tick: during pointer drag, if raw BPM value is within SNAP_THRESHOLD=4 of any tick, snaps to that tick. snapLocked ref prevents jitter at snap boundary — only releases when raw value diverges by > SNAP_THRESHOLD. Keyboard arrow keys bypass snap entirely.

**ChordPickerModal:**
- Two-phase UI: Phase 1 shows piano keyboard root selector (12 keys, black/white layout, denim highlight on selected) + chord category grid (7 categories with example suffix helper text). Phase 2 triggers when both selections are made.
- Desktop Phase 2: voicing panel expands horizontally to the right via width transition. Modal width grows, left side stays fixed.
- Mobile Phase 2: voicing panel expands vertically below category grid. max-h-[80dvh] + overflow-y-auto + overscroll-contain + touch-pan-y ensures native scroll isolation — background page does not scroll when user scrolls inside modal.
- Auto-scroll to voicing panel on Phase 2 trigger via scrollIntoView with 100ms delay to allow DOM render.
- Voicing panel: horizontal scrollable row showing ~1.5 cards in view, selected voicing gets border-denim + shadow-md, each card has Play button with hover:bg-denim-dark + hover:-translate-y-0.5 micro-interaction.
- Dynamic MIDI pitches: confirmed chord voicing → chordVoicingToMidi → passed to useAudioEngine, replacing hardcoded C major STRUM_PITCHES. Falls back to C major when no chord selected.
- Fetches voicings client-side via browser Supabase client — does not call "use server" functions from client component.

### Rejected approaches
- **Pattern library floating button overlap fix via z-index**: too fragile, root cause is layout not stacking order → solved by repositioning StepGridCard to vertically centered in remaining viewport space
- **Global min-width for narrow screens**: sub-375px edge case not worth the mobile UX tradeoff
- **onTouchMove stopPropagation alone for scroll isolation**: insufficient in Chrome devtools simulator; touch-action: pan-y at CSS level is the correct primitive — tells browser natively that vertical touch drag should scroll this element

### Product perspective
- Aligning strum and fingerpick mobile UI patterns reduces cognitive switching cost for users moving between pages
- Chord picker unlocks the core learning loop: user picks a chord progression concept → hears it with real guitar strum timbre → practices it. Previously locked to C major.
- Magnetic BPM snap reduces friction when targeting common practice tempos (60/90/120 BPM are the most pedagogically useful)
- Modal scroll isolation is a subtle but important mobile UX detail — broken scroll containment is one of the most common complaints in web apps on iOS

### One-liner for interviews
"We redesigned the strum page mobile UI with a fixed-bottom drawer matching our fingerpick page pattern, and added a chord picker with a piano keyboard UI, voicing selection, and dynamic audio — so users can finally hear their strum patterns with a real chord instead of a hardcoded C major."

### Follow-up questions to expect
- How does the magnetic BPM snap avoid jitter at the boundary? (snapLocked ref — only releases when raw value diverges by > threshold)
- Why touch-action: pan-y instead of just stopPropagation? (CSS-level hint to browser vs JS event interception — browser makes scroll decision before JS fires)
- How does chord selection wire into the audio engine? (chordVoicingToMidi → dynamic pitches prop → useAudioEngine replaces STRUM_PITCHES)
- Why fetch voicings client-side instead of using the server action? (server actions use "use server" and cannot be called from client components directly in this architecture)

---

## Issue #87 — Fingerpick Pattern Library Panel

**Shipped:** Preset selection, favourites (localStorage guest + Supabase logged-in + merge-on-login), tabbed collapsible sidebar, cursor reset on pattern switch.

**Technical decisions:**
- `useFingerpickPatterns.ts` mirrors `useStrumPatterns.ts` exactly — same merge-on-login pattern, same localStorage key convention, same Supabase table shape (`user_favourite_fingerpick_patterns`: composite PK on `user_id` + `pattern_id`, RLS-protected)
- Favourites store ID strings only (not pattern content) — preset data lives in the compiled bundle, so localStorage footprint is negligible even when custom patterns are added later
- Hook API designed with explicit TODO extension point for custom patterns; storage logic intentionally not implemented until the create-flow issue
- Cursor reset on pattern switch reuses the existing `cursorResetTick` mechanism (incremented on Stop) rather than adding new state — one-line fix by wrapping `setSelectedPattern` to also call `stop()` and increment the tick
- Sidebar structure (All/Favourites tabs, My Patterns + Presets collapsible sections, sign-in nudge) mirrors strum page exactly for UX consistency; Favourites tab shows both sections filtered to favourited items, with empty states per section

**Preset patterns added:**
- Travis Picking (12 measures, 3 progressive phases: alternating bass → melody + hammer-on → pinch)
- Arpeggio (12 measures: p-i-m-a forward → reverse → classical 8-note p-i-m-i-a-i-m-i)
- Waltz (12 measures, 3/4: basic bass-chord → hammer-on/pull-off ornaments → dotted-quarter subdivision)
- Celtic Fingerstyle (8 measures, dotted-eighth + sixteenth mixed rhythm, hammer-on/pull-off/slide-up/ghost notes)

**Blocked dependency resolved:** #87 was blocked on #88 (type system expansion) because realistic preset patterns needed the new Technique and Duration values. Landed immediately after #88 merged.

**Scope boundary held:** Custom pattern localStorage/Supabase storage explicitly deferred to create-flow issue. `description?: string` added to `FingerpickPattern` type to support library card display.

**Interview one-liner:** Designed a full pattern library with guest/auth favourites sync, made the deliberate call to scope out custom pattern storage, and designed the hook API with a clean extension point so the create-flow issue requires no refactor.

**Possible follow-up questions:**
- Why mirror `useStrumPatterns` instead of abstracting a shared hook? (YAGNI — two instances don't justify abstraction yet; the patterns differ enough in data shape that a generic hook would be over-engineered)
- How does merge-on-login work? (Read localStorage IDs → upsert to Supabase → clear localStorage → Sonner toast if any migrated)
- Why store only IDs in localStorage and not full pattern data? (Preset content is in the bundle; custom patterns will be stored separately in their own key when the create-flow lands)

---

## Issue #88 — TAB Data Model, Rendering & Dev Page

**What was built:**
Full expansion of the TAB type system and VexFlow rendering pipeline to cover professional-grade guitar TAB notation, plus a bilingual dev page for visual and audio verification.

**Scope:**
- 17 new Technique values, 4 new Duration values, 8 new StringFret fields, `isGraceNote` on BeatSlot
- VexFlow modifiers: staccato, accent, pick stroke, tremolo picking, vibrato, tapping ("T"), trill ("tr~~~"), GraceTabNote
- Technique-aware audio gain ladder in `useFingerpickAudioEngine`
- Low-pass filter (2000Hz) for hammer-on/pull-off/trill to approximate legato attack without pick transient
- `/dev/tab-notation` page: per-section Play buttons, bilingual EN/ZH descriptions, status badges (✅/⚡/⏳), language toggle, stress-test section
- 427 tests passing at close

**Key PM decision:**
Data model expansion was sequenced before the AI TAB recognition epic. The type system is the schema contract between AI output and VexFlow rendering — gaps here cause silent data loss at recognition time, not loud errors. Doing this first eliminates that entire class of bugs.

**Deliberately deferred with tracked issues:**
- Bend family rendering + audio → Issue B2
- Slide audio → dedicated research issue (sample-based pitch glide fundamentally incompatible with pluck samples; linear and exponential ramp both tried and reverted)
- Hammer-on/pull-off/trill/tapping audio refinement → dedicated issue (low-pass filter approximation insufficient; needs better sample or envelope research)
- Grace note rendering + audio → dedicated issue (GraceTabNote sizing unsolved; voice stealing causes silence)

**Key technical decisions:**
- `bendTarget?: number` in semitones (not string labels) — machine-readable for future audio pitch-shifting
- Grace note slots use fixed 1/32-beat scheduling duration, do not advance `currentTime` — preserves barline alignment
- Low-pass filter nodes created per-note, not tracked in refs — GC handles cleanup via `source.onended`
- Vibrato modifier wrapped in try-catch — VexFlow Vibrato constructor requires canvas context, throws in jsdom; 2 tests skipped with documented reason
- Slide audio removed after two implementation attempts (linear ramp, exponential ramp) both produced mechanical artifacts; root cause is pick attack transient in sample that cannot be removed post-hoc

**Interview talking points:**
- Schema-first approach: why data model before AI feature
- Build vs. buy: numeric `bendTarget` for forward audio compatibility
- Honest status tracking: dev page status badges reflect real implementation state, not aspirational state
- When to stop: slide audio and legato audio reverted rather than shipped in broken state

**Potential interview follow-up questions:**
- "How would you handle a TAB symbol the AI recognizes but your schema doesn't support yet?"
- "Why did you revert the slide audio instead of shipping the approximation?"
- "How does the low-pass filter approach differ from having a dedicated legato sample?"

---

## #98 Fingerpick Pattern Edit Modal

**Date:** 2026-07-11
**Milestone:** Fingerpicking page

### What was built
A full-featured create/edit modal for fingerpick patterns, grid-based UI with two interaction modes: single-cell focus (arrow keys + number entry) for fret editing, and column-selector buttons (multi-select) for slot-level operations. The completed pattern is a standard FingerpickPattern that feeds directly into the existing fingerpickToVexFlow → TabStaveRow → VexFlow render pipeline — no conversion layer needed.

### Key decisions

**Grid UI over VexFlow interaction layer** — edit state lives in a plain HTML grid, not an interactive VexFlow overlay. VexFlow remains render-only. Keeps edit and render concerns cleanly separated; avoids coupling the rendering pipeline to edit interactions.

**Pure editing logic in `fingerpickEdit.ts`** — all cell navigation, fret mutation, slot/measure structural ops, split/merge, beat group computation, clone, swap extracted to a pure module with 30+ unit tests. Modal component is thin UI only. Mirrors the fingerpickScheduler.ts vs useFingerpickAudioEngine.ts separation pattern.

**Time-signature-aware measure capacity** — slot operations enforce a hard cap (4/4 = 32 units of thirty-second notes). Split/merge preserve data: first sub-slot inherits original data, merged slots discard with inline confirmation if data would be lost. Quick preset (All ♩/♪/♬) offers remap vs clear choice.

**Popup anchor flip** — column popup opens right in the left half of a measure, left in the right half. Prevents overflow without dynamic modal width calculation.

**Tied note via right-click menu** — tied and technique are mutually exclusive per string+slot, enforced in setTied/setTechnique. Integrated into the existing context menu alongside H/P/↑/↓, not a separate UI surface.

**`fingerpickPatternSync.ts` mirrors strum sync pattern** — localStorage for guest, Supabase upsert for logged-in, merge-on-login with Sonner toast. No Supabase migration file — table created directly in dashboard via SQL.

**Undo/Redo as history stack** — pure function architecture makes this natural: every mutation returns new state, history = state[]. Capped at 50 entries. Cmd+Z / Cmd+Shift+Z scoped to modal container, not window.

**Two-layer hover highlighting** — L1 (beat group, subtle) derived from computeBeatGroups; L2 (slot column + string row, stronger) on hovered cell. Helps users orient in mixed-duration measures. rgba inline styles to avoid class collision with selected-cell denim border.

### What was deferred
- In-modal preview playback (Issue A — depends on #98 merge)
- Duration beam group SVG icons replacing text labels (backlog)
- Measure drag-and-drop reorder (backlog — arrow buttons as temporary impl)
- Onboarding tour (global feature, backlog)
- TAB playback slight stuttering with user-created patterns (backlog)

### Interview talking points
- "I separated edit state from render state — the grid editor owns a draft FingerpickPattern, VexFlow only sees confirmed data. No conversion layer: the modal output is the same type the audio engine and renderer already consume."
- "Extracted all mutation logic to a pure testable module before writing UI — 30+ tests covering navigation, two-digit fret entry, slot split/merge with data preservation, beat group computation, and tied/technique mutual exclusivity."
- "Time-signature-aware capacity enforcement: the editor treats a measure as a fixed bucket of thirty-second-note units. Split and merge operations validate against remaining capacity before mutating, so users can't accidentally overflow a measure."
- "Undo/redo fell out naturally from the pure function architecture — every edit returns new state, so history is just a state array. Zero additional complexity in the mutation layer."

### Follow-up questions to expect
- How does the edit modal integrate with the AI parse flow in Issue #99?
- Why not make VexFlow interactive instead of a separate grid?
- How do you handle the impedance mismatch between grid edit state and TAB render state?
- What happens if a user creates a pattern with techniques the audio engine doesn't support yet?

---

## #107 — Fingerpick page v3 design system refactor (2026-07-18)

**Scope evolution:** Originally scoped to page.tsx (controls panel + mobile drawer + layout) and TabStaveRow.tsx (TAB viewer visuals) per the issue. Mid-refactor, scope was deliberately narrowed to controls-panel-only first (sidebar/TAB viewer background colors preserved as-is per an explicit Sloan decision), then expanded back out panel-by-panel as each was completed: controls panel → sidebar → TAB viewer → page-level background → FingerpickEditModal (added to scope, not in the original issue — see below).

**Pre-work audit caught a stale assumption:** Before starting, Claude incorrectly flagged `fable/design-tokens.css` as a superseded v1 file based on outdated project memory. A full audit (reading FINAL_DESIGN_DIRECTION.md, the fable/ directory, and comparing against the live repo) showed the opposite: design-tokens.css matches FINAL_DESIGN_DIRECTION.md §2 byte-for-byte, and the repo had already fully migrated to the v3 token/[data-theme] system — the "integration warning" in FINAL §8 was already resolved and just hadn't been noted as such. Lesson: verify stale-looking references against the actual files before treating them as fact.

**Design-drift resolution (spec updated to match repo, not the reverse):** Two values diverged between the repo and the spec docs — light-mode `--bg`/`--bg-panel` (repo: `#F5F7FA`/`#EBEFF5` denim-tinted cool white, a deliberate #106 landing-page decision never backported to spec; spec: `#F4F4F1`/`#EDEDE9` warm paper) and `--h-viewer-toolbar` (repo: 45px, spec: 44px). Both repo values were confirmed as Sloan's actual current design decisions, so `FINAL_DESIGN_DIRECTION.md` and `fable/design-tokens.css` were patched to match the repo, restoring single-source-of-truth status going forward.

**Token decoupling:** `--popover` (shadcn bridge) originally shared `--bg-panel` with sidebar/topbar/control-rack surfaces. Introduced dedicated tokens — `--modal-bg` (white in light mode, `--bg-panel` in dark) and `--topbar-bg` (extracted at parity with the topbar's existing rendered color) — so each surface family is independently themeable. Controls panel background was also moved onto `--popover`/`--modal-bg` after an interim regression where it briefly inherited `--bg-panel` and visually merged with the sidebar/topbar.

**Sidebar dark-mode fixes:** `--ink-faint` (spec-intended for dormant/decorative labels only — module labels, ticks, dormant LEDs) had been applied to real readable text (empty-state copy, descriptions, icon default states), producing ~2.1:1 contrast against the dark background — well under WCAG AA. Moved to `--ink-dim` (~5.3:1) for anything a user actually reads; `--ink-faint` reserved for genuinely dormant/label-scale elements. Same fix applied to the controls panel for consistency between the two panels. Section headers and hover state, which had been collapsed onto the shared `--bg-raise` token during extraction (causing a visibly different, unintended color), were given their own dedicated tokens (`--sidebar-header-1-bg`, `--sidebar-header-2-bg`, `--sidebar-hover-bg`) restoring their original light-mode values exactly while gaining independent dark-mode values.

**TAB viewer dark mode:** VexFlow SVG output is re-themed at the render layer (post-`draw()` class application — `.sline`/`.fnum`/`.fnum-dim`/`.fnum-hot`/`.clef`/`.tech`/`.tech-arc` per FINAL §5.10), not by forking VexFlow's internal rendering — this preserves the `data-stave-*`/`data-measure-index`/`data-slot-index` cursor attributes the playback RAF loop depends on. `fable/implementation-notes.md` (a fingerpick-specific migration playbook, distinct from the visual-spec docs) was the source for this render-layer approach and for the exact inline-rgba-to-token cursor/measure-highlight replacements.

**FingerpickEditModal — added to scope:** Not in the original issue, but its complete absence of v3 styling and mobile usability became apparent mid-refactor once the surrounding page was updated. Added: v3 visual pass (radius 0, hairline borders instead of shadows, token colors throughout, §5.6 segmented-pill duration picker, §5.1 button recipes); mobile fret-entry via a hidden `inputMode="numeric"` input (no physical keyboard on mobile, so digit-key editing needed a touch equivalent); a touch-only mute button, precisely anchored below the selected cell and only visible while the numeric keyboard is actually focused (not just on cell selection) and hidden when the cell is already muted; a fix for native long-press-to-select-text firing during the long-press technique-menu gesture (`user-select: none`, `touch-action: manipulation`, `preventDefault` on touch pointerdown); touch equivalent of the desktop hover row/column highlight, driven by selection instead of hover since touch has no hover state; sticky header (mirroring the pre-existing sticky footer pattern — `-mx-4 -mt-4` to consume the dialog's own padding rather than just `sticky top-0`, which left a scrollable gap for content to leak through above it); capability-aware hint text (keyboard vs touch instructions) moved into a footer "?" icon popover with an iMessage-style spring-pop entrance animation and icon-only (no background box) hover/press/open feedback, per the "feedback behavior not surface material" principle.

**Breakpoint bug caught during final walkthrough:** the pattern-library sidebar's hide breakpoint and its drawer-toggle button's visibility breakpoint didn't match, leaving a ~751px-997px dead zone where the sidebar was hidden but unreachable. Fixed by aligning both to the same breakpoint, and repositioning the toggle button from the page's outer top-right to the TAB viewer section's top-right (adjacent to the controls panel) for better visual grouping.

**Interview angle:** Good example of scope discipline under real iteration — the issue's stated scope (page.tsx + TabStaveRow.tsx) expanded organically as gaps surfaced (FingerpickEditModal, page-level background, the breakpoint dead zone), and each expansion was made a deliberate, stated decision rather than silent scope creep. Also a clean example of catching a documentation-drift failure mode before it compounded: an audit before writing code found the design spec had gone stale relative to two intentional prior decisions, and the spec was corrected rather than the implementation being reverted to match outdated docs.

---

## Issue #114 — Tab Import 校验 / 归一 / 反复展开核心 lib（识谱 MVP, Track 1）

### 一句话闪光点
我给一个消费视觉 LLM 不确定输出的校验层立了一条硬不变式——要么交出保证可渲染、且逐处披露修改的结果，要么明确失败，绝不产出"看着对其实错"的东西；并刻意不在这层承诺识别准确率，把"可渲染"的地板和"读得准"的天花板拆给不同组件。

### 技术要点
- **核心不变式**：`pattern === null ⟺ errors 非空`。null 只在三种结构崩塌（非对象 / measures 非数组 / 零小节）发生；其余一律 clamp/修复 + warn。下游（Issue 2）拿到非 null 即可直接塞进编辑器、无需二次校验——这条负向保证就是契约本身。
- **诚实频道**：所有对原始 LLM 输出的改动（clamp 品位 / 填默认时值 / drop 不支持技巧 / 截断）一律记入 warnings。截断是全 lib 唯一"销毁数据"的操作，其余都"改+保留+标记"。
- **技巧注册表用类型系统当护栏**：`Record<NonNullable<Technique>, TechniqueSupport>` 穷举，将来新增 Technique 未分类则编译不过。render 标志逐条对齐 `fingerpickToVexFlow` 实际渲染行为，非 brief 旧描述。
- **时值推断分流**：整小节全缺 → 按拍号容量均匀推（4/4 4 slot → quarter）；部分缺 → 只对缺的逐个退 `eighth`，不重建节奏（那属于转录，超出 DoD）。
- **反复展开**：`times` = 总出现次数（times=1 恒等）；克隆 measure 与其每个 slot 双层换新 id（防 React key 撞 + cursor data-index 定位）；越界/重叠 directive → skip+warn，绝不 throw。
- **orchestrator 顺序**：validate → expand → cap，cap 必须在 expand 之后。

### 产品视角
- 北极星是"一键准确转录"，编辑器兜底是**最后手段**不是主力；但"编辑器兜底"被重新界定为——它只兜那一类**结构上无法自动验证**的 valid-but-wrong，不是低准确率的挡箭牌。
- 截断销毁数据、编辑器够不着，所以硬截断与"编辑器兜底"自相矛盾——这驱动了 cap 从 16 硬限改为 128 病态天花板。

### 被推翻的方案 / 决策路径
1. **DoD 修正**：原 DoD"不追求完美转录、编辑器是纠错层" → 发现该框架会纵容低准确率 → 拆两层：准确率归 Issue 2 的验收（可配样本图 eval），可渲染 + 诚实标注归 #114。
2. **errors/warnings 分界标准**：从"问题严不严重"（模糊）→ 改成"#114 检测得出它错吗？告诉 LLM 会不会改变答案？"。检测得出（不可能的 fret、对不上拍号的小节数）→ error → 值得 re-parse；检测不出（合法但可能读错的时值/技巧）→ warning → 只有人+原图能验。
3. **validity ≠ correctness**：#114 只判"合法/可渲染"（有标准答案），从不判"读得对不对"（pipeline 里无 ground truth）。这直接解释了为什么 re-parse 对时值/技巧无效——同图同模型、无新信号，第二次只是另一个独立猜测。
4. **硬截断 16 → 128**：16 是过紧的 MVP 护栏，且加错了地方——真正的炸口是 `expandRepeats` 的 `times` 无上限（可 `times: 9999`）。改法：用户真实内容不截（128 病态天花板真实导入摸不到），把上限加在 directive 层的 `times`（MAX_REPEAT_TIMES）堵住展开炸口。
5. **AI agent 产出的 QA 方法**：审计时把标准拆成"客观项（交证据 file:line/grep）"与"判断项（禁止自评，只交字面输出，判决权在人手里）"——因为判断项是同一模型检查自己的理解、误读对它自己隐形。这次正是靠这套逼出了唯一一个静默 mutation bug。

### 可深挖的追问方向
- 为什么 re-parse 不是通用准确率旋钮？（只对可检测的不可能有效）
- times 炸口为什么在 directive 层堵而非输出层截？（区分"用户给了长歌"vs"放大失控"两个不同来源）
- 如何对 AI coding agent 的自查做防伪？（交证据 vs 交结论）
- 分层 DoD 如何落到组件边界：#114 刻意不含任何准确率断言意味着什么？
