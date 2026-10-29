/**
 * The matte grain the pick shapes wear, as one SVG filter for the whole
 * document: grey fractal noise, kept inside the shape it filters and laid over
 * its fill with overlay blending — the surface of the classic matte picks the
 * palette comes from. A shape opts in with `filter: url(#gp-grain)`
 * (primitives.css); HTML fills use the `--gp-grain` tile instead (tokens.css).
 * Mounted once, in the root layout.
 */
export function GrainDefs() {
	return (
		<svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
			<filter id="gp-grain" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
				<feTurbulence type="fractalNoise" baseFrequency="2.6" numOctaves={3} stitchTiles="stitch" result="noise" />
				<feColorMatrix in="noise" type="saturate" values="0" result="grey" />
				<feComponentTransfer in="grey" result="grain">
					<feFuncR type="linear" slope={2} intercept={-0.5} />
					<feFuncG type="linear" slope={2} intercept={-0.5} />
					<feFuncB type="linear" slope={2} intercept={-0.5} />
					<feFuncA type="linear" slope={0} intercept={0.22} />
				</feComponentTransfer>
				<feComposite in="grain" in2="SourceAlpha" operator="in" result="inside" />
				<feBlend in="inside" in2="SourceGraphic" mode="overlay" />
			</filter>
		</svg>
	);
}
