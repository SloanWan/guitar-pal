import { useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { PRESET_STRUM_PATTERNS, type ChordProgression, type StrumPattern } from "@/lib/strumPatterns";
import { uniquePatternName } from "@/lib/strumBars";
import { progressionDisplayName } from "@/lib/strumProgressions";
import { createShare, newShareId, shareUrl, type SharedStrum } from "@/lib/sharedItems";
import { importStrumPattern } from "@/lib/strumStorage";
import { createClient } from "@/lib/supabase";
import { saveLastPattern } from "@/lib/lastPattern";
import { LAST_PATTERN_KEY, OPEN_PROGRESSION_KEY } from "@/components/strum/useStrumSession";

interface Args {
	user: User | null;
	pattern: StrumPattern | null;
	/** The pattern's progressions, and the one open. */
	progressions: ChordProgression[];
	openProgression: ChordProgression | null;
	customPatterns: StrumPattern[];
	patternsLoading: boolean;
	shared?: SharedStrum;
	stop: () => void;
}

/**
 * Sharing and importing a strum pattern.
 *
 * Share: a snapshot of the pattern and the progressions chosen to go with it,
 * under a fresh id. With one progression open it goes along; with several, a
 * dialog asks which. The link is copied inside the click (Safari refuses a
 * clipboard write after an await) and the row written after; where the clipboard
 * is off limits the link is shown to copy by hand.
 *
 * Import (a share page): the snapshot becomes a pattern of the viewer's own, the
 * progressions with it, and the strum page opens on it.
 */
export function useStrumShare({ user, pattern, progressions, openProgression, customPatterns, patternsLoading, shared, stop }: Args) {
	const router = useRouter();
	const [sharing, setSharing] = useState(false);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [importing, setImporting] = useState(false);

	function share() {
		if (shared || sharing || !pattern) return;
		if (!user) {
			toast("Sign in to share a pattern.", {
				action: { label: "Sign in", onClick: () => router.push("/auth?redirect=/strum") },
			});
			return;
		}
		if (progressions.length > 1) {
			setDialogOpen(true);
			return;
		}
		// What is on screen: the open progression, or the rhythm alone.
		void shareWith(openProgression ? [openProgression] : []);
	}

	async function shareWith(chosen: ChordProgression[]) {
		if (!user || !pattern) return;
		setDialogOpen(false);
		// Busy from the click until the link is out, so the wait reads as work.
		setSharing(true);
		const openIndex = Math.max(0, chosen.findIndex((p) => p.id === openProgression?.id));
		const id = newShareId();
		const url = shareUrl(window.location.origin, id);
		let copied = false;
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
		} catch {
			copied = false;
		}
		try {
			await createShare(createClient(), user, id, { kind: "strum", pattern, progressions: chosen, openIndex });
			const what =
				chosen.length === 1
					? `"${pattern.name}" with ${progressionDisplayName(chosen[0])}`
					: chosen.length > 1
						? `"${pattern.name}" with ${chosen.length} progressions`
						: `"${pattern.name}"`;
			if (copied) toast(`Link copied — anyone with it can open ${what}.`, { description: url });
			else window.prompt("Copy this link — anyone with it can open the pattern:", url);
		} catch (e) {
			console.error(e);
			toast.error(copied ? "Couldn't create the share — the copied link won't work." : "Couldn't create the share.");
		} finally {
			setSharing(false);
		}
	}

	async function importShared() {
		if (!shared || patternsLoading || importing) return;
		setImporting(true);
		try {
			const copy: StrumPattern = {
				...shared.pattern,
				id: crypto.randomUUID(),
				name: uniquePatternName(shared.pattern.name, [...PRESET_STRUM_PATTERNS, ...customPatterns]),
			};
			const imported: ChordProgression[] = shared.progressions.map((progression, index) => ({
				...progression,
				id: crypto.randomUUID(),
				patternId: copy.id,
				orderIndex: index,
			}));
			const opened = imported[shared.openIndex] ?? null;
			const supabase = createClient();
			await importStrumPattern(supabase, user, copy, imported);
			await saveLastPattern(supabase, user, "strum", copy.id);
			// Land on what was imported: the pattern, and the progression open.
			localStorage.setItem(LAST_PATTERN_KEY, copy.id);
			if (opened) localStorage.setItem(OPEN_PROGRESSION_KEY, opened.id);
			else localStorage.removeItem(OPEN_PROGRESSION_KEY);
			stop();
			if (user) {
				toast(`Saved "${copy.name}" to your patterns.`);
			} else {
				toast(`Saved "${copy.name}" to this browser.`, {
					description: "Sign in to keep it on your account.",
					action: { label: "Sign in", onClick: () => router.push("/auth?redirect=/strum") },
				});
			}
			router.push(`/strum?pattern=${copy.id}`);
		} catch (e) {
			console.error(e);
			toast.error("Couldn't save the pattern — try again.");
			setImporting(false);
		}
	}

	return { share, shareWith, sharing, dialogOpen, closeDialog: () => setDialogOpen(false), importShared, importing };
}
