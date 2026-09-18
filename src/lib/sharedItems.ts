import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { FingerpickPattern } from "./fingerpickTypes";
import { normalizeLoadedPattern } from "./fingerpickEdit";
import { validateFingerpickPattern } from "./tabImport";

/**
 * Public share links (issue #215).
 *
 * A share is a snapshot: the pattern's JSON copied into `shared_items` at the
 * moment of sharing, under an id that is the whole secret. Anyone holding the
 * link opens the copy in the full player; the sharer's own row is never read
 * by anyone else, and the link outlives edits and deletions of the original.
 *
 * The strum kind (pattern + optional progression) is in the schema already;
 * its read path arrives with the strum share page.
 */

export const SHARE_ID_LENGTH = 10;
const SHARE_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export interface SharedFingerpick {
	kind: "fingerpick";
	pattern: FingerpickPattern;
}

export type SharedItem = SharedFingerpick;

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
	const { id: _id, createdAt: _createdAt, ...pattern } = item.pattern;
	void _id;
	void _createdAt;
	return pattern;
}

/**
 * A stored row back into a `SharedItem`, or null when it is not one. Storage
 * is untrusted: the payload goes through the same validator every imported
 * tab does, then the same load-time fold a library row gets.
 */
export function readSharedItem(row: SharedItemRow): SharedItem | null {
	if (row.kind !== "fingerpick") return null;
	const { pattern } = validateFingerpickPattern(row.payload);
	if (pattern === null) return null;
	// The row id doubles as the pattern id on screen: stable across reloads,
	// and never one the viewer's own library could hold.
	return { kind: "fingerpick", pattern: normalizeLoadedPattern({ ...pattern, id: row.id }) };
}

/** Write a share; resolves to its id. Guests cannot share — the row needs an owner. */
export async function createShare(
	supabase: SupabaseClient,
	user: User,
	item: SharedItem,
): Promise<string> {
	const id = newShareId();
	const { error } = await supabase
		.from("shared_items")
		.insert({ id, owner_id: user.id, kind: item.kind, payload: toSharePayload(item) });
	if (error) throw new Error(error.message);
	return id;
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
