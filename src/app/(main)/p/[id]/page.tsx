import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import FingerpickWorkspace from "@/components/fingerpick/FingerpickWorkspace";
import StrumWorkspace from "@/components/strum/StrumWorkspace";
import { loadShare, type SharedItem } from "@/lib/sharedItems";
import { createSupabaseServer } from "@/lib/supabase-server";
import { patternBpm, patternMeter } from "@/lib/strumBars";
import { beatUnitGlyph, meterLabel } from "@/lib/strumMeter";
import { progressionCapo, progressionDisplayName } from "@/lib/strumProgressions";

type Props = { params: Promise<{ id: string }> };

// Read once per request: the metadata and the page both need the share. The
// server client reads under the `anon` policy when the visitor has no session,
// which is the point — a link opens for anyone holding it.
const shareFor = cache(async (id: string) => loadShare(await createSupabaseServer(), id));

function bars(n: number): string {
	return `${n} bar${n === 1 ? "" : "s"}`;
}

/** What a pasted link shows: the name, then one line of tempo, meter and size. */
function describe(share: SharedItem): { title: string; description: string } {
	if (share.kind === "fingerpick") {
		const { pattern } = share;
		return {
			title: `${pattern.name} — Shared tab | Guitar Pal`,
			description: `${beatUnitGlyph(pattern.timeSignature)} = ${pattern.bpm} · ${pattern.timeSignature[0]}/${pattern.timeSignature[1]} · ${bars(pattern.measures.length)}. Open it in the player, then import it to play along or edit.`,
		};
	}
	const { pattern, progressions, openIndex } = share;
	const meter = patternMeter(pattern);
	const opened = progressions[openIndex];
	const tempo = opened?.bpm ?? patternBpm(pattern);
	const size =
		progressions.length > 1
			? `${progressions.length} progressions`
			: opened
				? [
						`${progressionDisplayName(opened)}, ${bars(opened.bars.length)}`,
						...(progressionCapo(opened) > 0 ? [`capo ${progressionCapo(opened)}`] : []),
					].join(" · ")
				: bars(1);
	return {
		title: `${pattern.name} — Shared strum pattern | Guitar Pal`,
		description: `${beatUnitGlyph(meter)} = ${tempo} · ${meterLabel(meter)} · ${size}. Open it in the player, then import it to play along or edit.`,
	};
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params;
	const share = await shareFor(id);
	if (!share) return { title: "Shared pattern | Guitar Pal" };
	return describe(share);
}

export default async function SharedItemPage({ params }: Props) {
	const { id } = await params;
	const share = await shareFor(id);
	if (!share) notFound();
	return share.kind === "fingerpick" ? (
		<FingerpickWorkspace shared={share} />
	) : (
		<StrumWorkspace shared={share} />
	);
}
