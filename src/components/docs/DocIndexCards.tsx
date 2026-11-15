"use client";

import { ArrowRight, MessageCircle, Plug, Smartphone, type LucideIcon } from "lucide-react";
import Link from "@/components/AppLink";
import { NavCard } from "@/components/ui/card";
import { ModuleBadge } from "@/components/ui/list-row";
import { DOC_GUIDES, docHref, type DocSlug } from "@/lib/docs/docIndex";
import type { DocLang } from "@/lib/docs/docLang";

/** `/docs`' cards, one per guide (#500). A client module: the badge takes its icon as a component. */

const ICONS: Record<DocSlug, LucideIcon> = {
	install: Smartphone,
	mcp: Plug,
	"assistant-grammar": MessageCircle,
};

export default function DocIndexCards({ lang }: { lang: DocLang }) {
	return (
		<ul className="grid gap-3">
			{DOC_GUIDES.map(({ slug, copy }) => (
				<li key={slug}>
					<NavCard asChild className="flex items-center gap-3.5 p-4">
						<Link href={docHref(slug, lang)}>
							<ModuleBadge icon={ICONS[slug]} />
							<span className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span className="gp-title self-start font-gp-display text-[17px] font-bold text-gp-ink">
									{copy[lang].title}
								</span>
								<span className="text-(length:--gp-t-ui) text-gp-ink-2">{copy[lang].line}</span>
							</span>
							<ArrowRight className="size-4 flex-none text-gp-ink-3" aria-hidden />
						</Link>
					</NavCard>
				</li>
			))}
		</ul>
	);
}
