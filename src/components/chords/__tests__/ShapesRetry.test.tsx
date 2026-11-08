// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ChordVoicing } from "@/lib/chordVoicing";

/** The shared Try again (#463), over a real voicing cache whose fetches the test answers. */

const net = vi.hoisted(() => ({ fail: true, calls: 0 }));
vi.mock("@/lib/chordVoicingCache", async (importOriginal) => {
	const real = await importOriginal<typeof import("@/lib/chordVoicingCache")>();
	const shape: ChordVoicing = { id: "c1", label: null, start_fret: 1, barre_fret: null, capo: false, frets: "x32010", fingers: "032010" };
	const voicingCache = real.createVoicingCache(async () => {
		net.calls++;
		if (net.fail) throw new Error("timed out");
		return [shape];
	});
	return { ...real, voicingCache, loadVoicings: voicingCache.load, peekVoicings: voicingCache.peek, retryFailedVoicings: voicingCache.retryFailed };
});

import ShapesRetry from "@/components/chords/ShapesRetry";
import { useChordVoicings } from "@/components/fingerpick/useChordVoicings";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const C = { root: "C", suffix: "major" };

/** A surface: its shapes drawn through the hook, and the notice under them. */
function Surface() {
	const voicingsFor = useChordVoicings([C]);
	return (
		<div>
			<span data-testid="state">{voicingsFor(C).status}</span>
			<ShapesRetry chords={[C]} />
		</div>
	);
}

let root: Root | null = null;
let host: HTMLDivElement;
afterEach(() => {
	act(() => root?.unmount());
	host?.remove();
});

const flush = () => act(async () => {
	await new Promise((r) => setTimeout(r, 0));
});

describe("ShapesRetry", () => {
	it("says nothing while shapes load, offers Try again once they fail, and loads them on the press", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		host = document.createElement("div");
		document.body.appendChild(host);
		await act(async () => {
			root = createRoot(host);
			root.render(<Surface />);
		});
		await flush();
		expect(host.querySelector('[data-testid="state"]')?.textContent).toBe("failed");
		expect(host.textContent).toContain("Couldn't load the chord shapes.");

		net.fail = false;
		const button = [...host.querySelectorAll("button")].find((b) => b.textContent === "Try again");
		await act(async () => button?.click());
		await flush();
		expect(net.calls).toBe(2);
		expect(host.querySelector('[data-testid="state"]')?.textContent).toBe("ready");
		expect(host.textContent).not.toContain("Couldn't load");
	});

	it("draws nothing for chords that did not fail", async () => {
		host = document.createElement("div");
		await act(async () => {
			root = createRoot(host);
			root.render(<ShapesRetry chords={[{ root: "G", suffix: "major" }]} />);
		});
		expect(host.textContent).toBe("");
	});
});
