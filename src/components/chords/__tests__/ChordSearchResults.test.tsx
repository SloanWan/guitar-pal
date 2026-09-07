// Guards the palette's default highlight. cmdk selects the first item in DOM order and
// its Input re-asserts that on every keystroke, so the group order in ChordSearchResults
// is what decides which row Enter activates. A harness without a CommandInput does NOT
// reproduce that — the "select first item" pass is scheduled from the search update — so
// this test mounts one.
import { describe, it, expect } from "vitest";
import { useState, act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { Command, CommandInput, CommandList } from "@/components/ui/command";
import ChordSearchResults, {
	useChordPaletteRows,
} from "@/components/chords/ChordSearchResults";
import { isBrowsableSuffix } from "@/lib/chordSuffixes";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { CHORD_ROWS } from "@/lib/__fixtures__/chordData.fixture";

// jsdom ships neither of these and cmdk uses both.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};

const INDEX: readonly ChordIndexEntry[] = CHORD_ROWS.filter((r) =>
	isBrowsableSuffix(r.suffix),
).map((r) => ({ root: r.root, suffix: r.suffix }));

function Palette({ query }: { query: string }) {
	const rows = useChordPaletteRows(INDEX, query);
	return (
		<Command shouldFilter={false}>
			<CommandInput value={query} onValueChange={() => {}} />
			<CommandList>
				<ChordSearchResults
					rows={rows}
					onSelectChord={() => {}}
					onSelectShortcut={() => {}}
					onSelectBatch={() => {}}
					onCreateChord={() => {}}
				/>
			</CommandList>
		</Command>
	);
}

// Types a query into a freshly mounted palette and reports the rendered rows in DOM
// order, marking the highlighted one.
async function renderQuery(query: string): Promise<{ rows: string[]; selected: string | null }> {
	const host = document.createElement("div");
	document.body.appendChild(host);
	let root!: Root;
	await act(async () => {
		root = createRoot(host);
		root.render(<Palette query="" />);
	});
	await act(async () => {
		root.render(<Palette query={query} />);
	});

	const items = Array.from(host.querySelectorAll("[cmdk-item]"));
	const result = {
		rows: items.map((el) => el.getAttribute("data-value") ?? ""),
		selected:
			items.find((el) => el.getAttribute("aria-selected") === "true")?.getAttribute("data-value") ??
			null,
	};
	await act(async () => root.unmount());
	host.remove();
	return result;
}

describe("chord palette default highlight", () => {
	it("highlights the first chord, not the browse shortcut, for a bare root", async () => {
		const { rows, selected } = await renderQuery("c");
		expect(selected).toBe("c major");
		// The shortcut is still offered — just after the concrete matches.
		expect(rows).toContain("jump-root");
		expect(rows.indexOf("c major")).toBeLessThan(rows.indexOf("jump-root"));
	});

	it("highlights the first chord for a fully qualified chord query", async () => {
		const { selected } = await renderQuery("cmaj7");
		expect(selected).toBe("c maj7");
	});

	it("highlights the grid row when the query reads as a chord list", async () => {
		const { rows, selected } = await renderQuery("C Am F G");
		expect(selected).toBe("batch-grid");
		// The single-chord group is suppressed in batch mode; the browse shortcut for the
		// first root still shows, deliberately — an ambiguous query lists both options
		// rather than arbitrating between them — but it comes after the grid row.
		expect(rows).toEqual(["batch-grid", "jump-root"]);
	});

	it("falls back to the shortcut when a query matches no chord", async () => {
		const { rows, selected } = await renderQuery("power chords");
		expect(rows).toEqual(["jump-category"]);
		expect(selected).toBe("jump-category");
	});
});
