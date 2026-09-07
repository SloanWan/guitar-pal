"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import {
	dedupeUserVoicing,
	rawUserVoicingId,
	userVoicingColumns,
	type UserChordVoicing,
} from "@/lib/userChordVoicings";
import {
	clearLocalVoicings,
	fetchAccountVoicings,
	invalidateUserVoicings,
	readLocalVoicings,
	writeLocalVoicings,
} from "@/lib/userVoicingStore";

/**
 * The chord shapes the player has written, across every chord.
 *
 * Signed out they live in localStorage and are pushed to the account on the
 * first signed-in load, mirroring how `useStrumPatterns` and
 * `useChordProgressions` treat a player who starts before signing up. The list
 * is small enough to hold whole and filter per chord where it is used.
 */

export function useUserChordVoicings(user: User | null, loading: boolean) {
	const [voicings, setVoicings] = useState<UserChordVoicing[]>([]);
	const [voicingsLoading, setVoicingsLoading] = useState(true);

	useEffect(() => {
		if (loading || user) return;
		const local = readLocalVoicings();
		queueMicrotask(() => {
			setVoicings(local);
			setVoicingsLoading(false);
		});
	}, [user, loading]);

	useEffect(() => {
		if (!user) return;
		const currentUser = user;

		async function mergeAndReload() {
			const supabase = createClient();
			const local = readLocalVoicings();
			if (local.length > 0) {
				try {
					const { error } = await supabase
						.from("user_chord_voicings")
						.upsert(local.map((v) => userVoicingColumns(v, currentUser.id)));
					if (error) throw new Error(error.message);
					clearLocalVoicings();
				} catch (e) {
					console.error("[useUserChordVoicings] merge failed:", e);
				}
			}

			try {
				setVoicings(await fetchAccountVoicings(currentUser.id));
			} catch (e) {
				console.error("[useUserChordVoicings] load failed:", e);
			}
			setVoicingsLoading(false);
		}

		mergeAndReload();
	}, [user?.id]);

	/**
	 * Store a shape and return the row it actually lives in.
	 *
	 * Deduplication happens here rather than at the three places that save, so
	 * none of them can forget it: every save mints a fresh id, so writing the
	 * same grip twice — which takes no more than opening the editor and pressing
	 * apply again — would otherwise file it twice.
	 *
	 * The stored row comes back because its id may differ from the one just
	 * minted, and the caller is about to pin a bar to it.
	 */
	const saveVoicing = useCallback(
		(voicing: UserChordVoicing): UserChordVoicing => {
			const stored = dedupeUserVoicing(voicings, voicing);
			setVoicings((prev) => {
				const next = prev.some((v) => v.id === stored.id)
					? prev.map((v) => (v.id === stored.id ? stored : v))
					: [...prev, stored];
				if (!user) {
					writeLocalVoicings(next);
					// After the write, never before it: anything holding a fetched copy
					// has to fetch it again, and invalidating a cache while the old
					// value is still the stored one simply refills it with the old one.
					invalidateUserVoicings();
				}
				return next;
			});
			if (!user) return stored;
			(async () => {
				try {
					const supabase = createClient();
					const { error } = await supabase
						.from("user_chord_voicings")
						.upsert(userVoicingColumns(stored, user.id));
					if (error) throw new Error(error.message);
					invalidateUserVoicings();
				} catch (e) {
					console.error("[useUserChordVoicings] save failed:", e);
				}
			})();
			return stored;
		},
		[user, voicings],
	);

	const deleteVoicing = useCallback(
		(id: string) => {
			setVoicings((prev) => {
				const next = prev.filter((v) => v.id !== id);
				if (!user) {
					writeLocalVoicings(next);
					invalidateUserVoicings();
				}
				return next;
			});
			if (!user) return;
			(async () => {
				try {
					const supabase = createClient();
					const { error } = await supabase
						.from("user_chord_voicings")
						.delete()
						.eq("id", rawUserVoicingId(id))
						.eq("user_id", user.id);
					if (error) throw new Error(error.message);
					invalidateUserVoicings();
				} catch (e) {
					console.error("[useUserChordVoicings] delete failed:", e);
				}
			})();
		},
		[user],
	);

	return { voicings, voicingsLoading, saveVoicing, deleteVoicing };
}
