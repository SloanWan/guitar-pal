import { describe, it, expect } from "vitest";
import { SlidingWindowLimiter } from "@/lib/strumAssistant/rateLimit";

describe("SlidingWindowLimiter", () => {
	it("allows up to the limit inside one window", () => {
		const limiter = new SlidingWindowLimiter({ limit: 3, windowMs: 1000 });
		expect(limiter.check("a", 0).allowed).toBe(true);
		expect(limiter.check("a", 100).allowed).toBe(true);
		expect(limiter.check("a", 200).allowed).toBe(true);
		expect(limiter.check("a", 300).allowed).toBe(false);
	});

	it("counts down what is left", () => {
		const limiter = new SlidingWindowLimiter({ limit: 2, windowMs: 1000 });
		expect(limiter.check("a", 0).remaining).toBe(1);
		expect(limiter.check("a", 1).remaining).toBe(0);
	});

	it("keeps keys apart", () => {
		const limiter = new SlidingWindowLimiter({ limit: 1, windowMs: 1000 });
		expect(limiter.check("a", 0).allowed).toBe(true);
		expect(limiter.check("b", 0).allowed).toBe(true);
		expect(limiter.check("a", 0).allowed).toBe(false);
	});

	it("slides rather than resetting on a fixed boundary", () => {
		const limiter = new SlidingWindowLimiter({ limit: 2, windowMs: 1000 });
		limiter.check("a", 0);
		limiter.check("a", 900);
		expect(limiter.check("a", 950).allowed).toBe(false);
		// The first hit has aged out by 1001, the second has not.
		expect(limiter.check("a", 1001).allowed).toBe(true);
		expect(limiter.check("a", 1002).allowed).toBe(false);
	});

	it("says how long to wait", () => {
		const limiter = new SlidingWindowLimiter({ limit: 1, windowMs: 10_000 });
		limiter.check("a", 0);
		const verdict = limiter.check("a", 3000);
		expect(verdict.allowed).toBe(false);
		expect(verdict.retryAfterSeconds).toBe(7);
	});

	it("never reports a wait of zero while blocked", () => {
		const limiter = new SlidingWindowLimiter({ limit: 1, windowMs: 1000 });
		limiter.check("a", 0);
		expect(limiter.check("a", 999.9).retryAfterSeconds).toBeGreaterThanOrEqual(1);
	});

	it("drops idle keys so the map cannot grow without bound", () => {
		const limiter = new SlidingWindowLimiter({ limit: 5, windowMs: 1000 });
		for (let i = 0; i < 200; i++) limiter.check(`user-${i}`, 0);
		expect(limiter.size).toBe(200);
		// One later call prunes everything that has aged out.
		limiter.check("fresh", 5000);
		expect(limiter.size).toBe(1);
	});
});
