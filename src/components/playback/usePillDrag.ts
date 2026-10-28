import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { dockFor, otherDock, type PlayerDock } from "@/lib/playerDock";
import { prefersReducedMotion } from "@/lib/motion";

/** Movement under this many px is a press on the handle, not a drag. */
const DRAG_THRESHOLD = 4;
const SNAP = "transform 380ms cubic-bezier(0.3, 1.25, 0.45, 1)";

/**
 * Dragging the play pill between its docks by its handle.
 *
 * While dragged the pill follows the pointer (a transform on `moveRef`, so React
 * does not re-render every move). Let go, it snaps to the dock nearer the pointer
 * (`dockFor`); pressed without moving, it swaps docks. Either way it glides from
 * where it was to where it lands — measured before and after the dock changes
 * and played back as one transform (FLIP).
 */
export function usePillDrag(dock: PlayerDock, onDock: (dock: PlayerDock) => void) {
	const moveRef = useRef<HTMLDivElement>(null);
	const [dragging, setDragging] = useState(false);
	/** Where the pill would land if let go now, while it is being dragged. */
	const [target, setTarget] = useState<PlayerDock | null>(null);
	const flipFrom = useRef<DOMRect | null>(null);
	const suppressClick = useRef(false);
	const detach = useRef<(() => void) | null>(null);

	function glideFrom(from: DOMRect) {
		const el = moveRef.current;
		if (!el) return;
		el.style.transition = "none";
		el.style.transform = "";
		if (prefersReducedMotion()) return;
		const to = el.getBoundingClientRect();
		const dx = from.left - to.left, dy = from.top - to.top;
		if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
		el.style.transform = `translate(${dx}px, ${dy}px)`;
		void el.offsetWidth;
		el.style.transition = SNAP;
		el.style.transform = "";
	}

	// The dock changed: the pill is in its new place now, so glide in from the old one.
	useLayoutEffect(() => {
		const from = flipFrom.current;
		flipFrom.current = null;
		if (from) glideFrom(from);
	}, [dock]);

	useEffect(() => () => detach.current?.(), []);

	function onPointerDown(e: ReactPointerEvent<HTMLElement>) {
		const el = moveRef.current;
		if (e.button !== 0 || !el) return;
		const startX = e.clientX, startY = e.clientY;
		const area = el.closest(".pb-area")?.getBoundingClientRect();
		let moved = false;
		let aiming: PlayerDock | null = null;

		const move = (ev: PointerEvent) => {
			const dx = ev.clientX - startX, dy = ev.clientY - startY;
			if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
			if (!moved) {
				moved = true;
				setDragging(true);
				el.style.transition = "none";
			}
			el.style.transform = `translate(${dx}px, ${dy}px)`;
			// Set only when it changes: the hint pops each time the landing moves.
			const next = area ? dockFor({ x: ev.clientX, y: ev.clientY }, area) : dock;
			if (next !== aiming) {
				aiming = next;
				setTarget(next);
			}
		};
		const up = (ev: PointerEvent) => {
			detach.current?.();
			if (!moved) return;
			suppressClick.current = true;
			setDragging(false);
			setTarget(null);
			const from = el.getBoundingClientRect();
			const landing = area ? dockFor({ x: ev.clientX, y: ev.clientY }, area) : dock;
			if (landing === dock) {
				glideFrom(from);
				return;
			}
			flipFrom.current = from;
			onDock(landing);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
		window.addEventListener("pointercancel", up);
		detach.current = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", up);
			detach.current = null;
		};
	}

	/** A press that did not drag swaps docks; keyboard Enter / Space land here too. */
	function onClick(e: MouseEvent<HTMLElement>) {
		if (suppressClick.current) {
			suppressClick.current = false;
			e.preventDefault();
			return;
		}
		const el = moveRef.current;
		if (el) flipFrom.current = el.getBoundingClientRect();
		onDock(otherDock(dock));
	}

	return { moveRef, dragging, target, handleProps: { onPointerDown, onClick } };
}
