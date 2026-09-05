import { useState, useEffect } from "react";
import type { Bar, ChordProgression } from "@/lib/strumPatterns";
import { validateBars, normalizeBpm } from "@/lib/strumBars";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

const STORAGE_KEY = "chordProgressions";

/** A Supabase row from `user_pattern_progressions`; the table is not code-generated. */
interface ProgressionRow {
	id: string;
	pattern_id: string;
	bars: unknown;
	order_index: number | null;
	name: string | null;
	bpm: number | null;
}

/** Drop rows whose bars no longer validate — a bad row must not break the list. */
function rowToProgression(row: ProgressionRow): ChordProgression | null {
	if (!validateBars(row.bars).ok) return null;
	return {
		id: row.id,
		patternId: row.pattern_id,
		bars: row.bars as Bar[],
		orderIndex: row.order_index ?? 0,
		name: row.name ?? "",
		// Null means "no tempo of its own" — the pattern's tempo is used instead.
		bpm: row.bpm === null ? undefined : normalizeBpm(row.bpm),
	};
}

function progressionColumns(progression: ChordProgression, userId: string) {
	return {
		id: progression.id,
		user_id: userId,
		pattern_id: progression.patternId,
		bars: progression.bars,
		order_index: progression.orderIndex,
		name: progression.name?.trim() || null,
		bpm: progression.bpm === undefined ? null : normalizeBpm(progression.bpm),
	};
}

function readStored(): ChordProgression[] {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (!saved) return [];
		return (JSON.parse(saved) as ChordProgression[]).filter((p) => validateBars(p.bars).ok);
	} catch {
		return [];
	}
}

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
		const local = readStored();
		queueMicrotask(() => {
			setProgressions(local);
			setProgressionsLoading(false);
		});
	}, [user, loading]);

	useEffect(() => {
		if (!user) return;
		const currentUser = user;

		async function mergeAndReload() {
			const supabase = createClient();
			const local = readStored();
			if (local.length > 0) {
				try {
					const { error } = await supabase
						.from("user_pattern_progressions")
						.upsert(local.map((p) => progressionColumns(p, currentUser.id)));
					if (error) throw new Error(error.message);
					localStorage.removeItem(STORAGE_KEY);
				} catch (e) {
					console.error("[useChordProgressions] merge failed:", e);
				}
			}

			const { data, error } = await supabase
				.from("user_pattern_progressions")
				.select("id, pattern_id, bars, order_index, name, bpm")
				.eq("user_id", currentUser.id);
			if (error) console.error("[useChordProgressions] load failed:", error.message);
			setProgressions(
				(data ?? [])
					.map((row) => rowToProgression(row as ProgressionRow))
					.filter((p): p is ChordProgression => p !== null),
			);
			setProgressionsLoading(false);
		}

		mergeAndReload();
	}, [user?.id]);

	function persist(next: ChordProgression[]) {
		setProgressions(next);
		if (!user) writeStored(next);
	}

	function handleSaveProgression(progression: ChordProgression) {
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

	return {
		progressions,
		progressionsLoading,
		handleSaveProgression,
		handleDeleteProgression,
	};
}
