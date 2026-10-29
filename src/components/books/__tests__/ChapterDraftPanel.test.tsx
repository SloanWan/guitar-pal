import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { FingerpickPattern, Measure } from "@/lib/fingerpickTypes";
import type { ChapterExercise } from "@/lib/books/types";
import { takeHandoff } from "@/lib/assistant/handoff";

/**
 * The draft panel with the audio engine stubbed: what it says about the draft,
 * what it hands the stave, and its two ways out — Edit opens the editor's page
 * on the draft with the book's page beside it, Open in fingerpick hands it over
 * and marks the row used. Playing alone marks nothing.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/books/b1" }));
const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const api = vi.hoisted(() => ({ setExerciseStatus: vi.fn(), cropUrl: vi.fn() }));
vi.mock("@/lib/books/api", () => api);

const engine = vi.hoisted(() => ({
	isLoaded: true,
	isPlaying: false,
	isPaused: false,
	playOnce: true,
	setPlayOnce: vi.fn(),
	load: vi.fn(async () => {}),
	play: vi.fn(),
	pause: vi.fn(),
	resume: vi.fn(),
	stop: vi.fn(),
	getPlaybackProgress: () => null,
	applyBpmChange: vi.fn(),
}));
vi.mock("@/components/fingerpick/useFingerpickAudioEngine", () => ({
	useFingerpickAudioEngine: () => engine,
}));

// The stave is VexFlow, which jsdom cannot draw (#56): assert on its props.
const staveProps: { measures: Measure[]; measureWidths: number[] }[] = [];
vi.mock("@/components/fingerpick/TabStaveRow", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/components/fingerpick/TabStaveRow")>()),
	default: (props: { measures: Measure[]; measureWidths: number[] }) => {
		staveProps.push(props);
		return <div data-stave={props.measures.length} />;
	},
}));

import ChapterDraftPanel, { draftMeta, type OpenDraft } from "@/components/books/ChapterDraftPanel";
import { readEditorDraft } from "@/lib/tabEditorEntry";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class {
	constructor(private cb: ResizeObserverCallback) {}
	observe() {
		this.cb([{ contentRect: { width: 480 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
	}
	unobserve() {}
	disconnect() {}
};

const OPEN = { fret: null, muted: false } as const;
const slot = (id: string, fret: number) => ({
	id,
	duration: "quarter" as const,
	strings: [OPEN, OPEN, OPEN, OPEN, OPEN, { ...OPEN, fret }],
});
const PATTERN: FingerpickPattern = {
	id: "service-id",
	name: "Exercise 3",
	bpm: 100,
	timeSignature: [4, 4],
	measures: [
		{ id: "m1", slots: [slot("s1", 0), slot("s2", 1), slot("s3", 3), slot("s4", 0)] },
		{ id: "m2", slots: [slot("s5", 3), slot("s6", 1), slot("s7", 0), slot("s8", 0)] },
	],
};
const EXERCISE: ChapterExercise = {
	id: "e1",
	page: 206,
	kind: "tab",
	source: "literal",
	draft: PATTERN as unknown as Record<string, unknown>,
	warnings: [{ code: "TAB_JIANPU_OCTAVE", path: "measures", message: "3 note(s) an octave out" }],
	crop_path: null,
	status: "proposed",
};

let container: HTMLDivElement;
let root: Root | null = null;
const onTaken = vi.fn();
const onClose = vi.fn();
const onLocate = vi.fn();

function render(draft: OpenDraft = { chapterId: "c1", exercise: EXERCISE, pattern: PATTERN, onTaken }) {
	container = document.createElement("div");
	document.body.appendChild(container);
	act(() => {
		root = createRoot(container);
		root.render(<ChapterDraftPanel bookId="b1" draft={draft} onClose={onClose} onLocate={onLocate} />);
	});
}

// Microtasks, and the two frames the panel's body waits for before mounting.
async function settle() {
	await act(async () => {
		await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
		await Promise.resolve();
		await Promise.resolve();
	});
}

function button(label: string): HTMLButtonElement {
	const found = Array.from(container.querySelectorAll("button")).find(
		(b) => b.textContent?.includes(label) || b.getAttribute("aria-label") === label,
	);
	if (!found) throw new Error(`no button "${label}" in: ${container.textContent}`);
	return found;
}

beforeEach(() => {
	staveProps.length = 0;
	push.mockReset();
	toast.mockReset();
	onTaken.mockReset();
	onClose.mockReset();
	onLocate.mockReset();
	api.setExerciseStatus.mockReset().mockResolvedValue({ ...EXERCISE, status: "taken" });
	engine.play.mockReset();
	engine.stop.mockReset();
	engine.load.mockClear();
	sessionStorage.clear();
});

afterEach(() => {
	act(() => root?.unmount());
	root = null;
	container?.remove();
});

describe("draftMeta", () => {
	it("reads tempo, meter and length", () => {
		expect(draftMeta(PATTERN)).toBe("♩ = 100 · 4/4 · 2 bars");
		expect(draftMeta({ ...PATTERN, timeSignature: [6, 8], bpm: 60, measures: PATTERN.measures.slice(0, 1) })).toBe(
			"♩. = 60 · 6/8 · 1 bar",
		);
	});
});

describe("ChapterDraftPanel", () => {
	it("shows the draft, lays out its bars and preloads the samples", async () => {
		render();
		await settle();
		const text = container.textContent ?? "";
		expect(text).toContain("Exercise 3");
		expect(text).toContain("♩ = 100 · 4/4 · 2 bars · p.206 · Tab · literal");
		expect(text).toContain("3 note(s) an octave out");
		// The samples load once the opening motion is over, not before.
		expect(engine.load).not.toHaveBeenCalled();
		act(() => {
			container
				.querySelector('[data-testid="chapter-draft-panel"]')
				?.dispatchEvent(new Event("animationend", { bubbles: true }));
		});
		expect(engine.load).toHaveBeenCalledTimes(1);
		expect(staveProps.flatMap((p) => p.measures.map((m) => m.id))).toEqual(["m1", "m2"]);
	});

	it("plays the draft at its tempo without marking the row used", async () => {
		render();
		await settle();
		act(() => button("Play").click());
		expect(engine.play).toHaveBeenCalledTimes(1);
		const [played, options] = engine.play.mock.calls[0] as [FingerpickPattern, { loop: boolean }];
		expect(played.bpm).toBe(100);
		expect(played.measures).toHaveLength(2);
		expect(options.loop).toBe(true);
		expect(onTaken).not.toHaveBeenCalled();
		expect(api.setExerciseStatus).not.toHaveBeenCalled();
	});

	it("sends an unsaved draft to fingerpick by handoff, under a fresh id, and marks the row used", async () => {
		render();
		await settle();
		await act(async () => {
			button("Open in fingerpick").click();
		});
		expect(engine.stop).toHaveBeenCalled();
		expect(onTaken).toHaveBeenCalledTimes(1);
		expect(api.setExerciseStatus).toHaveBeenCalledWith("b1", "e1", "taken");
		expect(push).toHaveBeenCalledWith("/fingerpick");
		const handoff = takeHandoff("fingerpick");
		if (handoff?.kind !== "fingerpick") throw new Error("expected a fingerpick handoff");
		expect(handoff.pattern.name).toBe("Exercise 3");
		expect(handoff.pattern.id).not.toBe("service-id");
		expect(handoff.warnings.map((w) => w.code)).toEqual(["TAB_JIANPU_OCTAVE"]);
	});

	it("opens the editor's page on the draft, with the book's page, and comes back here", async () => {
		render({ chapterId: "c1", exercise: { ...EXERCISE, crop_path: "u/b/crops/c1/p0206-2.png" }, pattern: PATTERN, onTaken });
		await settle();
		act(() => button("Edit").click());
		expect(engine.stop).toHaveBeenCalled();
		expect(push).toHaveBeenCalledTimes(1);
		const url = new URL(push.mock.calls[0][0] as string, "https://x.test");
		expect(url.pathname).toBe("/fingerpick/edit/new");
		expect(url.searchParams.get("from")).toBe("/books/b1");
		const draft = readEditorDraft(url.searchParams.get("draft")!);
		expect(draft?.pattern.name).toBe("Exercise 3");
		expect(draft?.pattern.id).not.toBe("service-id");
		expect(draft?.notice.warnings).toEqual(["3 note(s) an octave out"]);
		expect(draft?.book).toEqual({ bookId: "b1", exerciseId: "e1", cropPath: "u/b/crops/c1/p0206-2.png", page: 206 });
		// The editor marks the row when it saves; opening it is not using the draft.
		expect(onTaken).not.toHaveBeenCalled();
	});

	it("closes on the header button", async () => {
		render();
		await settle();
		act(() => button("Close").click());
		// The close is animated: the owner hears of it when the animation ends.
		expect(onClose).not.toHaveBeenCalled();
		act(() => {
			container
				.querySelector('[data-testid="chapter-draft-panel"]')
				?.dispatchEvent(new Event("animationend", { bubbles: true }));
		});
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("offers the page it was read from", async () => {
		render();
		await settle();
		act(() => button("p.206").click());
		expect(onLocate).toHaveBeenCalledTimes(1);
	});
});
