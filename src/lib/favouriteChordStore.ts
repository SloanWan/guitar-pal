import { createClient } from "@/lib/supabase";
import { readFavourites, type FavouriteChord } from "@/lib/favouriteChords";

/**
 * Where favourite chords are kept: this device's localStorage when signed out,
 * the account's `user_favourite_chords` rows when signed in. Account calls
 * throw on a Supabase error.
 */

const STORAGE_KEY = "favouriteChords";

/** This device's favourites. Storage is untrusted; bad entries are dropped. */
export function readLocalFavourites(): FavouriteChord[] {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		return saved ? readFavourites(JSON.parse(saved)) : [];
	} catch {
		return [];
	}
}

export function writeLocalFavourites(favourites: readonly FavouriteChord[]): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(favourites));
	} catch {
		// private mode or a full quota: kept for this visit only
	}
}

export function clearLocalFavourites(): void {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// nothing to clear
	}
}

/** Oldest first, so the list reads in the order the chords were kept. */
export async function fetchAccountFavourites(userId: string): Promise<FavouriteChord[]> {
	const { data, error } = await createClient()
		.from("user_favourite_chords")
		.select("root, suffix")
		.eq("user_id", userId)
		.order("created_at", { ascending: true });
	if (error) throw new Error(error.message);
	return readFavourites(data);
}

/** Adds chords to the account; one already there stays as it was. */
export async function addAccountFavourites(favourites: readonly FavouriteChord[], userId: string): Promise<void> {
	if (favourites.length === 0) return;
	const { error } = await createClient()
		.from("user_favourite_chords")
		.upsert(
			favourites.map((f) => ({ user_id: userId, root: f.root, suffix: f.suffix })),
			{ onConflict: "user_id,root,suffix", ignoreDuplicates: true },
		);
	if (error) throw new Error(error.message);
}

export async function removeAccountFavourite(favourite: FavouriteChord, userId: string): Promise<void> {
	const { error } = await createClient()
		.from("user_favourite_chords")
		.delete()
		.eq("user_id", userId)
		.eq("root", favourite.root)
		.eq("suffix", favourite.suffix);
	if (error) throw new Error(error.message);
}
