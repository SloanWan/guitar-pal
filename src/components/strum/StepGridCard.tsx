import { Pencil } from "lucide-react";
import { StrumPattern } from "@/lib/strumPatterns";
import { patternNotation } from "@/lib/strumNotation";

interface Props {
	pattern: StrumPattern;
	/** Given for a pattern the user owns — presets are defined in code. */
	onEditPattern?: () => void;
	/** What fills the card below the header — the bar, or a progression view. */
	children: React.ReactNode;
}

/**
 * The card the selected pattern lives in. Its header — the pattern's name and
 * written rhythm — stays put whichever tab is open; only the body below it
 * changes.
 */
export default function StepGridCard({ pattern, onEditPattern, children }: Props) {
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
				{/* Editing the pattern from where it is played, rather than only from
				    the library. Absent for presets, which are defined in code. */}
				{onEditPattern && (
					<button
						type="button"
						onClick={onEditPattern}
						aria-label="Edit pattern"
						title="Edit pattern"
						className="flex shrink-0 items-center justify-center p-1.5 text-ink-dim transition-colors hover:bg-denim-tint hover:text-denim"
					>
						<Pencil size={14} />
					</button>
				)}
			</div>
			{children}
		</div>
	);
}
