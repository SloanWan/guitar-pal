import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * A guest's free turns, kept in a cookie the route signs.
 *
 * No account means no row to count in, so the count travels with the
 * visitor: a JSON payload, base64url, and an HMAC over it. A visitor can
 * clear it and be new — the IP and global limits in the route bound that —
 * but cannot forge one that says they have turns left. Server-only: it
 * holds the key.
 */

export const GUEST_COOKIE = "guitarpal_assistant_guest";
export const GUEST_TURN_LIMIT = 3;
export const GUEST_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface GuestRecord {
	id: string;
	/** Turns started in the window: the client's turn id and when it began. */
	turns: { id: string; at: number }[];
}

export interface GuestQuota {
	used: number;
	limit: number;
}

function b64url(buf: Buffer): string {
	return buf.toString("base64url");
}

function sign(payload: string, key: string): string {
	return b64url(createHmac("sha256", key).update(payload).digest());
}

export function encodeGuest(record: GuestRecord, key: string): string {
	const payload = b64url(Buffer.from(JSON.stringify(record), "utf8"));
	return `${payload}.${sign(payload, key)}`;
}

/** The record the cookie carries, or null for a missing, malformed or tampered one. */
export function decodeGuest(cookie: string | undefined, key: string): GuestRecord | null {
	if (!cookie) return null;
	const dot = cookie.lastIndexOf(".");
	if (dot <= 0) return null;
	const payload = cookie.slice(0, dot);
	const given = Buffer.from(cookie.slice(dot + 1));
	const wanted = Buffer.from(sign(payload, key));
	if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;
	try {
		const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
		if (typeof parsed !== "object" || parsed === null) return null;
		const r = parsed as Partial<GuestRecord>;
		if (typeof r.id !== "string" || !Array.isArray(r.turns)) return null;
		const turns = r.turns.filter(
			(t): t is GuestRecord["turns"][number] =>
				typeof t === "object" && t !== null && typeof t.id === "string" && typeof t.at === "number",
		);
		return { id: r.id, turns };
	} catch {
		return null;
	}
}

export function newGuest(): GuestRecord {
	return { id: randomUUID(), turns: [] };
}

/** The turns still in the window. */
export function liveTurns(record: GuestRecord, now: number): GuestRecord["turns"] {
	return record.turns.filter((t) => now - t.at < GUEST_WINDOW_MS);
}

export type GuestVerdict =
	| { allowed: true; record: GuestRecord; quota: GuestQuota }
	| { allowed: false; quota: GuestQuota; retryAfterSeconds: number };

/**
 * Admits a model call for this turn. A turn already in the record — a
 * loop's second or third call — is free; a new turn takes one of the
 * window's slots, or is refused with when the oldest slot comes back.
 */
export function admitGuestTurn(record: GuestRecord, turnId: string, now: number): GuestVerdict {
	const turns = liveTurns(record, now);
	const known = turns.some((t) => t.id === turnId);
	if (!known && turns.length >= GUEST_TURN_LIMIT) {
		const oldest = Math.min(...turns.map((t) => t.at));
		return {
			allowed: false,
			quota: { used: turns.length, limit: GUEST_TURN_LIMIT },
			retryAfterSeconds: Math.max(1, Math.ceil((oldest + GUEST_WINDOW_MS - now) / 1000)),
		};
	}
	const next = known ? turns : [...turns, { id: turnId, at: now }];
	return {
		allowed: true,
		record: { id: record.id, turns: next },
		quota: { used: next.length, limit: GUEST_TURN_LIMIT },
	};
}
