"use client";

/**
 * DEV-ONLY page — /dev/tab-json (not linked from any nav).
 *
 * Inspect tab JSON as rendered notation. Supports the #115 tab-import work:
 * paste a vision model's raw output and see what it actually renders as, plus
 * the errors/warnings the import pipeline produces along the way.
 *
 * Two sections:
 *   1. Read-only reference samples (FingerpickPattern JSON ↔ notation).
 *   2. Interactive: paste JSON, pick an interpretation mode, render.
 *
 * The greedy-wrap + stretch-to-fill layout is a deliberately duplicated,
 * simplified copy of the one in fingerpick/page.tsx — per the task, that file is
 * under active work elsewhere and must not be refactored to share this.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import FingerpickEditModal from "@/components/fingerpick/FingerpickEditModal";
import TabStaveRow, {
  computeMeasureMinWidth,
  CLEF_WIDTH,
} from "@/components/fingerpick/TabStaveRow";
import { fingerpickToVexFlow, VEX_DURATION } from "@/lib/fingerpickToVexFlow";
import type {
  FingerpickPattern,
  Measure,
  StringFret,
} from "@/lib/fingerpickTypes";
import { draftFromToolOutput } from "@/lib/tabImport/draftFromToolOutput";
import { normalizeImportedPattern } from "@/lib/tabImport/normalizeImportedPattern";
import type { VisionToolOutput } from "@/lib/tabImport/visionToolSchema";
import type { ValidationIssue } from "@/lib/tabImport/types";

// ── StringFret builders (samples only) ──────────────────────────────────────
// String index: [e(high), B, G, D, A, E(low)] = [0, 1, 2, 3, 4, 5]

const s = (): StringFret => ({
  fret: null,
  technique: null,
  tied: false,
  muted: false,
});
const n = (fret: number): StringFret => ({
  fret,
  technique: null,
  tied: false,
  muted: false,
});
const ho = (fret: number): StringFret => ({
  fret,
  technique: "hammer-on",
  tied: false,
  muted: false,
});
const po = (fret: number): StringFret => ({
  fret,
  technique: "pull-off",
  tied: false,
  muted: false,
});
const tie = (fret: number): StringFret => ({
  fret,
  technique: null,
  tied: true,
  muted: false,
});
const mute = (): StringFret => ({
  fret: null,
  technique: null,
  tied: false,
  muted: true,
});

// ── Reference samples ───────────────────────────────────────────────────────

const SAMPLE_BASIC: FingerpickPattern = {
  id: "sample-basic",
  name: "Basic Arpeggio",
  description: "Four quarter notes climbing E → G → B → e.",
  bpm: 80,
  timeSignature: [4, 4],
  measures: [
    {
      id: "b-m1",
      slots: [
        {
          id: "b1",
          duration: "quarter",
          strings: [s(), s(), s(), s(), s(), n(0)],
        },
        {
          id: "b2",
          duration: "quarter",
          strings: [s(), s(), n(0), s(), s(), s()],
        },
        {
          id: "b3",
          duration: "quarter",
          strings: [s(), n(0), s(), s(), s(), s()],
        },
        {
          id: "b4",
          duration: "quarter",
          strings: [n(0), s(), s(), s(), s(), s()],
        },
      ],
    },
  ],
};

// Multi-measure sample exercising: mixed durations (quarter / eighth / half /
// dotted-quarter / rest), a hammer-on technique, a tie, and a muted note.
const SAMPLE_MIXED: FingerpickPattern = {
  id: "sample-mixed",
  name: "Mixed Techniques",
  description: "Two measures: hammer-on, tie, muted note, and mixed rhythms.",
  bpm: 96,
  timeSignature: [4, 4],
  measures: [
    {
      id: "x-m1",
      slots: [
        // A-bass + open G together (1 beat)
        {
          id: "x1",
          duration: "quarter",
          strings: [s(), s(), n(0), s(), n(0), s()],
        },
        // hammer-on 0→2 on the G string (½ beat)
        {
          id: "x2",
          duration: "eighth",
          strings: [s(), s(), ho(2), s(), s(), s()],
        },
        // B string fret 1 (½ beat)
        {
          id: "x3",
          duration: "eighth",
          strings: [s(), n(1), s(), s(), s(), s()],
        },
        // high e ringing out (2 beats)
        {
          id: "x4",
          duration: "half",
          strings: [n(0), s(), s(), s(), s(), s()],
        },
      ],
    },
    {
      id: "x-m2",
      slots: [
        // muted high e (dead note) over open D (1 beat)
        {
          id: "x5",
          duration: "quarter",
          strings: [mute(), s(), s(), n(0), s(), s()],
        },
        // B fret 1 held (1.5 beats)
        {
          id: "x6",
          duration: "dotted-quarter",
          strings: [s(), n(1), s(), s(), s(), s()],
        },
        // tie the B fret 1 forward (0.5 beat)
        {
          id: "x7",
          duration: "eighth",
          strings: [s(), tie(1), s(), s(), s(), s()],
        },
        // closing rest (1 beat)
        { id: "x8", duration: "rest", strings: [s(), s(), s(), s(), s(), s()] },
      ],
    },
  ],
};

const SAMPLE_PULLOFF: FingerpickPattern = {
  id: "sample-pulloff",
  name: "Pull-off Lick",
  description: "Single measure with a pull-off on the high e string.",
  bpm: 100,
  timeSignature: [4, 4],
  measures: [
    {
      id: "p-m1",
      slots: [
        {
          id: "p1",
          duration: "quarter",
          strings: [n(5), s(), s(), s(), s(), s()],
        },
        {
          id: "p2",
          duration: "quarter",
          strings: [po(3), s(), s(), s(), s(), s()],
        },
        {
          id: "p3",
          duration: "quarter",
          strings: [po(0), s(), s(), s(), s(), s()],
        },
        {
          id: "p4",
          duration: "quarter",
          strings: [s(), n(1), s(), s(), s(), s()],
        },
      ],
    },
  ],
};

const SAMPLES: FingerpickPattern[] = [
  SAMPLE_BASIC,
  SAMPLE_MIXED,
  SAMPLE_PULLOFF,
];

// A vision-tool-output example that exercises the interesting warning paths:
// a low-confidence note, a technique+tied conflict, and a repeat directive.
const VISION_EXAMPLE = `{
  "notation": "standard",
  "timeSignature": [4, 4],
  "name": "Imported Riff",
  "bpm": 90,
  "measures": [
    { "slots": [
      { "duration": "quarter", "notes": [{ "string": 5, "fret": 0 }, { "string": 2, "fret": 0 }] },
      { "duration": "eighth", "notes": [{ "string": 2, "fret": 2, "technique": "hammer-on" }] },
      { "duration": "eighth", "notes": [{ "string": 1, "fret": 1, "confidence": "low", "note": "smudged fret number" }] },
      { "duration": "half", "notes": [{ "string": 0, "fret": 0, "technique": "pull-off", "tied": true }] }
    ] },
    { "slots": [
      { "duration": "quarter", "notes": [{ "string": 0, "fret": "x" }] },
      { "duration": "quarter", "notes": [{ "string": 1, "fret": 3 }] }
    ] }
  ],
  "repeats": [{ "range": [0, 1], "times": 2 }]
}`;

// ── Layout (simplified copy of fingerpick/page.tsx) ──────────────────────────

const ROW_TRAILING_PAD = 15;

function hoPoConnectorCount(measure: Measure): number {
  return measure.slots.reduce(
    (count, slot) =>
      count +
      slot.strings.filter(
        (sf) => sf.technique === "hammer-on" || sf.technique === "pull-off",
      ).length,
    0,
  );
}

// Greedy row packer: min widths drive wrapping, each row stretched to fill.
function computeAllMeasureWidths(
  measures: Measure[],
  containerWidth: number,
): number[][] {
  const renderData = measures.map((m) => fingerpickToVexFlow(m));
  const staveSpace = containerWidth - CLEF_WIDTH - ROW_TRAILING_PAD;
  const widthsFirst = renderData.map((rd, i) =>
    computeMeasureMinWidth(rd.notes, true, hoPoConnectorCount(measures[i])),
  );
  const widthsNonFirst = renderData.map((rd, i) =>
    computeMeasureMinWidth(rd.notes, false, hoPoConnectorCount(measures[i])),
  );

  const rows: number[][] = [];
  let i = 0;
  while (i < measures.length) {
    const rowWidths: number[] = [widthsFirst[i]];
    let rowWidth = widthsFirst[i];
    i++;
    while (i < measures.length) {
      const w = widthsNonFirst[i];
      if (rowWidth + w > staveSpace) break;
      rowWidths.push(w);
      rowWidth += w;
      i++;
    }
    const scale = staveSpace / rowWidth;
    rows.push(rowWidths.map((w) => w * scale));
  }
  return rows;
}

// ── Shape guard ──────────────────────────────────────────────────────────────
// Minimal structural check that prevents fingerpickToVexFlow / TabStaveRow from
// throwing on malformed input. Not a full validator — just the crash vectors.

function measuresRenderable(x: unknown): x is Measure[] {
  if (!Array.isArray(x)) return false;
  return x.every((m) => {
    if (!m || typeof m !== "object") return false;
    const slots = (m as { slots?: unknown }).slots;
    if (!Array.isArray(slots)) return false;
    return slots.every((sl) => {
      if (!sl || typeof sl !== "object") return false;
      const slot = sl as { duration?: unknown; strings?: unknown };
      if (typeof slot.duration !== "string" || !(slot.duration in VEX_DURATION))
        return false;
      if (!Array.isArray(slot.strings) || slot.strings.length !== 6)
        return false;
      return slot.strings.every((sf) => sf !== null && typeof sf === "object");
    });
  });
}

// Stricter guard for section 3: the editor modal reads name / bpm / timeSignature
// / measures off the pattern directly (clonePatternForEdit is a plain
// structuredClone with no normalization), so a bare measures array or a vision
// tool output — which pass neither this nor the modal — must be rejected before
// opening. measuresRenderable covers the slot/string shape; this adds the
// metadata the modal needs to render its header and grid.
function isFingerpickPattern(x: unknown): x is FingerpickPattern {
  if (!x || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  if (typeof p.name !== "string" || typeof p.bpm !== "number") return false;
  const ts = p.timeSignature;
  if (
    !Array.isArray(ts) ||
    ts.length !== 2 ||
    typeof ts[0] !== "number" ||
    typeof ts[1] !== "number"
  )
    return false;
  return measuresRenderable(p.measures);
}

// ── Notation renderer ────────────────────────────────────────────────────────

function PatternRender({ measures }: { measures: Measure[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const rows = useMemo(() => {
    if (width === 0 || measures.length === 0) return [];
    const widthRows = computeAllMeasureWidths(measures, width);
    let offset = 0;
    return widthRows.map((rowWidths) => {
      const start = offset;
      const rowMeasures = measures.slice(start, start + rowWidths.length);
      offset += rowWidths.length;
      return {
        measures: rowMeasures,
        startMeasureNumber: start + 1,
        widths: rowWidths,
      };
    });
  }, [measures, width]);

  return (
    <div
      ref={ref}
      className="w-full bg-workspace rounded-md border border-line px-2 py-1"
    >
      {measures.length === 0 ? (
        <p className="px-2 py-6 text-center text-xs text-ink-faint">
          Nothing to render.
        </p>
      ) : (
        rows.map((row) => (
          <TabStaveRow
            key={row.measures[0].id}
            measures={row.measures}
            startMeasureNumber={row.startMeasureNumber}
            measureWidths={row.widths}
          />
        ))
      )}
    </div>
  );
}

// ── Warning / error presentation ─────────────────────────────────────────────

function IssueList({
  issues,
  tone,
}: {
  issues: ValidationIssue[];
  tone: "error" | "warn";
}) {
  const badge =
    tone === "error"
      ? "border-destructive/50 bg-destructive/10 text-destructive"
      : "border-favorite-active/60 bg-favorite-active/10 text-ink";
  return (
    <ul className="flex flex-col gap-1.5">
      {issues.map((issue, i) => (
        <li
          key={`${issue.code}-${issue.path}-${i}`}
          className={`rounded-md border px-3 py-2 text-xs ${badge}`}
        >
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-semibold tracking-wide uppercase">
              {issue.code}
            </span>
            <code className="text-[10px] text-ink-dim">{issue.path}</code>
          </div>
          <p className="mt-1 leading-snug text-ink">{issue.message}</p>
        </li>
      ))}
    </ul>
  );
}

// ── Interactive convert result ────────────────────────────────────────────────

type ConvertState = {
  measures: Measure[] | null;
  vision: {
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    truncated: boolean;
    unsupportedNotation: "chord-framed" | "unknown" | null;
  } | null;
  error: string | null;
};

type Mode = "pattern" | "vision";

export default function TabJsonDevPage() {
  const [input, setInput] = useState(VISION_EXAMPLE);
  const [mode, setMode] = useState<Mode>("vision");
  const [state, setState] = useState<ConvertState>({
    measures: null,
    vision: null,
    error: null,
  });

  // ── Section 3: author via the real editor modal ────────────────────────────
  // The saved pattern lives only in local state — this page persists nothing.
  const [savedPattern, setSavedPattern] = useState<FingerpickPattern | null>(
    null,
  );
  const [modalOpen, setModalOpen] = useState(false);
  // What the modal opens with: null = new pattern, otherwise the seed to edit.
  const [modalSeed, setModalSeed] = useState<FingerpickPattern | null>(null);
  const [copied, setCopied] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null)
        window.clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  function openNewPattern() {
    setLoadError(null);
    setModalSeed(null);
    setModalOpen(true);
  }

  function openEditPattern() {
    if (!savedPattern) return;
    setLoadError(null);
    setModalSeed(savedPattern);
    setModalOpen(true);
  }

  // Take whatever JSON is in section 2's textarea, parse it as a full
  // FingerpickPattern, and open the modal seeded with it — so a vision model's
  // output can be pasted there, hand-corrected here, and exported as ground
  // truth. Anything that isn't a renderable pattern is rejected inline.
  function loadFromSection2() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch (err) {
      setLoadError(
        `Malformed JSON in section 2: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    if (!isFingerpickPattern(parsed)) {
      setLoadError(
        "Section 2 JSON is not a full FingerpickPattern (need name, bpm, timeSignature, and a renderable `measures` array). Vision tool output and bare measures arrays can't seed the editor.",
      );
      return;
    }
    setLoadError(null);
    setModalSeed(parsed);
    setModalOpen(true);
  }

  function handlePatternSave(pattern: FingerpickPattern) {
    setSavedPattern(pattern);
  }

  function handleCopyPattern() {
    if (!savedPattern) return;
    void navigator.clipboard
      .writeText(JSON.stringify(savedPattern, null, 2))
      .then(() => {
        setCopied(true);
        if (copyTimeoutRef.current !== null)
          window.clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = window.setTimeout(
          () => setCopied(false),
          1500,
        );
      });
  }

  function handleConvert() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch (err) {
      // Malformed JSON — leave the previous render untouched.
      setState((prev) => ({
        ...prev,
        error: `Malformed JSON: ${err instanceof Error ? err.message : String(err)}`,
      }));
      return;
    }

    if (mode === "pattern") {
      // Accept either a bare measures array or a full FingerpickPattern object.
      const candidate =
        parsed && typeof parsed === "object" && "measures" in parsed
          ? (parsed as { measures: unknown }).measures
          : parsed;
      if (!measuresRenderable(candidate)) {
        setState((prev) => ({
          ...prev,
          error:
            "Parsed JSON is not a renderable FingerpickPattern (need a `measures` array of slots with a valid `duration` and 6 `strings`).",
        }));
        return;
      }
      setState({ measures: candidate, vision: null, error: null });
      return;
    }

    // Vision mode: run the real import bridge, then normalization.
    try {
      const draft = draftFromToolOutput(parsed as VisionToolOutput);
      const result = normalizeImportedPattern(
        draft.raw,
        draft.repeats,
        draft.modelWarnings,
      );
      setState({
        measures:
          result.pattern && measuresRenderable(result.pattern.measures)
            ? result.pattern.measures
            : null,
        vision: {
          errors: result.errors,
          warnings: result.warnings,
          truncated: result.truncated,
          unsupportedNotation: draft.unsupportedNotation,
        },
        error: null,
      });
    } catch (err) {
      // Parsed but not a valid VisionToolOutput shape — don't crash.
      setState((prev) => ({
        ...prev,
        error: `Parsed JSON is not valid Vision tool output: ${
          err instanceof Error ? err.message : String(err)
        }`,
      }));
    }
  }

  const vision = state.vision;

  return (
    <>
      <div className="min-h-screen bg-workspace text-ink">
        <div className="mx-auto max-w-6xl p-6 font-mono">
          <h1 className="text-xl font-bold">
            Tab JSON Dev — Inspect &amp; Render
          </h1>
          <p className="mt-1 mb-8 text-xs text-ink-dim">
            Paste tab JSON, see what it renders as. Reference samples below;
            interactive converter (incl. the real vision-import pipeline) at the
            bottom. Throwaway dev page for #115 — not linked from any nav.
          </p>

          {/* ── Section 1: reference samples ─────────────────────────────── */}
          <h2 className="mb-4 text-xs font-semibold tracking-[0.2em] text-denim uppercase">
            1 · Reference Samples
          </h2>
          <div className="flex flex-col gap-6">
            {SAMPLES.map((pattern) => (
              <section
                key={pattern.id}
                className="rounded-lg border border-line bg-panel p-4"
              >
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-ink">
                    {pattern.name}
                  </h3>
                  {pattern.description && (
                    <p className="text-xs text-ink-dim">
                      {pattern.description}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <pre className="max-h-96 overflow-auto rounded-md border border-line bg-workspace p-3 text-[11px] leading-relaxed text-ink-dim">
                    {JSON.stringify(pattern, null, 2)}
                  </pre>
                  <PatternRender measures={pattern.measures} />
                </div>
              </section>
            ))}
          </div>

          {/* ── Section 2: interactive ───────────────────────────────────── */}
          <h2 className="mt-12 mb-4 text-xs font-semibold tracking-[0.2em] text-denim uppercase">
            2 · Interactive Converter
          </h2>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex border border-line-strong">
              {(
                [
                  { value: "pattern", label: "FingerpickPattern" },
                  { value: "vision", label: "Vision tool output" },
                ] as const
              ).map((opt, i) => {
                const on = opt.value === mode;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMode(opt.value)}
                    className={`px-3 py-1.5 text-[11px] tracking-[0.06em] uppercase transition-colors ${
                      i > 0 ? "border-l border-line-strong" : ""
                    } ${on ? "bg-denim text-on-denim" : "text-ink-dim hover:text-denim"}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={handleConvert}
              className="border border-denim bg-denim px-4 py-1.5 text-[11px] tracking-[0.06em] text-on-denim uppercase transition-colors hover:bg-denim-accent"
            >
              Convert
            </button>
            <span className="text-[11px] text-ink-faint">
              {mode === "vision"
                ? "Runs draftFromToolOutput → normalizeImportedPattern → render."
                : "Parses and renders the pattern directly."}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              className="h-96 w-full resize-y rounded-md border border-line bg-workspace p-3 text-[11px] leading-relaxed text-ink focus:border-denim focus:outline-none"
            />
            <div className="flex flex-col gap-3">
              <PatternRender measures={state.measures ?? []} />

              {state.error && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {state.error}
                </div>
              )}

              {vision && (
                <div className="flex flex-col gap-3 rounded-md border border-line bg-panel p-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-dim">
                    <span>
                      truncated:{" "}
                      <span
                        className={
                          vision.truncated ? "text-destructive" : "text-ink"
                        }
                      >
                        {String(vision.truncated)}
                      </span>
                    </span>
                    {vision.unsupportedNotation && (
                      <span className="text-destructive">
                        unsupportedNotation: {vision.unsupportedNotation}{" "}
                        (bridge short-circuited — nothing to render)
                      </span>
                    )}
                  </div>

                  <div>
                    <h4 className="mb-1.5 text-[10px] font-semibold tracking-[0.2em] text-denim uppercase">
                      Errors ({vision.errors.length})
                    </h4>
                    {vision.errors.length === 0 ? (
                      <p className="text-xs text-ink-faint">None.</p>
                    ) : (
                      <IssueList issues={vision.errors} tone="error" />
                    )}
                  </div>

                  <div>
                    <h4 className="mb-1.5 text-[10px] font-semibold tracking-[0.2em] text-denim uppercase">
                      Warnings ({vision.warnings.length})
                    </h4>
                    {vision.warnings.length === 0 ? (
                      <p className="text-xs text-ink-faint">None.</p>
                    ) : (
                      <IssueList issues={vision.warnings} tone="warn" />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Section 3: author via editor ───────────── */}
          <h2 className="mt-12 mb-4 text-xs font-semibold tracking-[0.2em] text-denim uppercase">
            3 · Author via Editor
          </h2>
          <p className="mb-4 text-[11px] text-ink-dim">
            Transcribe a tab image by hand in the real editor modal; the
            exported JSON is the ground-truth reference the vision model is
            scored against. Copy JSON round-trips into section 2&apos;s
            FingerpickPattern mode.
          </p>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={openNewPattern}
              className="border border-denim bg-denim px-4 py-1.5 text-[11px] tracking-[0.06em] text-on-denim uppercase transition-colors hover:bg-denim-accent"
            >
              New pattern
            </button>
            <button
              type="button"
              onClick={openEditPattern}
              disabled={!savedPattern}
              className="border border-line-strong px-4 py-1.5 text-[11px] tracking-[0.06em] text-ink-dim uppercase transition-colors hover:text-denim disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-ink-dim"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={handleCopyPattern}
              disabled={!savedPattern}
              className="border border-line-strong px-4 py-1.5 text-[11px] tracking-[0.06em] text-ink-dim uppercase transition-colors hover:text-denim disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-ink-dim"
            >
              {copied ? "Copied ✓" : "Copy JSON"}
            </button>
            <button
              type="button"
              onClick={loadFromSection2}
              className="border border-line-strong px-4 py-1.5 text-[11px] tracking-[0.06em] text-ink-dim uppercase transition-colors hover:text-denim"
            >
              Load from section 2 input
            </button>
          </div>

          {loadError && (
            <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {loadError}
            </div>
          )}

          {savedPattern ? (
            <section className="rounded-lg border border-line bg-panel p-4">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-ink">
                  {savedPattern.name}
                </h3>
                {savedPattern.description && (
                  <p className="text-xs text-ink-dim">
                    {savedPattern.description}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <pre className="max-h-96 overflow-auto rounded-md border border-line bg-workspace p-3 text-[11px] leading-relaxed text-ink-dim">
                  {JSON.stringify(savedPattern, null, 2)}
                </pre>
                <PatternRender measures={savedPattern.measures} />
              </div>
            </section>
          ) : (
            <p className="rounded-md border border-line bg-panel px-3 py-6 text-center text-xs text-ink-faint">
              No pattern yet — start with &ldquo;New pattern&rdquo;, or load
              section 2&apos;s JSON to correct it by hand.
            </p>
          )}
        </div>
      </div>

      <FingerpickEditModal
        open={modalOpen}
        pattern={modalSeed}
        onClose={() => setModalOpen(false)}
        onSave={handlePatternSave}
      />
    </>
  );
}
