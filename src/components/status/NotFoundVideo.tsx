"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type Source = "youtube" | "bilibili";

const SOURCES: Record<Source, { name: string; src: string }> = {
	youtube: { name: "YouTube", src: "https://www.youtube.com/embed/az7cnBm62bM" },
	bilibili: {
		name: "Bilibili",
		src: "https://player.bilibili.com/player.html?bvid=BV1djBgYxEUH&p=1&autoplay=0&danmaku=0",
	},
};

/** A YouTube thumbnail: it loads only where YouTube itself does. */
const PROBE_URL = "https://i.ytimg.com/vi/az7cnBm62bM/default.jpg";
/** Long enough for a slow connection, short enough not to stare at a skeleton. */
const PROBE_TIMEOUT_MS = 3500;

/**
 * The 404's clip. An iframe says nothing when its site is unreachable (it
 * just stays blank), so a thumbnail is fetched first: if it loads, YouTube
 * plays the clip; if it fails or times out, the same clip plays from
 * Bilibili. A link under the player swaps by hand when the guess is wrong.
 */
export default function NotFoundVideo() {
	const [source, setSource] = useState<Source | null>(null);

	useEffect(() => {
		const img = new Image();
		let settled = false;
		const settle = (to: Source) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			setSource(to);
		};
		const timer = setTimeout(() => settle("bilibili"), PROBE_TIMEOUT_MS);
		img.onload = () => settle("youtube");
		img.onerror = () => settle("bilibili");
		img.src = PROBE_URL;
		return () => {
			settled = true;
			clearTimeout(timer);
			img.onload = null;
			img.onerror = null;
			img.src = "";
		};
	}, []);

	const other: Source = source === "youtube" ? "bilibili" : "youtube";

	return (
		<div className="flex w-full max-w-110 flex-col items-center gap-2.5">
			<div className="relative aspect-video w-full overflow-hidden rounded-gp-lg bg-gp-well">
				{source ? (
					<iframe
						key={source}
						className="absolute inset-0 size-full"
						src={SOURCES[source].src}
						title={`A short clip, played from ${SOURCES[source].name}`}
						allow="encrypted-media; fullscreen; picture-in-picture"
						allowFullScreen
						referrerPolicy="strict-origin-when-cross-origin"
					/>
				) : (
					<Skeleton className="absolute inset-0 rounded-none" />
				)}
			</div>
			{source && (
				<button
					type="button"
					onClick={() => setSource(other)}
					className="gp-focus rounded-gp-xs text-(length:--gp-t-cap) text-gp-ink-3 underline decoration-gp-edge underline-offset-4 transition-colors duration-(--gp-d-state) hover:text-gp-ink"
				>
					Not playing? Watch on {SOURCES[other].name}
				</button>
			)}
		</div>
	);
}
