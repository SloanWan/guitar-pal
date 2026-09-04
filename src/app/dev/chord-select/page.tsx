// Dev harness for the inline chord selector used in the strum pattern editor.
// The editor lives inside a Radix dialog, which headless screenshot tooling
// cannot capture, so the component is exercised standalone here.
//
// The index is fetched server-side through the "use server" wrapper in
// lib/chords.ts (rather than lib/chordsData.ts directly) so that module's
// evaluation is exercised on every visit.

import { getChordIndex } from "@/lib/chords";
import ChordSelectHarness from "./ChordSelectHarness";

export default async function ChordSelectDevPage() {
	const index = await getChordIndex();
	return <ChordSelectHarness index={index} />;
}
