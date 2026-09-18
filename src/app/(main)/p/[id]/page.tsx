import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import FingerpickWorkspace from "@/components/fingerpick/FingerpickWorkspace";
import { loadShare } from "@/lib/sharedItems";
import { createSupabaseServer } from "@/lib/supabase-server";
import { beatUnitGlyph } from "@/lib/strumMeter";

type Props = { params: Promise<{ id: string }> };

// Read once per request: the metadata and the page both need the share. The
// server client reads under the `anon` policy when the visitor has no session,
// which is the point — a link opens for anyone holding it.
const shareFor = cache(async (id: string) => loadShare(await createSupabaseServer(), id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params;
	const share = await shareFor(id);
	if (!share) return { title: "Shared pattern | Guitar Pal" };
	const { pattern } = share;
	const bars = pattern.measures.length;
	return {
		title: `${pattern.name} — Shared tab | Guitar Pal`,
		description: `${beatUnitGlyph(pattern.timeSignature)} = ${pattern.bpm} · ${pattern.timeSignature[0]}/${pattern.timeSignature[1]} · ${bars} bar${bars === 1 ? "" : "s"}. Open it in the player, then import it to play along or edit.`,
	};
}

export default async function SharedItemPage({ params }: Props) {
	const { id } = await params;
	const share = await shareFor(id);
	if (!share) notFound();
	return <FingerpickWorkspace shared={share} />;
}
