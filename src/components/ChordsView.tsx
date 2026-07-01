"use client";

import { useState } from "react";

export default function ChordsView({ initialChord, roots, rootSuffixMap }: {
	initialChord?: { root: string; suffix: string; chord_voicings: unknown[] };
	roots?: unknown;
	rootSuffixMap?: unknown;
}) {
	const [key, setKey] = useState(initialChord?.root);
	const [suffix, setSuffix] = useState(initialChord?.suffix);
	const [voicings, setVoicings] = useState(initialChord?.chord_voicings);
	const [voicingIndex, setVoicingIndex] = useState(0);

	return (
		<div className="text-2xl font-bold">
			{/* {key} {suffix} */}
			<div className="mt-4 flex justify-center">
				<iframe
					src="https://guitarapp.com/chords/embedtool?root=Csharp&theme=system"
					title="Online Chord Tool"
					className="w-90 h-140 border-none rounded"
				>
					{" "}
				</iframe>
			</div>
		</div>
	);
}
