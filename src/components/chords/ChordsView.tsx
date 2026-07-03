"use client";

import { useState, useTransition } from "react";
import { getChord } from "@/lib/chords";
import { chordVoicingToVexChords, type ChordVoicing } from "@/lib/chordVoicingToVexChords";
import {
	groupSuffixes,
	getSlashSuffixes,
	isSlashChord,
	EXCLUDED_SUFFIXES,
} from "@/lib/chordSuffixes";
import ChordDiagram from "@/components/chords/ChordDiagram";
import RootOverviewGrid from "@/components/chords/RootOverviewGrid";
import AllChordsGrid from "@/components/chords/AllChordsGrid";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type ViewMode = "detail" | "root-overview" | "all-chords";

interface Props {
	initialChord?: {
		root: string;
		suffix: string;
		chord_voicings: ChordVoicing[];
	};
	roots: string[];
	rootSuffixMap: Record<string, string[]>;
}

export default function ChordsView({ initialChord, roots, rootSuffixMap }: Props) {
	const [root, setRoot] = useState(initialChord?.root ?? roots[0] ?? "");
	const [suffix, setSuffix] = useState(initialChord?.suffix ?? "");
	const [voicings, setVoicings] = useState<ChordVoicing[]>(initialChord?.chord_voicings ?? []);
	const [isPending, startTransition] = useTransition();
	const [showSlash, setShowSlash] = useState(false);
	const [viewMode, setViewMode] = useState<ViewMode>("detail");

	const rawSuffixes = rootSuffixMap[root] ?? [];
	const categoryGroups = groupSuffixes(rawSuffixes);
	const slashSuffixes = getSlashSuffixes(rawSuffixes);

	function fetchVoicings(nextRoot: string, nextSuffix: string) {
		startTransition(async () => {
			const chord = await getChord(nextRoot, nextSuffix);
			setVoicings(chord?.chord_voicings ?? []);
		});
	}

	function handleRootChange(nextRoot: string) {
		setRoot(nextRoot);
		if (viewMode === "root-overview") return;

		const nextRawSuffixes = rootSuffixMap[nextRoot] ?? [];
		const nextGroups = groupSuffixes(nextRawSuffixes);
		const nextSuffix =
			nextGroups[0]?.suffixes[0] ??
			nextRawSuffixes.find((s) => !EXCLUDED_SUFFIXES.includes(s)) ??
			"";
		setSuffix(nextSuffix);
		if (nextSuffix) fetchVoicings(nextRoot, nextSuffix);
		else setVoicings([]);
	}

	function handleSuffixChange(nextSuffix: string) {
		setSuffix(nextSuffix);
		fetchVoicings(root, nextSuffix);
	}

	// Called from browse grids: navigate to detail view for the clicked chord
	function handleSelectChord(nextRoot: string, nextSuffix: string) {
		setRoot(nextRoot);
		setSuffix(nextSuffix);
		setViewMode("detail");
		fetchVoicings(nextRoot, nextSuffix);
	}

	// When an inversion/slash chord is active, the main Select shows placeholder;
	// active state is shown in the chip row below instead.
	const selectValue = isSlashChord(suffix) ? "" : suffix;

	return (
		<div className="flex w-full flex-col items-center gap-6">
			{/* Mode navigation */}
			<div className="flex flex-wrap justify-center gap-2">
				{viewMode !== "detail" && (
					<Button size="sm" variant="outline" onClick={() => setViewMode("detail")}>
						← Back
					</Button>
				)}
				<Button
					size="sm"
					variant={viewMode === "root-overview" ? "default" : "outline"}
					onClick={() => setViewMode("root-overview")}
				>
					Show All ({root})
				</Button>
				<Button
					size="sm"
					variant={viewMode === "all-chords" ? "default" : "outline"}
					onClick={() => setViewMode("all-chords")}
				>
					All Chords
				</Button>
			</div>

			{/* ── Detail mode ──────────────────────────────────────────── */}
			{viewMode === "detail" && (
				<div className="flex w-full flex-col items-center gap-6">
					<div className="flex flex-col items-center gap-3">
						<div className="flex flex-wrap items-center justify-center gap-3">
							{/* Root */}
							<Select value={root} onValueChange={handleRootChange}>
								<SelectTrigger className="w-28">
									<SelectValue placeholder="Root" />
								</SelectTrigger>
								<SelectContent>
									{roots.map((r) => (
										<SelectItem key={r} value={r}>
											{r}
										</SelectItem>
									))}
								</SelectContent>
							</Select>

							{/* Quality — grouped by taxonomy */}
							<Select value={selectValue} onValueChange={handleSuffixChange}>
								<SelectTrigger className="w-44">
									<SelectValue placeholder="Quality" />
								</SelectTrigger>
								<SelectContent>
									{categoryGroups.map(({ category, suffixes }, idx) => (
										<span key={category}>
											{idx > 0 && <SelectSeparator />}
											<SelectGroup>
												<SelectLabel>{category}</SelectLabel>
												{suffixes.map((s) => (
													<SelectItem key={s} value={s}>
														{s}
													</SelectItem>
												))}
											</SelectGroup>
										</span>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Slash chords — collapsed by default */}
						{slashSuffixes.length > 0 && (
							<div className="flex flex-col items-center gap-2">
								<button
									type="button"
									onClick={() => setShowSlash((v) => !v)}
									className="text-xs text-muted-foreground transition-colors hover:text-foreground"
								>
									More: Slash Chords {showSlash ? "▴" : "▾"}
								</button>
								{showSlash && (
									<div className="flex flex-wrap justify-center gap-1.5">
										{slashSuffixes.map((s) => (
											<button
												key={s}
												type="button"
												onClick={() => handleSuffixChange(s)}
												className={
													suffix === s
														? "rounded px-2 py-0.5 text-xs font-medium bg-denim text-white"
														: "rounded px-2 py-0.5 text-xs border border-denim-border text-denim transition-colors hover:bg-denim-tint"
												}
											>
												{s}
											</button>
										))}
									</div>
								)}
							</div>
						)}
					</div>

					{/* Voicings */}
					{isPending ? (
						<p className="text-sm text-muted-foreground">Loading…</p>
					) : voicings.length === 0 ? (
						<p className="text-sm text-muted-foreground">No voicings found.</p>
					) : (
						<div className="flex flex-wrap justify-center gap-4">
							{voicings.map((v) => (
								<ChordDiagram
									key={v.id}
									def={chordVoicingToVexChords(v)}
									label={v.label ?? `Pos. ${v.start_fret}`}
								/>
							))}
						</div>
					)}
				</div>
			)}

			{/* ── Root overview mode ───────────────────────────────────── */}
			{viewMode === "root-overview" && (
				<div className="flex w-full flex-col items-center gap-6">
					<Select value={root} onValueChange={handleRootChange}>
						<SelectTrigger className="w-28">
							<SelectValue placeholder="Root" />
						</SelectTrigger>
						<SelectContent>
							{roots.map((r) => (
								<SelectItem key={r} value={r}>
									{r}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<RootOverviewGrid root={root} onSelectChord={handleSelectChord} />
				</div>
			)}

			{/* ── All chords mode ──────────────────────────────────────── */}
			{viewMode === "all-chords" && <AllChordsGrid onSelectChord={handleSelectChord} />}
		</div>
	);
}
