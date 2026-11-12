import { useState, useEffect } from "react";
import { refuseOfflineWrite } from "@/lib/offline/writes";
import { useLibraryCopy } from "@/hooks/useLibraryCopy";
import type { ChordProgression } from "@/lib/strumPatterns";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import {
	fetchAccountProgressions,
	migrateGuestStrumStorage,
	progressionColumns,
	readStoredProgressions,
	STRUM_PROGRESSIONS_STORAGE_KEY,
} from "@/lib/strumStorage";

const STORAGE_KEY = STRUM_PROGRESSIONS_STORAGE_KEY;

function writeStored(progressions: ChordProgression[]) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(progressions));
}

/**
 * Every chord progression the user owns, across all patterns — the list is
 * small enough to hold whole and filter per pattern in the UI.
 *
 * Signed out, progressions live in localStorage; on the first signed-in load
 * anything still stored locally is pushed to the account, mirroring how
 * `useStrumPatterns` merges custom patterns.
 */
export function useChordProgressions(user: User | null, loading: boolean) {
	const [progressions, setProgressions] = useState<ChordProgression[]>([]);
	const [progressionsLoading, setProgressionsLoading] = useState(true);

	useEffect(() => {
		if (loading || user) return;
		migrateGuestStrumStorage();
		const local = readStoredProgressions();
		queueMicrotask(() => {
			setProgressions(local);
			setProgressionsLoading(false);
		});
	}, [user, loading]);

	const userId = user?.id;
	useEffect(() => {
		if (!userId) return;
		const currentUserId = userId;

		async function mergeAndReload() {
			const supabase = createClient();
			migrateGuestStrumStorage();
			const local = readStoredProgressions();
			if (local.length > 0) {
				try {
					const { error } = await supabase
						.from("user_pattern_progressions")
						.upsert(local.map((p) => progressionColumns(p, currentUserId)));
					if (error) throw new Error(error.message);
					localStorage.removeItem(STORAGE_KEY);
				} catch (e) {
					console.error("[useChordProgressions] merge failed:", e);
				}
			}

			try {
				setProgressions(await fetchAccountProgressions(supabase, currentUserId));
			} catch (e) {
				console.error("[useChordProgressions] load failed:", e);
			}
			setProgressionsLoading(false);
		}

		mergeAndReload();
	}, [userId]);

	function persist(next: ChordProgression[]) {
		setProgressions(next);
		if (!user) writeStored(next);
	}

	function handleSaveProgression(progression: ChordProgression) {
		if (refuseOfflineWrite(user)) return;
		const exists = progressions.some((p) => p.id === progression.id);
		persist(
			exists
				? progressions.map((p) => (p.id === progression.id ? progression : p))
				: [...progressions, progression],
		);
		if (!user) return;
		(async () => {
			try {
				const supabase = createClient();
				const { error } = await supabase
					.from("user_pattern_progressions")
					.upsert(progressionColumns(progression, user.id));
				if (error) throw new Error(error.message);
			} catch (e) {
				console.error("[useChordProgressions] save failed:", e);
			}
		})();
	}

	function handleDeleteProgression(id: string) {
		if (refuseOfflineWrite(user)) return;
		persist(progressions.filter((p) => p.id !== id));
		if (!user) return;
		(async () => {
			try {
				const supabase = createClient();
				const { error } = await supabase
					.from("user_pattern_progressions")
					.delete()
					.eq("id", id)
					.eq("user_id", user.id);
				if (error) throw new Error(error.message);
			} catch (e) {
				console.error("[useChordProgressions] delete failed:", e);
			}
		})();
	}

	/**
	 * Drop every progression written over a pattern — called when that pattern is
	 * deleted, so no row is left pointing at something that no longer exists.
	 */
	function handleDeletePatternProgressions(patternId: string) {
		if (refuseOfflineWrite(user)) return;
		if (!progressions.some((p) => p.patternId === patternId)) return;
		persist(progressions.filter((p) => p.patternId !== patternId));
		if (!user) return;
		(async () => {
			try {
				const supabase = createClient();
				const { error } = await supabase
					.from("user_pattern_progressions")
					.delete()
					.eq("pattern_id", patternId)
					.eq("user_id", user.id);
				if (error) throw new Error(error.message);
			} catch (e) {
				console.error("[useChordProgressions] cascade delete failed:", e);
			}
		})();
	}

	// This device's copy, kept in step with the page's writes (#469).
	useLibraryCopy("progressions", userId, progressions, !progressionsLoading);

	return {
		progressions,
		progressionsLoading,
		handleSaveProgression,
		handleDeleteProgression,
		handleDeletePatternProgressions,
	};
}
