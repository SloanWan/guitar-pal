import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Segmented, segmentThumb } from "@/components/ui/segmented";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const OPTIONS = [
	{ value: "loop", label: "Loop" },
	{ value: "once", label: "Once" },
	{ value: "count", label: "Count-in" },
] as const;

describe("segmentThumb", () => {
	it("puts the thumb on the chosen column", () => {
		expect(segmentThumb(OPTIONS, "loop")).toEqual({ index: 0, count: 3 });
		expect(segmentThumb(OPTIONS, "count")).toEqual({ index: 2, count: 3 });
	});
	it("hides it when nothing is chosen", () => {
		expect(segmentThumb(OPTIONS, "none")).toBeNull();
	});
});

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
});
afterEach(async () => {
	await act(async () => root.unmount());
	host.remove();
});

function Harness() {
	const [value, setValue] = useState<(typeof OPTIONS)[number]["value"]>("loop");
	return <Segmented label="Mode" options={OPTIONS} value={value} onChange={setValue} />;
}
const thumb = () => host.querySelector<HTMLElement>(".gp-seg-thumb")!;
const radios = () => [...host.querySelectorAll<HTMLButtonElement>("[role=radio]")];
const keydown = (k: string) =>
	act(() => {
		document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
	});

describe("Segmented", () => {
	it("moves the thumb to the clicked segment", async () => {
		await act(() => root.render(<Harness />));
		expect(thumb().style.getPropertyValue("--i")).toBe("0");
		expect(thumb().style.getPropertyValue("--n")).toBe("3");
		await act(() => radios()[2].click());
		expect(thumb().style.getPropertyValue("--i")).toBe("2");
		expect(radios().map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "false", "true"]);
	});

	it("is a radio group the arrow keys move through, wrapping", async () => {
		await act(() => root.render(<Harness />));
		radios()[0].focus();
		await keydown("ArrowLeft");
		expect(thumb().style.getPropertyValue("--i")).toBe("2");
		expect(document.activeElement).toBe(radios()[2]);
		await keydown("Home");
		expect(thumb().style.getPropertyValue("--i")).toBe("0");
		expect(radios().map((r) => r.tabIndex)).toEqual([0, -1, -1]);
	});
});
