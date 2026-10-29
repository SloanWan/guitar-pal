import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { createShare, newShareId, shareUrl, type SharedFingerpick } from "@/lib/sharedItems";
import { saveUserFingerpickPattern } from "@/lib/fingerpickPatternSync";
import { saveLastPattern } from "@/lib/lastPattern";
import { uniquePatternName } from "@/lib/uniquePatternName";
import { createClient } from "@/lib/supabase";

interface Args {
	user: User | null;
	/** The tab on screen, as it is (a capo set this visit comes along). */
	pattern: FingerpickPattern;
	/** On a share page: the snapshot an import copies. */
	shared?: SharedFingerpick;
	/** Every tab's name, so an import gets one of its own. */
	takenNames: string[];
	/** The player's own tabs are still loading: an import waits for them. */
	loading: boolean;
	stop: () => void;
}

/** Share (a link to a snapshot of what is on screen) and, on a share page, import. */
export function useTabShare({ user, pattern, shared, takenNames, loading, stop }: Args) {
	const router = useRouter();
	const [sharing, setSharing] = useState(false);
	const [importing, setImporting] = useState(false);

	function askToSignIn(message: string) {
		toast(message, { action: { label: "Sign in", onClick: () => router.push("/auth?redirect=/fingerpick") } });
	}

	// The link goes on the clipboard first, inside the click — Safari refuses a
	// clipboard write after an await — and the row is written after; if that fails
	// the copied link is a dead one, and the toast says so. Where the clipboard is
	// off limits (an in-app browser, http on a LAN) the link is shown to copy by hand.
	// The button is busy from the click until the link is out, so the wait reads as work.
	async function share() {
		if (sharing) return;
		if (!user) {
			askToSignIn("Sign in to share a tab.");
			return;
		}
		setSharing(true);
		const id = newShareId();
		const url = shareUrl(window.location.origin, id);
		let copied = false;
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
		} catch {
			// shown to copy by hand below
		}
		try {
			await createShare(createClient(), user, id, { kind: "fingerpick", pattern });
			if (copied) toast(`Link copied — anyone with it can open "${pattern.name}".`, { description: url });
			else window.prompt("Copy this link — anyone with it can open the tab:", url);
		} catch (e) {
			console.error(e);
			toast.error(copied ? "Couldn't create the share — the copied link won't work." : "Couldn't create the share.");
		} finally {
			setSharing(false);
		}
	}

	// The snapshot becomes a tab of the viewer's own, through the save a hand-drawn one
	// gets (the browser for a guest, the account for a player), and their page opens
	// on it. The write is awaited before leaving so the page finds the row.
	async function importShared() {
		if (!shared || loading || importing) return;
		setImporting(true);
		try {
			const name = uniquePatternName(pattern.name, takenNames);
			const copy: FingerpickPattern = { ...pattern, id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
			const supabase = createClient();
			await saveUserFingerpickPattern(supabase, user, copy);
			await saveLastPattern(supabase, user, "fingerpick", copy.id);
			stop();
			if (user) toast(`Saved "${name}" to your tabs.`);
			else
				toast(`Saved "${name}" to this browser.`, {
					description: "Sign in to keep it on your account.",
					action: { label: "Sign in", onClick: () => router.push("/auth?redirect=/fingerpick") },
				});
			router.push(`/fingerpick?pattern=${copy.id}`);
		} catch (e) {
			console.error(e);
			toast.error("Couldn't save the tab — try again.");
			setImporting(false);
		}
	}

	return { share, sharing, importShared, importing };
}
