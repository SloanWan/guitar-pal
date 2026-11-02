import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useCountIn, type CountIn } from "@/components/playback/useCountIn";
import { COUNT_IN_KEY, formatCountIn, type CountInSetting } from "@/lib/countIn";

// No testing-library in this project: a bare harness that renders the hook
// and hands its latest return value out through a box.
function renderHook(go: () => void): { current: () => CountIn; unmount: () => void } {
	const box: { value?: CountIn } = {};
	function Harness() {
		box.value = useCountIn(go);
		return null;
	}
	const container = document.createElement("div");
	let root: Root | null = null;
	act(() => {
		root = createRoot(container);
		root.render(<Harness />);
	});
	return { current: () => box.value as CountIn, unmount: () => act(() => root?.unmount()) };
}

/** A context that records the cues it is asked to sound. */
class FakeContext {
	static made: FakeContext[] = [];
	currentTime = 0;
	state = "running";
	cues: { start: number; stopped: boolean; freq: number }[] = [];
	closed = false;
	constructor() {
		FakeContext.made.push(this);
	}
	createOscillator() {
		const cue = { start: -1, stopped: false, freq: 0 };
		this.cues.push(cue);
		const param = { set value(v: number) { cue.freq = v; } };
		return {
			type: "sine",
			frequency: param,
			connect: (next: unknown) => next,
			start: (when: number) => {
				cue.start = when;
			},
			stop: () => {
				cue.stopped = true;
			},
			onended: null,
		};
	}
	createGain() {
		const ramp = () => {};
		return {
			gain: { setValueAtTime: ramp, exponentialRampToValueAtTime: ramp },
			connect: (next: unknown) => next,
			disconnect: () => {},
		};
	}
	get destination() {
		return {};
	}
	resume() {
		return Promise.resolve();
	}
	close() {
		this.closed = true;
		return Promise.resolve();
	}
}

function store(setting: CountInSetting) {
	localStorage.setItem(COUNT_IN_KEY, formatCountIn(setting));
}

/** The stored setting is read after mount, in a microtask. */
async function settle() {
	await act(async () => {
		await Promise.resolve();
	});
}

beforeEach(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	vi.useFakeTimers();
	localStorage.clear();
	FakeContext.made = [];
	vi.stubGlobal("AudioContext", FakeContext);
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("useCountIn", () => {
	it("off: starts at once, without waking the engine early", async () => {
		const go = vi.fn();
		const prime = vi.fn();
		const hook = renderHook(go);
		await settle();
		act(() => hook.current().begin(prime));
		expect(go).toHaveBeenCalledTimes(1);
		expect(prime).not.toHaveBeenCalled();
		expect(hook.current().remaining).toBeNull();
		hook.unmount();
	});

	it("on: wakes the engine in the press, counts the seconds down, then starts", async () => {
		store({ on: true, seconds: 3, cue: false });
		const go = vi.fn();
		const prime = vi.fn();
		const hook = renderHook(go);
		await settle();
		act(() => hook.current().begin(prime));
		expect(prime).toHaveBeenCalledTimes(1);
		expect(hook.current().remaining).toBe(3);
		act(() => vi.advanceTimersByTime(1000));
		expect(hook.current().remaining).toBe(2);
		act(() => vi.advanceTimersByTime(1000));
		expect(hook.current().remaining).toBe(1);
		expect(go).not.toHaveBeenCalled();
		act(() => vi.advanceTimersByTime(1000));
		expect(go).toHaveBeenCalledTimes(1);
		expect(hook.current().remaining).toBeNull();
		// No cue asked for, no context made.
		expect(FakeContext.made).toHaveLength(0);
		hook.unmount();
	});

	it("starts with the page's latest start, not the one from the press", async () => {
		store({ on: true, seconds: 3, cue: false });
		const first = vi.fn();
		const latest = vi.fn();
		const box: { go: () => void } = { go: first };
		const hook = renderHook(() => box.go());
		await settle();
		act(() => hook.current().begin(() => {}));
		box.go = latest;
		act(() => vi.advanceTimersByTime(3000));
		expect(first).not.toHaveBeenCalled();
		expect(latest).toHaveBeenCalledTimes(1);
		hook.unmount();
	});

	it("cancelled: the start never comes, and the cues still to sound are stopped", async () => {
		store({ on: true, seconds: 5, cue: true });
		const go = vi.fn();
		const hook = renderHook(go);
		await settle();
		act(() => hook.current().begin(() => {}));
		const ctx = FakeContext.made[0];
		expect(ctx.cues).toHaveLength(5);
		// The last three are the count: higher.
		expect(ctx.cues.map((c) => c.freq > ctx.cues[0].freq)).toEqual([false, false, true, true, true]);
		act(() => vi.advanceTimersByTime(2000));
		act(() => hook.current().cancel());
		expect(hook.current().remaining).toBeNull();
		expect(ctx.cues.every((c) => c.stopped)).toBe(true);
		act(() => vi.advanceTimersByTime(10_000));
		expect(go).not.toHaveBeenCalled();
		hook.unmount();
	});

	it("leaves no timer and no context behind when the page goes", async () => {
		store({ on: true, seconds: 10, cue: true });
		const go = vi.fn();
		const hook = renderHook(go);
		await settle();
		const before = vi.getTimerCount();
		act(() => hook.current().begin(() => {}));
		expect(vi.getTimerCount()).toBe(before + 10);
		hook.unmount();
		expect(vi.getTimerCount()).toBe(before);
		expect(FakeContext.made[0].closed).toBe(true);
		act(() => vi.advanceTimersByTime(10_000));
		expect(go).not.toHaveBeenCalled();
	});
});
