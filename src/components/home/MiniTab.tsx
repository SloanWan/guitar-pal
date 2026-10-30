import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { tabPreview } from "@/lib/home/home";

const COL = 18;
const GAP = 6;
const LEFT = 6;
const TOP = 9;
const LINE = 8;

/** The opening of a tab as six lines and its frets — a tile's preview, not a stave to read from. */
export default function MiniTab({ pattern, columns: maxColumns = 16 }: { pattern: FingerpickPattern; columns?: number }) {
	const { columns, barlines } = tabPreview(pattern, maxColumns);
	const x = (i: number) => LEFT + GAP / 2 + i * COL + barlines.filter((b) => b <= i).length * GAP + COL / 2;
	const width = LEFT + columns.length * COL + (barlines.length + 1) * GAP + 2;
	const height = TOP * 2 + 5 * LINE;
	const bottom = TOP + 5 * LINE;
	return (
		<svg className="hm-tab" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Opening of ${pattern.name}`}>
			{[0, 1, 2, 3, 4, 5].map((s) => (
				<line key={s} className="ln" x1={LEFT} y1={TOP + s * LINE} x2={width - 2} y2={TOP + s * LINE} />
			))}
			{[0, ...barlines, columns.length].map((b, i) => {
				const bx = b === columns.length ? width - 2 : b === 0 ? LEFT : x(b) - COL / 2 - GAP / 2;
				return <line key={i} className="bl" x1={bx} y1={TOP} x2={bx} y2={bottom} />;
			})}
			{columns.map((notes, i) =>
				notes.map((n) => (
					<g key={`${i}-${n.string}`}>
						<rect className="ko" x={x(i) - 6} y={TOP + n.string * LINE - 5} width={12} height={10} rx={2} />
						<text className="nt" x={x(i)} y={TOP + n.string * LINE + 0.5}>
							{n.text}
						</text>
					</g>
				)),
			)}
		</svg>
	);
}
