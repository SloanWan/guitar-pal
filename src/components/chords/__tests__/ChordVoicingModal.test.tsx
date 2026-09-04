// The grid remembers which voicing a user paged to and feeds it back as initialIndex on
// the next open. Both halves of that contract live here: the modal must report every
// move outward, and its open-time reset must honour the index it is handed rather than
// snapping back to the first card.
import { describe, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import ChordVoicingModal from "@/components/chords/ChordVoicingModal";
import type { ChordPreview } from "@/components/chords/useChordPreview";
import { toVoicingCards } from "@/lib/chordCards";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PREVIEW: ChordPreview = { isPlaying: false, isPreloading: false, play: async () => {} };

function voicing(id: string, label: string, startFret: number): ChordVoicing {
	return {
		id,
		label,
		start_fret: startFret,
		barre_fret: null,
		capo: false,
		frets: "x32010",
		fingers: "032010",
	};
}

const VOICINGS = toVoicingCards([
	voicing("a", "Standard", 1),
	voicing("b", "Pos. 3", 3),
	voicing("c", "Pos. 5", 5),
]);

function mount(host: HTMLElement, props: Partial<React.ComponentProps<typeof ChordVoicingModal>>) {
	return (
		<ChordVoicingModal
			voicings={VOICINGS}
			root="C"
			suffix="major"
			open
			onClose={() => {}}
			preview={PREVIEW}
			{...props}
		/>
	);
}

const shownLabel = (host: HTMLElement) =>
	host.querySelector("p.text-sm.text-ink-dim")?.textContent ?? null;
const click = (host: HTMLElement, label: string) =>
	(host.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement).click();

describe("ChordVoicingModal — voicing paging", () => {
	it("reports each move so the caller can remember the landing voicing", async () => {
		const host = document.createElement("div");
		document.body.appendChild(host);
		const onActiveIndexChange = vi.fn();
		let root!: Root;

		await act(async () => {
			root = createRoot(host);
			root.render(mount(host, { onActiveIndexChange }));
		});
		expect(shownLabel(host)).toBe("Standard");

		await act(async () => click(host, "Next voicing"));
		expect(onActiveIndexChange).toHaveBeenLastCalledWith(1);
		expect(shownLabel(host)).toBe("Pos. 3");

		await act(async () => click(host, "Next voicing"));
		expect(onActiveIndexChange).toHaveBeenLastCalledWith(2);
		expect(shownLabel(host)).toBe("Pos. 5");

		await act(async () => click(host, "Previous voicing"));
		expect(onActiveIndexChange).toHaveBeenLastCalledWith(1);

		await act(async () => root.unmount());
		host.remove();
	});

	it("opens on the voicing it is handed, not back on the first one", async () => {
		const host = document.createElement("div");
		document.body.appendChild(host);
		let root!: Root;

		// Closed, then reopened with a remembered index — the reset must adopt it.
		await act(async () => {
			root = createRoot(host);
			root.render(mount(host, { open: false, initialIndex: 2 }));
		});
		await act(async () => {
			root.render(mount(host, { open: true, initialIndex: 2 }));
		});
		expect(shownLabel(host)).toBe("Pos. 5");

		await act(async () => root.unmount());
		host.remove();
	});

	it("does not page past either end", async () => {
		const host = document.createElement("div");
		document.body.appendChild(host);
		const onActiveIndexChange = vi.fn();
		let root!: Root;

		await act(async () => {
			root = createRoot(host);
			root.render(mount(host, { onActiveIndexChange, initialIndex: 0 }));
		});
		await act(async () => click(host, "Previous voicing"));
		expect(shownLabel(host)).toBe("Standard");

		await act(async () => {
			root.render(mount(host, { onActiveIndexChange, open: false, initialIndex: 2 }));
		});
		await act(async () => {
			root.render(mount(host, { onActiveIndexChange, open: true, initialIndex: 2 }));
		});
		await act(async () => click(host, "Next voicing"));
		expect(shownLabel(host)).toBe("Pos. 5");

		await act(async () => root.unmount());
		host.remove();
	});
});
