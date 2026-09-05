import { StrumPattern } from "@/lib/strumPatterns";
import { patternNotation } from "@/lib/strumNotation";

interface Props {
	pattern: StrumPattern;
	/** What fills the card below the header — the bar, or a progression view. */
	children: React.ReactNode;
}

/**
 * The card the selected pattern lives in. Its header — the pattern's name and
 * written rhythm — stays put whichever tab is open; only the body below it
 * changes.
 */
export default function StepGridCard({ pattern, children }: Props) {
	return (
		// v3 card: hairline border, no shadow, radius 0, dedicated --step-grid-bg surface
		<div className="flex min-h-0 flex-col overflow-hidden border border-line bg-step-grid">
			<div className="flex shrink-0 items-start justify-between gap-2 border-b border-line px-5 py-4">
				<div className="flex flex-col gap-0.5">
					<h3 className="font-heading capitalize text-base font-semibold text-ink">
						{pattern.name}
					</h3>
					{/* whitespace-pre + mono: blank cells are part of the notation — a two-cell
					    silent beat must read as two columns, not collapse to one space. */}
					<p className="whitespace-pre font-mono text-xs text-ink-dim">
						{patternNotation(pattern.beats)}
					</p>
				</div>
			</div>
			{children}
		</div>
	);
}
