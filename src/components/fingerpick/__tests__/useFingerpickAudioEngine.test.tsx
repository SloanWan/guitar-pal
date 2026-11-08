import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";

/** The engine's sample load (#455): it never rejects, says when it failed, and a play after a failure loads again. */

const loader = vi.hoisted(() => ({
	preloadFingerpickPresets: vi.fn<(ctx: unknown) => Promise<void>>(),
	getFingerpickNoteData: vi.fn(),
}));
vi.mock("@/components/strum/useGuitarSampleLoader", () => loader);

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { useFingerpickAudioEngine } from "@/components/fingerpick/useFingerpickAudioEngine";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Engine = ReturnType<typeof useFingerpickAudioEngine>;

// No testing-library in this project: a bare harness that renders the hook
// and hands its latest return value out through a box.
function renderEngine(): { current: () => Engine; unmount: () => void } {
	const box: { value?: Engine } = {};
	function Harness() {
		box.value = useFingerpickAudioEngine();
		return null;
	}
	const container = document.createElement("div");
	let root: Root | null = null;
	act(() => {
		root = createRoot(container);
		root.render(<Harness />);
	});
	return { current: () => box.value as Engine, unmount: () => act(() => root?.unmount()) };
}

/** Enough of a context for the engine to make its gains; nothing is played here. */
class FakeContext {
	state = "running";
	currentTime = 0;
	destination = {};
	createGain() {
		return { gain: { value: 1 }, connect: () => undefined };
	}
	resume() {
		return Promise.resolve();
	}
	close() {
		this.state = "closed";
		return Promise.resolve();
	}
}

const pattern = {} as FingerpickPattern;

beforeEach(() => {
	vi.stubGlobal("AudioContext", FakeContext);
	vi.spyOn(console, "error").mockImplementation(() => undefined);
	loader.preloadFingerpickPresets.mockReset();
	toast.error.mockReset();
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("useFingerpickAudioEngine: load", () => {
	it("resolves true and marks the samples in", async () => {
		loader.preloadFingerpickPresets.mockResolvedValue(undefined);
		const engine = renderEngine();
		let ok: boolean | undefined;
		await act(async () => {
			ok = await engine.current().load();
		});
		expect(ok).toBe(true);
		expect(engine.current().isLoaded).toBe(true);
		expect(engine.current().loadFailed).toBe(false);
		expect(toast.error).not.toHaveBeenCalled();
		engine.unmount();
	});

	it("resolves false on a failure, never rejects, and tells the player once", async () => {
		loader.preloadFingerpickPresets.mockRejectedValue(new Error("HTTP 404 fetching preset"));
		const engine = renderEngine();
		let ok: boolean | undefined;
		await act(async () => {
			ok = await engine.current().load();
		});
		expect(ok).toBe(false);
		expect(engine.current().isLoaded).toBe(false);
		expect(engine.current().loadFailed).toBe(true);
		expect(toast.error).toHaveBeenCalledTimes(1);
		engine.unmount();
	});

	it("shares one attempt between calls made while it is in flight", async () => {
		let fail: (e: Error) => void = () => undefined;
		loader.preloadFingerpickPresets.mockReturnValue(new Promise((_, reject) => (fail = reject)));
		const engine = renderEngine();
		let first: Promise<boolean> | undefined;
		let second: Promise<boolean> | undefined;
		act(() => {
			first = engine.current().load();
			second = engine.current().load();
		});
		expect(second).toBe(first);
		await act(async () => {
			fail(new Error("offline"));
			await first;
		});
		expect(loader.preloadFingerpickPresets).toHaveBeenCalledTimes(1);
		expect(toast.error).toHaveBeenCalledTimes(1);
		engine.unmount();
	});

	it("loads again when played after a failure, and not before one", async () => {
		const engine = renderEngine();
		act(() => engine.current().play(pattern));
		expect(loader.preloadFingerpickPresets).not.toHaveBeenCalled();

		loader.preloadFingerpickPresets.mockRejectedValueOnce(new Error("offline"));
		await act(async () => {
			await engine.current().load();
		});
		loader.preloadFingerpickPresets.mockResolvedValueOnce(undefined);
		await act(async () => {
			engine.current().play(pattern);
		});
		expect(loader.preloadFingerpickPresets).toHaveBeenCalledTimes(2);
		expect(engine.current().isLoaded).toBe(true);
		expect(engine.current().loadFailed).toBe(false);
		engine.unmount();
	});
});
