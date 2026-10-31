import { describe, it, expect, vi } from "vitest";
import { claimAudition } from "@/lib/assistant/audition";

describe("claimAudition", () => {
	it("stops the card that was playing when another starts", () => {
		const first = vi.fn();
		const second = vi.fn();
		const releaseFirst = claimAudition(first);
		const releaseSecond = claimAudition(second);
		expect(first).toHaveBeenCalledOnce();
		expect(second).not.toHaveBeenCalled();
		releaseFirst();
		releaseSecond();
	});

	it("does not stop a card that claims again", () => {
		const stop = vi.fn();
		claimAudition(stop);
		const release = claimAudition(stop);
		expect(stop).not.toHaveBeenCalled();
		release();
	});

	it("a stale release leaves the newer claim in place", () => {
		const first = vi.fn();
		const second = vi.fn();
		const releaseFirst = claimAudition(first);
		const releaseSecond = claimAudition(second);
		releaseFirst();
		const third = vi.fn();
		const releaseThird = claimAudition(third);
		expect(second).toHaveBeenCalledOnce();
		releaseThird();
		releaseSecond();
	});

	it("after a release, the next card stops nothing", () => {
		const first = vi.fn();
		claimAudition(first)();
		const release = claimAudition(vi.fn());
		expect(first).not.toHaveBeenCalled();
		release();
	});
});
