"use client";

import "./home.css";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { OPEN_PROGRESSION_KEY } from "@/components/strum/useStrumSession";
import { PAGE_GUTTER } from "@/components/auth/formText";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@/hooks/useUser";
import { greeting, todayLabel, type KeptItem } from "@/lib/home/home";
import { loadHome, setKept, type HomeData } from "@/lib/home/loadHome";
import { nicknameOf } from "@/lib/profile";
import { createClient } from "@/lib/supabase";
import AskCard from "./AskCard";
import ContinueCard from "./ContinueCard";
import HomeSide from "./HomeSide";
import LatestTiles from "./LatestTiles";

/** The clock the page talks in, read on the client and kept to the minute. */
function useNow(): Date | null {
	const [now, setNow] = useState<Date | null>(null);
	useEffect(() => {
		queueMicrotask(() => setNow(new Date()));
		const id = setInterval(() => setNow(new Date()), 30_000);
		return () => clearInterval(id);
	}, []);
	return now;
}

function readOpenProgression(): string | null {
	try {
		return localStorage.getItem(OPEN_PROGRESSION_KEY);
	} catch {
		return null;
	}
}

/** The song card's frame while the load is out: its title lines, a bar of chords, the grid, the controls. */
function SongCardSkeleton() {
	return (
		<div className="hm-cont" aria-busy="true" aria-label="Loading">
			<div className="hm-cont-top">
				<Skeleton className="hm-sk-line hm-sk-mod" />
				<Skeleton className="hm-sk-line hm-sk-name" />
				<Skeleton className="hm-sk-line hm-sk-meta" />
			</div>
			<Skeleton className="hm-sk-bars" />
			<Skeleton className="hm-sk-grid" />
			<Skeleton className="hm-sk-ctl" />
		</div>
	);
}

/** The panel's frame while the load is out: a heading and a few rows. */
function SideSkeleton() {
	return (
		<aside className="hm-side" aria-busy="true" aria-label="Loading">
			<div className="hm-blk">
				<Skeleton className="hm-sk-line hm-sk-h" />
				<div className="hm-sk-rows">
					<Skeleton className="hm-sk-row" />
					<Skeleton className="hm-sk-row" />
					<Skeleton className="hm-sk-row" />
				</div>
			</div>
		</aside>
	);
}

/**
 * /home, signed in (#363 step 13): a greeting that asks what we are playing and
 * the assistant to answer it with; the song last strummed, ready to play, and
 * the three latest things; one panel of the player's own.
 */
export default function HomePage() {
	const { user, loading } = useUser();
	const now = useNow();
	const [data, setData] = useState<HomeData | null>(null);

	const userId = user?.id;
	useEffect(() => {
		// The proxy keeps a signed-out visitor off /home; wait for the user to resolve.
		if (loading || !user) return;
		let cancelled = false;
		loadHome(createClient(), user, readOpenProgression(), new Date())
			.then((next) => {
				if (!cancelled) setData(next);
			})
			.catch((e: unknown) => {
				console.error("[home] load failed:", e);
				if (!cancelled) toast("Couldn't load your things. Reload to try again.");
			});
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- a token refresh hands back a new user object for the same account
	}, [userId, loading]);

	// A pick turned on or off: the row keeps its place (things don't jump), and goes back if the write fails.
	function keep(item: KeptItem, kept: boolean) {
		if (!user || !item.keep) return;
		const mark = (on: boolean) =>
			setData((d) =>
				d && {
					...d,
					kept: d.kept.map((k) => (k.key === item.key && k.keep ? { ...k, keep: { ...k.keep, kept: on } } : k)),
				},
			);
		mark(kept);
		setKept(createClient(), user, item.keep.target, kept).catch((e: unknown) => {
			console.error("[home] keep failed:", e);
			mark(!kept);
			toast(`Couldn't ${kept ? "keep" : "let go of"} ${item.title}. Try again.`);
		});
	}

	return (
		<div className={`hm ${PAGE_GUTTER}`}>
			<div className="hm-lay">
				<div className="hm-col gp-rise">
					<header className="hm-greet">
						<p className="hm-today">{now ? todayLabel(now) : ""}</p>
						<h1 className="hm-h1">{now ? greeting(now, user ? nicknameOf(user) : null) : ""}</h1>
					</header>

					<AskCard />

					<section className="hm-sec" aria-labelledby="hm-jump">
						<h2 id="hm-jump" className="hm-h2">
							Jump back in
						</h2>
						{data ? (
							<div className="hm-arrive gp-rise">
								<ContinueCard continued={data.continued} now={now} />
								<LatestTiles tab={data.tab} chords={data.chords} shapes={data.shapes} book={data.book} now={now} />
							</div>
						) : (
							<SongCardSkeleton />
						)}
					</section>
				</div>

				<div className="hm-arrive gp-rise">
					{data ? (
						<HomeSide week={data.week} kept={data.kept} opened={data.opened} links={data.links} now={now} onKeep={keep} />
					) : (
						<SideSkeleton />
					)}
				</div>
			</div>
		</div>
	);
}
