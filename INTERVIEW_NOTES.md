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
