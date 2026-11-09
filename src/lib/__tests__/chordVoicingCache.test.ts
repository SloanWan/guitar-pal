import { describe, it, expect, vi } from "vitest";
import {
	batchVoicingFetches,
	createVoicingCache,
	voicingCacheKey,
	type VoicingBatchFetcher,
	type VoicingStorage,
} from "@/lib/chordVoicingCache";
import type { ChordVoicing } from "@/lib/chordVoicing";

const C_MAJOR: ChordVoicing = {
	id: "c-std",
	label: "Standard",
	start_fret: 1,
	barre_fret: null,
	capo: false,
	frets: "x32010",
	fingers: "032010",
};

function fakeStorage(seed: Record<string, string> = {}): VoicingStorage & {
	written: Record<string, string>;
} {
	const written: Record<string, string> = { ...seed };
	return {
		written,
		getItem: (key) => written[key] ?? null,
		setItem: (key, value) => {
			written[key] = value;
		},
	};
}

/** A storage locked down the way Safari's private mode locks it down. */
function throwingStorage(): VoicingStorage {
	return {
		getItem: () => {
			throw new Error("denied");
		},
		setItem: () => {
			throw new Error("denied");
		},
	};
}

describe("createVoicingCache", () => {
	it("fetches a chord once and serves every later call from memory", async () => {
		const fetcher = vi.fn(async () => [C_MAJOR]);
		const cache = createVoicingCache(fetcher);

		expect(await cache.load("C", "major")).toEqual([C_MAJOR]);
		expect(await cache.load("C", "major")).toEqual([C_MAJOR]);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it("joins concurrent calls for the same chord into one request", async () => {
		const fetcher = vi.fn(async () => [C_MAJOR]);
		const cache = createVoicingCache(fetcher);

		const [a, b] = await Promise.all([cache.load("C", "major"), cache.load("C", "major")]);
		expect(a).toBe(b);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it("keys on the chord identity, not just the root", async () => {
		const fetcher = vi.fn(async (root: string, suffix: string) => [
			{ ...C_MAJOR, id: `${root}-${suffix}` },
		]);
		const cache = createVoicingCache(fetcher);

		await cache.load("C", "major");
		await cache.load("C", "minor");
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(cache.peek("C", "minor")?.[0].id).toBe("C-minor");
	});

	it("peeks null before the fetch and the voicings after it", async () => {
		const cache = createVoicingCache(async () => [C_MAJOR]);

		expect(cache.peek("C", "major")).toBeNull();
		await cache.load("C", "major");
		expect(cache.peek("C", "major")).toEqual([C_MAJOR]);
	});

	it("persists a fetched chord, so a later cache reads it without fetching", async () => {
		const storage = fakeStorage();
		await createVoicingCache(async () => [C_MAJOR], storage).load("C", "major");

		const fetcher = vi.fn(async () => [C_MAJOR]);
		const reloaded = createVoicingCache(fetcher, storage);
		// Synchronously, on the very first read — no placeholder to flash.
		expect(reloaded.peek("C", "major")).toEqual([C_MAJOR]);
		expect(await reloaded.load("C", "major")).toEqual([C_MAJOR]);
		expect(fetcher).not.toHaveBeenCalled();
	});

	it("ignores a corrupt stored entry instead of throwing", async () => {
		const storage = fakeStorage({ [`chordVoicings:v1:${voicingCacheKey("C", "major")}`]: "{" });
		const cache = createVoicingCache(async () => [C_MAJOR], storage);

		expect(cache.peek("C", "major")).toBeNull();
		expect(await cache.load("C", "major")).toEqual([C_MAJOR]);
	});

	it("still works when storage refuses both reads and writes", async () => {
		const cache = createVoicingCache(async () => [C_MAJOR], throwingStorage());

		expect(cache.peek("C", "major")).toBeNull();
		expect(await cache.load("C", "major")).toEqual([C_MAJOR]);
		expect(cache.peek("C", "major")).toEqual([C_MAJOR]);
	});

	it("does not cache a failed fetch, so the next call retries", async () => {
		let attempts = 0;
		const fetcher = vi.fn(async () => {
			attempts += 1;
			if (attempts === 1) throw new Error("offline");
			return [C_MAJOR];
		});
		const cache = createVoicingCache(fetcher);

		await expect(cache.load("C", "major")).rejects.toThrow("offline");
		expect(cache.peek("C", "major")).toBeNull();
		expect(await cache.load("C", "major")).toEqual([C_MAJOR]);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it("caches an empty answer, so a chord the library lacks is asked for once", async () => {
		const fetcher = vi.fn(async () => []);
		const cache = createVoicingCache(fetcher);

		// "This chord has no voicings" is an answer, not a miss: it is cached like
		// any other, and the diagram view falls back to the chord name.
		expect(await cache.load("H", "major")).toEqual([]);
		expect(await cache.load("H", "major")).toEqual([]);
		expect(cache.peek("H", "major")).toEqual([]);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
});

describe("batchVoicingFetches", () => {
	it("sends the chords asked for in one tick as one request, each answered from it", async () => {
		const fetchMany = vi.fn<VoicingBatchFetcher>(async (chords) =>
			Object.fromEntries(chords.map(({ root, suffix }) => [voicingCacheKey(root, suffix), [{ ...C_MAJOR, id: `${root}-${suffix}` }]])),
		);
		const fetchOne = batchVoicingFetches(fetchMany);
		const [c, am, c2] = await Promise.all([fetchOne("C", "major"), fetchOne("A", "minor"), fetchOne("C", "major")]);
		expect(fetchMany).toHaveBeenCalledTimes(1);
		expect(fetchMany.mock.calls[0][0]).toEqual([
			{ root: "C", suffix: "major" },
			{ root: "A", suffix: "minor" },
		]);
		expect(c[0].id).toBe("C-major");
		expect(am[0].id).toBe("A-minor");
		expect(c2).toBe(c);
	});

	it("splits a long batch, and starts a new one on a later tick", async () => {
		const fetchMany = vi.fn<VoicingBatchFetcher>(async () => ({}));
		const fetchOne = batchVoicingFetches(fetchMany, 2);
		await Promise.all(["C", "D", "E"].map((root) => fetchOne(root, "major")));
		expect(fetchMany.mock.calls.map(([chords]) => chords.length)).toEqual([2, 1]);
		await fetchOne("F", "major");
		expect(fetchMany).toHaveBeenCalledTimes(3);
	});

	it("answers a chord missing from the reply with an empty list", async () => {
		const fetchOne = batchVoicingFetches(async () => ({}));
		expect(await fetchOne("G", "add11")).toEqual([]);
	});

	it("fails every chord of a failed request, and the cache retries them next time", async () => {
		const fetchMany = vi
			.fn<VoicingBatchFetcher>()
			.mockRejectedValueOnce(new Error("timed out"))
			.mockResolvedValueOnce({ "C major": [C_MAJOR] });
		const cache = createVoicingCache(batchVoicingFetches(fetchMany));
		const results = await Promise.allSettled([cache.load("C", "major"), cache.load("A", "minor")]);
		expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
		expect(await cache.load("C", "major")).toEqual([C_MAJOR]);
		expect(fetchMany).toHaveBeenCalledTimes(2);
	});
});

describe("failures and Try again (#463)", () => {
	it("records a failed chord, forgets it when it loads, and tells subscribers each time", async () => {
		const fetcher = vi.fn<(root: string, suffix: string) => Promise<ChordVoicing[]>>()
			.mockRejectedValueOnce(new Error("timed out"))
			.mockResolvedValueOnce([C_MAJOR]);
		const cache = createVoicingCache(fetcher);
		const heard = vi.fn();
		const unsubscribe = cache.subscribe(heard);

		await expect(cache.load("C", "major")).rejects.toThrow("timed out");
		expect(cache.isFailed("C", "major")).toBe(true);
		const afterFailure = cache.failures();
		expect([...afterFailure]).toEqual(["C major"]);

		await cache.load("C", "major");
		expect(cache.isFailed("C", "major")).toBe(false);
		expect(cache.failures()).not.toBe(afterFailure);
		expect(heard).toHaveBeenCalled();

		unsubscribe();
		heard.mockClear();
		cache.retryFailed();
		expect(heard).not.toHaveBeenCalled();
	});

	it("clears every failure and counts the retry", async () => {
		const cache = createVoicingCache(async () => {
			throw new Error("offline");
		});
		await Promise.allSettled([cache.load("C", "major"), cache.load("A", "minor")]);
		expect(cache.failures().size).toBe(2);
		expect(cache.retries()).toBe(0);
		cache.retryFailed();
		expect(cache.failures().size).toBe(0);
		expect(cache.retries()).toBe(1);
	});

	it("keeps the same failure set between changes, so a store reading it settles", () => {
		const cache = createVoicingCache(async () => [C_MAJOR]);
		expect(cache.failures()).toBe(cache.failures());
	});
});
