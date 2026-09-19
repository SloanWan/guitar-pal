// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ChordVoicing } from "@/lib/chordVoicing";
import type { ChordRef } from "@/lib/strumPatterns";
import type { UserChordVoicing } from "@/lib/userChordVoicings";

// The hook reads and fills the shared voicing cache; the cache is faked here so
// the tests control what is already known and what a lookup returns.
const cache = new Map<string, ChordVoicing[]>();
const pendingLoads = new Map<string, { resolve: (v: ChordVoicing[]) => void; reject: (e: Error) => void }>();
const loadCalls: string[] = [];
vi.mock("@/lib/chordVoicingCache", () => ({
	voicingCacheKey: (root: string, suffix: string) => `${root} ${suffix}`,
	peekVoicings: (root: string, suffix: string) => cache.get(`${root} ${suffix}`) ?? null,
	loadVoicings: (root: string, suffix: string) => {
		const key = `${root} ${suffix}`;
		loadCalls.push(key);
		return new Promise<ChordVoicing[]>((resolve, reject) => {
			pendingLoads.set(key, {
				resolve: (v) => {
					cache.set(key, v);
					resolve(v);
				},
				reject,
			});
		});
	},
}));

import { useChordVoicings, type ChordVoicingsState } from "../useChordVoicings";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const C: ChordRef = { root: "C", suffix: "major" };
const Am: ChordRef = { root: "A", suffix: "minor" };
const voicing = (id: string, frets = "x32010"): ChordVoicing => ({
	id,
	label: null,
	start_fret: 1,
	barre_fret: null,
	capo: false,
	frets,
	fingers: "032010",
});
const mine = (id: string, root: string, suffix: string): UserChordVoicing => ({
	...voicing(id, "x35553"),
	root,
	suffix,
	category: null,
});

// Mounts the hook and exposes its lookup for the given chords. The probe hands
// the lookup out through a callback prop rather than assigning module state
// from inside the component, which the React compiler lint forbids.
let latest: ((ref: ChordRef) => ChordVoicingsState) | null = null;
function Probe({
	refs,
	user,
	onLookup,
}: {
	refs: ChordRef[];
	user: UserChordVoicing[];
	onLookup: (lookup: (ref: ChordRef) => ChordVoicingsState) => void;
}) {
	const lookup = useChordVoicings(refs, user);
	onLookup(lookup);
	return null;
}
const capture = (lookup: (ref: ChordRef) => ChordVoicingsState) => {
	latest = lookup;
};
async function mount(refs: ChordRef[], user: UserChordVoicing[] = []): Promise<Root> {
	const host = document.createElement("div");
	document.body.appendChild(host);
	let root!: Root;
	await act(async () => {
		root = createRoot(host);
		root.render(<Probe refs={refs} user={user} onLookup={capture} />);
	});
	return root;
}

beforeEach(() => {
	cache.clear();
	pendingLoads.clear();
	loadCalls.length = 0;
	latest = null;
});

describe("useChordVoicings", () => {
	it("reports a chord as loading until its lookup resolves, then ready with its voicings", async () => {
		await mount([C]);
		expect(latest!(C)).toEqual({ status: "loading" });
		expect(loadCalls).toEqual(["C major"]);
		await act(async () => {
			pendingLoads.get("C major")!.resolve([voicing("c1")]);
		});
		expect(latest!(C)).toEqual({ status: "ready", voicings: [voicing("c1")] });
	});

	it("serves a chord already in the cache without a lookup", async () => {
		cache.set("A minor", [voicing("am1", "x02210")]);
		await mount([Am]);
		expect(loadCalls).toEqual([]);
		expect(latest!(Am).status).toBe("ready");
	});

	it("looks each distinct chord up once, however many times it is named", async () => {
		await mount([C, C, { ...C, voicingId: "pinned" }, Am]);
		expect(loadCalls).toEqual(["C major", "A minor"]);
	});

	it("reports a failed lookup as failed rather than loading forever", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		await mount([C]);
		await act(async () => {
			pendingLoads.get("C major")!.reject(new Error("offline"));
		});
		expect(latest!(C)).toEqual({ status: "failed" });
		errorSpy.mockRestore();
	});

	it("merges the player's own shapes after the library's, and answers from them alone for a chord the library lacks", async () => {
		cache.set("C major", [voicing("c1")]);
		const own = mine("u1", "C", "major");
		const unknownOwn = mine("u2", "X", "weird");
		await mount([C, { root: "X", suffix: "weird" }], [own, unknownOwn]);
		const c = latest!(C);
		expect(c.status === "ready" && c.voicings.map((v) => v.id)).toEqual(["c1", "u1"]);
		const x = latest!({ root: "X", suffix: "weird" });
		expect(x.status === "ready" && x.voicings.map((v) => v.id)).toEqual(["u2"]);
	});

	it("a chord not asked for is still answered from the cache", async () => {
		cache.set("A minor", [voicing("am1", "x02210")]);
		await mount([C]);
		expect(latest!(Am).status).toBe("ready");
	});
});
