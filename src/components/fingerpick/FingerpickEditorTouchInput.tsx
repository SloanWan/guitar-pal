import { useState } from "react";
import { X as XIcon } from "lucide-react";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import type { Cell } from "@/lib/fingerpickEdit";

export interface FingerpickEditorTouchInputProps {
	/**
	 * Shared off-screen numeric input. The parent focuses it inside a touch tap
	 * (iOS ignores a deferred focus) and parks it over the tapped cell first so
	 * focusing never jump-scrolls the dialog.
	 */
	inputRef: React.RefObject<HTMLInputElement | null>;
	working: FingerpickPattern;
	selectedCell: Cell | null;
	/**
	 * Content-relative anchor for the mute button, centred just below the tapped
	 * cell; set by the parent on a touch tap, null when no cell was tapped.
	 */
	touchMute: { top: number; left: number } | null;
	/** A digit typed on the native keyboard, for the selected cell. */
	onDigit: (digit: number) => void;
	/** Backspace on the native keyboard: clears the selected cell. */
	onBackspace: () => void;
	onToggleMute: () => void;
	/** The native keyboard went away; the parent drops its two-digit entry buffer. */
	onBlur: () => void;
}

// Touch fret entry. Both pieces live inside the scroll region so they are
// anchored in its coordinate space and scroll with the grid.
export default function FingerpickEditorTouchInput({
	inputRef,
	working,
	selectedCell,
	touchMute,
	onDigit,
	onBackspace,
	onToggleMute,
	onBlur,
}: FingerpickEditorTouchInputProps) {
	// True while the hidden numeric input holds focus (i.e. the native fret-entry
	// keyboard is up). The touch mute button belongs to that same "keyboard active"
	// interaction, so it is shown only while this is true and hidden on blur.
	const [isFretInputFocused, setIsFretInputFocused] = useState(false);

	// The selected cell's live string data, used to gate the touch mute button:
	// an already-muted cell needs no mute affordance, so the button is hidden
	// until the cell is un-muted (or a different, non-muted cell is selected).
	const selectedMuted = selectedCell
		? !!working.measures[selectedCell.measureIndex]?.slots[selectedCell.slotIndex]?.strings[
				selectedCell.stringIndex
			]?.muted
		: false;

	return (
		<>
			{/* Off-screen numeric input: focused on a touch tap to summon the
			    native numeric keyboard for fret entry. Invisible and
			    non-interactive; each keystroke arrives as an onChange — take the
			    last typed character, route it to the shared digit logic, and reset
			    the field so the next keystroke starts fresh. */}
			<input
				ref={inputRef}
				type="number"
				inputMode="numeric"
				pattern="[0-9]*"
				aria-hidden
				tabIndex={-1}
				onChange={(e) => {
					const raw = e.currentTarget.value;
					e.currentTarget.value = "";
					if (!selectedCell) return;
					const lastChar = raw.slice(-1);
					if (!/^[0-9]$/.test(lastChar)) return;
					onDigit(Number(lastChar));
				}}
				onFocus={() => setIsFretInputFocused(true)}
				onBlur={() => {
					setIsFretInputFocused(false);
					// Reset the field and the pending two-digit buffer.
					if (inputRef.current) inputRef.current.value = "";
					onBlur();
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.currentTarget.blur();
						return;
					}
					// The native numeric keyboard has no "x"; its Backspace clears
					// the selected cell (mirrors the physical-keyboard path).
					if (e.key === "Backspace" || e.key === "Delete") onBackspace();
				}}
				className="absolute h-6 w-6 opacity-0 pointer-events-none -z-10"
				style={{ top: 0, left: 0 }}
			/>

			{/* Touch mute button: the native numeric keyboard can't type "x", so
			    give touch users a tappable way to mute the selected string. Uses
			    the same toggleMuted commit as the desktop "x" key. Centred just
			    below the selected cell (the "x" glyph is the tab mute notation).
			    Hidden while the selected cell is already muted — it reappears once
			    the cell is un-muted or a different, non-muted cell is selected. */}
			{touchMute && selectedCell && isFretInputFocused && !selectedMuted && (
				<button
					// Keep the hidden input focused when pressing this button: without
					// it, the button steals focus, blurs the input, and the resulting
					// isFretInputFocused=false would unmount the button before its
					// onClick fires. Preserving focus also keeps the keyboard up.
					onMouseDown={(e) => e.preventDefault()}
					onClick={onToggleMute}
					aria-label="Mute string"
					title="Mute string"
					className="absolute z-60 flex h-8 w-8 items-center justify-center border border-line-strong bg-popover text-ink hover:bg-denim-tint hover:text-denim active:bg-denim-tint transition-colors"
					style={{
						top: touchMute.top,
						left: touchMute.left,
						transform: "translate(-50%, 6px)",
					}}
				>
					<XIcon size={14} />
				</button>
			)}
		</>
	);
}
