"use client";

/**
 * DEV-ONLY design-system showcase — /dev/design-system
 *
 * A static component audit for the v3 "DAW-aesthetic" design system, built
 * purely from the spec docs (FINAL_DESIGN_DIRECTION.md + fable/*.md). This is
 * NOT wired into any real feature; it exists so the v3 system can be reviewed
 * component-by-component, side-by-side, in both themes.
 *
 * Reuse policy (per task brief):
 *  - Theme mechanism: reuses the app's exact scheme — localStorage key
 *    "gp-theme" + document.documentElement.dataset.theme (see src/app/layout.tsx
 *    boot script + src/components/ThemeToggle.tsx).
 *  - Fader / Rocker / Segmented: the fingerpick refactor's v3 primitives live as
 *    LOCAL (un-exported) functions inside src/app/(main)/fingerpick/page.tsx.
 *    They cannot be imported without modifying that page (out of scope), so the
 *    exact implementations are reproduced verbatim below and clearly marked —
 *    this audits the real shared markup, not an idealised mock.
 *  - LED, BPM ghost-readout, beat clock, playhead strip: not extracted anywhere
 *    in the codebase, so minimal standalone versions are built here from spec.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// ════════════════════════════════════════════════════════════════════════════
// THEME — reuses the app's mechanism (localStorage "gp-theme" + dataset.theme)
// ════════════════════════════════════════════════════════════════════════════

type Theme = "dark" | "light";

// Must match the FOUC boot script in src/app/layout.tsx and ThemeToggle.tsx.
const THEME_STORAGE_KEY = "gp-theme";

function subscribeToTheme(onChange: () => void): () => void {
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
	return () => observer.disconnect();
}
function getTheme(): Theme {
	return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}
function getServerTheme(): Theme {
	return "dark"; // Dark is the token default on :root; boot script overrides.
}
function applyTheme(next: Theme): void {
	document.documentElement.dataset.theme = next;
	localStorage.setItem(THEME_STORAGE_KEY, next);
}
function useTheme(): Theme {
	return useSyncExternalStore(subscribeToTheme, getTheme, getServerTheme);
}

// DARK/LIGHT segmented pill (§5.6 + additional-components §2). Active segment
// uses --bg-raise + --denim-accent text (NOT denim fill — theme choice is not a
// "live" state), font 9–10px.
function ThemeSegmented(): React.JSX.Element {
	const theme = useTheme();
	return (
		<div
			role="group"
			aria-label="Switch color theme"
			className="flex border border-line-strong font-mono text-[10px] tracking-widest"
		>
			{(["dark", "light"] as const).map((t, i) => {
				const on = theme === t;
				return (
					<button
						key={t}
						type="button"
						aria-pressed={on}
						onClick={() => applyTheme(t)}
						className={`px-2.5 py-2 uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent ${
							i > 0 ? "border-l border-line-strong" : ""
						} ${on ? "bg-raise text-denim-accent" : "text-ink-faint hover:text-ink-dim"}`}
					>
						{t}
					</button>
				);
			})}
		</div>
	);
}

// ════════════════════════════════════════════════════════════════════════════
// v3 PRIMITIVES — reproduced VERBATIM from src/app/(main)/fingerpick/page.tsx
// (local un-exported Fader / Rocker / Segmented; auditing the real markup).
// ════════════════════════════════════════════════════════════════════════════

interface FaderProps {
	min: number;
	max: number;
	step: number;
	value: number;
	onValue: (value: number) => void;
	onDragStart?: () => void;
	onDragEnd?: () => void;
	ticks: number[];
	tickValues?: number[];
	tickLabels?: string[];
	scale: string[];
	disabled?: boolean;
	ariaLabel: string;
}

// Hardware fader: 3px track, denim fill, knurled 10×18 thumb, semantic ticks
// and a scale row. Draggable via pointer capture; keyboard arrows/page keys.
function Fader({
	min,
	max,
	step,
	value,
	onValue,
	onDragStart,
	onDragEnd,
	ticks,
	tickValues,
	tickLabels,
	scale,
	disabled,
	ariaLabel,
}: FaderProps): React.JSX.Element {
	const trackRef = useRef<HTMLDivElement>(null);
	const draggingRef = useRef(false);
	const [hoveredTick, setHoveredTick] = useState<number | null>(null);
	const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

	function segmentIndexAt(p: number): number | null {
		if (!tickLabels) return null;
		for (let i = 0; i < ticks.length; i++) {
			const start = i === 0 ? 0 : (ticks[i - 1] + ticks[i]) / 2;
			const end = i === ticks.length - 1 ? 100 : (ticks[i] + ticks[i + 1]) / 2;
			if (p >= start && p < end) return i;
		}
		return null;
	}
	function handleTrackMouseMove(e: React.MouseEvent<HTMLDivElement>): void {
		if (draggingRef.current || !tickLabels) return;
		const el = trackRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const p = rect.width > 0 ? ((e.clientX - rect.left) / rect.width) * 100 : 0;
		const next = segmentIndexAt(p);
		setHoveredTick((prev) => (prev === next ? prev : next));
	}
	function handleTrackMouseLeave(): void {
		setHoveredTick(null);
	}
	function snap(raw: number): number {
		const clamped = Math.min(max, Math.max(min, raw));
		const stepped = Math.round((clamped - min) / step) * step + min;
		return Math.min(max, Math.max(min, stepped));
	}
	function magnetize(raw: number): number {
		if (!tickValues) return raw;
		const threshold = (max - min) * 0.03;
		let best = raw;
		let bestDist = threshold;
		for (const tv of tickValues) {
			const d = Math.abs(raw - tv);
			if (d <= bestDist) {
				bestDist = d;
				best = tv;
			}
		}
		return best;
	}
	function valueFromClientX(clientX: number): number {
		const el = trackRef.current;
		if (!el) return value;
		const rect = el.getBoundingClientRect();
		const p = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
		return magnetize(snap(min + p * (max - min)));
	}
	function handlePointerDown(e: React.PointerEvent<HTMLDivElement>): void {
		if (disabled) return;
		draggingRef.current = true;
		setHoveredTick(null);
		e.currentTarget.setPointerCapture(e.pointerId);
		onDragStart?.();
		onValue(valueFromClientX(e.clientX));
	}
	function handlePointerMove(e: React.PointerEvent<HTMLDivElement>): void {
		if (!draggingRef.current) return;
		onValue(valueFromClientX(e.clientX));
	}
	function handlePointerUp(e: React.PointerEvent<HTMLDivElement>): void {
		if (!draggingRef.current) return;
		draggingRef.current = false;
		e.currentTarget.releasePointerCapture(e.pointerId);
		onDragEnd?.();
	}
	function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
		if (disabled) return;
		let next: number;
		switch (e.key) {
			case "ArrowLeft":
			case "ArrowDown":
				next = value - step;
				break;
			case "ArrowRight":
			case "ArrowUp":
				next = value + step;
				break;
			case "PageDown":
				next = value - step * 10;
				break;
			case "PageUp":
				next = value + step * 10;
				break;
			default:
				return;
		}
		e.preventDefault();
		onValue(snap(next));
	}

	return (
		<div className={`select-none ${disabled ? "pointer-events-none" : ""}`}>
			<div
				role="slider"
				aria-label={ariaLabel}
				aria-valuemin={min}
				aria-valuemax={max}
				aria-valuenow={Math.round(value)}
				tabIndex={disabled ? -1 : 0}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onKeyDown={handleKeyDown}
				className="relative flex h-7 cursor-ew-resize touch-none items-center select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim"
			>
				<div
					ref={trackRef}
					className="relative h-0.75 w-full touch-none select-none bg-line-strong"
					onMouseMove={handleTrackMouseMove}
					onMouseLeave={handleTrackMouseLeave}
				>
					<div
						className="absolute inset-y-0 left-0 bg-denim"
						style={{ width: `${pct}%` }}
					/>
					{hoveredTick !== null && tickLabels && (
						<div
							className="pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap bg-ink px-1.5 py-0.5 text-[10px] text-surface"
							style={{
								left: `${ticks[hoveredTick]}%`,
								bottom: "calc(100% + 10px)",
							}}
						>
							{tickLabels[hoveredTick]}
						</div>
					)}
					<div
						className="absolute top-1/2 h-4.5 w-2.5 -translate-x-1/2 -translate-y-1/2 border border-panel bg-ink"
						style={{ left: `${pct}%` }}
					>
						<span
							aria-hidden="true"
							className="absolute inset-x-0.5 inset-y-1"
							style={{
								background:
									"repeating-linear-gradient(90deg, var(--bg-panel) 0 1px, transparent 1px 3px)",
							}}
						/>
					</div>
					<div aria-hidden="true" className="absolute inset-x-0 top-full h-1.5">
						{ticks.map((t) => (
							<span
								key={t}
								className="absolute top-0.5 h-1 w-px bg-ink-faint"
								style={{ left: `${t}%` }}
							/>
						))}
					</div>
					{tickValues &&
						ticks.map((t, i) => (
							<button
								key={t}
								type="button"
								tabIndex={-1}
								aria-hidden="true"
								onPointerDown={(e) => e.stopPropagation()}
								onClick={() => onValue(tickValues[i])}
								className="absolute top-full h-2.5 w-4 -translate-x-1/2 cursor-pointer touch-none select-none focus:outline-none"
								style={{ left: `${t}%` }}
							/>
						))}
				</div>
			</div>
			<div className="mt-2 flex justify-between font-mono text-[8px] tracking-[0.08em] text-ink-faint">
				{scale.map((s, i) => (
					<span key={i}>{s}</span>
				))}
			</div>
		</div>
	);
}

interface RockerProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
	disabled?: boolean;
	ariaLabel: string;
}

// Hardware rocker switch: 40×20 bordered outer, 15×14 sliding block. A sliding
// rectangle — never a pill with a circle.
function Rocker({ checked, onChange, disabled, ariaLabel }: RockerProps): React.JSX.Element {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={ariaLabel}
			disabled={disabled}
			onClick={() => onChange(!checked)}
			className={`relative h-5 w-10 shrink-0 border transition-colors duration-100 disabled:cursor-not-allowed ${
				checked ? "border-denim" : "border-line-strong"
			}`}
		>
			<span
				aria-hidden="true"
				className={`absolute top-0.5 h-3.5 w-3.5 transition-all duration-100 ${
					checked ? "left-5 bg-denim" : "left-0.5 bg-ink-dim"
				}`}
			/>
		</button>
	);
}

interface SegmentedOption {
	value: string;
	label: string;
}
interface SegmentedProps {
	options: readonly SegmentedOption[];
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
}

// Segmented pills: hairline-bordered row, exactly one denim-filled active segment.
function Segmented({ options, value, onChange, disabled }: SegmentedProps): React.JSX.Element {
	return (
		<div className={`flex border border-line-strong ${disabled ? "pointer-events-none" : ""}`}>
			{options.map((opt, i) => {
				const on = opt.value === value;
				return (
					<button
						key={opt.value}
						type="button"
						disabled={disabled}
						onClick={() => onChange(opt.value)}
						className={`flex-1 py-1.5 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors ${
							i > 0 ? "border-l border-line-strong" : ""
						} ${on ? "bg-denim text-on-denim" : "text-ink-dim hover:text-denim"}`}
					>
						{opt.label}
					</button>
				);
			})}
		</div>
	);
}

// ════════════════════════════════════════════════════════════════════════════
// STANDALONE demo components — not in the codebase yet, built from spec.
// ════════════════════════════════════════════════════════════════════════════

// §5.11 LED — the retro signature. The ONE radius exception (round). Dormant,
// on, pulse (beats on --beat-dur), breathe (2.4s standby). aria-hidden.
type LedState = "dormant" | "on" | "pulse" | "breathe";
function Led({ state }: { state: LedState }): React.JSX.Element {
	const lit = state !== "dormant";
	const anim = state === "pulse" ? "gp-led-pulse" : state === "breathe" ? "gp-led-breathe" : "";
	return (
		<span
			aria-hidden="true"
			className={`inline-block h-1.5 w-1.5 rounded-full ${
				lit ? "bg-denim-accent" : "bg-ink-faint"
			} ${anim}`}
			style={lit ? { boxShadow: "var(--glow-led)" } : undefined}
		/>
	);
}

// §5.7 BPM numeric readout with LCD segment-ghost. Zero-padded to 3 digits,
// --denim-accent value + text-shadow glow, ghost "888" at opacity 0.09 behind.
function BpmReadout({ bpm }: { bpm: number }): React.JSX.Element {
	return (
		<div className="inline-block border border-line-strong bg-surface px-6 pt-3 pb-2 text-center">
			<span className="relative inline-block font-mono text-[44px] leading-none font-bold tracking-[-0.02em] text-denim-accent text-shadow-(--glow-readout)">
				<span aria-hidden="true" className="absolute inset-0 opacity-[0.09]">
					888
				</span>
				<span className="relative">{String(bpm).padStart(3, "0")}</span>
			</span>
			<div className="mt-1.5 font-mono text-[9px] tracking-[0.28em] text-ink-faint">BPM</div>
		</div>
	);
}

// ── Small structural helpers ────────────────────────────────────────────────

// §5.9 module-label header, extended with a spec citation for audit reference.
function Section({
	spec,
	title,
	children,
}: {
	spec: string;
	title: string;
	children: React.ReactNode;
}): React.JSX.Element {
	return (
		<section className="border-t border-line py-10">
			<div className="mb-6 flex items-baseline gap-3 font-mono text-[9px] tracking-[0.2em] text-ink-faint uppercase">
				<span className="text-denim-accent">{spec}</span>
				<span>{title}</span>
			</div>
			{children}
		</section>
	);
}

// A labelled cell so every state can be named for report-by-reference.
function StateCell({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}): React.JSX.Element {
	return (
		<div className="flex flex-col items-start gap-2">
			<span className="font-mono text-[9px] tracking-[0.18em] text-ink-faint uppercase">
				{label}
			</span>
			{children}
		</div>
	);
}

// ── Color token swatches (§2) — resolves live computed values per theme ──────

const TOKEN_GROUPS: readonly { group: string; tokens: readonly string[] }[] = [
	{ group: "Surfaces §2.1", tokens: ["--bg", "--bg-panel", "--bg-raise"] },
	{ group: "Ink §2.2", tokens: ["--ink", "--ink-dim", "--ink-faint"] },
	{ group: "Lines §2.3", tokens: ["--line", "--line-strong"] },
	{
		group: "Accent — denim §2.4",
		tokens: [
			"--denim",
			"--denim-accent",
			"--denim-tint",
			"--denim-glow",
			"--readout-glow",
			"--measure-hl",
		],
	},
	{
		group: "Utility §2.5",
		tokens: [
			"--btn-on-denim",
			"--thumb",
			"--nav-bg",
			"--backdrop",
			"--tab-line-2",
			"--tab-num-2",
		],
	},
];

// Client-only flag with no effect/setState — avoids SSR/client mismatch on the
// computed token values (getComputedStyle is unavailable during SSR).
const emptySubscribe = (): (() => void) => () => {};
function useIsClient(): boolean {
	return useSyncExternalStore(
		emptySubscribe,
		() => true,
		() => false,
	);
}

function resolveToken(name: string): string {
	if (typeof window === "undefined") return "";
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function ColorSwatch({ token, isClient }: { token: string; isClient: boolean }): React.JSX.Element {
	// Read live computed style (re-runs when the group re-mounts on theme flip).
	const value = isClient ? resolveToken(token) : "";
	return (
		<div className="flex items-center gap-3 border border-line p-2">
			<span
				className="h-10 w-10 shrink-0 border border-line-strong"
				style={{ background: `var(${token})` }}
			/>
			<span className="flex min-w-0 flex-col font-mono text-[10px] tracking-[0.04em]">
				<span className="text-ink">{token}</span>
				<span className="truncate text-ink-dim">{value || "—"}</span>
			</span>
		</div>
	);
}

// ── Buttons (§5.1 / §8) ─────────────────────────────────────────────────────

// A tiny square-cap geometric icon (stop glyph) for the icon-button demos.
function StopIcon(): React.JSX.Element {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<rect
				x="3"
				y="3"
				width="10"
				height="10"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="square"
			/>
		</svg>
	);
}

const BTN_BASE =
	"font-mono uppercase tracking-[0.08em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent";

// ── Playhead + measure highlight mock (§5.10) ───────────────────────────────

function PlayheadStrip(): React.JSX.Element {
	return (
		<div className="max-w-130">
			{/* DAW ruler (§5.10): 20px, one cell per measure, zero-padded numbers */}
			<div className="flex h-5 border-b border-line-strong">
				{["01", "02", "03", "04"].map((n, i) => (
					<span
						key={n}
						className={`flex-1 font-mono text-[9px] tracking-[0.08em] text-ink-faint ${
							i > 0 ? "border-l border-line-strong pl-1.5" : ""
						} pt-0.75`}
					>
						{n}
					</span>
				))}
			</div>
			{/* Stave + overlays */}
			<div className="relative h-28">
				{/* Measure highlight block — measure 02 (§5.10) */}
				<div
					className="absolute top-0 bottom-0"
					style={{ left: "25%", width: "25%", background: "var(--measure-hl)" }}
					aria-hidden="true"
				/>
				{/* 6-line stave SVG (.sline → --line-strong) */}
				<svg
					className="absolute inset-0 h-full w-full"
					viewBox="0 0 400 112"
					preserveAspectRatio="none"
					aria-hidden="true"
				>
					{[16, 32, 48, 64, 80, 96].map((y) => (
						<line
							key={y}
							x1="0"
							y1={y}
							x2="400"
							y2={y}
							stroke="var(--line-strong)"
							strokeWidth="1"
							vectorEffect="non-scaling-stroke"
						/>
					))}
				</svg>
				{/* Sample fret numbers (non-scaling, so mono renders crisp) */}
				<div className="pointer-events-none absolute inset-0 font-mono text-[13px]">
					<span className="absolute text-ink" style={{ left: "8%", top: 26 }}>
						0
					</span>
					<span className="absolute text-ink-dim" style={{ left: "16%", top: 58 }}>
						2
					</span>
					{/* Current note under the playhead: --denim-accent, weight 700 */}
					<span
						className="absolute font-bold text-denim-accent"
						style={{ left: "39%", top: 42 }}
					>
						3
					</span>
					<span className="absolute text-ink-dim" style={{ left: "62%", top: 74 }}>
						0
					</span>
				</div>
				{/* Playhead: 2px denim-accent, glow, downward triangle cap */}
				<div
					className="absolute top-0 bottom-0"
					style={{
						left: "40%",
						width: 2,
						background: "var(--denim-accent)",
						boxShadow: "var(--glow-playhead)",
					}}
					aria-hidden="true"
				>
					<span
						className="absolute"
						style={{
							top: -6,
							left: "50%",
							transform: "translateX(-50%)",
							width: 0,
							height: 0,
							borderLeft: "5px solid transparent",
							borderRight: "5px solid transparent",
							borderTop: "6px solid var(--denim-accent)",
						}}
					/>
				</div>
			</div>
		</div>
	);
}

// ── Typography scale (§3) ───────────────────────────────────────────────────

interface TypeRole {
	role: string;
	sample: string;
	className: string;
	style?: React.CSSProperties;
}

const TYPE_ROLES: readonly TypeRole[] = [
	{
		role: "Hero headline — mono 700, clamp(40–84px), ls −0.03em",
		sample: "Practice with intent.",
		className: "font-mono font-bold text-ink",
		style: { fontSize: "clamp(40px, 6.5vw, 84px)", lineHeight: 1.04, letterSpacing: "-0.03em" },
	},
	{
		role: "Section h2 — mono 700, clamp(26–40px), ls −0.02em",
		sample: "Every tool, one surface.",
		className: "font-mono font-bold text-ink",
		style: { fontSize: "clamp(26px, 3.4vw, 40px)", letterSpacing: "-0.02em" },
	},
	{
		role: "BPM readout — mono 700, 44px, lh 1, ls −0.02em, denim-accent + glow",
		sample: "096",
		className:
			"font-mono font-bold leading-none text-denim-accent text-shadow-(--glow-readout)",
		style: { fontSize: "44px", letterSpacing: "-0.02em" },
	},
	{
		role: "Card h3 — mono 500, 16px, ls 0.02em",
		sample: "Fingerpicking studio",
		className: "font-mono font-medium text-ink",
		style: { fontSize: "16px", letterSpacing: "0.02em" },
	},
	{
		role: "Body (landing) — sans 400, 16px, lh 1.55",
		sample: "A web practice studio for self-taught guitarists — strumming machine, fingerpicking TAB player, chord library.",
		className: "font-sans text-ink-dim max-w-[52ch]",
		style: { fontSize: "16px", lineHeight: 1.55 },
	},
	{
		role: "Body (app) — sans 400, 14px",
		sample: "Repositioned on measure transitions, exactly like the real player.",
		className: "font-sans text-ink-dim",
		style: { fontSize: "14px" },
	},
	{
		role: "Nav / buttons — mono, 12px, ls 0.08em, UPPER",
		sample: "LAUNCH GUITAR PAL",
		className: "font-mono uppercase text-ink",
		style: { fontSize: "12px", letterSpacing: "0.08em" },
	},
	{
		role: "Eyebrow / hero badge — mono, 11px, ls 0.18em, UPPER",
		sample: "// TOOLKIT",
		className: "font-mono uppercase text-denim-accent",
		style: { fontSize: "11px", letterSpacing: "0.18em" },
	},
	{
		role: "Module label — mono, 9–10px, ls 0.2em, UPPER",
		sample: "TRANSPORT",
		className: "font-mono uppercase text-ink-faint",
		style: { fontSize: "10px", letterSpacing: "0.2em" },
	},
	{
		role: "Metadata row — mono, 10–12px, ls 0.06em, UPPER",
		sample: "12 BARS · 4/4 · 96 BPM",
		className: "font-mono uppercase text-ink-faint",
		style: { fontSize: "11px", letterSpacing: "0.06em" },
	},
	{
		role: "Micro (units / scales) — mono, 8–9px, ls 0.28em, UPPER",
		sample: "BPM",
		className: "font-mono uppercase text-ink-faint",
		style: { fontSize: "9px", letterSpacing: "0.28em" },
	},
	{
		role: "TAB fret numbers — mono, 13px (700 for current note)",
		sample: "0 2 3 0",
		className: "font-mono text-ink",
		style: { fontSize: "13px" },
	},
];

// ════════════════════════════════════════════════════════════════════════════
// PAGE
// ════════════════════════════════════════════════════════════════════════════

const KEYFRAMES = `
@keyframes gp-ledpulse {
  0%, 100% { opacity: 1; box-shadow: var(--glow-led); }
  50%      { opacity: 0.4; box-shadow: var(--glow-led-dim); }
}
@keyframes gp-ledbreathe {
  0%, 100% { opacity: 1; box-shadow: var(--glow-led); }
  50%      { opacity: 0.45; box-shadow: var(--glow-led-dim); }
}
.gp-led-pulse   { animation: gp-ledpulse var(--beat-dur, 0.625s) ease-in-out infinite; }
.gp-led-breathe { animation: gp-ledbreathe 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .gp-led-pulse, .gp-led-breathe { animation: none; }
}
`;

export default function DesignSystemPage(): React.JSX.Element {
	const [bpm, setBpm] = useState(96);
	const [vol, setVol] = useState(1);
	const [rockerOff, setRockerOff] = useState(false);
	const [rockerOn, setRockerOn] = useState(true);
	const [subdivision, setSubdivision] = useState("1/8");
	const [selectedItem, setSelectedItem] = useState(1);
	const theme = useTheme();
	const isClient = useIsClient();

	// Beat clock (§6.1 / additional §3): mirror the app — write --beat-dur on every
	// BPM change so the metronome pulse LED beats on the same clock as the music.
	useEffect(() => {
		document.documentElement.style.setProperty("--beat-dur", `${60 / bpm}s`);
	}, [bpm]);

	return (
		<div className="min-h-screen bg-surface text-ink">
			<style>{KEYFRAMES}</style>

			{/* Fixed theme toggle (task item #1) */}
			<div className="fixed top-4 right-4 z-50 flex items-center gap-3 border border-line bg-panel px-3 py-2">
				<span className="font-mono text-[9px] tracking-[0.2em] text-ink-faint uppercase">
					Theme
				</span>
				<ThemeSegmented />
			</div>

			<div className="mx-auto max-w-250 px-8 pt-8 pb-24">
				{/* Page header */}
				<header className="pb-6">
					<div className="font-mono text-[11px] tracking-[0.18em] text-denim-accent uppercase">
						{"// DEV — DESIGN SYSTEM AUDIT"}
					</div>
					<h1
						className="mt-3 font-mono font-bold text-ink"
						style={{ fontSize: "clamp(28px, 4vw, 44px)", letterSpacing: "-0.02em" }}
					>
						Guitar Pal v3 component showcase
					</h1>
					<p className="mt-3 max-w-[60ch] font-sans text-[14px] text-ink-dim">
						Every documented component and state, built from the spec docs, for
						side-by-side visual audit. Toggle the theme (top-right) to check both modes.
						Section labels cite the spec § for report-by-reference.
					</p>
				</header>

				{/* §2 COLOR TOKENS */}
				<Section spec="§2" title="Color token swatches">
					{/* key={theme} re-mounts the grid on theme flip → tokens re-resolve */}
					<div key={theme} className="flex flex-col gap-6">
						{TOKEN_GROUPS.map((g) => (
							<div key={g.group}>
								<div className="mb-2 font-mono text-[9px] tracking-[0.18em] text-ink-faint uppercase">
									{g.group}
								</div>
								<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
									{g.tokens.map((t) => (
										<ColorSwatch key={t} token={t} isClient={isClient} />
									))}
								</div>
							</div>
						))}
					</div>
				</Section>

				{/* §3 TYPOGRAPHY */}
				<Section spec="§3" title="Typography scale">
					<div className="flex flex-col gap-7">
						{TYPE_ROLES.map((r) => (
							<div
								key={r.role}
								className="flex flex-col gap-2 border-b border-line pb-6 last:border-b-0"
							>
								<span className="font-mono text-[9px] tracking-[0.18em] text-ink-faint uppercase">
									{r.role}
								</span>
								<span className={r.className} style={r.style}>
									{r.sample}
								</span>
							</div>
						))}
					</div>
				</Section>

				{/* §5.1 / §8 BUTTONS */}
				<Section spec="§5.1 / §8" title="Buttons">
					<div className="flex flex-col gap-8">
						{/* Primary */}
						<div className="flex flex-wrap items-end gap-6">
							<StateCell label="Primary · default">
								<button
									type="button"
									className={`${BTN_BASE} border border-denim bg-denim px-7 py-3.5 text-[13px] text-on-denim hover:border-denim-accent hover:bg-denim-accent active:bg-denim-accent`}
								>
									Start practicing
								</button>
							</StateCell>
							<StateCell label="Primary · hover">
								<span
									className={`${BTN_BASE} border border-denim-accent bg-denim-accent px-7 py-3.5 text-[13px] text-on-denim`}
								>
									Start practicing
								</span>
							</StateCell>
							<StateCell label="Primary · active">
								<span
									className={`${BTN_BASE} border border-denim-accent bg-denim-accent px-7 py-3.5 text-[13px] text-on-denim`}
								>
									Start practicing
								</span>
							</StateCell>
						</div>
						{/* Ghost */}
						<div className="flex flex-wrap items-end gap-6">
							<StateCell label="Ghost · default">
								<button
									type="button"
									className={`${BTN_BASE} border border-line-strong bg-transparent px-7 py-3.5 text-[13px] text-ink hover:border-denim hover:text-denim-accent active:border-denim active:bg-denim-tint`}
								>
									Learn more
								</button>
							</StateCell>
							<StateCell label="Ghost · hover">
								<span
									className={`${BTN_BASE} border border-denim bg-transparent px-7 py-3.5 text-[13px] text-denim-accent`}
								>
									Learn more
								</span>
							</StateCell>
							<StateCell label="Ghost · active">
								<span
									className={`${BTN_BASE} border border-denim bg-denim-tint px-7 py-3.5 text-[13px] text-ink`}
								>
									Learn more
								</span>
							</StateCell>
						</div>
						{/* Outlined accent */}
						<div className="flex flex-wrap items-end gap-6">
							<StateCell label="Outlined accent · default">
								<button
									type="button"
									className={`${BTN_BASE} border border-denim bg-transparent px-4.5 py-2 text-[12px] text-denim-accent hover:bg-denim hover:text-on-denim active:bg-denim-tint`}
								>
									Sign in
								</button>
							</StateCell>
							<StateCell label="Outlined accent · hover">
								<span
									className={`${BTN_BASE} border border-denim bg-denim px-4.5 py-2 text-[12px] text-on-denim`}
								>
									Sign in
								</span>
							</StateCell>
							<StateCell label="Outlined accent · active">
								<span
									className={`${BTN_BASE} border border-denim bg-denim-tint px-4.5 py-2 text-[12px] text-denim-accent`}
								>
									Sign in
								</span>
							</StateCell>
						</div>
						{/* Icon button */}
						<div className="flex flex-wrap items-end gap-6">
							<StateCell label="Icon · default">
								<button
									type="button"
									aria-label="Stop"
									className="flex h-11 w-11 items-center justify-center border border-line-strong text-ink-dim transition-colors hover:border-denim hover:text-denim-accent active:border-denim active:bg-denim-tint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent"
								>
									<StopIcon />
								</button>
							</StateCell>
							<StateCell label="Icon · hover">
								<span className="flex h-11 w-11 items-center justify-center border border-denim text-denim-accent">
									<StopIcon />
								</span>
							</StateCell>
							<StateCell label="Icon · .on (latched)">
								<span className="flex h-11 w-11 items-center justify-center border border-denim text-denim-accent">
									<StopIcon />
								</span>
							</StateCell>
						</div>
					</div>
				</Section>

				{/* §5.6 SEGMENTED PILLS */}
				<Section spec="§5.6" title="Segmented pills">
					<div className="flex flex-wrap gap-10">
						<StateCell label="Subdivision (one .on)">
							<div className="w-44">
								<Segmented
									options={[
										{ value: "1/4", label: "1/4" },
										{ value: "1/8", label: "1/8" },
										{ value: "1/16", label: "1/16" },
									]}
									value={subdivision}
									onChange={setSubdivision}
								/>
							</div>
						</StateCell>
						<StateCell label="Theme variant (DARK/LIGHT)">
							<ThemeSegmented />
						</StateCell>
					</div>
				</Section>

				{/* §5.5 TOGGLE SWITCHES */}
				<Section spec="§5.5" title="Toggle switches (hardware rocker)">
					<div className="flex flex-wrap gap-10">
						<StateCell label="Off">
							<Rocker
								checked={rockerOff}
								onChange={setRockerOff}
								ariaLabel="Demo off"
							/>
						</StateCell>
						<StateCell label="On">
							<Rocker checked={rockerOn} onChange={setRockerOn} ariaLabel="Demo on" />
						</StateCell>
					</div>
				</Section>

				{/* §5.4 SLIDERS */}
				<Section spec="§5.4" title="Sliders (hardware fader)">
					<div className="flex flex-col gap-10">
						<StateCell label="BPM fader — genre ticks, snap, knurled thumb, drag/keyboard">
							<div className="w-full max-w-[320px]">
								<Fader
									min={40}
									max={220}
									step={1}
									value={bpm}
									onValue={setBpm}
									ticks={[11, 19, 28, 33, 39, 44, 50, 56, 67]}
									tickValues={[60, 75, 90, 100, 110, 120, 130, 140, 160]}
									tickLabels={[
										"Slow Practice",
										"Folk",
										"Ballad",
										"Pop / Blues",
										"Funk",
										"Pop / Rock",
										"Rock",
										"Jazz / Hard Rock",
										"Fast Rock",
									]}
									scale={["40", "130", "220"]}
									ariaLabel="Tempo in BPM"
								/>
							</div>
						</StateCell>
						<StateCell label="Volume fader — 0/25/50/75/100% ticks">
							<div className="w-full max-w-[320px]">
								<Fader
									min={0}
									max={2}
									step={0.01}
									value={vol}
									onValue={setVol}
									ticks={[0, 25, 50, 75, 100]}
									tickValues={[0, 0.5, 1, 1.5, 2]}
									scale={["0", "100", "200"]}
									ariaLabel="Volume"
								/>
							</div>
						</StateCell>
					</div>
				</Section>

				{/* §5.11 LEDs */}
				<Section spec="§5.11" title="LEDs (the retro signature)">
					<div className="flex flex-wrap gap-10">
						<StateCell label="Dormant">
							<Led state="dormant" />
						</StateCell>
						<StateCell label="On">
							<Led state="on" />
						</StateCell>
						<StateCell label={`Pulse (beats on --beat-dur = ${bpm} BPM)`}>
							<Led state="pulse" />
						</StateCell>
						<StateCell label="Breathe (2.4s standby)">
							<Led state="breathe" />
						</StateCell>
					</div>
					<div className="mt-6 font-mono text-[9px] tracking-[0.06em] text-ink-faint uppercase">
						Placement example (§5.9 module label with LED):
					</div>
					<div className="mt-2 flex max-w-65 items-center justify-between border border-line bg-panel px-4 py-3 font-mono text-[9px] tracking-[0.2em] text-ink-faint uppercase">
						<span className="inline-flex items-center gap-1.5">
							<Led state="pulse" />
							Metronome
						</span>
						<span>{Math.round(vol * 100)}%</span>
					</div>
				</Section>

				{/* §5.7 BPM READOUT */}
				<Section spec="§5.7" title="Numeric readout (BPM) with LCD ghost">
					<div className="flex flex-wrap items-start gap-8">
						<BpmReadout bpm={bpm} />
						<StateCell label="Steppers drive the readout + beat clock">
							<div className="flex gap-2">
								{[
									{ label: "−10", delta: -10 },
									{ label: "−1", delta: -1 },
									{ label: "+1", delta: 1 },
									{ label: "+10", delta: 10 },
								].map(({ label, delta }) => (
									<button
										key={label}
										type="button"
										onClick={() =>
											setBpm((b) => Math.max(40, Math.min(220, b + delta)))
										}
										className="border border-line-strong px-3 py-1.5 font-mono text-[11px] text-ink-dim transition-colors hover:border-denim hover:text-denim active:bg-denim-tint"
									>
										{label}
									</button>
								))}
							</div>
						</StateCell>
					</div>
				</Section>

				{/* §5.3 LIST ITEMS */}
				<Section spec="§5.3" title="List items (pattern library)">
					<div className="max-w-70 border border-line bg-panel">
						{[
							{
								id: 0,
								title: "Travis picking",
								meta: "12 BARS · 4/4 · 96 BPM",
								fav: true,
							},
							{
								id: 1,
								title: "Waltz arpeggio",
								meta: "8 BARS · 3/4 · 120 BPM",
								fav: false,
							},
							{
								id: 2,
								title: "Clawhammer roll",
								meta: "16 BARS · 4/4 · 84 BPM",
								fav: false,
							},
						].map((item) => {
							const selected = item.id === selectedItem;
							return (
								<button
									key={item.id}
									type="button"
									onClick={() => setSelectedItem(item.id)}
									className={`flex w-full flex-col border-b border-line px-3.5 py-2.5 text-left transition-colors last:border-b-0 ${
										selected
											? "border-l-2 border-l-denim bg-denim-tint"
											: "border-l-2 border-l-transparent hover:bg-raise"
									}`}
								>
									<span className="flex items-baseline justify-between">
										<span
											className={`font-sans text-[13px] font-medium ${
												selected ? "text-denim-accent" : "text-ink"
											}`}
										>
											{item.title}
										</span>
										<span
											className={`text-[11px] ${
												item.fav ? "text-denim-accent" : "text-ink-faint"
											}`}
										>
											{item.fav ? "★" : "☆"}
										</span>
									</span>
									<span className="mt-1 font-mono text-[10px] tracking-[0.06em] text-ink-faint uppercase">
										{item.meta}
									</span>
								</button>
							);
						})}
					</div>
					<p className="mt-3 font-mono text-[9px] tracking-[0.06em] text-ink-faint uppercase">
						Default · hover (row 3) · selected/active (row highlighted)
					</p>
				</Section>

				{/* §5.2 CARDS / GRID */}
				<Section spec="§5.2" title="Cards / hairline grid">
					<div className="grid grid-cols-1 border border-line sm:grid-cols-3">
						{[
							{
								tag: "TOOL_01",
								h: "Strumming",
								body: "Programmable rhythm machine with real guitar samples.",
							},
							{
								tag: "TOOL_02",
								h: "Fingerpicking",
								body: "TAB player with a live playback cursor.",
							},
							{
								tag: "TOOL_03",
								h: "Chords",
								body: "2,000+ chord voicings, browsable by root.",
							},
						].map((c, i) => (
							<div
								key={c.tag}
								className={`group relative bg-surface p-8 pb-12 transition-colors hover:bg-raise ${
									i < 2 ? "border-b border-line sm:border-r sm:border-b-0" : ""
								}`}
							>
								<span className="absolute top-4 right-4 flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-ink-faint uppercase">
									{/* dormant LED that lights on card hover (§5.2 / §5.11) */}
									<span
										aria-hidden="true"
										className="inline-block h-1.5 w-1.5 rounded-full bg-ink-faint transition-all group-hover:bg-denim-accent"
										style={{ boxShadow: "none" }}
									/>
									{c.tag}
								</span>
								<div className="mb-7 flex h-12 w-12 items-center justify-center border border-line-strong transition-colors group-hover:border-denim">
									<StopIcon />
								</div>
								<h3 className="mb-3 font-mono text-[16px] font-medium tracking-[0.02em] text-ink">
									{c.h}
								</h3>
								<p className="font-sans text-[14px] text-ink-dim">{c.body}</p>
							</div>
						))}
					</div>
					<p className="mt-3 font-mono text-[9px] tracking-[0.06em] text-ink-faint uppercase">
						Hover a card — LED lights, icon-box border → denim, surface → --bg-raise
					</p>
				</Section>

				{/* §5.8 TEXT INPUTS */}
				<Section spec="§5.8" title="Text inputs">
					<div className="flex flex-col gap-6">
						<StateCell label="With value">
							<input
								type="text"
								defaultValue="Travis picking"
								className="w-70 border border-line-strong bg-surface px-2.5 py-1.5 font-mono text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent"
							/>
						</StateCell>
						<StateCell label="Placeholder (terminal '>' affordance)">
							<input
								type="text"
								placeholder="> filter patterns…"
								className="w-70 border border-line-strong bg-surface px-2.5 py-1.5 font-mono text-[12px] text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent"
							/>
						</StateCell>
					</div>
				</Section>

				{/* §5.10 PLAYHEAD + MEASURE HIGHLIGHT */}
				<Section spec="§5.10" title="Playhead + measure highlight (mock TAB strip)">
					<PlayheadStrip />
					<p className="mt-3 font-mono text-[9px] tracking-[0.06em] text-ink-faint uppercase">
						Playhead: 2px denim-accent + glow + triangle cap · measure 02 highlighted ·
						current note (3) in denim-accent 700
					</p>
				</Section>
			</div>
		</div>
	);
}
