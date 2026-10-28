import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import {
	HANDOFF_EVENT,
	takeHandoff,
	type FingerpickAnyHandoff,
	type FingerpickHandoff,
} from "@/lib/assistant/handoff";
import { applySet, applyTabEdit } from "@/lib/assistant/tab/editIntent";
import type { TabSession } from "./useTabSession";

/** An assistant change to a tab the player has, as opposed to a new tab to check. */
export type TabEdit = Exclude<FingerpickAnyHandoff, FingerpickHandoff>;

/**
 * What the page says once an edit has been applied. `saved` is what the save
 * settled on: a rename, or a preset's copy, may gain a counter, and a tempo is
 * held inside its meter's range.
 */
export function tabEditMessage(
	edit: TabEdit,
	targetName: string,
	saved: Pick<FingerpickPattern, "name" | "bpm">,
	isPreset: boolean,
): string {
	const savedName = saved.name;
	const kept = "— the shipped tab stays as it was.";
	switch (edit.kind) {
		case "fingerpick-delete":
			return `Deleted "${targetName}".`;
		case "fingerpick-rename":
			return `Renamed "${targetName}" to "${savedName}".`;
		case "fingerpick-set": {
			const parts = [
				...(edit.timeSignature ? [`${edit.timeSignature[0]}/${edit.timeSignature[1]}`] : []),
				...(edit.bpm !== null ? [`${saved.bpm} BPM`] : []),
			].join(" at ");
			return isPreset ? `Saved "${savedName}" at ${parts} ${kept}` : `Set "${targetName}" to ${parts}.`;
		}
		case "fingerpick-edit": {
			const bars = `${edit.measures.length} bar${edit.measures.length === 1 ? "" : "s"}`;
			const first = (edit.barIndex ?? 0) + 1;
			const where = edit.replaceCount > 1 ? `bars ${first}–${first + edit.replaceCount - 1}` : `bar ${first}`;
			if (edit.op === "append") return isPreset ? `Saved "${savedName}" with ${bars} added ${kept}` : `Added ${bars} to "${targetName}".`;
			return isPreset ? `Saved "${savedName}" with ${where} rewritten ${kept}` : `Rewrote ${where} of "${targetName}".`;
		}
	}
}

/** A preset is never changed: an edit to one is saved as a tab of the player's own. */
function asOwn(pattern: FingerpickPattern, isPreset: boolean): FingerpickPattern {
	return isPreset ? { ...pattern, id: crypto.randomUUID(), name: `${pattern.name} (mine)`, createdAt: undefined } : pattern;
}

/**
 * What the assistant hands this page. A new tab opens in the editor to be checked
 * and saved (nothing is saved on arrival); a change to one the player has —
 * bars added or rewritten, a new name, tempo or meter, a delete — goes through
 * the same saves the editor and the library use. The assistant lives in the
 * header, so a handoff usually lands with the page on screen; the event covers
 * that and the mount read covers arriving with one waiting.
 */
export function useTabHandoff(session: TabSession, isShared: boolean) {
	const [handoff, setHandoff] = useState<FingerpickHandoff | null>(null);

	function apply(edit: TabEdit) {
		const target = session.patterns.find((p) => p.id === edit.patternId);
		if (!target) {
			toast(`"${edit.patternName}" is no longer in your tabs — nothing was changed.`);
			return;
		}
		const isPreset = !session.customPatterns.some((p) => p.id === target.id);
		// The assistant refuses to rename or delete a preset; these never arrive for one.
		if (edit.kind === "fingerpick-delete") {
			if (isPreset) return;
			session.remove(target.id);
			toast(tabEditMessage(edit, target.name, target, isPreset));
			return;
		}
		if (edit.kind === "fingerpick-rename") {
			if (isPreset) return;
			const saved = session.save({ ...target, name: edit.newName });
			toast(tabEditMessage(edit, target.name, saved, isPreset));
			return;
		}
		const changed =
			edit.kind === "fingerpick-set"
				? applySet(target, edit.bpm, edit.timeSignature).next
				: applyTabEdit(target, edit.op, edit.barIndex, edit.measures, edit.replaceCount);
		const saved = session.save(asOwn(changed, isPreset));
		// A new tab is opened by the save; an edited one is opened here so the change
		// is on screen — a new tempo or meter reopened even when it already is, so
		// the tempo shown follows.
		if (!isPreset && (edit.kind === "fingerpick-set" || saved.id !== session.selected.id)) session.select(saved);
		toast(tabEditMessage(edit, target.name, saved, isPreset));
	}

	// Subscribed once; the latest closure is always the one called. An edit that
	// lands before the player's tabs have loaded waits for them.
	const applyRef = useRef(apply);
	const pendingRef = useRef<TabEdit | null>(null);
	const loadingRef = useRef(session.isLoading);
	useEffect(() => {
		applyRef.current = apply;
		loadingRef.current = session.isLoading;
	});
	useEffect(() => {
		if (session.isLoading || !pendingRef.current) return;
		const edit = pendingRef.current;
		pendingRef.current = null;
		applyRef.current(edit);
	}, [session.isLoading]);

	useEffect(() => {
		// A share page is not where a handed-over tab lands: the stash waits for the player's own page.
		if (isShared) return;
		function take() {
			const next = takeHandoff("fingerpick");
			if (!next) return;
			if (next.kind !== "fingerpick") {
				if (loadingRef.current) pendingRef.current = next;
				else applyRef.current(next);
				return;
			}
			// A new tab of the player's, whatever id the stash carried: a fresh one keeps
			// it from overwriting one they have.
			setHandoff({ ...next, pattern: { ...next.pattern, id: crypto.randomUUID() } });
		}
		take();
		window.addEventListener(HANDOFF_EVENT, take);
		return () => window.removeEventListener(HANDOFF_EVENT, take);
	}, [isShared]);

	return { handoff, closeHandoff: () => setHandoff(null) };
}
