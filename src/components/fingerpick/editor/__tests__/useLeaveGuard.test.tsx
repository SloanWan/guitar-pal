// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { mayNavigate } from "@/lib/leaveGuard";
import { useLeaveGuard } from "../useLeaveGuard";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Guard = ReturnType<typeof useLeaveGuard>;

/** Renders the hook in a probe; `result.current` is its latest return. */
function setup(dirty: boolean) {
	const navigate = { replace: vi.fn(), push: vi.fn() };
	const result: { current: Guard } = { current: null as unknown as Guard };
	function Probe({ d }: { d: boolean }) {
		result.current = useLeaveGuard(d, navigate);
		return null;
	}
	const root = createRoot(document.createElement("div"));
	act(() => root.render(<Probe d={dirty} />));
	return {
		navigate,
		result,
		rerender: ({ d }: { d: boolean }) => act(() => root.render(<Probe d={d} />)),
		unmount: () => act(() => root.unmount()),
	};
}

describe("useLeaveGuard", () => {
	let add: ReturnType<typeof vi.spyOn>;
	let remove: ReturnType<typeof vi.spyOn>;
	const listening = (type: string) =>
		add.mock.calls.filter(([t]) => t === type).length - remove.mock.calls.filter(([t]) => t === type).length;

	beforeEach(() => {
		add = vi.spyOn(window, "addEventListener");
		remove = vi.spyOn(window, "removeEventListener");
	});
	afterEach(() => vi.restoreAllMocks());

	it("listens to nothing while the tab is clean", () => {
		setup(false);
		expect(listening("beforeunload")).toBe(0);
		expect(listening("popstate")).toBe(0);
		expect(mayNavigate("/chords")).toBe(true);
	});

	it("holds reloads, back and links only while dirty, and lets go once clean again", () => {
		const { rerender, result } = setup(true);
		expect(listening("beforeunload")).toBe(1);
		expect(listening("popstate")).toBe(1);

		let allowed = true;
		act(() => {
			allowed = mayNavigate("/chords");
		});
		expect(allowed).toBe(false);
		expect(result.current.attempt).toEqual({ kind: "link", href: "/chords" });

		rerender({ d: false });
		expect(listening("beforeunload")).toBe(0);
		expect(listening("popstate")).toBe(0);
		expect(mayNavigate("/chords")).toBe(true);
	});

	it("removes everything on unmount", () => {
		const { unmount } = setup(true);
		unmount();
		expect(listening("beforeunload")).toBe(0);
		expect(listening("popstate")).toBe(0);
		expect(mayNavigate("/chords")).toBe(true);
	});

	it("asks before Close with edits, and closes straight away without", () => {
		const clean = setup(false);
		act(() => clean.result.current.request("/fingerpick"));
		expect(clean.navigate.replace).toHaveBeenCalledWith("/fingerpick");
		clean.unmount();

		const dirty = setup(true);
		act(() => dirty.result.current.request("/fingerpick"));
		expect(dirty.result.current.attempt).toEqual({ kind: "close", href: "/fingerpick" });
		expect(dirty.navigate.replace).not.toHaveBeenCalled();
	});

	it("keeps editing, or follows the held link on discard", () => {
		const { result, navigate } = setup(true);
		act(() => {
			mayNavigate("/chords");
		});
		act(() => result.current.keep());
		expect(result.current.attempt).toBeNull();
		expect(navigate.push).not.toHaveBeenCalled();

		act(() => {
			mayNavigate("/chords");
		});
		act(() => result.current.discard());
		expect(navigate.push).toHaveBeenCalledWith("/chords");
		// Once leaving, nothing is held any more.
		expect(mayNavigate("/home")).toBe(true);
	});

	it("holds the back button: the pop lands on the guard entry and asks", () => {
		const push = vi.spyOn(window.history, "pushState");
		const { result } = setup(true);
		expect(push).toHaveBeenCalledTimes(1);
		act(() => {
			window.dispatchEvent(new PopStateEvent("popstate"));
		});
		expect(result.current.attempt).toEqual({ kind: "back" });
		// Keep editing puts the guard entry back for the next press.
		act(() => result.current.keep());
		expect(push).toHaveBeenCalledTimes(2);
	});
});
