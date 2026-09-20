import { ChevronDown, TriangleAlert } from "lucide-react";
import type { ParseIssue } from "@/lib/books/types";

/**
 * The parse's warnings, one line each — on the chapter card and beside an
 * open draft. `action` may put something after a line: the way to act on
 * what the warning says, where there is one.
 */
export default function IssueList({
	issues,
	className = "",
	action,
}: {
	issues: ParseIssue[];
	className?: string;
	action?: (issue: ParseIssue) => React.ReactNode;
}) {
	return (
		<ul className={`flex flex-col gap-1 ${className}`}>
			{issues.map((issue, i) => (
				<li key={`${issue.code}-${issue.path}-${i}`} className="flex items-start gap-1.5 text-[12px] text-ink-dim">
					<TriangleAlert
						className="mt-0.5 size-3 flex-none text-denim-accent"
						strokeWidth={1.5}
						aria-hidden="true"
					/>
					<span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
						<span>{issue.message}</span>
						{action?.(issue)}
					</span>
				</li>
			))}
		</ul>
	);
}

/** The fold's label: light denim, the theme's denim on hover. Shared with the editor's notice. */
export const WARNINGS_SUMMARY =
	"flex cursor-pointer list-none items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-denim/60 transition-colors duration-(--dur-hover) hover:text-denim [&::-webkit-details-marker]:hidden";

/**
 * The warnings folded to their count, however many: a draft's list opens
 * on demand and never pushes what is under it. `dropdown` floats the open
 * list over what follows (the draft panel, above its tab) instead.
 */
export function WarningsFold({
	issues,
	dropdown = false,
	className = "",
}: {
	issues: ParseIssue[];
	dropdown?: boolean;
	className?: string;
}) {
	if (issues.length === 0) return null;
	return (
		<details className={`group ${className}`}>
			<summary className={WARNINGS_SUMMARY}>
				<TriangleAlert className="size-3" strokeWidth={1.5} aria-hidden="true" />
				{issues.length} {issues.length === 1 ? "warning" : "warnings"}
				<ChevronDown
					className="size-3 transition-transform duration-(--dur-hover) group-open:rotate-180"
					strokeWidth={1.5}
					aria-hidden="true"
				/>
			</summary>
			{dropdown ? (
				<div className="absolute inset-x-0 top-full z-20 border-b border-line bg-surface px-4 py-3 [box-shadow:var(--elev-panel)]">
					<IssueList issues={issues} />
				</div>
			) : (
				<IssueList issues={issues} className="mt-1" />
			)}
		</details>
	);
}
