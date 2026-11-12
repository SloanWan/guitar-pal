import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const saveCopy = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/offline/libraryCopy", () => ({ saveCopy: (...args: unknown[]) => saveCopy(...args) }));

const { useLibraryCopy } = await import("../useLibraryCopy");

interface Props {
	userId: string | undefined;
	value: unknown;
	ready: boolean;
}

// No testing-library in this project: a bare harness, re-rendered with new props.
function Harness({ userId, value, ready }: Props) {
	useLibraryCopy("strumPatterns", userId, value, ready);
	return null;
}

let root: Root | null = null;
function render(props: Props) {
	act(() => {
		root ??= createRoot(document.createElement("div"));
		root.render(<Harness {...props} />);
	});
}

describe("useLibraryCopy", () => {
	beforeEach(() => saveCopy.mockClear());
	afterEach(() => {
		act(() => root?.unmount());
		root = null;
	});

	it("does not write the first value once ready: that is the read, kept already", () => {
		render({ userId: "u1", value: [], ready: false });
		render({ userId: "u1", value: ["a"], ready: true });
		expect(saveCopy).not.toHaveBeenCalled();
	});

	it("writes what changes after, the page's own writes", () => {
		const loaded = ["a"];
		const saved = ["a", "b"];
		render({ userId: "u1", value: loaded, ready: true });
		render({ userId: "u1", value: saved, ready: true });
		expect(saveCopy).toHaveBeenCalledExactlyOnceWith("strumPatterns", "u1", saved);
	});

	it("puts no list over a copy while a list is still loading (the favourites after the patterns)", () => {
		const empty: string[] = [];
		render({ userId: "u1", value: empty, ready: true });
		render({ userId: "u1", value: empty, ready: true });
		expect(saveCopy).not.toHaveBeenCalled();
	});

	it("writes nothing for a guest", () => {
		render({ userId: undefined, value: ["a"], ready: true });
		render({ userId: undefined, value: ["b"], ready: true });
		expect(saveCopy).not.toHaveBeenCalled();
	});

	it("starts over for another account, and after a reload of the list", () => {
		render({ userId: "u1", value: ["a"], ready: true });
		render({ userId: "u2", value: ["b"], ready: true });
		render({ userId: "u2", value: ["b"], ready: false });
		render({ userId: "u2", value: ["c"], ready: true });
		expect(saveCopy).not.toHaveBeenCalled();
	});
});
