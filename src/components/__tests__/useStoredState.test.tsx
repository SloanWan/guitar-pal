import { describe, it, expect, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FLAG_CODEC, useStoredState, type StoredCodec } from "@/components/useStoredState";

// No testing-library in this project: a bare harness that renders the hook
// and hands its latest return value out through a box.
function renderStored<T>(key: string, fallback: T, codec: StoredCodec<T>) {
	const box: { value?: [T, (value: T) => void] } = {};
	function Harness() {
		box.value = useStoredState(key, fallback, codec);
		return null;
	}
	const container = document.createElement("div");
	let root: Root | null = null;
	act(() => {
		root = createRoot(container);
		root.render(<Harness />);
	});
	return {
		current: () => box.value as [T, (value: T) => void],
		unmount: () => act(() => root?.unmount()),
	};
}

// The stored value lands in a microtask after mount.
async function settle() {
	await act(async () => {
		await Promise.resolve();
	});
}

const SIZE: StoredCodec<number> = {
	parse: (raw) => (Number.isFinite(Number(raw)) ? Number(raw) : null),
	format: String,
};

describe("useStoredState", () => {
	beforeEach(() => localStorage.clear());

	it("starts at the fallback when nothing is stored", async () => {
		const hook = renderStored("k", false, FLAG_CODEC);
		await settle();
		expect(hook.current()[0]).toBe(false);
		hook.unmount();
	});

	it("reads back what this browser stored", async () => {
		localStorage.setItem("k", "1");
		const hook = renderStored("k", false, FLAG_CODEC);
		await settle();
		expect(hook.current()[0]).toBe(true);
		hook.unmount();
	});

	it("keeps the fallback for a stored value the codec refuses", async () => {
		localStorage.setItem("size", "wide");
		const hook = renderStored("size", 64, SIZE);
		await settle();
		expect(hook.current()[0]).toBe(64);
		hook.unmount();
	});

	it("stores what it is set to", async () => {
		const hook = renderStored("k", false, FLAG_CODEC);
		await settle();
		act(() => hook.current()[1](true));
		expect(hook.current()[0]).toBe(true);
		expect(localStorage.getItem("k")).toBe("1");
		hook.unmount();
	});
});
