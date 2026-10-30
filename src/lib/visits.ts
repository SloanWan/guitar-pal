import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * How often a player opens each thing, for Home's "Most opened" (#399). Kept in
 * sync with the `kind` CHECK on `user_visits` (scripts/create-user-visits.sql).
 */
export type VisitKind = "strum" | "tab" | "chord" | "book";

/** A chord is visited by name, never by voicing. */
export function chordVisitTarget(root: string, suffix: string): string {
	return `${root}|${suffix}`;
}

/** The inverse of `chordVisitTarget`; null for a target that is not one. */
export function readChordVisitTarget(target: string): { root: string; suffix: string } | null {
	const bar = target.indexOf("|");
	if (bar <= 0 || bar === target.length - 1) return null;
	return { root: target.slice(0, bar), suffix: target.slice(bar + 1) };
}

// What this browser tab has counted already: a thing counts once a tab session,
// so a reload or switching back and forth does not inflate it.
const COUNTED_KEY = "guitarpal:visits-counted";

function readCounted(): Set<string> {
	try {
		const raw: unknown = JSON.parse(sessionStorage.getItem(COUNTED_KEY) ?? "[]");
		return new Set(Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : []);
	} catch {
		return new Set();
	}
}

function writeCounted(keys: Set<string>): void {
	try {
		sessionStorage.setItem(COUNTED_KEY, JSON.stringify([...keys]));
	} catch {
		// Storage refused (a private window): the visit still counts, just maybe twice.
	}
}

/** Count one visit to a thing. No-op signed out, and for what this tab has counted already. */
export async function recordVisit(supabase: SupabaseClient, user: User | null, kind: VisitKind, target: string): Promise<void> {
	if (!user || target === "") return;
	const key = `${user.id}:${kind}:${target}`;
	const counted = readCounted();
	if (counted.has(key)) return;
	// Marked before the call, so an effect run twice in a row counts once.
	counted.add(key);
	writeCounted(counted);
	const { error } = await supabase.rpc("record_visit", { p_kind: kind, p_target: target });
	if (error) {
		const now = readCounted();
		now.delete(key);
		writeCounted(now);
		throw new Error(error.message);
	}
}
