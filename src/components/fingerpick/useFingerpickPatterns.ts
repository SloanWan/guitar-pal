import { useState, useEffect } from "react";
import { FingerpickPattern } from "@/lib/fingerpickTypes";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import { uniquePatternName } from "@/lib/uniquePatternName";
import { createClient } from "@/lib/supabase";
import {
	loadUserFingerpickPatterns,
	saveUserFingerpickPattern,
	deleteUserFingerpickPattern,
	mergeLocalFingerpickPatternsToSupabase,
	LOCAL_FINGERPICK_FAVOURITES_KEY as LOCAL_STORAGE_KEY,
} from "@/lib/fingerpickPatternSync";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";

export function useFingerpickPatterns(user: User | null, loading: boolean) {
	const [selectedPattern, setSelectedPattern] = useState<FingerpickPattern>(
		PRESET_FINGERPICK_PATTERNS[0],
	);
	const [customPatterns, setCustomPatterns] = useState<FingerpickPattern[]>([]);
	const [favouriteIds, setFavouriteIds] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	// Presets plus any user-created patterns; presets stay first.
	const patterns = [...PRESET_FINGERPICK_PATTERNS, ...customPatterns];

	// Logged-out path: read favourites and custom patterns from localStorage.
	useEffect(() => {
		if (loading || user) return;
		let localFavIds: string[] = [];
		try {
			const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
			if (saved) localFavIds = JSON.parse(saved) as string[];
		} catch {
			// ignore malformed data
		}
		const supabase = createClient();
		loadUserFingerpickPatterns(supabase, null)
			.then((patterns) => {
				setCustomPatterns(patterns);
			})
			.catch((e) => console.error(e))
			.finally(() => {
				setFavouriteIds(localFavIds);
				setIsLoading(false);
			});
	}, [user, loading]);

	// Logged-in path: merge any localStorage data into Supabase, then load.
	useEffect(() => {
		if (!user) return;
		const currentUser = user;

		async function mergeAndReload() {
			const supabase = createClient();
			let merged = false;

			// Merge favourites.
			const savedFavs = localStorage.getItem(LOCAL_STORAGE_KEY);
			if (savedFavs) {
				try {
					const localFavIds = JSON.parse(savedFavs) as string[];
					const { data: existingFavs } = await supabase
						.from("user_favourite_fingerpick_patterns")
						.select("pattern_id")
						.eq("user_id", currentUser.id);
					const existingFavIds = new Set(
						(existingFavs ?? []).map((r) => r.pattern_id as string),
					);
					const toInsert = localFavIds.filter((id) => !existingFavIds.has(id));
					if (toInsert.length > 0) {
						await supabase
							.from("user_favourite_fingerpick_patterns")
							.insert(toInsert.map((id) => ({ user_id: currentUser.id, pattern_id: id })));
						merged = true;
					}
					localStorage.removeItem(LOCAL_STORAGE_KEY);
				} catch (e) {
					console.error(e);
				}
			}

			// Merge custom patterns.
			try {
				const migratedCount = await mergeLocalFingerpickPatternsToSupabase(
					supabase,
					currentUser,
				);
				if (migratedCount > 0) merged = true;
			} catch (e) {
				console.error(e);
			}

			try {
				const patterns = await loadUserFingerpickPatterns(supabase, currentUser);
				setCustomPatterns(patterns);
			} catch (e) {
				console.error(e);
			}

			const { data: favs } = await supabase
				.from("user_favourite_fingerpick_patterns")
				.select("pattern_id")
				.eq("user_id", currentUser.id);
			setFavouriteIds((favs ?? []).map((r) => r.pattern_id as string));
			setIsLoading(false);

			if (merged) {
				toast("Your fingerpick patterns have been synced to your account.");
			}
		}

		mergeAndReload();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [user?.id]);

	function toggleFavourite(patternId: string) {
		const isFav = favouriteIds.includes(patternId);
		const updated = isFav
			? favouriteIds.filter((id) => id !== patternId)
			: [...favouriteIds, patternId];
		setFavouriteIds(updated);
		if (!user) {
			localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
		}
		if (user) {
			(async () => {
				try {
					const supabase = createClient();
					if (isFav) {
						const { error } = await supabase
							.from("user_favourite_fingerpick_patterns")
							.delete()
							.eq("pattern_id", patternId)
							.eq("user_id", user.id);
						if (error) throw new Error(error.message);
					} else {
						const { error } = await supabase
							.from("user_favourite_fingerpick_patterns")
							.insert({ user_id: user.id, pattern_id: patternId });
						if (error) throw new Error(error.message);
					}
				} catch (e) {
					console.error(e);
				}
			})();
		}
	}

	// Insert or update a custom pattern (create + edit both route here). Returns
	// what was stored (the name may have gained a counter) and whether it is new.
	function saveCustomPattern(saved: FingerpickPattern): { pattern: FingerpickPattern; isNew: boolean } {
		// A new pattern is stamped now and goes to the top; an edit keeps its
		// stamp and its place. The list is newest first, as the library shows it.
		// Names are unique across presets and customs ("Waltz" → "Waltz (1)"),
		// so a card is always identifiable by name alone.
		const existing = customPatterns.find((p) => p.id === saved.id);
		const takenNames = patterns.filter((p) => p.id !== saved.id).map((p) => p.name);
		const name = uniquePatternName(saved.name, takenNames);
		const pattern: FingerpickPattern = existing
			? { ...saved, name, createdAt: existing.createdAt ?? saved.createdAt }
			: { ...saved, name, createdAt: saved.createdAt ?? new Date().toISOString() };
		setCustomPatterns((prev) =>
			existing
				? prev.map((p) => (p.id === pattern.id ? pattern : p))
				: [pattern, ...prev],
		);
		if (selectedPattern.id === pattern.id) setSelectedPattern(pattern);
		(async () => {
			try {
				const supabase = createClient();
				await saveUserFingerpickPattern(supabase, user, pattern);
			} catch (e) {
				console.error(e);
			}
		})();
		return { pattern, isNew: !existing };
	}

	function deleteCustomPattern(patternId: string) {
		setCustomPatterns((prev) => prev.filter((p) => p.id !== patternId));
		if (selectedPattern.id === patternId) setSelectedPattern(PRESET_FINGERPICK_PATTERNS[0]);

		// The favourite record goes with the pattern, or the favourites tab keeps
		// listing one that can no longer be opened.
		const wasFavourite = favouriteIds.includes(patternId);
		if (wasFavourite) {
			const remainingFavs = favouriteIds.filter((id) => id !== patternId);
			setFavouriteIds(remainingFavs);
			if (!user) localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(remainingFavs));
		}

		(async () => {
			try {
				// The favourite record goes with it, inside the delete itself — see
				// deleteUserFingerpickPattern.
				await deleteUserFingerpickPattern(createClient(), user, patternId);
			} catch (e) {
				console.error(e);
			}
		})();
	}


	return {
		patterns,
		customPatterns,
		selectedPattern,
		setSelectedPattern,
		favouriteIds,
		toggleFavourite,
		saveCustomPattern,
		deleteCustomPattern,
		isLoading,
	};
}
