// Snapshots of ChordDiagramSVG in every mode and size, over the three shapes
// that take different code paths (open chord, barre, high position).
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

// The corner radius only the root marker carries (DOT_R × 0.45).
const ROOT_SQUARE = 'rx="3.6"';

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
		expect(html).not.toContain(ROOT_SQUARE);
		expect(html).toMatchSnapshot();
	});

	it("draws the root as a rounded square when rootMidi is given", () => {
		const { openC } = SHAPES;
		const html = renderToStaticMarkup(
			<ChordDiagramSVG {...openC} frets={[...openC.frets]} fingers={[...openC.fingers]} />,
		);
		// Open C's root sounds twice: the A string at fret 3 and the B string at fret 1.
		expect(html.split(ROOT_SQUARE).length - 1).toBe(2);
	});

	it("draws in theme tokens, never fixed colours", () => {
		const { barreF } = SHAPES;
		const html = renderToStaticMarkup(
			<ChordDiagramSVG {...barreF} frets={[...barreF.frets]} fingers={[...barreF.fingers]} mode="fretboard" />,
		);
		expect(html).not.toMatch(/(fill|stroke)="#/);
	});
});

describe("ChordDiagramSVG root tone and plucks", () => {
	const { openC } = SHAPES;
	const draw = (extra: object) =>
		renderToStaticMarkup(<ChordDiagramSVG {...openC} frets={[...openC.frets]} fingers={[...openC.fingers]} {...extra} />);

	it("paints the root in the module's colour only when asked", () => {
		expect(draw({})).not.toContain("fill-m-500");
		expect(draw({ rootTone: true })).toContain("fill-m-500");
	});

	it("plucks each sounding string in turn, low first, muted ones skipped", () => {
		const html = draw({ pluck: { run: 1, gapS: 0.32 } });
		const delays = [...html.matchAll(/cd-pluck-string[^>]*animation-delay:([\d.]+)s/g)].map((m) => Number(m[1]));
		expect(delays).toEqual([0, 0.32, 0.64, 0.96, 1.28]);
		expect(html.match(/cd-pluck-ring/g)).toHaveLength(5);
	});

	it("shakes a string from the held note down, and an open one whole", () => {
		const html = draw({ pluck: { run: 1, gapS: 0.32 } });
		// Open C, low string first: A at 3, D at 2, G open, B at 1, e open.
		const [a, d, g, b, e] = [...html.matchAll(/cd-pluck-string[^>]*y1="([\d.]+)"/g)].map((m) => Number(m[1]));
		expect(a).toBeGreaterThan(d);
		expect(d).toBeGreaterThan(b);
		expect(b).toBeGreaterThan(g);
		expect(e).toBe(g);
	});

	it("plucks every string at once for a strum", () => {
		const html = draw({ pluck: { run: 1, gapS: 0 } });
		const delays = [...html.matchAll(/cd-pluck-string[^>]*animation-delay:([\d.]+)s/g)].map((m) => Number(m[1]));
		expect(delays).toEqual([0, 0, 0, 0, 0]);
	});

	it("draws no plucks while nothing plays", () => {
		expect(draw({})).not.toContain("cd-pluck");
	});
});
