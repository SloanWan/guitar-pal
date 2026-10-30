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
 * Clicking anywhere in the tab seeks to the nearest note in the clicked row
 * (nearest by x); a click between or outside rows takes the nearest row. While
 * playing or paused the engine seeks at once; while stopped the target is kept
 * for the next play(). In section mode a click picks the measure under it.
 */
export function useClickToSeek({
	viewerRef,
	isPlaying,
	isPaused,
	seekToNote,
	toExpandedMeasureIndex,
	snapCursorToNote,
	sectionMode,
	geometry,
	onPickMeasure,
}: ClickToSeekArgs): ClickToSeek {
	// Note to seek to on the next play() — set by a click while stopped,
	// consumed by takePendingSeek() and cleared by clearPendingSeek().
	const pendingSeekRef = useRef<SeekTarget | null>(null);

	function handleTabClick(e: React.MouseEvent<HTMLDivElement>): void {
		const container = viewerRef.current;
		if (!container) return;
		const rect = container.getBoundingClientRect();
		const measure = measureAtPoint(geometry, e.clientX - rect.left, e.clientY - rect.top + container.scrollTop);
		if (measure === null) return;
		if (sectionMode) {
			onPickMeasure(measure);
			return;
		}

		// The nearest note by x among the clicked row's measures; a row of rests has none.
		const rowIndex = geometry.find((r) => r.measureIndex === measure)?.rowIndex;
		const rowMeasures = new Set(geometry.filter((r) => r.rowIndex === rowIndex).map((r) => String(r.measureIndex)));
		let nearest: SVGElement | null = null;
		let best = Infinity;
		for (const el of container.querySelectorAll<SVGElement>("[data-measure-index][data-slot-index]")) {
			if (!rowMeasures.has(el.dataset.measureIndex ?? "")) continue;
			const r = el.getBoundingClientRect();
			const distance = Math.abs(r.left + r.width / 2 - e.clientX);
			if (distance < best) {
				best = distance;
				nearest = el;
			}
		}
		if (!nearest) return;

		const measureIndex = Number(nearest.dataset.measureIndex);
		const slotIndex = Number(nearest.dataset.slotIndex);
		if (isPlaying || isPaused) {
			// The engine runs on the expanded timeline: the clicked measure's first occurrence.
			seekToNote(toExpandedMeasureIndex(measureIndex), slotIndex);
		} else {
			// Stopped: the next play() starts from here.
			pendingSeekRef.current = { measureIndex, slotIndex };
		}
		snapCursorToNote(nearest, measureIndex);
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
