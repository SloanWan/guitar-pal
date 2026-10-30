import { ChevronDown, TriangleAlert } from "lucide-react";
import type { ParseIssue } from "@/lib/books/types";

/**
 * The parse's warnings, one line each — on the chapter card and in an open
 * draft. `action` may put something after a line: the way to act on what the
 * warning says, where there is one.
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
		<ul className={`bk-issues ${className}`}>
			{issues.map((issue, i) => (
				<li key={`${issue.code}-${issue.path}-${i}`} className="bk-iss">
					<TriangleAlert aria-hidden />
					<span>{issue.message}</span>
					{action?.(issue)}
				</li>
			))}
		</ul>
	);
}

/**
 * The warnings folded to their count, however many: the list opens on demand
 * under the summary (a reading in the text-tab picker).
 */
export function WarningsFold({ issues, className = "" }: { issues: ParseIssue[]; className?: string }) {
	if (issues.length === 0) return null;
	return (
		<details className={`bk-fold ${className}`}>
			<summary>
				<TriangleAlert aria-hidden />
				{issues.length} {issues.length === 1 ? "warning" : "warnings"}
				<ChevronDown className="bk-fold-chev" aria-hidden />
			</summary>
			<IssueList issues={issues} className="bk-fold-list" />
		</details>
	);
}
