import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { FingerpickPattern, Measure } from "@/lib/fingerpickTypes";
import type { ChapterExercise } from "@/lib/books/types";
import { takeHandoff } from "@/lib/strumAssistant/handoff";

/**
 * The draft panel with the audio engine, the library and the editor stubbed:
 * what it says about the draft, what it hands the stave, and its two ways
 * out — a draft goes to fingerpick by handoff, a saved pattern by id — each
 * marking the row used. Playing alone marks nothing.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const api = vi.hoisted(() => ({ setExerciseStatus: vi.fn(), cropUrl: vi.fn() }));
vi.mock("@/lib/books/api", () => api);

const auth = vi.hoisted(() => ({ user: null as { id: string } | null, loading: false }));
vi.mock("@/hooks/useUser", () => ({ useUser: () => auth }));

const library = vi.hoisted(() => ({
	patterns: [{ id: "preset", name: "Travis" }],
	isLoading: false,
	saveCustomPattern: vi.fn(),
}));
vi.mock("@/components/fingerpick/useFingerpickPatterns", () => ({
	useFingerpickPatterns: () => library,
}));

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

const sync = vi.hoisted(() => ({
	saveUserFingerpickPattern: vi.fn(async () => {}),
	saveLastPattern: vi.fn(async () => {}),
}));
vi.mock("@/lib/supabase", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/fingerpickPatternSync", () => ({ saveUserFingerpickPattern: sync.saveUserFingerpickPattern }));
vi.mock("@/lib/lastPattern", () => ({ saveLastPattern: sync.saveLastPattern }));

// The editor is a page of its own; here it is a button that saves a renamed
// copy, and a record of what it was opened inside of and shown beside.
interface EditorProps {
	open: boolean;
	pattern: FingerpickPattern | null;
	container?: HTMLElement | null;
	reference?: { url: string; alt: string };
	onSave: (p: FingerpickPattern) => void;
	onClose: () => void;
}
const editorProps: EditorProps[] = [];
vi.mock("@/components/fingerpick/FingerpickEditModal", () => ({
	default: (props: EditorProps) => {
		editorProps.push(props);
		const { open, pattern, onSave, onClose } = props;
		return open && pattern ? (
			<button
				type="button"
				data-testid="editor-save"
				onClick={() => {
					onSave({ ...pattern, name: "Exercise 3 (mine)" });
					onClose();
				}}
			/>
		) : null;
	},
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

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class {
	constructor(private cb: ResizeObserverCallback) {}
	observe() {
		this.cb([{ contentRect: { width: 480 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
	}
	unobserve() {}
	disconnect() {}
};

const OPEN = { fret: null, technique: null, tied: false, muted: false } as const;
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
	editorProps.length = 0;
	api.cropUrl.mockReset().mockResolvedValue("https://signed/crop.png");
	// jsdom has no matchMedia: the panel takes its fallback, the split layout.
	delete (window as { matchMedia?: unknown }).matchMedia;
	push.mockReset();
	toast.mockReset();
	onTaken.mockReset();
	onClose.mockReset();
	onLocate.mockReset();
	auth.user = null;
	library.isLoading = false;
	library.saveCustomPattern.mockReset().mockImplementation((p: FingerpickPattern) => ({ pattern: p, isNew: true }));
	api.setExerciseStatus.mockReset().mockResolvedValue({ ...EXERCISE, status: "taken" });
	sync.saveUserFingerpickPattern.mockClear();
	sync.saveLastPattern.mockClear();
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

	it("saves an edit through the library, shows what was stored, then opens fingerpick on it by id", async () => {
		auth.user = { id: "u1" };
		render();
		await settle();
		act(() => button("Edit").click());
		await act(async () => {
			container.querySelector<HTMLButtonElement>('[data-testid="editor-save"]')?.click();
		});
		expect(library.saveCustomPattern).toHaveBeenCalledTimes(1);
		const stored = library.saveCustomPattern.mock.calls[0][0] as FingerpickPattern;
		expect(stored.name).toBe("Exercise 3 (mine)");
		expect(stored.id).not.toBe("service-id");
		expect(container.textContent).toContain("Exercise 3 (mine)");
		expect(container.textContent).toContain("Practice draft · saved");
		expect(onTaken).toHaveBeenCalledTimes(1);
		expect(toast).toHaveBeenCalledWith('Saved "Exercise 3 (mine)" to your patterns.');

		await act(async () => {
			button("Open in fingerpick").click();
		});
		await settle();
		// The row is confirmed written before the page is asked to open it.
		expect(sync.saveUserFingerpickPattern).toHaveBeenCalledWith({}, auth.user, stored);
		expect(sync.saveLastPattern).toHaveBeenCalledWith({}, auth.user, "fingerpick", stored.id);
		expect(push).toHaveBeenCalledWith(`/fingerpick?pattern=${stored.id}`);
		expect(takeHandoff("fingerpick")).toBeNull();
	});

	it("keeps Edit shut until the library is loaded, and closes on the header button", async () => {
		library.isLoading = true;
		render();
		await settle();
		expect(button("Edit").disabled).toBe(true);
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

	it("opens the editor inside the panel, without the crop, in the split layout", async () => {
		render();
		await settle();
		const last = editorProps[editorProps.length - 1];
		expect(last.container).toBe(container.querySelector('[data-testid="chapter-draft-panel"]'));
		expect(last.reference).toBeUndefined();
		expect(api.cropUrl).not.toHaveBeenCalled();
	});

	it("hands the editor the crop as a reference where the panel is a sheet", async () => {
		window.matchMedia = ((query: string) =>
			({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList) as typeof window.matchMedia;
		render({ chapterId: "c1", exercise: { ...EXERCISE, crop_path: "u/b/crops/c1/p0206-2.png" }, pattern: PATTERN, onTaken });
		await settle();
		await settle();
		expect(api.cropUrl).toHaveBeenCalledWith("u/b/crops/c1/p0206-2.png");
		const last = editorProps[editorProps.length - 1];
		expect(last.reference).toEqual({ url: "https://signed/crop.png", alt: "Page 206, Exercise 3" });
	});
});
