"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { dedupeUserVoicing, type UserChordVoicing } from "@/lib/userChordVoicings";
import {
	clearLocalVoicings,
	deleteAccountVoicing,
	fetchAccountVoicings,
	invalidateUserVoicings,
	readLocalVoicings,
	upsertAccountVoicings,
	writeLocalVoicings,
} from "@/lib/userVoicingStore";

/**
 * The chord shapes the player has written, across every chord.
 *
 * Signed out they live in localStorage and are pushed to the account on the
 * first signed-in load, as `useStrumPatterns` and `useChordProgressions` do.
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

	const userId = user?.id;
	useEffect(() => {
		if (!userId) return;
		let cancelled = false;

		(async () => {
			const local = readLocalVoicings();
			try {
				await upsertAccountVoicings(local, userId);
				if (local.length > 0) clearLocalVoicings();
			} catch (e) {
				console.error("[useUserChordVoicings] merge failed:", e);
			}
			try {
				const fetched = await fetchAccountVoicings(userId);
				if (!cancelled) setVoicings(fetched);
			} catch (e) {
				console.error("[useUserChordVoicings] load failed:", e);
			}
			if (!cancelled) setVoicingsLoading(false);
		})();

		return () => {
			cancelled = true;
		};
	}, [userId]);

	/** Writes the list a change produced: to this device when signed out, then drops stale reads. */
	const commitLocal = useCallback(
		(next: UserChordVoicing[]) => {
			if (user) return;
			writeLocalVoicings(next);
			invalidateUserVoicings();
		},
		[user],
	);

	/**
	 * Store a shape and return the row it actually lives in — an existing row
	 * when the same grip is already on record, so a bar pinned to it stays pinned.
	 */
	const saveVoicing = useCallback(
		(voicing: UserChordVoicing): UserChordVoicing => {
			const stored = dedupeUserVoicing(voicings, voicing);
			const next = voicings.some((v) => v.id === stored.id)
				? voicings.map((v) => (v.id === stored.id ? stored : v))
				: [...voicings, stored];
			setVoicings(next);
			commitLocal(next);
			if (user) {
				upsertAccountVoicings([stored], user.id)
					.then(invalidateUserVoicings)
					.catch((e: unknown) => console.error("[useUserChordVoicings] save failed:", e));
			}
			return stored;
		},
		[user, voicings, commitLocal],
	);

	const deleteVoicing = useCallback(
		(id: string) => {
			const next = voicings.filter((v) => v.id !== id);
			setVoicings(next);
			commitLocal(next);
			if (user) {
				deleteAccountVoicing(id, user.id)
					.then(invalidateUserVoicings)
					.catch((e: unknown) => console.error("[useUserChordVoicings] delete failed:", e));
			}
		},
		[user, voicings, commitLocal],
	);

	return { voicings, voicingsLoading, saveVoicing, deleteVoicing };
}
