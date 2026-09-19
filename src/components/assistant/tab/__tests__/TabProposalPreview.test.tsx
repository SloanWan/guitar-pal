import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Measure } from "@/lib/fingerpickTypes";
import { takeHandoff } from "@/lib/assistant/handoff";
import { buildTabProposal } from "@/lib/assistant/tab/buildTabProposal";
import { parsePickOrder } from "@/lib/assistant/tab/parsePickOrder";
import TabProposalPreview from "@/components/assistant/tab/TabProposalPreview";
import { SHAPES } from "@/lib/assistant/tab/__tests__/fixtures";

// The stave is VexFlow, which jsdom cannot draw (#56). What the card decides —
// which measures go on the one row, at what widths — is asserted on the props
// it hands the real renderer instead.
const staveProps: { measures: Measure[]; measureWidths: number[]; timeSignature?: [number, number] }[] = [];
vi.mock("@/components/fingerpick/TabStaveRow", async (importOriginal) => ({
	// The layout pass imports the real width maths from the same module.
	...(await importOriginal<typeof import("@/components/fingerpick/TabStaveRow")>()),
	default: (props: { measures: Measure[]; measureWidths: number[]; timeSignature?: [number, number] }) => {
		staveProps.push(props);
		return <div data-stave={props.measures.length} />;
	},
}));

const push = vi.fn();
let pathname = "/strum";
vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
	usePathname: () => pathname,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout: the observer reports a width at once so the stave lays out.
globalThis.ResizeObserver = class {
	constructor(private cb: ResizeObserverCallback) {}
	observe() {
		this.cb([{ contentRect: { width: 360 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
	}
	unobserve() {}
	disconnect() {}
};

const voicingFor = (ref: { root: string; suffix: string }) => SHAPES[`${ref.root} ${ref.suffix}`] ?? null;
const chord = (root: string, suffix: string, text: string) => ({ text, chord: { root, suffix, voicingId: null } });

function proposalOf(words: ReturnType<typeof chord>[], orderText = "5 3 2 1 3 2 1 3") {
	const order = parsePickOrder(orderText);
	if (!order.ok) throw new Error(order.error);
	const built = buildTabProposal({ chordWords: words, order: order.order, voicingFor });
	if (!built.ok) throw new Error(built.error);
	return built.proposal;
}

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
	staveProps.length = 0;
	push.mockClear();
	sessionStorage.clear();
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
});

describe("TabProposalPreview", () => {
	it("shows the name, meter, tempo and chords, and one row of at most two bars", async () => {
		const proposal = proposalOf([chord("C", "major", "C"), chord("G", "major", "G"), chord("A", "minor", "Am")]);
		await act(async () => root.render(<TabProposalPreview proposal={proposal} />));
		expect(host.textContent).toContain("C G Am picking");
		expect(host.textContent).toContain("4/4");
		expect(host.textContent).toContain("C · G · Am");
		const last = staveProps[staveProps.length - 1];
		expect(last.measures.length).toBeLessThanOrEqual(2);
		expect(last.measureWidths).toHaveLength(last.measures.length);
		expect(host.textContent).toContain(`3 bars · ${3 - last.measures.length} more in the editor`);
		expect(last.timeSignature).toEqual([4, 4]);
		expect(last.measures[0].slots[0].chord).toEqual({ root: "C", suffix: "major", voicingId: null });
	});

	it("lists the proposal's warnings", async () => {
		const proposal = proposalOf([chord("D", "major", "D")], "6 3 2 1");
		await act(async () => root.render(<TabProposalPreview proposal={proposal} />));
		expect(host.textContent).toContain("String 6 is not in the D shape");
	});

	it("hands the pattern to the fingerpick page and goes there", async () => {
		const proposal = proposalOf([chord("A", "minor", "Am")]);
		await act(async () => root.render(<TabProposalPreview proposal={proposal} />));
		const button = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Open in fingerpick"));
		await act(async () => button!.click());
		const handoff = takeHandoff("fingerpick");
		expect(handoff?.pattern.name).toBe(proposal.pattern.name);
		expect(handoff?.pattern.measures).toHaveLength(1);
		expect(push).toHaveBeenCalledWith("/fingerpick");
	});

	it("does not navigate when already on the fingerpick page", async () => {
		pathname = "/fingerpick";
		const proposal = proposalOf([chord("A", "minor", "Am")]);
		await act(async () => root.render(<TabProposalPreview proposal={proposal} />));
		const button = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Open in fingerpick"));
		await act(async () => button!.click());
		expect(push).not.toHaveBeenCalled();
		expect(takeHandoff("fingerpick")).not.toBeNull();
		pathname = "/strum";
	});
});
