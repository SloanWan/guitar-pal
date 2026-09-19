import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { FingerpickPattern } from "./fingerpickTypes";
import { normalizeLoadedPattern } from "./fingerpickEdit";
import { validateFingerpickPattern } from "./tabImport";
import type { Bar, Beat, ChordProgression, StrumPattern } from "./strumPatterns";
import { normalizeBars, normalizeBeats, normalizeBpm, patternBpm, patternMeter, validateBars } from "./strumBars";
import { normalizeMeter } from "./strumMeter";
import { normalizeCapo } from "./strumProgressions";

/**
 * Public share links (issue #215).
 *
 * A share is a snapshot: the pattern's JSON copied into `shared_items` at the
 * moment of sharing, under an id that is the whole secret. Anyone holding the
 * link opens the copy in the full player; the sharer's own row is never read
 * by anyone else, and the link outlives edits and deletions of the original.
 *
 * Two kinds: a fingerpick pattern (a tab), and a strum pattern with any of
 * the chord progressions written over it that the sharer chose to send.
 */

export const SHARE_ID_LENGTH = 10;
const SHARE_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export interface SharedFingerpick {
	kind: "fingerpick";
	pattern: FingerpickPattern;
}

export interface SharedStrum {
	kind: "strum";
	pattern: StrumPattern;
	/** The progressions sent along, in the sharer's list order; empty for the bare rhythm. */
	progressions: ChordProgression[];
	/** Which of them the share opens on — the one the sharer was looking at. */
	openIndex: number;
}

export type SharedItem = SharedFingerpick | SharedStrum;

export type SharedItemKind = SharedItem["kind"];

/** A share as it comes back from the table, before the payload is trusted. */
export interface SharedItemRow {
	id: string;
	kind: string;
	payload: unknown;
}

/**
 * Mint a share id: 10 characters of base62, ~59 bits, from the platform's
 * CSPRNG. Rejection sampling keeps the draw uniform (256 is not a multiple of
 * 62). Also the shape the table's check constraint enforces.
 */
export function newShareId(): string {
	const bytes = new Uint8Array(SHARE_ID_LENGTH * 2);
	let id = "";
	while (id.length < SHARE_ID_LENGTH) {
		crypto.getRandomValues(bytes);
		for (const byte of bytes) {
			if (id.length === SHARE_ID_LENGTH) break;
			// 248 = the largest multiple of 62 below 256.
			if (byte >= 248) continue;
			id += SHARE_ID_ALPHABET[byte % SHARE_ID_ALPHABET.length];
		}
	}
	return id;
}

export function isShareId(value: string): boolean {
	return new RegExp(`^[A-Za-z0-9]{${SHARE_ID_LENGTH}}$`).test(value);
}

/** The route a share opens at, relative to the site root. */
export function sharePath(id: string): string {
	return `/p/${id}`;
}

/**
 * What gets stored. Identity and stamp are the sharer's business, not the
 * viewer's: the id is minted afresh on import, and `createdAt` would only
 * mislead a library sorted newest-first.
 */
export function toSharePayload(item: SharedItem): Record<string, unknown> {
	if (item.kind === "fingerpick") {
		const { id: _id, createdAt: _createdAt, ...pattern } = item.pattern;
		void _id;
		void _createdAt;
		return pattern;
	}
	// A progression's identity, list position and reconcile bookkeeping are
	// all about the sharer's library; the viewer's copy starts its own.
	const { pattern, progressions, openIndex } = item;
	return {
		pattern: {
			name: pattern.name,
			beats: pattern.beats,
			bpm: patternBpm(pattern),
			meter: patternMeter(pattern),
		},
		...(progressions.length > 0
			? {
					progressions: progressions.map((progression) => ({
						bars: progression.bars,
						...(progression.name?.trim() ? { name: progression.name.trim() } : {}),
						...(progression.bpm === undefined ? {} : { bpm: normalizeBpm(progression.bpm) }),
						...(normalizeCapo(progression.capo) > 0 ? { capo: normalizeCapo(progression.capo) } : {}),
					})),
					...(openIndex > 0 && openIndex < progressions.length ? { open: openIndex } : {}),
				}
			: {}),
	};
}

const PROGRESSION_NAME_MAX = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A strum payload back into a pattern and its progressions. The row id becomes
 * the pattern id, and each progression hangs off it under a derived id, so
 * they stay a set on screen and none can collide with the viewer's own.
 */
function readSharedStrum(rowId: string, payload: unknown): SharedStrum | null {
	if (!isRecord(payload) || !isRecord(payload.pattern)) return null;
	const raw = payload.pattern;
	if (!validateBars([{ beats: raw.beats, chord: null }]).ok) return null;
	const pattern: StrumPattern = {
		id: rowId,
		name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Shared pattern",
		beats: normalizeBeats(raw.beats as Beat[]),
		bpm: normalizeBpm(raw.bpm),
		meter: normalizeMeter(raw.meter),
	};

	if (payload.progressions === undefined || payload.progressions === null) {
		return { kind: "strum", pattern, progressions: [], openIndex: 0 };
	}
	// A progression that does not read is a share that does not read: the
	// chords are what was being shared, and a bare rhythm would say nothing.
	if (!Array.isArray(payload.progressions) || payload.progressions.length === 0) return null;
	const progressions: ChordProgression[] = [];
	for (const [index, rawProgression] of payload.progressions.entries()) {
		if (!isRecord(rawProgression) || !validateBars(rawProgression.bars).ok) return null;
		const name =
			typeof rawProgression.name === "string" ? rawProgression.name.trim().slice(0, PROGRESSION_NAME_MAX) : "";
		progressions.push({
			id: `${rowId}-progression-${index}`,
			patternId: rowId,
			bars: normalizeBars(rawProgression.bars as Bar[]),
			orderIndex: index,
			...(name ? { name } : {}),
			...(typeof rawProgression.bpm === "number" ? { bpm: normalizeBpm(rawProgression.bpm) } : {}),
			...(normalizeCapo(rawProgression.capo) > 0 ? { capo: normalizeCapo(rawProgression.capo) } : {}),
			// Written as reconciled with the pattern it arrived with, so nothing
			// asks the viewer to sync a rhythm they have not touched.
			syncedBeats: pattern.beats.map((beat) => [...beat]),
		});
	}
	const open = payload.open;
	const openIndex =
		typeof open === "number" && Number.isInteger(open) && open >= 0 && open < progressions.length ? open : 0;
	return { kind: "strum", pattern, progressions, openIndex };
}

/**
 * A stored row back into a `SharedItem`, or null when it is not one. Storage
 * is untrusted: the payload goes through the same validator every imported
 * tab does, then the same load-time fold a library row gets.
 */
export function readSharedItem(row: SharedItemRow): SharedItem | null {
	if (row.kind === "strum") return readSharedStrum(row.id, row.payload);
	if (row.kind !== "fingerpick") return null;
	const { pattern } = validateFingerpickPattern(row.payload);
	if (pattern === null) return null;
	// The row id doubles as the pattern id on screen: stable across reloads,
	// and never one the viewer's own library could hold.
	return { kind: "fingerpick", pattern: normalizeLoadedPattern({ ...pattern, id: row.id }) };
}

/** The absolute link for a share, for the clipboard. */
export function shareUrl(origin: string, id: string): string {
	return `${origin}${sharePath(id)}`;
}

/**
 * Write a share under an id the caller minted with `newShareId`. The id comes
 * from outside so the link can be put on the clipboard inside the click that
 * asked for it — Safari refuses a clipboard write once an await has passed —
 * and the row written after. Guests cannot share: the row needs an owner.
 */
export async function createShare(
	supabase: SupabaseClient,
	user: User,
	id: string,
	item: SharedItem,
): Promise<void> {
	if (!isShareId(id)) throw new Error(`Not a share id: ${id}`);
	const { error } = await supabase
		.from("shared_items")
		.insert({ id, owner_id: user.id, kind: item.kind, payload: toSharePayload(item) });
	if (error) throw new Error(error.message);
}

/** Read a share by id; null when there is no such row or its payload is unreadable. */
export async function loadShare(supabase: SupabaseClient, id: string): Promise<SharedItem | null> {
	if (!isShareId(id)) return null;
	const { data, error } = await supabase
		.from("shared_items")
		.select("id, kind, payload")
		.eq("id", id)
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!data) return null;
	return readSharedItem(data as SharedItemRow);
}
