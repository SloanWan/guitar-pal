"use client";

import { ArrowDownUp, BookOpen, Grid3x3, Link2, ListMusic } from "lucide-react";
import Link from "@/components/AppLink";
import { OPEN_PROGRESSION_KEY } from "@/components/strum/useStrumSession";
import { ListRow } from "@/components/ui/list-row";
import { PickToggle } from "@/components/ui/pick-toggle";
import type { SharedLink } from "@/lib/home/loadHome";
import { weekIsEmpty, whenLabel, type KeptItem, type OpenedItem, type WeekCounts } from "@/lib/home/home";
import { sharePath } from "@/lib/sharedItems";

const ICON = { strum: ArrowDownUp, tab: ListMusic, chords: Grid3x3, books: BookOpen } as const;

/** The newest few; everything is still on its own page. */
const KEPT_SHOWN = 7;
/** Links listed; older ones are still on their pages. */
const LINKS_SHOWN = 3;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

interface Props {
	week: WeekCounts;
	kept: readonly KeptItem[];
	opened: readonly OpenedItem[];
	links: readonly SharedLink[];
	now: Date | null;
	onKeep: (item: KeptItem, kept: boolean) => void;
}

/**
 * The panel beside the page: what this week added (gone in a week that added
 * nothing — no zeros, no streaks), what the player comes back to most, what
 * they kept and made, and the links they sent out.
 */
export default function HomeSide({ week, kept, opened, links, now, onKeep }: Props) {
	return (
		<aside className="hm-side" aria-label="Yours">
			{!weekIsEmpty(week) && (
				<section className="hm-blk" aria-labelledby="hm-week">
					<h2 id="hm-week" className="hm-blk-h">
						This week
					</h2>
					<ul className="hm-week">
						{week.progressions > 0 && (
							<li>
								<b>{week.progressions}</b>
								{plural(week.progressions, "progression saved", "progressions saved")}
							</li>
						)}
						{week.chords > 0 && (
							<li>
								<b>{week.chords}</b>
								{plural(week.chords, "chord kept", "chords kept")}
							</li>
						)}
						{week.links > 0 && (
							<li>
								<b>{week.links}</b>
								{plural(week.links, "link shared", "links shared")}
							</li>
						)}
					</ul>
					<p className="hm-meta">Since Monday.</p>
				</section>
			)}

			{opened.length > 0 && (
				<section className="hm-blk" aria-labelledby="hm-opened">
					<h2 id="hm-opened" className="hm-blk-h">
						Most opened
					</h2>
					<div className="hm-list">
						{opened.map((item) => (
							<div key={item.key} className="hm-item" data-m={item.module}>
								<ListRow asChild module={item.module} icon={ICON[item.module]} title={item.title} subline={item.subline}>
									<Link href={item.href} />
								</ListRow>
							</div>
						))}
					</div>
				</section>
			)}

			<section className="hm-blk" aria-labelledby="hm-kept">
				<h2 id="hm-kept" className="hm-blk-h">
					Kept and saved
				</h2>
				{kept.length === 0 ? (
					<p className="hm-empty">
						Nothing here yet. The pick beside a pattern, a tab or a chord keeps it, and what you save lands here too.
					</p>
				) : (
					<div className="hm-list">
						{kept.slice(0, KEPT_SHOWN).map((item) => (
							<div key={item.key} className="hm-item" data-m={item.module}>
								<ListRow asChild module={item.module} icon={ICON[item.module]} title={item.title} subline={item.subline}>
									<Link
										href={item.href}
										onClick={() => {
											// Strum reopens the progression this device left open; leave this one open.
											if (item.progressionId) localStorage.setItem(OPEN_PROGRESSION_KEY, item.progressionId);
										}}
									/>
								</ListRow>
								{item.keep && (
									<PickToggle
										pressed={item.keep.kept}
										onPressedChange={(next) => onKeep(item, next)}
										label={`Keep ${item.title}`}
									/>
								)}
							</div>
						))}
					</div>
				)}
			</section>

			{links.length > 0 && (
				<section className="hm-blk" aria-labelledby="hm-links">
					<h2 id="hm-links" className="hm-blk-h">
						Links you shared
					</h2>
					<div className="hm-list">
						{links.slice(0, LINKS_SHOWN).map((link) => (
							<div key={link.id} className="hm-item" data-m={link.kind === "strum" ? "strum" : "tab"}>
								<ListRow
									asChild
									module={link.kind === "strum" ? "strum" : "tab"}
									icon={link.kind === "strum" ? ArrowDownUp : ListMusic}
									title={link.title}
									subline={`${sharePath(link.id)}${now ? ` · ${whenLabel(new Date(link.createdAt), now)}` : ""}`}
									trailing={<Link2 aria-hidden />}
								>
									<Link href={sharePath(link.id)} />
								</ListRow>
							</div>
						))}
					</div>
				</section>
			)}
		</aside>
	);
}
