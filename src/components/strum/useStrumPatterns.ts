import { useState, useEffect } from "react";
import { StrumPattern, Beat } from "@/lib/strumPatterns";
import { createClient } from "@/lib/supabase";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";

export function useStrumPatterns(user: User | null, loading: boolean) {
	const [customPatterns, setCustomPatterns] = useState<StrumPattern[]>([]);
	const [patternsLoading, setPatternsLoading] = useState(true);
	const [favouriteIds, setFavouriteIds] = useState<string[]>([]);

	useEffect(() => {
		if (loading || user) return;
		setCustomPatterns([]);
		setFavouriteIds([]);
		let localPatterns: StrumPattern[] = [];
		try {
			const saved = localStorage.getItem("customStrumPatterns");
			if (saved) localPatterns = JSON.parse(saved) as StrumPattern[];
		} catch {
			// ignore malformed data
		}
		setCustomPatterns(localPatterns);
		setPatternsLoading(false);
		let localFavIds: string[] = [];
		try {
			const savedFavs = localStorage.getItem("favouritePatternIds");
			if (savedFavs) localFavIds = JSON.parse(savedFavs) as string[];
		} catch {
			// ignore malformed data
		}
		setFavouriteIds(localFavIds);
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
					const localPatterns = JSON.parse(savedPatterns) as StrumPattern[];
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
								name: p.name,
								beats: p.beats,
								description: p.description,
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
				(patterns ?? []).map((row) => ({
					id: row.pattern_id as string,
					name: row.name as string,
					beats: row.beats as Beat[],
					description: (row.description ?? "") as string,
				})),
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
						name: pattern.name,
						beats: pattern.beats,
						description: pattern.description,
					});
					if (error) throw new Error(error.message);
					const { data: patterns } = await supabase
						.from("user_strum_patterns")
						.select("*")
						.eq("user_id", user.id);
					setCustomPatterns(
						(patterns ?? []).map((row) => ({
							id: row.pattern_id as string,
							name: row.name as string,
							beats: row.beats as Beat[],
							description: (row.description ?? "") as string,
						})),
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
						.update({ name: updated.name, beats: updated.beats, description: updated.description })
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
