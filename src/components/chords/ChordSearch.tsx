"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, SearchIcon } from "lucide-react";

import {
	CommandDialog,
	CommandInput,
	CommandList,
	CommandGroup,
	CommandItem,
} from "@/components/ui/command";
import MusicalText from "@/components/MusicalText";
import { useNavTransition } from "@/components/nav-progress";
import { rootToSlug, suffixToSlug } from "@/lib/chordSlug";
import { isSlashChord } from "@/lib/chordSuffixes";
import { tocSectionId, tocSubsectionId } from "@/lib/chordToc";
import {
	searchChords,
	getNavShortcut,
	type ChordIndexEntry,
	type ChordSearchResult,
	type NavShortcut,
} from "@/lib/chordSearch";
import { reportChordRequest, type SubmissionVerdict } from "@/lib/chordRequests";

// Chord names read best compact (Cm7, Cmaj7) but slash chords already carry their
// own separator, so no extra space there. Matches how the browse UI labels chords.
function displayName(root: string, suffix: string): string {
	return isSlashChord(suffix) ? `${root}${suffix}` : `${root} ${suffix}`;
}

// Deep-links a browse shortcut into /chords/all via the shared tocSectionId anchors.
// Root (and root+category) shortcuts land on the default root-first grouping — where
// each root section carries per-category subsections (id "b-minor"); a bare category
// flips to the category-first grouping (?group=category) where its heading lives.
function shortcutHref(s: NavShortcut): string {
	switch (s.kind) {
		case "root":
			return `/chords/all#${tocSectionId(s.root)}`;
		case "root-category":
			return `/chords/all#${tocSubsectionId(s.root, s.category)}`;
		case "category":
			return `/chords/all?group=category#${tocSectionId(s.category)}`;
	}
}

// Trailing phrase for a category in a shortcut label: "minor" → "minor chords",
// "power chord" → "power chords" (avoids the doubled "power chord chords").
function categoryPhrase(category: string): string {
	const lower = category.toLowerCase();
	return /chord$/.test(lower) ? `${lower}s` : `${lower} chords`;
}

const REPORT_MESSAGES: Record<SubmissionVerdict, string> = {
	ok: "Thanks — we'll look into adding it.",
	duplicate: "You've already reported that.",
	throttled: "Please wait a moment before reporting again.",
	empty: "",
};

type ReportState = "idle" | "sending" | { done: SubmissionVerdict } | { error: true };

export default function ChordSearch({ index }: { index: readonly ChordIndexEntry[] }) {
	const router = useRouter();
	const startNav = useNavTransition();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [report, setReport] = useState<ReportState>("idle");

	// Browser-only platform hint. Lazily read on first render; on the server it
	// resolves to false, so the <kbd> is marked suppressHydrationWarning to absorb
	// the one-render text difference rather than churning state in an effect.
	const [isMac] = useState(
		() =>
			typeof navigator !== "undefined" &&
			/mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent),
	);

	// Cmd+K / Ctrl+K toggles the palette. Skipped while focus is in a form field —
	// same guard the strum/fingerpick spacebar handlers use, extended to <select>.
	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			const t = e.target;
			if (
				t instanceof HTMLInputElement ||
				t instanceof HTMLTextAreaElement ||
				t instanceof HTMLSelectElement
			) {
				return;
			}
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				setOpen((o) => !o);
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	const results = useMemo(() => searchChords(index, query), [index, query]);
	const shortcut = useMemo(() => getNavShortcut(query), [query]);
	const trimmed = query.trim();

	// Report state is per-query, so clear it whenever the query changes.
	const handleQueryChange = useCallback((next: string) => {
		setQuery(next);
		setReport("idle");
	}, []);

	const handleOpenChange = useCallback((next: boolean) => {
		setOpen(next);
		if (!next) {
			setQuery("");
			setReport("idle");
		}
	}, []);

	// Close the palette immediately on select so it never sits open and inert, then
	// run the navigation inside a transition so the global progress bar takes over
	// while the destination route is in flight (the palette is already gone).
	const goToChord = useCallback(
		(r: ChordSearchResult) => {
			handleOpenChange(false);
			startNav(() =>
				router.push(`/chords/${rootToSlug(r.root)}/${suffixToSlug(r.suffix)}`),
			);
		},
		[router, handleOpenChange, startNav],
	);

	const goToBrowse = useCallback(
		(s: NavShortcut) => {
			handleOpenChange(false);
			startNav(() => router.push(shortcutHref(s)));
		},
		[router, handleOpenChange, startNav],
	);

	const submitReport = useCallback(async () => {
		setReport("sending");
		try {
			const verdict = await reportChordRequest(trimmed);
			setReport({ done: verdict });
		} catch {
			setReport({ error: true });
		}
	}, [trimmed]);

	return (
		<>
			{/* Compact affordance — it only opens the modal, so an icon + shortcut hint
          is enough. Discoverable and touch-friendly (hint hidden on small screens). */}
			<button
				type="button"
				onClick={() => setOpen(true)}
				aria-label="Search chords"
				title="Search chords"
				className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-ink-dim shadow-sm transition-all duration-200 hover:scale-110 hover:border-denim-light hover:text-ink hover:shadow-lg"
			>
				<SearchIcon className="size-4 shrink-0" />
				<kbd
					suppressHydrationWarning
					className="pointer-events-none hidden rounded border border-line bg-denim-tint px-1.5 font-sans text-[10px] text-ink-dim sm:inline-block"
				>
					{isMac ? "⌘K" : "Ctrl K"}
				</kbd>
			</button>

			<CommandDialog
				open={open}
				onOpenChange={handleOpenChange}
				shouldFilter={false}
				title="Chord search"
				description="Search the chord library by name — try Cmaj7, F#m7b5, or C/G."
			>
				<CommandInput
					value={query}
					onValueChange={handleQueryChange}
					placeholder="Search chords — e.g. Cmaj7, F#m7b5, C/G"
				/>
				<CommandList>
					{shortcut && (
						<CommandGroup heading="Jump to">
							<CommandItem
								value={`jump-${shortcut.kind}`}
								onSelect={() => goToBrowse(shortcut)}
							>
								<span className="font-medium text-ink">
									{shortcut.kind === "root" ? (
										<>
											Show all <MusicalText text={shortcut.root} /> chords
										</>
									) : shortcut.kind === "root-category" ? (
										<>
											Show all <MusicalText text={shortcut.root} />{" "}
											{categoryPhrase(shortcut.category)}
										</>
									) : (
										// "Power Chord" already ends in "Chord", so pluralise it
										// rather than tack on a second "chords".
										`Show all ${shortcut.category}${/chord/i.test(shortcut.category) ? "s" : " chords"}`
									)}
								</span>
								<ArrowRightIcon className="ml-auto size-4 text-ink-dim" />
							</CommandItem>
						</CommandGroup>
					)}

					{results.length > 0 && (
						<CommandGroup heading="Chords">
							{results.map((r) => {
								const key = `${r.root} ${r.suffix}`;
								return (
									<CommandItem
										key={key}
										value={key}
										onSelect={() => goToChord(r)}
									>
										<span className="font-medium text-ink">
											<MusicalText text={displayName(r.root, r.suffix)} />
										</span>
										<span className="ml-auto text-xs text-ink-dim">
											{r.category}
										</span>
									</CommandItem>
								);
							})}
						</CommandGroup>
					)}

					{trimmed === "" && (
						<p className="px-4 py-6 text-center text-sm text-ink-dim">
							Type a chord name to search.
						</p>
					)}

					{trimmed !== "" && results.length === 0 && (
						<div className="flex flex-col items-center gap-3 px-4 py-6 text-center text-sm">
							<p className="text-ink-dim">
								No chord found for “<span className="text-ink">{trimmed}</span>”.
							</p>

							{report === "idle" && (
								<button
									type="button"
									onClick={submitReport}
									className="rounded-md bg-denim px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-denim-dark"
								>
									Report this chord as missing
								</button>
							)}
							{report === "sending" && <p className="text-ink-dim">Sending…</p>}
							{typeof report === "object" && "done" in report && (
								<p className="text-denim">{REPORT_MESSAGES[report.done]}</p>
							)}
							{typeof report === "object" && "error" in report && (
								<button
									type="button"
									onClick={submitReport}
									className="text-denim underline hover:text-denim-dark"
								>
									Couldn&apos;t send — tap to retry
								</button>
							)}
						</div>
					)}
				</CommandList>
			</CommandDialog>
		</>
	);
}
