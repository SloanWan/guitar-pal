// Characterization snapshots for ChordDiagramSVG. The component has no other
// tests, and its open-string / note-name tables are being moved to a shared
// module: these pin the rendered markup so that move can be shown not to
// change a single pixel. Cover every mode and every size, plus the three
// shapes that exercise different code paths (open chord, barre, high position).
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import ChordDiagramSVG, {
	type DiagramMode,
	type DiagramSize,
} from "@/components/chords/ChordDiagramSVG";

const SHAPES = {
	// Open C: mixed open / muted / fretted strings, no barre.
	openC: { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], startFret: 1, rootMidi: 48 },
	// F barre at fret 1: barre span, barre-row light dots in fretboard mode.
	barreF: { frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], startFret: 1, barreFret: 1, rootMidi: 41 },
	// A-shape C at fret 3: startFret > 1 shows the fret number instead of the nut.
	highC: { frets: [-1, 3, 5, 5, 5, 3], fingers: [0, 1, 3, 3, 3, 1], startFret: 3, barreFret: 3, rootMidi: 48 },
} as const;

const MODES: readonly DiagramMode[] = ["fingers", "noteNames", "fretboard"];
const SIZES: readonly DiagramSize[] = ["compact", "regular", "large"];

describe("ChordDiagramSVG markup", () => {
	for (const [name, shape] of Object.entries(SHAPES)) {
		for (const mode of MODES) {
			it(`${name} in ${mode} mode`, () => {
				const html = renderToStaticMarkup(
					<ChordDiagramSVG {...shape} frets={[...shape.frets]} fingers={[...shape.fingers]} mode={mode} />,
				);
				expect(html).toMatchSnapshot();
			});
		}
	}

	for (const size of SIZES) {
		it(`open C at ${size} size`, () => {
			const { openC } = SHAPES;
			const html = renderToStaticMarkup(
				<ChordDiagramSVG {...openC} frets={[...openC.frets]} fingers={[...openC.fingers]} size={size} />,
			);
			expect(html).toMatchSnapshot();
		});
	}

	it("omits root highlighting when rootMidi is absent", () => {
		const { openC } = SHAPES;
		const html = renderToStaticMarkup(
			<ChordDiagramSVG frets={[...openC.frets]} fingers={[...openC.fingers]} startFret={1} mode="noteNames" />,
		);
		expect(html).not.toContain("#4A6FA5");
		expect(html).toMatchSnapshot();
	});
});
