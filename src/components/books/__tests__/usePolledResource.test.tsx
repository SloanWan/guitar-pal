import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { POLL_INTERVAL_MS, usePolledResource } from "@/components/books/usePolledResource";

// No testing-library in this project: a bare harness that renders the hook
// and hands its latest return value out through a box.
type Hooked<T> = ReturnType<typeof usePolledResource<T>>;

function renderHook<T>(use: () => Hooked<T>): { current: () => Hooked<T>; unmount: () => void } {
	const box: { value?: Hooked<T> } = {};
	function Harness() {
		box.value = use();
		return null;
	}
	const container = document.createElement("div");
	let root: Root | null = null;
	act(() => {
		root = createRoot(container);
		root.render(<Harness />);
	});
	return {
		current: () => box.value as Hooked<T>,
		unmount: () => act(() => root?.unmount()),
	};
}

/**
 * The poll is the only thing a book page does for minutes at a time, so:
 * it runs only while something is in flight, it stops when the tab hides,
 * and a slow old response never overwrites a newer one.
 */

type Row = { status: "scanning" | "ready" };
const scanning = (row: Row) => row.status === "scanning";

beforeEach(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

describe("usePolledResource", () => {
	it("loads once, then polls only while shouldPoll holds", async () => {
		const answers: Row[] = [{ status: "scanning" }, { status: "scanning" }, { status: "ready" }];
		const load = vi.fn(async () => answers.shift() ?? { status: "ready" as const });

		const hook = renderHook(() => usePolledResource(load, scanning));
		await act(async () => {});
		expect(load).toHaveBeenCalledTimes(1);
		expect(hook.current().value).toEqual({ status: "scanning" });

		await act(async () => {
			await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
		});
		expect(load).toHaveBeenCalledTimes(2);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
		});
		expect(load).toHaveBeenCalledTimes(3);
		expect(hook.current().value).toEqual({ status: "ready" });

		// Ready: the interval is gone.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5);
		});
		expect(load).toHaveBeenCalledTimes(3);
	});

	it("pauses while the document is hidden and refreshes when it shows again", async () => {
		const load = vi.fn(async (): Promise<Row> => ({ status: "scanning" }));
		renderHook(() => usePolledResource(load, scanning));
		await act(async () => {});
		expect(load).toHaveBeenCalledTimes(1);

		const visibility = vi.spyOn(document, "visibilityState", "get");
		visibility.mockReturnValue("hidden");
		act(() => document.dispatchEvent(new Event("visibilitychange")));
		await act(async () => {
			await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
		});
		expect(load).toHaveBeenCalledTimes(1);

		visibility.mockReturnValue("visible");
		act(() => document.dispatchEvent(new Event("visibilitychange")));
		await act(async () => {});
		expect(load).toHaveBeenCalledTimes(2);
		visibility.mockRestore();
	});

	it("lets the newest answer win over a slower older one", async () => {
		let resolveSlow: (row: Row) => void = () => {};
		const slow = new Promise<Row>((resolve) => {
			resolveSlow = resolve;
		});
		const load = vi
			.fn<() => Promise<Row>>()
			.mockReturnValueOnce(slow)
			.mockResolvedValue({ status: "ready" });

		const hook = renderHook(() => usePolledResource(load, scanning));
		await act(async () => {
			await hook.current().refresh();
		});
		expect(hook.current().value).toEqual({ status: "ready" });

		await act(async () => {
			resolveSlow({ status: "scanning" });
		});
		expect(hook.current().value).toEqual({ status: "ready" });
	});

	it("surfaces a failed load as error and keeps the last value", async () => {
		const load = vi
			.fn<() => Promise<Row>>()
			.mockResolvedValueOnce({ status: "ready" })
			.mockRejectedValueOnce(new Error("down"));
		const hook = renderHook(() => usePolledResource(load, scanning));
		await act(async () => {});
		await act(async () => {
			await hook.current().refresh();
		});
		expect(hook.current().value).toEqual({ status: "ready" });
		expect(hook.current().error).toBeInstanceOf(Error);
	});
});
