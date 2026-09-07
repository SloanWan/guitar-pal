"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import Link from "@/components/AppLink";
import ChordDiagram from "@/components/chords/ChordDiagram";
import { useChordPreview } from "@/components/chords/useChordPreview";
import { useUserChordVoicings } from "@/components/chords/useUserChordVoicings";
import { useUser } from "@/hooks/useUser";
import { Button } from "@/components/ui/button";
import { CirclePlay, Loader2 } from "lucide-react";
import { chordHref } from "@/lib/chordSlug";
import { chordDisplayName } from "@/lib/chordSuffixes";
import { voicingFrets } from "@/lib/chordShapeSearch";
import { formatTabSequence } from "@/lib/chordTabSequence";
import { chordVoicingToVexChords } from "@/lib/chordVoicingToVexChords";
import { chordVoicingToMidi, rootPitchClass } from "@/lib/chordVoicingToMidi";
import {
	userVoicingCategory,
	type UserChordVoicing,
} from "@/lib/userChordVoicings";

/**
 * Everything the player has written, in one place.
 *
 * Their shapes are otherwise only met one chord at a time — on that chord's page,
 * or when a search happens to turn one up. This is the list: what have I written,
 * what is it called, and which ones do I no longer want.
 *
 * Grouped by chord rather than listed flat, because a chord played three ways is
 * one thing the player knows and three rows they would have to read as one.
 */

interface ChordGroup {
	root: string;
	suffix: string;
	category: string | null;
	voicings: UserChordVoicing[];
}

function groupByChord(voicings: readonly UserChordVoicing[]): ChordGroup[] {
	const groups = new Map<string, ChordGroup>();
	for (const voicing of voicings) {
		const key = `${voicing.root} ${voicing.suffix}`;
		const group = groups.get(key);
		if (group) {
			group.voicings.push(voicing);
			continue;
		}
		groups.set(key, {
			root: voicing.root,
			suffix: voicing.suffix,
			category: userVoicingCategory(voicing),
			voicings: [voicing],
		});
	}
	return [...groups.values()].sort((a, b) =>
		chordDisplayName(a.root, a.suffix).localeCompare(chordDisplayName(b.root, b.suffix)),
	);
}

export default function MyChordsView() {
	const { user, loading: userLoading } = useUser();
	const { voicings, voicingsLoading, deleteVoicing } = useUserChordVoicings(user, userLoading);
	const preview = useChordPreview();
	// Deleting a shape cannot be undone, so the bin asks first.
	const [confirmId, setConfirmId] = useState<string | null>(null);

	if (voicingsLoading) {
		return <p className="text-center text-sm text-ink-dim">Loading your chords…</p>;
	}

	const groups = groupByChord(voicings);

	if (groups.length === 0) {
		return (
			<div className="mx-auto flex max-w-md flex-col gap-2 border border-line bg-surface p-5">
				<p className="text-sm text-ink-dim">You haven&rsquo;t written any chords yet.</p>
				<p className="text-xs leading-snug text-ink-faint">
					Paste a shape into the chord search — six frets, first string first, like{" "}
					<span className="font-mono text-ink-dim">007707</span> — and it will offer to
					write down anything nothing is held with.
				</p>
			</div>
		);
	}

	return (
		// One chord per row, so the column is narrowed and centred rather than left
		// against the edge of a page-wide container: a single diagram pinned to the
		// left of six columns of nothing reads as a layout that lost its content.
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
			{groups.map((group) => (
				<section
					key={`${group.root} ${group.suffix}`}
					className="flex flex-col gap-3 border border-line bg-surface p-4"
				>
					<div className="flex flex-wrap items-baseline gap-2">
						<Link
							href={chordHref(group.root, group.suffix)}
							className="text-base font-semibold text-ink underline-offset-2 hover:text-denim hover:underline"
						>
							{chordDisplayName(group.root, group.suffix)}
						</Link>
						{group.category && (
							<span className="border border-line-strong px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-dim">
								{group.category}
							</span>
						)}
						<span className="ml-auto font-mono text-[10px] text-ink-faint">
							{group.voicings.length} shape{group.voicings.length === 1 ? "" : "s"}
						</span>
					</div>

					<div className="flex flex-wrap justify-center gap-5">
						{group.voicings.map((v) => {
							const written = formatTabSequence(voicingFrets(v));
							return (
								<div key={v.id} className="flex flex-col items-center gap-2">
									<ChordDiagram
										def={chordVoicingToVexChords(v)}
										label={v.label ?? written}
										rootMidi={rootPitchClass(group.root)}
									/>
									<span className="font-mono text-[10px] tracking-[0.12em] text-ink-faint">
										{written}
									</span>
									<Button
										size="sm"
										variant="outline"
										className="gap-1 rounded-none border-line-strong text-denim hover:bg-denim-tint"
										disabled={preview.isPreloading}
										onClick={() =>
											void preview.play(chordVoicingToMidi(v).map((n) => n.midi))
										}
									>
										{preview.isPreloading ? (
											<Loader2 className="h-3 w-3 animate-spin" />
										) : (
											<CirclePlay className="h-3 w-3" />
										)}
										{preview.isPreloading ? "Loading…" : "Play"}
									</Button>

									{confirmId === v.id ? (
										<div className="flex items-center gap-2">
											<span className="text-[10px] text-ink-dim">Delete?</span>
											<button
												type="button"
												onClick={() => {
													deleteVoicing(v.id);
													setConfirmId(null);
												}}
												className="bg-destructive px-2 py-0.5 text-[10px] font-semibold text-white transition-colors hover:bg-destructive/90"
											>
												Delete
											</button>
											<button
												type="button"
												onClick={() => setConfirmId(null)}
												className="px-1 text-[10px] text-ink-dim transition-colors hover:text-ink"
											>
												Cancel
											</button>
										</div>
									) : (
										<div className="flex items-center gap-3">
											<Link
												href={`/chords/create?frets=${encodeURIComponent(written.replace(/\s+/g, "-"))}`}
												aria-label={`Edit ${v.label ?? written}`}
												title="Rename, refile or redraw this chord"
												className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint transition-colors hover:text-denim-accent"
											>
												<Pencil size={10} />
												Edit
											</Link>
											<button
												type="button"
												onClick={() => setConfirmId(v.id)}
												aria-label={`Delete ${v.label ?? written}`}
												className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint transition-colors hover:text-destructive"
											>
												<Trash2 size={10} />
												Delete
											</button>
										</div>
									)}
								</div>
							);
						})}
					</div>
				</section>
			))}

			{!user && (
				<p className="text-center text-xs text-ink-faint">
					These are stored on this device. Sign in and they move to your account.
				</p>
			)}
		</div>
	);
}
