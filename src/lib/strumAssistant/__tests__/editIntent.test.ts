import { describe, it, expect } from "vitest";
import { parseEditIntent } from "@/lib/strumAssistant/editIntent";
import type { NamedPattern } from "@/lib/lastPattern";

/**
 * The reader that answers "put these chords on that pattern" without a model.
 * Its two jobs are equally load-bearing: recognising the request, and refusing
 * everything that only looks like one — a wrong guess here writes a row.
 */

const PATTERNS: NamedPattern[] = [
	{ id: "p-belief", name: "belief" },
	{ id: "p-jam", name: "C jam" },
	{ id: "p-rainy", name: "下雨天" },
	{ id: "preset-old", name: "old faithful" },
	{ id: "preset-one", name: "on the one" },
	{ id: "preset-beat", name: "on the beat" },
];

const read = (input: string, patterns: NamedPattern[] = PATTERNS) =>
	parseEditIntent(input, patterns);

describe("parseEditIntent", () => {
	describe("reads the request", () => {
		it("takes the Chinese sentence whole", () => {
			const intent = read("添加一个 Em9-D-C#-F#m7 和弦进行去 belief pattern 里");
			expect(intent).toEqual({
				kind: "attach",
				op: "attach",
				pattern: { id: "p-belief", name: "belief" },
				chordWords: ["Em9", "D", "C#", "F#m7"],
			});
		});

		it("takes the English one", () => {
			const intent = read("add Em9 D C# F#m7 to belief");
			expect(intent).toMatchObject({ kind: "attach", chordWords: ["Em9", "D", "C#", "F#m7"] });
		});

		it("accepts the ways either language puts it", () => {
			for (const line of [
				"给 belief 加上 C G Am F",
				"把 C G Am F 加到 belief 里",
				"belief 新增 C G Am F",
				"put C G Am F on belief",
				"attach C G Am F to belief",
				"append C-G-Am-F to belief",
			]) {
				expect(read(line), line).toMatchObject({
					kind: "attach",
					pattern: { id: "p-belief" },
					chordWords: ["C", "G", "Am", "F"],
				});
			}
		});

		it("matches a name however it was capitalised", () => {
			expect(read("add C G to BELIEF")).toMatchObject({ pattern: { id: "p-belief" } });
		});

		it("reads a Chinese pattern name", () => {
			expect(read("给下雨天加上 Am F C G")).toMatchObject({
				pattern: { id: "p-rainy" },
				chordWords: ["Am", "F", "C", "G"],
			});
		});

		it("attaches to a preset, which is a pattern like any other", () => {
			expect(read("add C G Am F to old faithful")).toMatchObject({
				pattern: { id: "preset-old" },
			});
		});

		it("takes the longest name, not the first that matches", () => {
			const patterns = [...PATTERNS, { id: "p-old", name: "old" }];
			expect(read("add C G to old faithful", patterns)).toMatchObject({
				pattern: { id: "preset-old" },
			});
		});

		it("keeps a name that is made of chord words out of the chords", () => {
			// "C jam" would otherwise donate its C to the progression.
			expect(read("add D G to C jam")).toMatchObject({
				pattern: { id: "p-jam" },
				chordWords: ["D", "G"],
			});
		});

		it("reads chords typed in lowercase, which is how they are typed", () => {
			expect(read("add c am f g to on the beat")).toMatchObject({
				kind: "attach",
				pattern: { id: "preset-beat" },
				chordWords: ["c", "am", "f", "g"],
			});
		});

		it("carries a word it cannot place along with the chords around it", () => {
			// "RM" is not a chord, but it is where a chord goes. Ending the run at it
			// would have read only "F C F G"; dropping it would lose a bar.
			expect(read("添加C G AM RM F C F G到belief")).toMatchObject({
				kind: "attach",
				chordWords: ["C", "G", "AM", "RM", "F", "C", "F", "G"],
			});
		});

		it("does not carry a trailing word, which is more likely prose", () => {
			expect(read("add C G RM to belief")).toMatchObject({ chordWords: ["C", "G"] });
		});

		it("reads a Chinese and between chords as a gap", () => {
			expect(read("给 belief 加上 C 和 G 与 Am")).toMatchObject({
				chordWords: ["C", "G", "Am"],
			});
			expect(read("add C and G to belief")).toMatchObject({ chordWords: ["C", "G"] });
		});

		it("takes a single chord as a one-bar progression", () => {
			expect(read("add C to belief")).toMatchObject({ chordWords: ["C"] });
		});

		it("keeps a chord the library may not carry, rather than reading past it", () => {
			// Resolving is the caller's job; an unplaceable word is shown in red.
			expect(read("add Cmaj7#11 G7b9 to belief")).toMatchObject({
				chordWords: ["Cmaj7#11", "G7b9"],
			});
		});
	});

	describe("renames and deletes", () => {
		it("reads a rename with its new name, in either language", () => {
			for (const line of ["把 belief 改名为 faith", "rename belief to faith", "belief 改叫 faith"]) {
				expect(read(line), line).toEqual({
					kind: "rename",
					op: "rename",
					pattern: { id: "p-belief", name: "belief" },
					newName: "faith",
				});
			}
		});

		it("reads a rename that names no new name", () => {
			expect(read("rename belief")).toMatchObject({ kind: "rename", newName: "" });
		});

		it("does not read a new name as chords", () => {
			// "to C" would be one chord to the attach reader; here it is a name.
			expect(read("rename belief to C")).toMatchObject({ kind: "rename", newName: "C" });
		});

		it("reads a delete, in either language", () => {
			for (const line of ["删掉 belief", "delete belief", "remove the belief pattern"]) {
				expect(read(line), line).toEqual({
					kind: "delete",
					op: "delete",
					pattern: { id: "p-belief", name: "belief" },
					aboutProgression: false,
				});
			}
		});

		it("knows when the player means a progression, which it must not delete for", () => {
			// Reading these as "delete belief" would take the whole pattern.
			for (const line of [
				"删掉 belief 里的 C G Am F",
				"delete the C G Am F progression from belief",
				"把 belief 的那个和弦进行删了",
			]) {
				expect(read(line), line).toMatchObject({ kind: "delete", aboutProgression: true });
			}
		});

		it("still names a preset, so the card can say no", () => {
			expect(read("delete old faithful")).toMatchObject({ kind: "delete", pattern: { id: "preset-old" } });
		});

		it("carries the operation into a name it could not resolve", () => {
			expect(read("delete wonderwall")).toEqual({
				kind: "unknown-pattern",
				op: "delete",
				name: "wonderwall",
				chordWords: [],
			});
			expect(read("remove the wonderwall pattern")).toMatchObject({ name: "wonderwall" });
			expect(read("rename wonderwall to faith")).toMatchObject({ op: "rename", name: "wonderwall" });
			expect(read("删掉「夏天」")).toMatchObject({ op: "delete", name: "夏天" });
		});
	});

	describe("says what it cannot resolve", () => {
		it("reports a pattern the player does not have, keeping the chords", () => {
			// The chords were read fine; only the target has to be picked.
			expect(read("add C G Am F to wonderwall")).toEqual({
				kind: "unknown-pattern",
				op: "attach",
				name: "wonderwall",
				chordWords: ["C", "G", "Am", "F"],
			});
		});

		it("reports a quoted name that matches nothing", () => {
			expect(read("把 C G 加到「夏天」里")).toMatchObject({
				kind: "unknown-pattern",
				name: "夏天",
			});
		});

		it("strips the words that trail a name without being part of it", () => {
			expect(read("add C G to summer pattern")).toMatchObject({
				kind: "unknown-pattern",
				name: "summer",
			});
		});

		it("keeps a named pattern when the chords are missing, to be filled in", () => {
			// Half a request understood beats a whole one refused: the card opens
			// with the chord field waiting rather than sending this to the model.
			expect(read("给 belief 加一个和弦进行")).toEqual({
				kind: "attach",
				op: "attach",
				pattern: { id: "p-belief", name: "belief" },
				chordWords: [],
			});
			expect(read("add a progression to belief")).toMatchObject({
				kind: "attach",
				chordWords: [],
			});
		});

		it("keeps a name aimed at when neither half resolves", () => {
			expect(read("add a progression to wonderwall")).toEqual({
				kind: "unknown-pattern",
				op: "attach",
				name: "wonderwall",
				chordWords: [],
			});
		});

		it("reports every pattern answering to a name two of them share", () => {
			const twins: NamedPattern[] = [
				{ id: "a", name: "belief" },
				{ id: "b", name: "Belief" },
			];
			const reading = read("add C G to belief", twins);
			expect(reading).toMatchObject({ kind: "ambiguous", name: "belief" });
			if (reading?.kind !== "ambiguous") return;
			expect(reading.matches.map((m) => m.id)).toEqual(["a", "b"]);
		});
	});

	describe("refuses what is not this request", () => {
		it("passes on a plain chord line", () => {
			expect(read("C Am F G")).toBeNull();
			expect(read("C Am F G, DUDUDU")).toBeNull();
		});

		it("passes on a request to make something new", () => {
			expect(read("给我一个 C-G-Am-F 的民谣扫弦，慢一点")).toBeNull();
			expect(read("a slow folk strum in C G Am F")).toBeNull();
		});

		it("does not read one lowercase letter as a chord", () => {
			// "a" is an article far more often than it is the chord, and one letter
			// standing alone says nothing either way — so the target stands and the
			// chords are asked for. Written as a chord, it reads as one.
			expect(read("add a to belief")).toMatchObject({ kind: "attach", chordWords: [] });
			expect(read("add A to belief")).toMatchObject({ chordWords: ["A"] });
		});

		it("passes on chords with nowhere to put them", () => {
			expect(read("add C G Am F")).toBeNull();
		});

		it("does not read an English sentence as chords", () => {
			// A named pattern still stands — the card asks which chords, and costs a
			// cancel at worst. Nothing here is read as a chord it is not.
			expect(read("add a bad day to belief")).toMatchObject({ chordWords: [] });
			expect(read("put the guitar down")).toBeNull();
			expect(read("add a capo")).toBeNull();
		});

		it("never throws on arbitrary input", () => {
			for (const junk of ["", "🎸", "|||", "\n\t", "add to to to", "'; drop table --"]) {
				expect(() => read(junk)).not.toThrow();
			}
			expect(() => parseEditIntent("add C G to belief", [])).not.toThrow();
		});
	});
});
