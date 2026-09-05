"use client";

import { useEffect, useState } from "react";
import Link from "@/components/AppLink";
import { Rows4, Hand, History, Star } from "lucide-react";
import { useUser } from "@/hooks/useUser";
import { createClient } from "@/lib/supabase";
import { PRESET_STRUM_PATTERNS, type StrumPattern } from "@/lib/strumPatterns";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import { loadUserFingerpickPatterns } from "@/lib/fingerpickPatternSync";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import {
	loadLastPatterns,
	resolvePatternMeta,
	resolvePatternMetas,
	type PatternMeta,
} from "@/lib/lastPattern";

const EYEBROW =
	"font-mono text-[length:var(--text-eyebrow-size)] uppercase tracking-[var(--text-eyebrow-ls)] text-denim-accent";

// A resolved card: pattern metadata plus which tool it belongs to (fixes the
// deep-link target and the icon).
type ToolCard = PatternMeta & { tool: "strum" | "fingerpick" };

const TOOL_META = {
	strum: { href: "/strum", label: "Strumming", Icon: Rows4 },
	fingerpick: { href: "/fingerpick", label: "Fingerpicking", Icon: Hand },
} as const;

function PatternCard({ card }: { card: ToolCard }) {
	const { href, label, Icon } = TOOL_META[card.tool];
	return (
		<Link
			href={`${href}?pattern=${encodeURIComponent(card.id)}`}
			className="group relative flex items-center gap-4 border border-line px-5 py-4 transition-colors duration-200 hover:bg-denim-tint focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-denim-accent"
		>
			<div className="flex size-10 flex-none items-center justify-center border border-line-strong transition-colors duration-200 group-hover:border-denim">
				<Icon className="size-5" strokeWidth={1.5} strokeLinecap="square" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="truncate font-mono text-[length:var(--text-h3-size)] font-medium tracking-[0.02em]">
					{card.name}
				</div>
				<div className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-faint">
					{label}
					{card.source === "custom" ? " · Custom" : ""}
				</div>
			</div>
		</Link>
	);
}

function Section({
	icon,
	title,
	children,
}: {
	icon: React.ReactNode;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section>
			<h2 className="mb-5 flex items-center gap-2 font-mono text-[length:var(--text-eyebrow-size)] uppercase tracking-[var(--text-eyebrow-ls)] text-ink-dim">
				<span className="text-denim-accent">{icon}</span>
				{title}
			</h2>
			{children}
		</section>
	);
}

// One favourites column, scoped to a single tool. Cards stack vertically so the
// two columns (strum / fingerpick) read as parallel lists.
function FavouriteColumn({ tool, cards }: { tool: "strum" | "fingerpick"; cards: ToolCard[] }) {
	const { label, Icon } = TOOL_META[tool];
	return (
		<div>
			<h3 className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-faint">
				<Icon className="size-3.5" strokeWidth={1.5} strokeLinecap="square" />
				{label}
			</h3>
			{cards.length > 0 ? (
				<div className="flex flex-col gap-4">
					{cards.map((card) => (
						<PatternCard key={card.id} card={card} />
					))}
				</div>
			) : (
				<p className="border border-line px-5 py-4 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-faint">
					No favourites yet
				</p>
			)}
		</div>
	);
}

export default function HomePage() {
	const { user, loading } = useUser();
	const [dataLoading, setDataLoading] = useState(true);
	const [continueCards, setContinueCards] = useState<ToolCard[]>([]);
	const [favStrum, setFavStrum] = useState<ToolCard[]>([]);
	const [favFingerpick, setFavFingerpick] = useState<ToolCard[]>([]);

	useEffect(() => {
		// The proxy guards /home for signed-out visitors; on the client the user
		// resolves asynchronously, so wait for it before hitting Supabase.
		if (loading) return;
		if (!user) {
			// Unreachable in practice (the proxy guards /home), but keep the skeleton
			// from spinning forever if the client resolves to no user. Deferred so the
			// state update doesn't fire synchronously inside the effect body.
			queueMicrotask(() => setDataLoading(false));
			return;
		}
		const currentUser = user;
		let cancelled = false;

		(async () => {
			const supabase = createClient();
			try {
				const [
					strumCustomsRes,
					fingerpickCustoms,
					strumFavsRes,
					fingerpickFavsRes,
					last,
				] = await Promise.all([
					supabase
						.from("user_strum_patterns")
						.select("pattern_id, name")
						.eq("user_id", currentUser.id),
					loadUserFingerpickPatterns(supabase, currentUser),
					supabase
						.from("user_favourite_patterns")
						.select("pattern_id")
						.eq("user_id", currentUser.id),
					supabase
						.from("user_favourite_fingerpick_patterns")
						.select("pattern_id")
						.eq("user_id", currentUser.id),
					loadLastPatterns(supabase, currentUser),
				]);
				if (cancelled) return;

				const strumCustoms: StrumPattern[] = (strumCustomsRes.data ?? []).map(
					(row) => ({
						id: row.pattern_id as string,
						name: row.name as string,
						beats: [],
					}),
				);
				const fpCustoms: FingerpickPattern[] = fingerpickCustoms;

				// Continue practising — last-opened pattern per tool.
				const continued: ToolCard[] = [];
				if (last.strum) {
					const meta = resolvePatternMeta(last.strum, PRESET_STRUM_PATTERNS, strumCustoms);
					if (meta) continued.push({ ...meta, tool: "strum" });
				}
				if (last.fingerpick) {
					const meta = resolvePatternMeta(
						last.fingerpick,
						PRESET_FINGERPICK_PATTERNS,
						fpCustoms,
					);
					if (meta) continued.push({ ...meta, tool: "fingerpick" });
				}

				// Favourites — kept per-tool so the UI can render one column each.
				const strumFavIds = (strumFavsRes.data ?? []).map((r) => r.pattern_id as string);
				const fpFavIds = (fingerpickFavsRes.data ?? []).map((r) => r.pattern_id as string);
				const strumFavourites = resolvePatternMetas(
					strumFavIds,
					PRESET_STRUM_PATTERNS,
					strumCustoms,
				).map((m): ToolCard => ({ ...m, tool: "strum" }));
				const fpFavourites = resolvePatternMetas(
					fpFavIds,
					PRESET_FINGERPICK_PATTERNS,
					fpCustoms,
				).map((m): ToolCard => ({ ...m, tool: "fingerpick" }));

				setContinueCards(continued);
				setFavStrum(strumFavourites);
				setFavFingerpick(fpFavourites);
			} catch (e) {
				console.error(e);
			} finally {
				if (!cancelled) setDataLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [user, loading]);

	const showLoading = loading || dataLoading;
	const hasFavourites = favStrum.length > 0 || favFingerpick.length > 0;
	const isEmpty = !showLoading && continueCards.length === 0 && !hasFavourites;

	return (
		<div className="mx-auto max-w-300 px-(--gutter) py-12 max-sm:py-8">
			<div className="mb-12">
				<span className={EYEBROW}>{"// Your bench"}</span>
				<h1 className="mt-3.5 font-mono text-(length:--text-h2-size) font-bold tracking-(--text-h2-ls)">
					Pick up where you left off.
				</h1>
			</div>

			{showLoading ? (
				<div className="grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
					{[0, 1, 2, 3].map((i) => (
						<div key={i} className="h-[74px] animate-pulse border border-line bg-denim-tint" />
					))}
				</div>
			) : isEmpty ? (
				<p className="border border-line px-6 py-10 text-center text-ink-dim">
					No saved patterns yet. Open{" "}
					<Link href="/strum" className="text-denim-accent underline-offset-2 hover:underline">
						Strumming
					</Link>{" "}
					or{" "}
					<Link
						href="/fingerpick"
						className="text-denim-accent underline-offset-2 hover:underline"
					>
						Fingerpicking
					</Link>{" "}
					and star a pattern to see it here.
				</p>
			) : (
				<div className="flex flex-col gap-12">
					{continueCards.length > 0 && (
						<Section icon={<History className="size-3.5" strokeWidth={1.5} />} title="Continue practising">
							<div className="grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
								{continueCards.map((card) => (
									<PatternCard key={`${card.tool}-${card.id}`} card={card} />
								))}
							</div>
						</Section>
					)}

					{hasFavourites && (
						<Section icon={<Star className="size-3.5" strokeWidth={1.5} />} title="Favourites">
							<div className="grid grid-cols-2 gap-x-8 gap-y-4 max-[900px]:grid-cols-1">
								<FavouriteColumn tool="strum" cards={favStrum} />
								<FavouriteColumn tool="fingerpick" cards={favFingerpick} />
							</div>
						</Section>
					)}
				</div>
			)}
		</div>
	);
}
