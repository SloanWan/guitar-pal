import { permanentRedirect } from "next/navigation";
import { boardHref } from "@/lib/chordBatchResolve";

// Chords side by side are the hub's board now; an old link lands on a board of the same chords.
type Props = { searchParams: Promise<{ q?: string }> };

export default async function ChordGridPage({ searchParams }: Props) {
	const { q } = await searchParams;
	permanentRedirect(typeof q === "string" && q.trim() !== "" ? boardHref(q) : "/chords");
}
