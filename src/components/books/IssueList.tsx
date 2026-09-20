import { TriangleAlert } from "lucide-react";
import type { ParseIssue } from "@/lib/books/types";

/** The parse's warnings, one line each — on the chapter card and beside an open draft. */
export default function IssueList({ issues, className = "" }: { issues: ParseIssue[]; className?: string }) {
	return (
		<ul className={`flex flex-col gap-1 ${className}`}>
			{issues.map((issue, i) => (
				<li key={`${issue.code}-${issue.path}-${i}`} className="flex items-start gap-1.5 text-[12px] text-ink-dim">
					<TriangleAlert
						className="mt-0.5 size-3 flex-none text-denim-accent"
						strokeWidth={1.5}
						aria-hidden="true"
					/>
					<span>{issue.message}</span>
				</li>
			))}
		</ul>
	);
}
