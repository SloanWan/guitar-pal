import { describe, expect, it, vi } from "vitest";
import { copyKey, forgetAccountCopies, memoryStore, readThrough, saveCopy, type CopyStore } from "../libraryCopy";

const patterns = [{ id: "p1", name: "Waltz" }];

describe("readThrough", () => {
	it("returns the account's answer and keeps it", async () => {
		const store = memoryStore();
		const remote = vi.fn().mockResolvedValue(patterns);
		expect(await readThrough("strumPatterns", "u1", remote, { store, online: true })).toEqual(patterns);
		expect(remote).toHaveBeenCalledOnce();
		expect(await store.get(copyKey("u1", "strumPatterns"))).toMatchObject({ value: patterns });
	});

	it("answers from the copy when the read fails", async () => {
		const store = memoryStore();
		await saveCopy("strumPatterns", "u1", patterns, store);
		const remote = vi.fn().mockRejectedValue(new Error("TypeError: Failed to fetch"));
		expect(await readThrough("strumPatterns", "u1", remote, { store, online: true })).toEqual(patterns);
	});

	it("answers from the copy without asking when the browser is offline", async () => {
		const store = memoryStore();
		await saveCopy("progressions", "u1", patterns, store);
		const remote = vi.fn().mockResolvedValue([]);
		expect(await readThrough("progressions", "u1", remote, { store, online: false })).toEqual(patterns);
		expect(remote).not.toHaveBeenCalled();
	});

	it("still asks offline when there is no copy, and fails as the read did", async () => {
		const store = memoryStore();
		const failure = new Error("TypeError: Failed to fetch");
		const remote = vi.fn().mockRejectedValue(failure);
		await expect(readThrough("progressions", "u1", remote, { store, online: false })).rejects.toBe(failure);
		expect(remote).toHaveBeenCalledOnce();
	});

	it("never answers one account with another's copy", async () => {
		const store = memoryStore();
		await saveCopy("strumPatterns", "u1", patterns, store);
		const remote = vi.fn().mockRejectedValue(new Error("offline"));
		await expect(readThrough("strumPatterns", "u2", remote, { store, online: false })).rejects.toThrow("offline");
	});

	it("keeps libraries apart", async () => {
		const store = memoryStore();
		await saveCopy("strumFavourites", "u1", ["p1"], store);
		const remote = vi.fn().mockRejectedValue(new Error("offline"));
		await expect(readThrough("strumPatterns", "u1", remote, { store, online: true })).rejects.toThrow("offline");
	});

	it("ignores a copy that is not one of its own records", async () => {
		const store = memoryStore();
		await store.put(copyKey("u1", "strumPatterns"), patterns);
		const remote = vi.fn().mockRejectedValue(new Error("offline"));
		await expect(readThrough("strumPatterns", "u1", remote, { store, online: true })).rejects.toThrow("offline");
	});

	it("reads and writes through a store that fails, as if there were no copy", async () => {
		const broken: CopyStore = {
			get: () => Promise.reject(new Error("blocked")),
			put: () => Promise.reject(new Error("blocked")),
			deleteAccount: () => Promise.reject(new Error("blocked")),
		};
		expect(await readThrough("strumPatterns", "u1", async () => patterns, { store: broken, online: true })).toEqual(patterns);
		await expect(
			readThrough("strumPatterns", "u1", () => Promise.reject(new Error("offline")), { store: broken, online: false }),
		).rejects.toThrow("offline");
		await expect(forgetAccountCopies("u1", broken)).resolves.toBeUndefined();
	});
});

describe("readThrough on a connection that carries nothing", () => {
	it("shows the copy once the read takes too long, and keeps the late answer for next time", async () => {
		vi.useFakeTimers();
		try {
			const store = memoryStore();
			await saveCopy("strumPatterns", "u1", patterns, store);
			let answer: (value: unknown) => void = () => undefined;
			const remote = () => new Promise<unknown>((resolve) => (answer = resolve));
			const reading = readThrough("strumPatterns", "u1", remote, { store, online: true, timeoutMs: 100 });
			await vi.advanceTimersByTimeAsync(100);
			expect(await reading).toEqual(patterns);

			const fresh = [{ id: "p2", name: "Shuffle" }];
			answer(fresh);
			await vi.waitFor(async () => expect(await store.get(copyKey("u1", "strumPatterns"))).toMatchObject({ value: fresh }));
		} finally {
			vi.useRealTimers();
		}
	});

	it("waits as long as it takes when there is no copy to show", async () => {
		vi.useFakeTimers();
		try {
			const store = memoryStore();
			let answer: (value: unknown) => void = () => undefined;
			const reading = readThrough("strumPatterns", "u1", () => new Promise<unknown>((resolve) => (answer = resolve)), {
				store,
				online: true,
				timeoutMs: 100,
			});
			await vi.advanceTimersByTimeAsync(1000);
			answer(patterns);
			expect(await reading).toEqual(patterns);
		} finally {
			vi.useRealTimers();
		}
	});

	it("leaves no timer behind once the read answers", async () => {
		vi.useFakeTimers();
		try {
			const store = memoryStore();
			await saveCopy("strumPatterns", "u1", patterns, store);
			await readThrough("strumPatterns", "u1", async () => patterns, { store, online: true, timeoutMs: 100 });
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("forgetAccountCopies", () => {
	it("deletes every library of one account and no other's", async () => {
		const store = memoryStore();
		await saveCopy("strumPatterns", "u1", patterns, store);
		await saveCopy("chordVoicings", "u1", [], store);
		await saveCopy("strumPatterns", "u10", patterns, store);
		await forgetAccountCopies("u1", store);
		expect(await store.get(copyKey("u1", "strumPatterns"))).toBeUndefined();
		expect(await store.get(copyKey("u1", "chordVoicings"))).toBeUndefined();
		// A prefix of another id is not that account.
		expect(await store.get(copyKey("u10", "strumPatterns"))).toMatchObject({ value: patterns });
	});
});
