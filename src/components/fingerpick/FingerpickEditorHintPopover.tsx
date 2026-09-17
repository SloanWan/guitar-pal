import { useEffect, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import { SPRING_POP_EASING, prefersReducedMotion } from "@/lib/motion";
import { useIsomorphicLayoutEffect } from "./fingerpickEditorShared";

export interface FingerpickEditorHintPopoverProps {
	/** Fine pointer (mouse/trackpad) → the keyboard hint; otherwise the touch one. */
	hasFinePointer: boolean;
}

// Editing help: "?" toggles a popover with the input-appropriate hint. Anchored
// above the icon (the footer sits at the bottom) and left-aligned from the
// leftmost button so it never spills past the modal edges. Owns its open state,
// its outside-press dismissal and its entrance spring.
export default function FingerpickEditorHintPopover({
	hasFinePointer,
}: FingerpickEditorHintPopoverProps) {
	const [hintOpen, setHintOpen] = useState(false);
	const hintRef = useRef<HTMLDivElement>(null);
	// Previous hintOpen value, so the entrance spring fires only on false→true.
	const prevHintOpenRef = useRef(false);

	// Dismiss on any outside pointer press, except when the "?" trigger is
	// pressed — its own click handler toggles it (so pressing it while open
	// closes it).
	useEffect(() => {
		if (!hintOpen) return;
		function handlePointerDown(e: PointerEvent) {
			const target = e.target as HTMLElement;
			if (!hintRef.current?.contains(target) && !target.closest("[data-hint-trigger]")) {
				setHintOpen(false);
			}
		}
		document.addEventListener("pointerdown", handlePointerDown);
		return () => document.removeEventListener("pointerdown", handlePointerDown);
	}, [hintOpen]);

	// Entrance: spring-pop (scale in from 0.85 with overshoot past 1.0, plus the
	// opacity fade) only on the false→true transition. Closing keeps the plain
	// CSS fade/shrink from the element's transition classes. Skipped entirely for
	// prefers-reduced-motion, leaving the instant class-driven toggle.
	useIsomorphicLayoutEffect(() => {
		const wasOpen = prevHintOpenRef.current;
		prevHintOpenRef.current = hintOpen;
		if (!hintOpen || wasOpen) return;
		if (prefersReducedMotion()) return;
		hintRef.current?.animate(
			[
				{ opacity: 0, transform: "scale(0.85)" },
				{ opacity: 1, transform: "scale(1)" },
			],
			{ duration: 250, easing: SPRING_POP_EASING },
		);
	}, [hintOpen]);

	return (
		<div className="relative">
			{/* LED-style feedback (§1.2 / §5.11): the glyph itself carries all
			    state — no background box, border, or shadow on the button.
			    Dormant (ink-faint) when closed; lit (denim-accent + soft glow)
			    on hover and while the popover is open; a quick scale-down on
			    press stands in for §5.1's momentary-flash on bare chrome. */}
			<button
				data-hint-trigger
				onClick={() => setHintOpen((v) => !v)}
				aria-label="Editing help"
				aria-expanded={hintOpen}
				title="Editing help"
				className={`h-8 w-8 flex items-center justify-center transition duration-150 ease-out motion-reduce:transition-none active:scale-[0.92] ${
					hintOpen
						? "text-denim-accent filter-[drop-shadow(0_0_4px_var(--denim-glow))]"
						: "text-ink-faint hover:text-denim-accent hover:filter-[drop-shadow(0_0_4px_var(--denim-glow))]"
				}`}
			>
				<CircleHelp size={18} />
			</button>
			{/* Kept mounted (not conditionally rendered) so the exit transition
			    plays on close. Entrance is a spring-pop run via the Web Animations
			    API (see the layout effect above); close is the plain CSS fade/shrink
			    from the classes below. Visibility/interaction is gated by the
			    opacity/pointer-events classes; reduced-motion users skip both and
			    get an instant toggle (§6.7). */}
			<div
				ref={hintRef}
				aria-hidden={!hintOpen}
				className={`absolute bottom-full left-0 mb-2 z-60 w-max max-w-xs origin-bottom-left border border-line-strong bg-surface p-3 flex flex-col gap-1 text-[11px] leading-relaxed text-ink-dim transition duration-150 ease-out motion-reduce:transition-none ${
					hintOpen ? "opacity-100 scale-100" : "pointer-events-none opacity-0 scale-[0.96]"
				}`}
			>
				{hasFinePointer ? (
					<>
						<p>
							Click a cell, then use arrow keys to move, number keys to set a fret,{" "}
							<span className="font-mono">X</span> to mute, or Backspace to clear.
						</p>
						<p>Right-click a cell for techniques.</p>
					</>
				) : (
					<>
						<p>
							Tap a cell to select it, then use the number pad to set a fret, the mute
							button to mute, or Backspace to clear.
						</p>
						<p>Long-press a cell for techniques.</p>
					</>
				)}
			</div>
		</div>
	);
}
