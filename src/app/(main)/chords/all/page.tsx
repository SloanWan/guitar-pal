import { permanentRedirect } from "next/navigation";

// Every chord is the hub's Table view now; the old grouping by quality is its "By quality" view.
type Props = { searchParams: Promise<{ group?: string }> };

export default async function AllChordsPage({ searchParams }: Props) {
	const { group } = await searchParams;
	permanentRedirect(group === "category" ? "/chords?view=quality" : "/chords?view=table");
}
