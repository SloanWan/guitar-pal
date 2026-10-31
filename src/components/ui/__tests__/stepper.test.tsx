import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { REPEAT_DELAY_MS, REPEAT_EVERY_MS, Stepper } from "@/components/ui/stepper";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const changes: number[] = [];
function Harness({ initial = 100, max = 240 }: { initial?: number; max?: number }) {
	const [value, setValue] = useState(initial);
	return (
		<Stepper
			label="tempo"
			value={value}
			min={40}
			max={max}
			tap
			onChange={(v) => {
				changes.push(v);
				setValue(v);
			}}
		/>
	);
}

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
	vi.useFakeTimers();
	changes.length = 0;
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
});
afterEach(async () => {
	await act(async () => root.unmount());
	host.remove();
	vi.useRealTimers();
});

const render = (ui: React.ReactNode) => act(() => root.render(ui));
const button = (name: string) => host.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`)!;
const readout = () => host.querySelector("output")!.textContent;
const fire = (target: EventTarget, type: string) =>
	act(() => {
		target.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0 }));
	});
const click = (target: HTMLElement) => act(() => target.click());
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("Stepper", () => {
	it("steps once per click", async () => {
		await render(<Harness />);
		await click(button("Increase tempo"));
		await click(button("Increase tempo"));
		await click(button("Decrease tempo"));
		expect(changes).toEqual([101, 102, 101]);
		expect(readout()).toBe("101");
	});

	it("repeats while held and does not step again on the click that ends the hold", async () => {
		await render(<Harness />);
		const up = button("Increase tempo");
		await fire(up, "pointerdown");
		await wait(REPEAT_DELAY_MS - 1);
		expect(changes).toEqual([]);
		await wait(1 + REPEAT_EVERY_MS * 3);
		expect(changes).toEqual([101, 102, 103, 104]);
		await fire(up, "pointerup");
		await click(up);
		await wait(REPEAT_EVERY_MS * 5);
		expect(changes).toEqual([101, 102, 103, 104]);
		expect(vi.getTimerCount()).toBe(0);
		// the next plain click steps again
		await click(up);
		expect(changes.at(-1)).toBe(105);
	});

	it("stops repeating at a bound and disables that button", async () => {
		await render(<Harness initial={237} />);
		const up = button("Increase tempo");
		await fire(up, "pointerdown");
		await wait(REPEAT_DELAY_MS + REPEAT_EVERY_MS * 10);
		expect(changes).toEqual([238, 239, 240]);
		expect(vi.getTimerCount()).toBe(0);
		expect(up.disabled).toBe(true);
		await fire(window, "pointerup");
	});

	it("stops on pointer cancel, and on a release away from the button", async () => {
		await render(<Harness />);
		const down = button("Decrease tempo");
		await fire(down, "pointerdown");
		await wait(REPEAT_DELAY_MS + REPEAT_EVERY_MS);
		await fire(window, "pointercancel");
		const held = changes.length;
		await wait(REPEAT_EVERY_MS * 5);
		expect(changes).toHaveLength(held);
		expect(vi.getTimerCount()).toBe(0);

		await fire(down, "pointerdown");
		await wait(REPEAT_DELAY_MS);
		await fire(document.body, "pointerup");
		const again = changes.length;
		await wait(REPEAT_EVERY_MS * 5);
		expect(changes).toHaveLength(again);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("leaves no timer or listener behind when unmounted mid-hold", async () => {
		const removed = vi.spyOn(window, "removeEventListener");
		await render(<Harness />);
		await fire(button("Increase tempo"), "pointerdown");
		await wait(REPEAT_DELAY_MS + REPEAT_EVERY_MS);
		const before = changes.length;
		await act(async () => root.unmount());
		expect(vi.getTimerCount()).toBe(0);
		const types = removed.mock.calls.map(([type]) => type);
		expect(types).toEqual(expect.arrayContaining(["pointerup", "pointercancel"]));
		await wait(REPEAT_EVERY_MS * 5);
		expect(changes).toHaveLength(before);
		root = createRoot(host);
		removed.mockRestore();
	});

	it("sets the value from tapped beats", async () => {
		vi.setSystemTime(0);
		await render(<Harness />);
		const tap = button("Tap tempo");
		for (let i = 0; i < 4; i++) {
			await click(tap);
			await wait(500);
		}
		expect(changes.at(-1)).toBe(120);
	});
});
