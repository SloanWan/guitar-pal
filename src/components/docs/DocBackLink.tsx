import { ArrowLeft } from "lucide-react";
import Link from "@/components/AppLink";
import { DOC_INDEX_COPY } from "@/lib/docs/docIndex";
import type { DocLang } from "@/lib/docs/docLang";

/** "← All docs" over a guide's title (#500), back to the index in the same language. */
export default function DocBackLink({ lang }: { lang: DocLang }) {
	return (
		<Link
			href={`/docs?lang=${lang}`}
			className="gp-focus mb-3 inline-flex items-center gap-1 rounded-gp-xs text-(length:--gp-t-cap) font-semibold text-gp-ink-3 transition-colors duration-(--gp-d-state) hover:text-gp-ink"
		>
			<ArrowLeft className="size-3.5" aria-hidden />
			{DOC_INDEX_COPY[lang].back}
		</Link>
	);
}
