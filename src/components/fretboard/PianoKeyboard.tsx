"use client";

/**
 * A piano keyboard as a radio group: one key per note, the selected pitch
 * class lit on every key that sounds it. Built from HTML buttons rather than
 * SVG so focus, keyboard operation and `role="radio"` come for free and match
 * the button grid it replaces; the black keys are simply positioned over the
 * white ones.
 *
 * Sizing follows `<Fretboard/>`: the white keys share the container's width
 * down to a floor that keeps them tappable, and below that the keyboard
 * scrolls, with the selected root scrolled into view.
 *
 * A `range` (the guitar's E2–D6) is drawn as a band under the keys; keys
 * outside it are dimmed but still select a root, since a root is a pitch
 * class and every octave of it is the same choice.
 *
 * The keyboard can also follow the fretboard: `highlight(midi)` rings the key
 * that sounds exactly that pitch (and, fainter, its other octaves) and
 * `strike(midi)` flashes a key that just sounded. Both are imperative, on the
 * DOM, so a hover on the neck never re-renders anything.
 */
import {
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	type KeyboardEvent as ReactKeyboardEvent,
	type Ref,
} from "react";

import MusicalText from "@/components/MusicalText";
import { prefersReducedMotion } from "@/lib/motion";
import { keyLabel, pianoKeys, type PianoKey, type PianoRange } from "@/lib/piano/keys";

/** Narrowest a white key gets before the keyboard scrolls instead. */
const MIN_WHITE_W = 22;
const WHITE_H = 76;
const BLACK_H = 46;
/** Black key width as a share of a white key. */
const BLACK_W = 0.62;
const BAND_H = 18;
/** How long a struck key stays flashed; matches the CSS animation. */
const STRIKE_MS = 300;

export interface PianoKeyboardHandle {
	/** Ring the key sounding `midi` (and its octaves, fainter); null clears. */
	highlight: (midi: number | null) => void;
	/** Flash the key sounding `midi` once, the way a played key dips. */
	strike: (midi: number) => void;
}

export interface PianoKeyboardProps {
	ref?: Ref<PianoKeyboardHandle>;
	keys?: PianoRange;
	/** 0..11; every key of this pitch class shows selected. */
	selectedPitchClass: number;
	/** Keys outside it are dimmed; drawn as a labelled band under the keyboard. */
	range?: PianoRange;
	/** The key that was pressed or chosen with the keyboard. */
	onSelect: (midi: number) => void;
	/**
	 * What a key prints. Default: its name when selected, "C<octave>" on each
	 * C, nothing otherwise. Chords mode prints numerals instead.
	 */
	labelFor?: (key: PianoKey, selected: boolean) => string;
	/** Keys to grey out (still pressable), beyond those outside `range`. */
	dimmed?: (key: PianoKey) => boolean;
	/** Pitch classes to tint as members of the current chord (the root stays `selected`). */
	tonePitchClasses?: readonly number[];
	ariaLabel?: string;
	className?: string;
}

export default function PianoKeyboard({
	ref,
	keys: keysRange,
	selectedPitchClass,
	range,
	onSelect,
	labelFor,
	dimmed,
	tonePitchClasses,
	ariaLabel = "Scale root",
	className,
}: PianoKeyboardProps) {
	const scroller = useRef<HTMLDivElement>(null);
	const board = useRef<HTMLDivElement>(null);
	/** Keys carrying `data-hover`, so clearing touches exactly those. */
	const highlighted = useRef<HTMLElement[]>([]);
	/** Strike timers per key, so a re-strike restarts instead of stacking. */
	const strikes = useRef(new Map<number, ReturnType<typeof setTimeout>>());
	const keys = pianoKeys(keysRange ?? { fromMidi: 36, toMidi: 96 });
	const whites = keys.filter((k) => !k.isBlack).length;
	const whiteW = `calc(100% / ${whites})`;
	const inRange = (midi: number) => !range || (midi >= range.fromMidi && midi <= range.toMidi);
	const isSelected = (key: PianoKey) => key.pitchClass === selectedPitchClass;
	/** The one key tab lands on: the lowest selected key inside the range. */
	const focusMidi =
		keys.find((k) => isSelected(k) && inRange(k.midi))?.midi ?? keys.find(isSelected)?.midi ?? keys[0].midi;

	// Bring the selected root into view, on mount and whenever it changes.
	useEffect(() => {
		const el = scroller.current;
		const key = board.current?.querySelector<HTMLElement>(`[data-midi="${focusMidi}"]`);
		// jsdom has no scrollTo on elements; the scroll is a convenience anyway.
		if (!el || !key || typeof el.scrollTo !== "function") return;
		const left = key.offsetLeft + key.offsetWidth / 2 - el.clientWidth / 2;
		el.scrollTo({ left: Math.max(0, left), behavior: prefersReducedMotion() ? "auto" : "smooth" });
	}, [focusMidi]);

	// Constraint 4: no timer may outlive the keyboard.
	useEffect(() => {
		const running = strikes.current;
		return () => {
			for (const t of running.values()) clearTimeout(t);
			running.clear();
		};
	}, []);

	useImperativeHandle(
		ref,
		() => ({
			highlight(midi) {
				for (const el of highlighted.current) delete el.dataset.hover;
				highlighted.current = [];
				if (midi === null || !board.current) return;
				const pc = ((midi % 12) + 12) % 12;
				for (const el of board.current.querySelectorAll<HTMLElement>("[data-midi]")) {
					const keyMidi = Number(el.dataset.midi);
					if (keyMidi === midi) el.dataset.hover = "self";
					else if (((keyMidi % 12) + 12) % 12 === pc) el.dataset.hover = "octave";
					else continue;
					highlighted.current.push(el);
				}
			},
			strike(midi) {
				const el = board.current?.querySelector<HTMLElement>(`[data-midi="${midi}"]`);
				if (!el || prefersReducedMotion()) return;
				const prior = strikes.current.get(midi);
				if (prior !== undefined) {
					clearTimeout(prior);
					delete el.dataset.struck;
					// Restart the CSS animation: the attribute must leave and return
					// across a style flush, or the browser sees no change.
					void el.offsetWidth;
				}
				el.dataset.struck = "";
				strikes.current.set(
					midi,
					setTimeout(() => {
						delete el.dataset.struck;
						strikes.current.delete(midi);
					}, STRIKE_MS),
				);
			},
		}),
		[],
	);

	// Radio-group keyboard model: arrows move and select, Home/End jump.
	const handleKeyDown = useCallback(
		(e: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
			let next: number | null = null;
			if (e.key === "ArrowRight" || e.key === "ArrowUp") next = Math.min(keys.length - 1, index + 1);
			else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(0, index - 1);
			else if (e.key === "Home") next = 0;
			else if (e.key === "End") next = keys.length - 1;
			if (next === null || next === index) return;
			e.preventDefault();
			const target = keys[next];
			onSelect(target.midi);
			board.current?.querySelector<HTMLElement>(`[data-midi="${target.midi}"]`)?.focus();
		},
		[keys, onSelect],
	);

	const keyButton = (key: PianoKey, index: number) => {
		const selected = isSelected(key);
		const outside = !inRange(key.midi);
		const label = labelFor
			? labelFor(key, selected)
			: selected
				? key.name
				: key.pitchClass === 0
					? `C${key.octave}`
					: "";
		return (
			<button
				key={key.midi}
				type="button"
				role="radio"
				aria-checked={selected}
				aria-label={keyLabel(key.midi)}
				tabIndex={key.midi === focusMidi ? 0 : -1}
				data-midi={key.midi}
				data-black={key.isBlack || undefined}
				data-selected={selected || undefined}
				data-outside={outside || undefined}
				data-dimmed={dimmed?.(key) || undefined}
				data-tone={(!selected && tonePitchClasses?.includes(key.pitchClass)) || undefined}
				onClick={() => onSelect(key.midi)}
				onKeyDown={(e) => handleKeyDown(e, index)}
				className={key.isBlack ? "pk-key pk-black" : "pk-key pk-white"}
				style={
					key.isBlack
						? {
								left: `calc(${key.whiteIndex + 1} * ${whiteW} - ${BLACK_W / 2} * ${whiteW})`,
								width: `calc(${BLACK_W} * ${whiteW})`,
								height: BLACK_H,
							}
						: { left: `calc(${key.whiteIndex} * ${whiteW})`, width: whiteW, height: WHITE_H }
				}
			>
				{label && (
					<span className="pk-label font-mono">
						<MusicalText text={label} />
					</span>
				)}
			</button>
		);
	};

	// The band's ends sit under the centre of their keys.
	const bandKeys = range
		? { from: keys.find((k) => k.midi === range.fromMidi), to: keys.find((k) => k.midi === range.toMidi) }
		: null;
	const centreOf = (key: PianoKey) =>
		key.isBlack ? `calc(${key.whiteIndex + 1} * ${whiteW})` : `calc(${key.whiteIndex + 0.5} * ${whiteW})`;

	return (
		<div className={className} style={{ containerType: "inline-size" }}>
			<div ref={scroller} className="fp-thin-scroll overflow-x-auto overflow-y-hidden">
				<div
					ref={board}
					role="radiogroup"
					aria-label={ariaLabel}
					className="pk-board relative"
					style={{
						width: `max(100cqw, ${whites * MIN_WHITE_W}px)`,
						height: WHITE_H + (bandKeys ? BAND_H : 0),
					}}
				>
					{keys.map((key, i) => keyButton(key, i))}
					{bandKeys?.from && bandKeys.to && (
						<div
							className="pk-band"
							aria-hidden="true"
							style={{ top: WHITE_H, left: centreOf(bandKeys.from), right: `calc(100% - ${centreOf(bandKeys.to)})` }}
						>
							<span className="pk-band-label font-mono">
								Guitar <MusicalText text={keyLabel(bandKeys.from.midi)} />
								{" – "}
								<MusicalText text={keyLabel(bandKeys.to.midi)} />
							</span>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
