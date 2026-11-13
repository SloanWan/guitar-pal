import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { proposeStrum, proposeTab } from "@/lib/assistant/general/execute";
import { proposalToPattern } from "@/lib/assistant/strum/buildProposal";
import type { AssistantProposal } from "@/lib/assistant/types";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { patternCapo } from "@/lib/fingerpickChords";
import { isShareId, SHARE_ID_LENGTH, sharePath, type SharedItem, type SharedStrum } from "@/lib/sharedItems";
import { patternBpm, patternMeter } from "@/lib/strumBars";
import { beatUnitGlyph, meterLabel, SUPPORTED_METERS } from "@/lib/strumMeter";
import { patternNotation } from "@/lib/strumNotation";
import { patternRhythm } from "@/lib/strumRhythm";
import { chordAbbreviation, progressionCapo } from "@/lib/strumProgressions";
import { MAX_MEASURES, NOTE_MARKS_SHAPE, PERCUSSION_INPUT, type ValidationIssue } from "@/lib/tabImport";
import { patternToAsciiTab } from "./asciiTab";
import { IMPORT_TAB_SHAPE, importTab, patternToImportBars } from "./importTab";

/**
 * The Guitar Pal MCP server (#308): compose in Claude, play in Guitar Pal.
 *
 * Four tools, each a thin skin over a reader the app already has. The model
 * writes notation, ASCII tab or structured bars; the same builders and the
 * same validator the in-app assistant and the book import use decide what it
 * amounts to; what passes is written as a share and the model gets the link.
 * A card is always a reader's — nothing here lets the model reach `Bar[]` or
 * a `FingerpickPattern` except through them.
 *
 * Everything that touches a database or a request is injected, so the tool
 * suite runs the real server over an in-memory transport, and the route is
 * the one place that knows about Supabase, limits and origins.
 */

export const SERVER_NAME = "guitar-pal";
export const SERVER_VERSION = "0.1.0";

/** A refusal with a message written for the player: limits, configuration. Anything else is logged and generic. */
export class ShareRefused extends Error {}

export interface SavedShare {
	id: string;
	/** When the link stops opening; absent for a share that never does. */
	expiresAt?: Date;
}

export interface GuitarPalMcpDeps {
	chordIndex(): Promise<readonly ChordIndexEntry[]>;
	/** Writes the share under a fresh id. Throws `ShareRefused` to tell the player why not. */
	saveShare(item: SharedItem): Promise<SavedShare>;
	loadShare(id: string): Promise<SharedItem | null>;
	/** `https://guitarpal.example`, for the links in tool results. */
	origin: string;
	/** Days a share stays open (`MCP_SHARE_TTL_DAYS`), for the tools' side-effect lines; 0 never closes. Default 30. */
	shareTtlDays?: number;
}

const text = (body: string, isError = false): CallToolResult => ({
	content: [{ type: "text", text: body }],
	...(isError ? { isError: true } : {}),
});

function link(origin: string, id: string): string {
	return `${origin}${sharePath(id)}`;
}

/** The `/p/<id>` a player pasted, or the bare id. */
export function shareIdFromLink(value: string): string | null {
	const trimmed = value.trim();
	if (isShareId(trimmed)) return trimmed;
	const m = new RegExp(`/p/([A-Za-z0-9]{${SHARE_ID_LENGTH}})(?:[/?#]|$)`).exec(trimmed);
	return m ? m[1] : null;
}

function daysUntil(date: Date, now: Date = new Date()): number {
	return Math.max(1, Math.round((date.getTime() - now.getTime()) / 86_400_000));
}

function footer(saved: SavedShare, origin: string): string {
	const expiry = saved.expiresAt ? ` The link stops opening in ${daysUntil(saved.expiresAt)} days.` : "";
	return `Open it here: ${link(origin, saved.id)}\nThe page is the full player — play, loop, change tempo — and "Import" copies it into the player's own library to edit. The link is the playable result.${expiry}`;
}

function listWarnings(warnings: readonly ValidationIssue[]): string {
	if (warnings.length === 0) return "";
	return `\nWarnings, about what the link plays:\n${warnings.map((w) => `- ${w.message}`).join("\n")}`;
}

/** A strum proposal as the share it becomes: the rhythm, and the chord bars written over it when there are any. */
export function strumShareFrom(proposal: AssistantProposal): SharedStrum {
	const pattern = proposalToPattern(proposal, "share");
	if (proposal.chords.length === 0) return { kind: "strum", pattern, progressions: [], openIndex: 0 };
	return {
		kind: "strum",
		pattern,
		progressions: [
			{
				id: "share-progression-0",
				patternId: pattern.id,
				bars: proposal.bars,
				orderIndex: 0,
				...(proposal.bpm === null ? {} : { bpm: proposal.bpm }),
				...(proposal.capo === null || proposal.capo === 0 ? {} : { capo: proposal.capo }),
			},
		],
		openIndex: 0,
	};
}

/** The written form of a strum share: the rhythm line and the chords over it. */
export function describeStrum(share: SharedStrum): string {
	const { pattern, progressions, openIndex } = share;
	const meter = patternMeter(pattern);
	const opened = progressions[openIndex] ?? progressions[0];
	const tempo = opened?.bpm ?? patternBpm(pattern);
	const lines = [
		`Name: ${pattern.name}`,
		`Rhythm: ${patternRhythm(pattern).map(patternNotation).join(" | ")}  (${meterLabel(meter)}, ${beatUnitGlyph(meter)} = ${tempo}; D down, U up, X mute, one character per cell${patternRhythm(pattern).length > 1 ? ", bars separated by |" : ""})`,
	];
	if (opened) {
		const chords = opened.bars.map((bar) => (bar.chord ? chordAbbreviation(bar.chord) : bar.unknownChord ?? "—"));
		lines.push(`Chords, one bar each: ${chords.join(" | ")}`);
		const capo = progressionCapo(opened);
		if (capo > 0) lines.push(`Capo: ${capo}`);
	}
	return lines.join("\n");
}

/** The written form of a fingerpick share: the header and the tab. */
export function describeFingerpick(pattern: FingerpickPattern): string {
	const capo = patternCapo(pattern);
	const header = [
		`Name: ${pattern.name}`,
		`${meterLabel(pattern.timeSignature)}, ${beatUnitGlyph(pattern.timeSignature)} = ${pattern.bpm}, ${pattern.measures.length} bar${pattern.measures.length === 1 ? "" : "s"}${capo > 0 ? `, capo ${capo}` : ""}`,
		...(pattern.description ? [pattern.description] : []),
	];
	return `${header.join("\n")}\n\n${patternToAsciiTab(pattern)}`;
}

/**
 * Each hint's reason, recorded in docs/mcp.md for the directories' review.
 * Write tools: not read-only (each saves a share); not destructive (a new row,
 * nothing existing is changed or removed); not idempotent (the same call twice
 * makes two links); open-world (the link is public, so the call publishes).
 */
const WRITE_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true } as const;
/** read_share: reads a share by id and writes nothing; the same id reads the same snapshot; confined to Guitar Pal's own shares. */
const READ_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const NO_SHARE_MESSAGE = "The share could not be saved. Try again in a moment.";

/**
 * What every write tool does to the world, said plainly in its description
 * (OpenAI: "Side effects should never be hidden or implicit"), and that what
 * plays is the app replaying notation, not generated audio.
 */
export function sideEffectLine(ttlDays: number): string {
	const expiry = ttlDays > 0 ? `expires after ${ttlDays} days` : "does not expire";
	return `Each successful call saves a new public snapshot at a /p/<id> link: anyone with the link can open it, it ${expiry}, and nothing that already exists is changed. The page plays what was written on Guitar Pal's own guitar samples; it does not generate audio.`;
}

/** The server's instructions: what it does and how its tools answer, not orders to the model. */
export const SERVER_INSTRUCTIONS =
	"Guitar Pal turns a strumming pattern or a fingerpicking tab into a link that plays it in the browser, on the app's own guitar samples. Each tool checks what it is given with the same validators the app uses: an error result names what is not playable, and a corrected call is accepted. A successful write returns a /p/<id> link, which is the playable result; text that has not passed through a tool has not been checked and does not play.";

export function createGuitarPalServer(deps: GuitarPalMcpDeps): McpServer {
	const server = new McpServer(
		{ name: SERVER_NAME, version: SERVER_VERSION },
		{
			instructions: SERVER_INSTRUCTIONS,
		},
	);
	const effects = sideEffectLine(deps.shareTtlDays ?? 30);

	async function save(item: SharedItem): Promise<SavedShare | CallToolResult> {
		try {
			return await deps.saveShare(item);
		} catch (error) {
			if (error instanceof ShareRefused) return text(error.message, true);
			console.error("[mcp] share write failed", error);
			return text(NO_SHARE_MESSAGE, true);
		}
	}

	const isResult = (value: SavedShare | CallToolResult): value is CallToolResult => "content" in value;

	server.registerTool(
		"propose_strum",
		{
			title: "Propose a strumming pattern",
			description: `Use this when the player wants a strumming pattern they can hear and play along to: a rhythm for a song, a chord progression in time, a strum to practise changes with. Not for chord theory, fingering or gear advice, or anything the player only wants explained. Write the rhythm, with or without chords, and get a link that plays it. The rhythm is one bar of 4/4 in Guitar Pal's notation: D down, U up, X mute, a space for a cell where nothing is struck — 8 cells for eighths (\"D DU UD \"), 16 for sixteenths. Give one chord word per bar (\"C\", \"Am\", \"F#m7\"); every chord is looked up in the chord library, and words it does not know are left off with a warning. ${effects} Returns the link and the pattern as written, or an error naming what is not playable.`,
			inputSchema: {
				name: z.string().max(80).describe("Two or three words."),
				rhythm: z.string().max(200).describe("One bar: D, U, X and spaces, 8 or 16 cells."),
				chords: z.array(z.string().max(20)).max(64).describe("Chord names in order, one per bar; empty for a bare rhythm."),
				bpm: z.number().int().min(0).max(300).describe("Beats per minute; 0 when the player named no tempo."),
				capo: z.number().int().min(0).max(12).optional().describe("Capo fret for the progression, when the player named one."),
			},
			annotations: WRITE_ANNOTATIONS,
		},
		async ({ name, rhythm, chords, bpm, capo }) => {
			const index = await deps.chordIndex();
			const built = proposeStrum({ name, rhythm, chords, bpm }, index);
			if (built.isError || !built.card || !("proposal" in built.card)) return text(built.result, true);
			const proposal: AssistantProposal =
				capo !== undefined && capo > 0 && built.card.proposal.chords.length > 0
					? { ...built.card.proposal, capo }
					: built.card.proposal;
			const share = strumShareFrom(proposal);
			const saved = await save(share);
			if (isResult(saved)) return saved;
			const warnings: ValidationIssue[] = [];
			const w = proposal.warnings;
			if (w.unresolvedChords.length > 0) {
				warnings.push({ code: "UNKNOWN_CHORD", path: "chords", message: `The library has no chord called ${w.unresolvedChords.map((c) => `"${c}"`).join(", ")}; left off.` });
			}
			if (w.padded) warnings.push({ code: "RHYTHM_PADDED", path: "rhythm", message: "The rhythm did not fill its bar; the rest of the bar is silent." });
			return text(`Made "${proposal.name}".\n${describeStrum(share)}${listWarnings(warnings)}\n\n${footer(saved, deps.origin)}`);
		},
	);

	server.registerTool(
		"propose_tab",
		{
			title: "Propose a fingerpicking tab",
			description: `Use this when the player wants a fingerpicking pattern, a riff, a melody or an exercise they can hear, loop or play along with, or has pasted a text (ASCII) tab to play. Not for a tab in a photo, screenshot or scan (that is import_tab), nor for explaining a technique. Notes go on a grid of even slots per bar, so the rhythm is exact and any fret can be written: say how many slots a bar has, then put each note on one. Use this when composing, and for a text (ASCII) tab you were given — lay each column of the tab on a slot. For a tab read off an image or a printed page, where the note values are written, use import_tab instead. ${effects} Returns the link and the tab as the app holds it, or an error naming the bar to fix.`,
			inputSchema: {
				name: z.string().max(80).describe("Two or three words."),
				slotsPerBar: z
					.number()
					.int()
					.min(1)
					.max(96)
					.describe("How many even slots each bar is divided into. In 4/4: 8 for eighth notes, 16 for sixteenths. In 3/4 or 6/8: 6 for eighths, 12 for sixteenths. Every bar uses the same grid."),
				bars: z
					.array(
						z.object({
							notes: z
								.array(
									z.object({
										string: z.number().int().min(1).max(6).describe("1 = high e, 2 = B, 3 = G, 4 = D, 5 = A, 6 = low E."),
										fret: z.number().int().min(0).max(24).describe("0 (open) to 24."),
										slot: z.number().int().min(0).describe("Which slot of this bar, counting from 0. The last is slotsPerBar - 1."),
										...NOTE_MARKS_SHAPE,
									}),
								)
								.max(6 * 96)
								.describe("The notes of this bar, in any order. A slot with no note on it is silent; a note sounds until the next slot that carries one."),
							hits: z
								.array(z.object({ slot: z.number().int().min(0).describe("Which slot of this bar, counting from 0."), kind: PERCUSSION_INPUT }))
								.max(96)
								.optional()
								.describe("Right-hand hits on slots of this bar, when the music has them."),
						}),
					)
					.min(1)
					.max(MAX_MEASURES)
					.describe("The bars in order. A bar with no notes is a bar of rest."),
				bpm: z.number().int().min(0).max(300).describe("Beats per minute, counting the beat (♩ in 4/4, ♩. in 6/8); 0 when the player named no tempo."),
				timeSignature: z.string().describe(`${SUPPORTED_METERS.map(meterLabel).join(", ")}; empty for 4/4.`),
			},
			annotations: WRITE_ANNOTATIONS,
		},
		async ({ name, slotsPerBar, bars, bpm, timeSignature }) => {
			const built = proposeTab({ name, slotsPerBar, bars, bpm, timeSignature });
			if (built.isError || !built.card || !("tabProposal" in built.card)) return text(built.result, true);
			const { pattern, warnings } = built.card.tabProposal;
			const saved = await save({ kind: "fingerpick", pattern });
			if (isResult(saved)) return saved;
			return text(`Made "${pattern.name}".\n${describeFingerpick(pattern)}${listWarnings(warnings)}\n\n${footer(saved, deps.origin)}`);
		},
	);

	server.registerTool(
		"import_tab",
		{
			title: "Import a transcribed tab",
			description: `Use this when the player shares a photo, screenshot or scan of a guitar tab and wants to play it, hear it or bring it into Guitar Pal. Not for composing (that is propose_tab), nor for a question about what the image shows. Transcribe, do not compose: copy every fret and every written note value exactly as printed, in order, and do not correct or simplify what looks odd. Each bar is a list of slots; each slot has the duration printed (stems, flags and dots) and the notes struck together in it as {string, fret} with string 1 = high e and 6 = low E; a rest is a slot with rest: true and no notes. Where you could not read something with confidence, still write your best reading and name the place in \`uncertain\` — the player checks those against the original. The app validates the durations against the meter and bounds the frets; it cannot tell a note on the wrong string, so be exact about strings. ${effects} Returns the link and the tab as the app holds it, or an error naming the bar to fix.`,
			inputSchema: IMPORT_TAB_SHAPE,
			annotations: WRITE_ANNOTATIONS,
		},
		async (input) => {
			const index = await deps.chordIndex();
			const result = importTab(input, index);
			if (!result.ok) return text(`The tab did not validate:\n${result.errors.map((e) => `- ${e.message}`).join("\n")}`, true);
			const saved = await save({ kind: "fingerpick", pattern: result.pattern });
			if (isResult(saved)) return saved;
			const checkNote =
				input.uncertain && input.uncertain.length > 0
					? "\nThe uncertain places are written under the pattern's name on the page, so the player sees them there too."
					: "";
			return text(
				`Imported "${result.pattern.name}".\n${describeFingerpick(result.pattern)}${listWarnings(result.warnings)}${checkNote}\n\n${footer(saved, deps.origin)}`,
			);
		},
	);

	server.registerTool(
		"read_share",
		{
			title: "Read a Guitar Pal link",
			description:
				"Use this when the player gives a Guitar Pal share link (https://…/p/XXXXXXXXXX) or its id, to change the pattern or talk about it. Reads only: nothing is written. A fingerpicking tab comes back as ASCII and as the same bars import_tab takes, so you can edit the bars and call import_tab to make a new link; a strumming pattern comes back as its rhythm line and chords for propose_strum. A share is a snapshot: a revision is made with those tools, as a new link.",
			inputSchema: { link: z.string().max(300).describe("The share link or its 10-character id.") },
			annotations: READ_ANNOTATIONS,
		},
		async ({ link: value }) => {
			const id = shareIdFromLink(value);
			if (!id) return text(`"${value}" is not a Guitar Pal share link: those look like ${deps.origin}/p/XXXXXXXXXX.`, true);
			let share: SharedItem | null;
			try {
				share = await deps.loadShare(id);
			} catch (error) {
				console.error("[mcp] share read failed", error);
				return text("The share could not be read. Try again in a moment.", true);
			}
			if (!share) return text("No pattern is at that link: it may have expired or never existed.", true);
			if (share.kind === "strum") return text(`A strumming pattern.\n${describeStrum(share)}`);
			return text(
				`A fingerpicking tab.\n${describeFingerpick(share.pattern)}\n\nAs import_tab bars:\n${JSON.stringify({ timeSignature: meterLabel(share.pattern.timeSignature), bpm: share.pattern.bpm, ...(patternCapo(share.pattern) > 0 ? { capo: patternCapo(share.pattern) } : {}), bars: patternToImportBars(share.pattern) })}`,
			);
		},
	);

	return server;
}
