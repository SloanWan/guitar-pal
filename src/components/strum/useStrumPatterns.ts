import { useState, useEffect } from "react";
import { StrumPattern, Beat, Bar } from "@/lib/strumPatterns";
import { normalizeBpm, patternBpm } from "@/lib/strumBars";
import { createClient } from "@/lib/supabase";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";

/** A Supabase row from `user_strum_patterns`; the table is not code-generated. */
interface StrumPatternRow {
	pattern_id: string;
	name: string;
	beats: Beat[];
	bpm?: unknown;
}

function rowToPattern(row: StrumPatternRow): StrumPattern {
	return {
		id: row.pattern_id,
		name: row.name,
		beats: row.beats,
		bpm: normalizeBpm(row.bpm),
	};
}

/**
 * Columns written for a pattern. `bars` mirrors the single bar so the column
 * stays consistent with `beats` for any reader still looking at it; chord
 * sequences live in their own table, never here.
 */
function patternColumns(pattern: StrumPattern): {
	name: string;
	beats: Beat[];
	bars: Bar[];
	bpm: number;
} {
	return {
		name: pattern.name,
		beats: pattern.beats,
		bars: [{ beats: pattern.beats, chord: null }],
		bpm: patternBpm(pattern),
	};
}

/** Normalize patterns read back from localStorage into the current shape. */
function sanitizeStoredPatterns(patterns: StrumPattern[]): StrumPattern[] {
	return patterns.map((p) => ({
		id: p.id,
		name: p.name,
		beats: p.beats,
		bpm: patternBpm(p),
	}));
}

export function useStrumPatterns(user: User | null, loading: boolean) {
	const [customPatterns, setCustomPatterns] = useState<StrumPattern[]>([]);
	const [patternsLoading, setPatternsLoading] = useState(true);
	const [favouriteIds, setFavouriteIds] = useState<string[]>([]);

	useEffect(() => {
		if (loading || user) return;
		let localPatterns: StrumPattern[] = [];
		try {
			const saved = localStorage.getItem("customStrumPatterns");
			if (saved)
				localPatterns = sanitizeStoredPatterns(JSON.parse(saved) as StrumPattern[]);
		} catch {
			// ignore malformed data
		}
		let localFavIds: string[] = [];
		try {
			const savedFavs = localStorage.getItem("favouritePatternIds");
			if (savedFavs) localFavIds = JSON.parse(savedFavs) as string[];
		} catch {
			// ignore malformed data
		}
		queueMicrotask(() => {
			setCustomPatterns(localPatterns);
			setFavouriteIds(localFavIds);
			setPatternsLoading(false);
		});
	}, [user, loading]);

	useEffect(() => {
		if (!user) return;
		const currentUser = user;

		async function mergeAndReload() {
			const supabase = createClient();
			let merged = false;

			const savedPatterns = localStorage.getItem("customStrumPatterns");
			if (savedPatterns) {
				try {
					const localPatterns = sanitizeStoredPatterns(
						JSON.parse(savedPatterns) as StrumPattern[],
					);
					const { data: existing } = await supabase
						.from("user_strum_patterns")
						.select("pattern_id")
						.eq("user_id", currentUser.id);
					const existingIds = new Set(
						(existing ?? []).map((r) => r.pattern_id as string),
					);
					const toInsert = localPatterns.filter((p) => !existingIds.has(p.id));
					if (toInsert.length > 0) {
						await supabase.from("user_strum_patterns").insert(
							toInsert.map((p) => ({
								user_id: currentUser.id,
								pattern_id: p.id,
								...patternColumns(p),
							})),
						);
						merged = true;
					}
					localStorage.removeItem("customStrumPatterns");
				} catch (e) {
					console.error(e);
				}
			}

			const savedFavs = localStorage.getItem("favouritePatternIds");
			if (savedFavs) {
				try {
					const localFavIds = JSON.parse(savedFavs) as string[];
					const { data: existingFavs } = await supabase
						.from("user_favourite_patterns")
						.select("pattern_id")
						.eq("user_id", currentUser.id);
					const existingFavIds = new Set(
						(existingFavs ?? []).map((r) => r.pattern_id as string),
					);
					const toInsertFavs = localFavIds.filter((id) => !existingFavIds.has(id));
					if (toInsertFavs.length > 0) {
						await supabase.from("user_favourite_patterns").insert(
							toInsertFavs.map((id) => ({ user_id: currentUser.id, pattern_id: id })),
						);
						merged = true;
					}
					localStorage.removeItem("favouritePatternIds");
				} catch (e) {
					console.error(e);
				}
			}

			const { data: patterns } = await supabase
				.from("user_strum_patterns")
				.select("*")
				.eq("user_id", currentUser.id);
			setCustomPatterns(
				(patterns ?? []).map((row) => rowToPattern(row as StrumPatternRow)),
			);
			setPatternsLoading(false);

			const { data: favs } = await supabase
				.from("user_favourite_patterns")
				.select("pattern_id")
				.eq("user_id", currentUser.id);
			setFavouriteIds((favs ?? []).map((r) => r.pattern_id as string));

			if (merged) {
				toast("Your patterns and favourites have been synced to your account.");
			}
		}

		mergeAndReload();
	}, [user?.id]);

	function handleSaveCustomPattern(pattern: StrumPattern) {
		if (user) {
			setPatternsLoading(true);
			(async () => {
				try {
					const supabase = createClient();
					const { error } = await supabase.from("user_strum_patterns").insert({
						user_id: user.id,
						pattern_id: pattern.id,
						...patternColumns(pattern),
					});
					if (error) throw new Error(error.message);
					const { data: patterns } = await supabase
						.from("user_strum_patterns")
						.select("*")
						.eq("user_id", user.id);
					setCustomPatterns(
						(patterns ?? []).map((row) => rowToPattern(row as StrumPatternRow)),
					);
					setPatternsLoading(false);
				} catch (e) {
					console.error(e);
					setPatternsLoading(false);
				}
			})();
		} else {
			const updated = [...customPatterns, pattern];
			setCustomPatterns(updated);
			localStorage.setItem("customStrumPatterns", JSON.stringify(updated));
		}
	}

	function handleEditCustomPattern(updated: StrumPattern) {
		const next = customPatterns.map((p) => (p.id === updated.id ? updated : p));
		setCustomPatterns(next);
		if (user) {
			(async () => {
				try {
					const supabase = createClient();
					const { error } = await supabase
						.from("user_strum_patterns")
						.update(patternColumns(updated))
						.eq("pattern_id", updated.id)
						.eq("user_id", user.id);
					if (error) throw new Error(error.message);
				} catch (e) {
					console.error(e);
				}
			})();
		} else {
			localStorage.setItem("customStrumPatterns", JSON.stringify(next));
		}
	}

	function handleDeleteCustomPattern(id: string) {
		const updated = customPatterns.filter((p) => p.id !== id);
		setCustomPatterns(updated);
		localStorage.setItem("customStrumPatterns", JSON.stringify(updated));

		// A favourite record for a pattern that no longer exists would keep the
		// favourites tab listing a ghost, so it goes with the pattern.
		const wasFavourite = favouriteIds.includes(id);
		if (wasFavourite) {
			const remainingFavs = favouriteIds.filter((favId) => favId !== id);
			setFavouriteIds(remainingFavs);
			localStorage.setItem("favouritePatternIds", JSON.stringify(remainingFavs));
		}

		if (user) {
			(async () => {
				try {
					const supabase = createClient();
					const { error } = await supabase
						.from("user_strum_patterns")
						.delete()
						.eq("pattern_id", id)
						.eq("user_id", user.id);
					if (error) throw new Error(error.message);
					if (wasFavourite) {
						const { error: favError } = await supabase
							.from("user_favourite_patterns")
							.delete()
							.eq("pattern_id", id)
							.eq("user_id", user.id);
						if (favError) throw new Error(favError.message);
					}
				} catch (e) {
					console.error(e);
				}
			})();
		}
	}

	function handleToggleFavourite(patternId: string) {
		const isFav = favouriteIds.includes(patternId);
		const updated = isFav
			? favouriteIds.filter((id) => id !== patternId)
			: [...favouriteIds, patternId];
		setFavouriteIds(updated);
		localStorage.setItem("favouritePatternIds", JSON.stringify(updated));
		if (user) {
			(async () => {
				try {
					const supabase = createClient();
					if (isFav) {
						const { error } = await supabase
							.from("user_favourite_patterns")
							.delete()
							.eq("pattern_id", patternId)
							.eq("user_id", user.id);
						if (error) throw new Error(error.message);
					} else {
						const { error } = await supabase
							.from("user_favourite_patterns")
							.insert({ user_id: user.id, pattern_id: patternId });
						if (error) throw new Error(error.message);
					}
				} catch (e) {
					console.error(e);
				}
			})();
		}
	}

	return {
		customPatterns,
		patternsLoading,
		favouriteIds,
		handleSaveCustomPattern,
		handleEditCustomPattern,
		handleDeleteCustomPattern,
		handleToggleFavourite,
	};
}
