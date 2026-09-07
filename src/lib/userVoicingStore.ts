import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import { getUser } from "@/lib/auth";
import {
	rawUserVoicingId,
	rowToUserVoicing,
	userVoicingColumns,
	type UserChordVoicing,
	type UserVoicingRow,
} from "@/lib/userChordVoicings";

/**
 * Reading the player's own chord shapes, outside of React.
 *
 * `useUserChordVoicings` owns them while a component is looking at them. This is
 * for the places that need them once and cannot justify what the hook costs —
 * the chord palette is mounted on every page in the app, and making it hold a
 * live subscription to the player's shapes would mean an auth round trip on
 * every page load for a search almost nobody runs.
 *
 * Signed out they live in localStorage; signed in, in the account. Both paths
 * end in the same validated rows, so no caller has to know which it got.
 */

const STORAGE_KEY = "userChordVoicings";

/** The shapes stored on this device. Storage is untrusted; bad rows are dropped. */
export function readLocalVoicings(): UserChordVoicing[] {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (!saved) return [];
		return (JSON.parse(saved) as UserVoicingRow[])
			.map((row) => rowToUserVoicing({ ...row, id: rawUserVoicingId(row.id) }))
			.filter((v): v is UserChordVoicing => v !== null);
	} catch {
		return [];
	}
}

export function writeLocalVoicings(voicings: readonly UserChordVoicing[]): void {
	localStorage.setItem(
		STORAGE_KEY,
		JSON.stringify(voicings.map((v) => userVoicingColumns(v, "local"))),
	);
}

export function clearLocalVoicings(): void {
	localStorage.removeItem(STORAGE_KEY);
}

/** Every shape one signed-in player has written. */
export async function fetchAccountVoicings(userId: string): Promise<UserChordVoicing[]> {
	// select("*") on purpose: an explicit column list is a second place to
	// remember a new column, and forgetting it fails silently.
	const { data, error } = await createClient()
		.from("user_chord_voicings")
		.select("*")
		.eq("user_id", userId);
	if (error) throw new Error(error.message);
	return (data ?? [])
		.map((row) => rowToUserVoicing(row as UserVoicingRow))
		.filter((v): v is UserChordVoicing => v !== null);
}

/** The player's shapes, wherever they are kept. */
export async function fetchUserVoicings(user?: User | null): Promise<UserChordVoicing[]> {
	const signedIn = user === undefined ? await getUser() : user;
	return signedIn ? fetchAccountVoicings(signedIn.id) : readLocalVoicings();
}

/**
 * The same, fetched at most once until something is written.
 *
 * Held across the session so a search costs nothing the second time, and thrown
 * away the moment a shape is saved or deleted — a cache that outlived a write is
 * how a chord the player has just written comes back as "not in the library".
 */
let request: Promise<UserChordVoicing[]> | null = null;

export function loadUserVoicings(): Promise<UserChordVoicing[]> {
	request ??= fetchUserVoicings().catch((err: unknown) => {
		request = null;
		throw err;
	});
	return request;
}

export function invalidateUserVoicings(): void {
	request = null;
}
