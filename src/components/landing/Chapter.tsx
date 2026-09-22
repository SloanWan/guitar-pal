"use client";

import { useRef, type ReactNode } from "react";
import Link from "@/components/AppLink";
import { captionIndex } from "@/lib/landing/progress";
import { useChapterProgress } from "./useChapterProgress";
import { ENTER, Led } from "./landingUi";

export interface ChapterCaption {
	/** The sentence's bold opening. */
	lead: string;
	text: string;
}

/**
 * A phone: a chapter trims its demo to what fits under the copy (one bar,
 * no chips). The stage stacks copy over frame earlier, at 900px, in CSS.
 */
export const NARROW_STAGE_QUERY = "(max-width: 640px)";

export interface ChapterProps {
	/** Its place on the page, printed as `01 · NAME`. */
	index: number;
	name: string;
	title: ReactNode;
	captions: readonly ChapterCaption[];
	cta: { href: string; label: string };
	/** The demo frame's title bar: the screen's name, a meta note, and whether its LED is lit. */
	frame: { title: string; meta?: string; ledOn?: boolean };
	/** The frame's live position readout, right-aligned in denim. */
	position?: (progress: number) => string;
	/** The demo, drawn for a given scroll progress. */
	children: (progress: number) => ReactNode;
}

const BTN_GHOST =
	"inline-block border border-line-strong px-7 py-3.5 font-mono text-[length:var(--text-btn-size)] uppercase tracking-[var(--text-btn-ls)] text-ink transition-[border-color,background-color,color] duration-150 hover:border-denim hover:text-denim-accent active:border-denim active:bg-denim-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim-accent";

/**
 * One chapter of the landing: a tall section whose sticky stage holds the
 * copy on the left and a framed demo on the right, both driven by how far
 * the visitor has scrolled through it. Under reduced motion the section is
 * its natural height, the stage no longer sticks and every caption shows.
 */
export default function Chapter({
	index,
	name,
	title,
	captions,
	cta,
	frame,
	position,
	children,
}: ChapterProps) {
	const ref = useRef<HTMLElement>(null);
	const { progress, reduced } = useChapterProgress(ref);
	const current = captionIndex(progress, captions.length);
	const num = String(index).padStart(2, "0");

	return (
		<section
			ref={ref}
			id={`chapter-${index}`}
			aria-labelledby={`chapter-${index}-title`}
			className="relative h-[320vh] border-b border-line max-[900px]:h-[260vh] motion-reduce:h-auto motion-reduce:py-20"
		>
			{/* Sticky under the (main) layout's scroller; its height is that scrollport,
			    i.e. the viewport minus the h-13 NavBar above it. */}
			<div className="sticky top-0 mx-auto grid h-[calc(100dvh-3.25rem)] max-w-300 grid-cols-[minmax(260px,5fr)_minmax(0,7fr)] items-center gap-12 overflow-hidden px-(--gutter) max-[900px]:grid-cols-1 max-[900px]:grid-rows-[auto_minmax(0,1fr)] max-[900px]:items-start max-[900px]:gap-5 max-[900px]:pt-5 motion-reduce:static motion-reduce:h-auto motion-reduce:overflow-visible">
				<div className="flex flex-col">
					<span className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-denim-accent before:h-[1.5px] before:w-6 before:bg-denim">
						{num} · {name}
					</span>
					<h2
						id={`chapter-${index}-title`}
						className="mt-4 font-mono text-(length:--text-h2-size) leading-[1.15] font-bold tracking-(--text-h2-ls) text-balance max-[900px]:text-[clamp(22px,5vw,30px)]"
					>
						{title}
					</h2>
					{reduced ? (
						<div className="mt-6 flex max-w-[38ch] flex-col gap-3 text-ink-dim">
							{captions.map((c) => (
								<p key={c.lead}>
									<b className="font-medium text-ink">{c.lead}</b> {c.text}
								</p>
							))}
						</div>
					) : (
						<div className="relative mt-6 min-h-[8.4em] max-w-[38ch] max-[900px]:min-h-[6.6em] max-[900px]:text-[14.5px]">
							{captions.map((c, i) => (
								<p
									key={c.lead}
									aria-hidden={i !== current || undefined}
									className={`absolute top-0 left-0 m-0 text-ink-dim transition-[opacity,transform] duration-250 ease-out ${
										i === current ? "opacity-100" : "translate-y-2.5 opacity-0"
									}`}
								>
									<b className="font-medium text-ink">{c.lead}</b> {c.text}
								</p>
							))}
						</div>
					)}
					{!reduced && (
						<div className="mt-2 flex gap-1.5" aria-hidden="true">
							{captions.map((c, i) => (
								<i
									key={c.lead}
									className={`h-px w-[18px] transition-colors duration-250 ${
										i <= current ? "bg-denim" : "bg-line-strong"
									}`}
								/>
							))}
						</div>
					)}
					<Link href={cta.href} className={`${BTN_GHOST} mt-7 self-start max-[900px]:hidden`}>
						{cta.label}
					</Link>
				</div>

				<div className="w-full max-w-[720px] justify-self-end border border-line bg-panel max-[900px]:max-w-full max-[900px]:self-start max-[900px]:justify-self-stretch">
					<div className="flex h-9 items-center gap-2.5 border-b border-line px-3.5 font-mono text-[10px] uppercase tracking-[0.14em] whitespace-nowrap text-ink-faint">
						<Led on={frame.ledOn ?? true} />
						<span className="text-ink-dim">{frame.title}</span>
						{frame.meta && (
							<>
								<span className="max-[900px]:hidden">/</span>
								<span className="max-[900px]:hidden">{frame.meta}</span>
							</>
						)}
						{position && (
							<span className="ml-auto text-denim-accent tabular-nums">
								{/* Keyed on its text, so a new reading fades up instead of flicking. */}
								<span key={position(progress)} className={`inline-block ${ENTER}`}>
									{position(progress)}
								</span>
							</span>
						)}
					</div>
					{/* A container, so a demo can lay itself out by the frame's width rather than the viewport's. */}
					<div className="@container p-5 max-[900px]:p-3.5">{children(progress)}</div>
				</div>
			</div>
		</section>
	);
}
