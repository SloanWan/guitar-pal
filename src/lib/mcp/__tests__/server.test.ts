import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { INDEX } from "@/lib/assistant/tab/__tests__/fixtures";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import {
	createGuitarPalServer,
	describeStrum,
	shareIdFromLink,
	ShareRefused,
	strumShareFrom,
	type GuitarPalMcpDeps,
} from "@/lib/mcp/server";
import { buildProposal } from "@/lib/assistant/strum/buildProposal";
import { readSharedItem, toSharePayload, type SharedItem } from "@/lib/sharedItems";

/**
 * The real server over the SDK's in-memory transport, with the database
 * replaced by a map: what a client sees is what claude.ai sees.
 */

const ORIGIN = "https://guitarpal.test";

type TextResult = { content: { type: string; text: string }[]; isError?: boolean };

function memoryDeps(over: Partial<GuitarPalMcpDeps> = {}) {
	const rows = new Map<string, SharedItem>();
	let n = 0;
	const deps: GuitarPalMcpDeps = {
		chordIndex: async () => INDEX,
		origin: ORIGIN,
		async saveShare(item) {
			const id = `share${String(++n).padStart(5, "0")}`;
			// Through the payload and back, as the table would hand it to the page.
			const read = readSharedItem({ id, kind: item.kind, payload: toSharePayload(item) });
			if (!read) throw new Error("the share did not read back");
			rows.set(id, read);
			return { id, expiresAt: new Date(Date.now() + 30 * 86_400_000) };
		},
		async loadShare(id) {
			return rows.get(id) ?? null;
		},
		...over,
	};
	return { deps, rows };
}

async function connect(deps: GuitarPalMcpDeps) {
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const server = createGuitarPalServer(deps);
	await server.connect(serverTransport);
	const client = new Client({ name: "test", version: "0" });
	await client.connect(clientTransport);
	return { client, server };
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<TextResult> {
	return (await client.callTool({ name, arguments: args })) as TextResult;
}

const textOf = (r: TextResult) => r.content.map((c) => c.text).join("\n");

let closers: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const close of closers) await close();
	closers = [];
});

async function open(deps: GuitarPalMcpDeps) {
	const { client, server } = await connect(deps);
	closers.push(async () => {
		await client.close();
		await server.close();
	});
	return client;
}

describe("shareIdFromLink", () => {
	it("takes the link, the link with a trailing path, or the bare id", () => {
		expect(shareIdFromLink("https://guitarpal.test/p/aB3xK9mQ2z")).toBe("aB3xK9mQ2z");
		expect(shareIdFromLink("https://guitarpal.test/p/aB3xK9mQ2z?x=1")).toBe("aB3xK9mQ2z");
		expect(shareIdFromLink(" aB3xK9mQ2z ")).toBe("aB3xK9mQ2z");
		expect(shareIdFromLink("https://guitarpal.test/p/short")).toBeNull();
		expect(shareIdFromLink("https://guitarpal.test/strum")).toBeNull();
	});
});

describe("strumShareFrom", () => {
	it("is a bare rhythm without chords, and one progression with them", () => {
		const bare = buildProposal({ rhythm: "D DU UD ", chordWords: [], index: INDEX });
		expect(bare.ok).toBe(true);
		if (!bare.ok) return;
		expect(strumShareFrom(bare.proposal).progressions).toEqual([]);

		const withChords = buildProposal({ rhythm: "D DU UD ", chordWords: ["C", "G", "Am", "F"], index: INDEX, capo: 2, bpm: 90 });
		expect(withChords.ok).toBe(true);
		if (!withChords.ok) return;
		const share = strumShareFrom(withChords.proposal);
		expect(share.progressions).toHaveLength(1);
		expect(share.progressions[0].bars.map((b) => b.chord?.root)).toEqual(["C", "G", "A", "F"]);
		expect(share.progressions[0]).toMatchObject({ bpm: 90, capo: 2 });
		expect(describeStrum(share)).toContain("Chords, one bar each: C | G | Am | F");
		expect(describeStrum(share)).toContain("Capo: 2");
	});
});

describe("the server over a client", () => {
	let deps: GuitarPalMcpDeps;
	let rows: Map<string, SharedItem>;
	beforeEach(() => {
		({ deps, rows } = memoryDeps());
	});

	it("lists the four tools with their schemas", async () => {
		const client = await open(deps);
		const { tools } = await client.listTools();
		expect(tools.map((t) => t.name).sort()).toEqual(["import_tab", "propose_strum", "propose_tab", "read_share"]);
		const importTab = tools.find((t) => t.name === "import_tab")!;
		expect(importTab.inputSchema.required).toEqual(expect.arrayContaining(["name", "timeSignature", "bpm", "bars"]));
		expect(JSON.stringify(importTab.inputSchema)).toContain("dotted-quarter");
		expect(tools.find((t) => t.name === "read_share")!.annotations?.readOnlyHint).toBe(true);
	});

	it("propose_strum: validates, saves, and answers with the link and the rhythm", async () => {
		const client = await open(deps);
		const r = await call(client, "propose_strum", { name: "Folk strum", rhythm: "D DU UD ", chords: ["C", "G", "Am", "F"], bpm: 90 });
		expect(r.isError).toBeUndefined();
		const text = textOf(r);
		expect(text).toContain(`${ORIGIN}/p/share00001`);
		expect(text).toContain("Rhythm: D DU UD");
		expect(text).toContain("C | G | Am | F");
		expect(text).toMatch(/stops opening in 30 days/);
		const saved = rows.get("share00001");
		expect(saved?.kind).toBe("strum");
		if (saved?.kind !== "strum") return;
		expect(saved.pattern.name).toBe("Folk strum");
		expect(saved.progressions[0].bars).toHaveLength(4);
	});

	it("propose_strum: an unplayable rhythm is an error and nothing is saved", async () => {
		const client = await open(deps);
		const r = await call(client, "propose_strum", { name: "x", rhythm: "D Q", chords: [], bpm: 0 });
		expect(r.isError).toBe(true);
		expect(textOf(r)).toMatch(/not valid notation/);
		expect(rows.size).toBe(0);
	});

	it("propose_strum: an unknown chord word is a warning, not a refusal", async () => {
		const client = await open(deps);
		const r = await call(client, "propose_strum", { name: "x", rhythm: "D DU UD ", chords: ["C", "capo"], bpm: 0 });
		expect(r.isError).toBeUndefined();
		expect(textOf(r)).toMatch(/no chord called "capo"/);
	});

	it("propose_tab: takes the grid, saves, and shows the tab back", async () => {
		const client = await open(deps);
		const r = await call(client, "propose_tab", {
			name: "Am pluck",
			slotsPerBar: 8,
			bars: [{ notes: [{ string: 5, fret: 0, slot: 0 }, { string: 3, fret: 2, slot: 2 }, { string: 2, fret: 1, slot: 4 }, { string: 1, fret: 0, slot: 6 }] }],
			bpm: 72,
			timeSignature: "",
		});
		expect(r.isError).toBeUndefined();
		const text = textOf(r);
		expect(text).toContain("Made \"Am pluck\"");
		expect(text).toContain("4/4, ♩ = 72, 1 bar");
		expect(text).toContain(`${ORIGIN}/p/share00001`);
		expect(text).toMatch(/\ne\|------0-\|/);
		expect(text).toMatch(/\nA\|0-------\|/);
		const saved = rows.get("share00001");
		expect(saved?.kind).toBe("fingerpick");
		if (saved?.kind !== "fingerpick") return;
		// A note sounds until the next slot that carries one: four notes, four quarters.
		expect(saved.pattern.measures[0].slots).toHaveLength(4);
		expect(saved.pattern.measures[0].slots.every((s) => s.duration === "quarter")).toBe(true);
	});

	it("propose_tab: a bend with its height and a palm-muted note are saved and shown", async () => {
		const client = await open(deps);
		const r = await call(client, "propose_tab", {
			name: "Bend lick",
			slotsPerBar: 4,
			bars: [{ notes: [{ string: 3, fret: 7, slot: 0, technique: "bend-release", bendTarget: 1 }, { string: 5, fret: 0, slot: 2, palmMute: true }] }],
			bpm: 0,
			timeSignature: "",
		});
		expect(r.isError).toBeUndefined();
		const text = textOf(r);
		expect(text).toMatch(/\nG\|7b8r/);
		expect(text).toMatch(/\n {2}\s*P\.M\./);
		const saved = rows.get("share00001");
		if (saved?.kind !== "fingerpick") throw new Error("not saved as fingerpick");
		expect(saved.pattern.measures[0].slots[0].strings[2]).toMatchObject({ fret: 7, technique: "bend-release", bendTarget: 1 });
		expect(saved.pattern.measures[0].slots[1].strings[4]).toMatchObject({ fret: 0, palmMute: true });
	});

	it("propose_tab: a note off the grid is an error naming the bar, and nothing is saved", async () => {
		const client = await open(deps);
		const r = await call(client, "propose_tab", { name: "x", slotsPerBar: 8, bars: [{ notes: [{ string: 1, fret: 0, slot: 8 }] }], bpm: 0, timeSignature: "" });
		expect(r.isError).toBe(true);
		expect(textOf(r)).toMatch(/Bar 1 has a note on slot 8/);
		expect(rows.size).toBe(0);
	});

	it("import_tab: takes the bars, keeps the uncertain places, and shows the tab", async () => {
		const client = await open(deps);
		const r = await call(client, "import_tab", {
			name: "Etude 3",
			timeSignature: "3/4",
			bpm: 60,
			bars: [
				{
					slots: [
						{ duration: "quarter", notes: [{ string: 6, fret: 0 }, { string: 1, fret: 0 }], chord: "Em" },
						{ duration: "quarter", notes: [{ string: 3, fret: 0 }] },
						{ duration: "quarter", notes: [{ string: 2, fret: 0 }] },
					],
				},
			],
			uncertain: ["bar 1, slot 2: G string fret 0 or 2"],
		});
		expect(r.isError).toBeUndefined();
		const text = textOf(r);
		expect(text).toContain("Imported \"Etude 3\"");
		expect(text).toContain("3/4, ♩ = 60, 1 bar");
		expect(text).toContain("check these against the original: bar 1, slot 2");
		expect(text).toContain("  Em");
		const saved = rows.get("share00001");
		expect(saved?.kind).toBe("fingerpick");
		if (saved?.kind !== "fingerpick") return;
		expect(saved.pattern.description).toMatch(/bar 1, slot 2/);
		expect(saved.pattern.measures[0].slots[0].chord).toMatchObject({ root: "E", suffix: "minor" });
	});

	it("import_tab: an overfull bar is an error naming the bar, and nothing is saved", async () => {
		const client = await open(deps);
		const r = await call(client, "import_tab", {
			name: "x",
			timeSignature: "4/4",
			bpm: 0,
			bars: [{ slots: [{ duration: "whole", notes: [{ string: 1, fret: 0 }] }, { duration: "quarter", notes: [{ string: 1, fret: 1 }] }] }],
		});
		expect(r.isError).toBe(true);
		expect(textOf(r)).toMatch(/Bar 1 holds 5 quarter notes/);
		expect(rows.size).toBe(0);
	});

	it("import_tab: input that does not fit the schema is refused before any reader runs", async () => {
		const client = await open(deps);
		const r = await call(client, "import_tab", { name: "x", timeSignature: "4/4", bpm: 0, bars: [{ slots: [{ duration: "crotchet", notes: [] }] }] });
		expect(r.isError).toBe(true);
		expect(rows.size).toBe(0);
	});

	it("read_share: a tab comes back as ASCII and as import_tab bars that round-trip", async () => {
		const client = await open(deps);
		const preset = PRESET_FINGERPICK_PATTERNS[0];
		await deps.saveShare({ kind: "fingerpick", pattern: preset });
		const r = await call(client, "read_share", { link: `${ORIGIN}/p/share00001` });
		expect(r.isError).toBeUndefined();
		const text = textOf(r);
		expect(text).toContain(`Name: ${preset.name}`);
		const json = JSON.parse(text.slice(text.indexOf("As import_tab bars:\n") + "As import_tab bars:\n".length)) as {
			timeSignature: string;
			bpm: number;
			bars: unknown[];
		};
		expect(json.bars).toHaveLength(preset.measures.length);
		const again = await call(client, "import_tab", { name: preset.name, ...json });
		expect(again.isError).toBeUndefined();
	});

	it("read_share: a strum comes back as its rhythm and chords", async () => {
		const client = await open(deps);
		await call(client, "propose_strum", { name: "Folk strum", rhythm: "D DU UD ", chords: ["C", "G"], bpm: 0 });
		const r = await call(client, "read_share", { link: "share00001" });
		expect(textOf(r)).toContain("A strumming pattern.\nName: Folk strum\nRhythm: D DU UD");
		expect(textOf(r)).toContain("C | G");
	});

	it("read_share: a link that is not one, and one with nothing behind it", async () => {
		const client = await open(deps);
		expect((await call(client, "read_share", { link: `${ORIGIN}/strum` })).isError).toBe(true);
		const gone = await call(client, "read_share", { link: `${ORIGIN}/p/zzzzzzzzzz` });
		expect(gone.isError).toBe(true);
		expect(textOf(gone)).toMatch(/expired or never existed/);
	});

	it("a refusal from the store reaches the model in its own words; any other failure is generic", async () => {
		const refused = await open({ ...deps, saveShare: async () => { throw new ShareRefused("No links today."); } });
		const r = await call(refused, "propose_strum", { name: "x", rhythm: "D DU UD ", chords: [], bpm: 0 });
		expect(r.isError).toBe(true);
		expect(textOf(r)).toBe("No links today.");

		const broken = await open({ ...deps, saveShare: async () => { throw new Error("connection refused: db.internal"); } });
		const b = await call(broken, "propose_strum", { name: "x", rhythm: "D DU UD ", chords: [], bpm: 0 });
		expect(b.isError).toBe(true);
		expect(textOf(b)).not.toContain("db.internal");
	});
});
