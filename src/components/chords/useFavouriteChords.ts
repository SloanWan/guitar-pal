"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { isFavourite as listHas, mergeFavourites, toggleFavourite, type FavouriteChord } from "@/lib/favouriteChords";
import {
	addAccountFavourites,
	clearLocalFavourites,
	fetchAccountFavourites,
	readLocalFavourites,
	removeAccountFavourite,
	writeLocalFavourites,
} from "@/lib/favouriteChordStore";

/**
 * The chords the player keeps. Signed out they live on this device and are
 * pushed to the account on the first signed-in load, as `useUserChordVoicings`
 * does; until the push has gone through they stay on the device too.
 */
export function useFavouriteChords(user: User | null, loading: boolean) {
	const [favourites, setFavourites] = useState<FavouriteChord[]>([]);
	const [favouritesLoading, setFavouritesLoading] = useState(true);

	useEffect(() => {
		if (loading || user) return;
		const local = readLocalFavourites();
		queueMicrotask(() => {
			setFavourites(local);
			setFavouritesLoading(false);
		});
	}, [user, loading]);

	const userId = user?.id;
	useEffect(() => {
		if (!userId) return;
		let cancelled = false;

		(async () => {
			const local = readLocalFavourites();
			let pushed = local.length === 0;
			try {
				await addAccountFavourites(local, userId);
				pushed = true;
				if (local.length > 0) clearLocalFavourites();
			} catch (e) {
				console.error("[useFavouriteChords] merge failed:", e);
			}
			try {
				const account = await fetchAccountFavourites(userId);
				if (!cancelled) setFavourites(pushed ? account : mergeFavourites(account, local));
			} catch (e) {
				console.error("[useFavouriteChords] load failed:", e);
				if (!cancelled) setFavourites(local);
			}
			if (!cancelled) setFavouritesLoading(false);
		})();

		return () => {
			cancelled = true;
		};
	}, [userId]);

	const isFavourite = useCallback((root: string, suffix: string) => listHas(favourites, root, suffix), [favourites]);

	/** Keep the chord, or let it go. A write the account refuses is undone on screen. */
	const toggle = useCallback(
		(root: string, suffix: string) => {
			const adding = !listHas(favourites, root, suffix);
			const next = toggleFavourite(favourites, root, suffix);
			setFavourites(next);
			if (!user) {
				writeLocalFavourites(next);
				return;
			}
			const chord = { root, suffix };
			(adding ? addAccountFavourites([chord], user.id) : removeAccountFavourite(chord, user.id)).catch((e: unknown) => {
				console.error("[useFavouriteChords] save failed:", e);
				setFavourites((now) => toggleFavourite(now, root, suffix));
				toast("That favourite could not be saved — try again in a moment.");
			});
		},
		[user, favourites],
	);

	return { favourites, favouritesLoading, isFavourite, toggle };
}

export type FavouriteChords = ReturnType<typeof useFavouriteChords>;
