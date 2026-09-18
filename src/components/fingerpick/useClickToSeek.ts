import { useCallback, useRef } from "react";
import { measureAtPoint, type MeasureRect } from "./useMeasureGeometry";

export interface SeekTarget {
	/** A rendered (compact) measure index. */
	measureIndex: number;
	slotIndex: number;
}

export interface ClickToSeekArgs {
	viewerRef: React.RefObject<HTMLDivElement | null>;
	isPlaying: boolean;
	isPaused: boolean;
	/** The engine's seek, on the expanded timeline. */
	seekToNote: (expandedMeasureIndex: number, slotIndex: number) => void;
	toExpandedMeasureIndex: (measureIndex: number) => number;
	snapCursorToNote: (noteEl: SVGElement, measureIndex: number) => void;
	/** Any click on the tab counts as an interaction (the controls come back). */
	onInteract: () => void;
	/** Section mode: a click picks a measure instead of seeking. */
	sectionMode: boolean;
	geometry: readonly MeasureRect[];
	onPickMeasure: (measureIndex: number) => void;
}

export interface ClickToSeek {
	handleTabClick: (e: React.MouseEvent<HTMLDivElement>) => void;
	/** The note recorded while stopped, for the next play(); cleared once taken. */
	takePendingSeek: () => SeekTarget | null;
	clearPendingSeek: () => void;
}

/**
 * Clicking anywhere in the tab viewer seeks to the nearest note in the clicked
 * row (nearest by x-distance). Clicks outside all rows clamp to the nearest
 * row. While playing or paused the engine seeks at once; while stopped the
 * target is kept for the next play(). In section mode a click picks the
 * measure under it instead.
 */
export function useClickToSeek({
	viewerRef,
	isPlaying,
	isPaused,
	seekToNote,
	toExpandedMeasureIndex,
	snapCursorToNote,
	onInteract,
	sectionMode,
	geometry,
	onPickMeasure,
}: ClickToSeekArgs): ClickToSeek {
	// Note to seek to on the next play() — set by a click while stopped,
	// consumed by takePendingSeek() and cleared by clearPendingSeek().
	const pendingSeekRef = useRef<SeekTarget | null>(null);

	function handleTabClick(e: React.MouseEvent<HTMLDivElement>): void {
		onInteract();

		const container = viewerRef.current;
		if (!container) return;

		if (sectionMode) {
			const rect = container.getBoundingClientRect();
			const measure = measureAtPoint(
				geometry,
				e.clientX - rect.left + container.scrollLeft,
				e.clientY - rect.top + container.scrollTop,
			);
			if (measure !== null) onPickMeasure(measure);
			return;
		}

		const noteEls = Array.from(
			container.querySelectorAll<SVGElement>("[data-measure-index][data-slot-index]"),
		);
		if (noteEls.length === 0) return;

		const allSvgs = Array.from(container.querySelectorAll<SVGElement>("svg"));
		if (allSvgs.length === 0) return;

		const clickYVp = e.clientY;
		const clickXVp = e.clientX;

		// Find the row SVG the click landed in by viewport Y.
		let targetSvg = allSvgs.find((svg) => {
			const r = svg.getBoundingClientRect();
			return clickYVp >= r.top && clickYVp <= r.bottom;
		});

		// Click was between or outside rows — clamp to nearest by Y distance.
		if (!targetSvg) {
			let minDist = Infinity;
			for (const svg of allSvgs) {
				const r = svg.getBoundingClientRect();
				const dist = Math.min(Math.abs(clickYVp - r.top), Math.abs(clickYVp - r.bottom));
				if (dist < minDist) {
					minDist = dist;
					targetSvg = svg;
				}
			}
		}
		if (!targetSvg) return;

		// Notes in the target row only.
		const rowNotes = noteEls.filter((el) => targetSvg!.contains(el));
		if (rowNotes.length === 0) return;

		// Nearest note by X distance.
		let nearestEl: SVGElement | null = null;
		let minXDist = Infinity;
		for (const el of rowNotes) {
			const r = el.getBoundingClientRect();
			const dist = Math.abs(r.left + r.width / 2 - clickXVp);
			if (dist < minXDist) {
				minXDist = dist;
				nearestEl = el;
			}
		}
		if (!nearestEl) return;

		const measureIndex = parseInt(nearestEl.getAttribute("data-measure-index") ?? "0", 10);
		const slotIndex = parseInt(nearestEl.getAttribute("data-slot-index") ?? "0", 10);

		if (isPlaying || isPaused) {
			// Audio engine handles the reschedule (playing) or saved-position update (paused).
			// The engine runs on the expanded timeline, so map the clicked original measure
			// to its first expanded occurrence.
			seekToNote(toExpandedMeasureIndex(measureIndex), slotIndex);
		} else {
			// Stopped: record the target so the next play() starts from here.
			pendingSeekRef.current = { measureIndex, slotIndex };
		}
		snapCursorToNote(nearestEl, measureIndex);
	}

	const takePendingSeek = useCallback((): SeekTarget | null => {
		const pending = pendingSeekRef.current;
		pendingSeekRef.current = null;
		return pending;
	}, []);

	const clearPendingSeek = useCallback(() => {
		pendingSeekRef.current = null;
	}, []);

	return { handleTabClick, takePendingSeek, clearPendingSeek };
}
