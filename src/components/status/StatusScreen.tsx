import type { ReactNode } from "react";

export { StatusTab } from "./StatusTab";

/**
 * The frame the 404 and error pages share: a picture, a heading, a sentence,
 * then whatever the page offers (a video, the buttons). One centred column;
 * the shell around it keeps the way out.
 */
export default function StatusScreen({
	art,
	title,
	lead,
	children,
}: {
	art: ReactNode;
	title: string;
	lead: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-full flex-col justify-center py-12 max-sm:py-8">
			<div className="w-full px-(--gp-gutter-phone) min-[720px]:px-(--gp-gutter-tablet) min-[960px]:px-(--gp-gutter-desktop)">
				<div className="gp-rise mx-auto flex max-w-140 flex-col items-center text-center">
					{art}
					<h1 className="mt-7 font-gp-display text-(length:--gp-t-xl) leading-(--gp-lh-head) font-bold tracking-[-0.015em] text-balance text-gp-ink min-[960px]:text-(length:--gp-t-xl-lg)">
						{title}
					</h1>
					<p className="mt-2 text-(length:--gp-t-body) leading-(--gp-lh-body) text-pretty text-gp-ink-2">
						{lead}
					</p>
					<div className="mt-7 flex w-full flex-col items-center gap-6">{children}</div>
				</div>
			</div>
		</div>
	);
}
