import type { NavKey, TabKey } from "@/lib/navigation";

type IconKey = NavKey | TabKey;

/** Each destination drawn twice: a stroked outline at rest, a filled shape when it is the current page. */
const ICONS: Record<IconKey, { outline: string; filled: string; outlineDots?: string }> = {
	home: {
		outline: "M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z",
		filled: "M3.2 10.1 12 3l8.8 7.1V19.2a1.8 1.8 0 0 1-1.8 1.8h-4.3v-5.6H9.3V21H5a1.8 1.8 0 0 1-1.8-1.8z",
	},
	strum: {
		outline: "M8 4v15M4.5 15.5 8 19l3.5-3.5M16 20V5M12.5 8.5 16 5l3.5 3.5",
		filled:
			"M6.6 3.2a1.4 1.4 0 0 1 2.8 0v10.5h2.1a.8.8 0 0 1 .6 1.3l-3.5 4.6a.8.8 0 0 1-1.2 0L3.9 15a.8.8 0 0 1 .6-1.3h2.1zM17.4 20.8a1.4 1.4 0 0 1-2.8 0V10.3h-2.1a.8.8 0 0 1-.6-1.3l3.5-4.6a.8.8 0 0 1 1.2 0L20.1 9a.8.8 0 0 1-.6 1.3h-2.1z",
	},
	tab: {
		outline: "M3 5.5h18M3 10h18M3 14.5h18M3 19h18",
		outlineDots: "M8.5 7.8v0M15.5 12.3v0M11 16.8v0",
		filled:
			"M4.2 3.2h15.6a2 2 0 0 1 2 2v13.6a2 2 0 0 1-2 2H4.2a2 2 0 0 1-2-2V5.2a2 2 0 0 1 2-2zM2.2 8.6h19.6v1.3H2.2zM2.2 14.1h19.6v1.3H2.2zM8.6 4.55a1.35 1.35 0 1 0 0 2.7a1.35 1.35 0 1 0 0 -2.7zM15.4 10.4a1.35 1.35 0 1 0 0 2.7a1.35 1.35 0 1 0 0 -2.7zM11 16.05a1.35 1.35 0 1 0 0 2.7a1.35 1.35 0 1 0 0 -2.7z",
	},
	chords: {
		outline: "M5 4h14M5 4v16M9.7 4v16M14.3 4v16M19 4v16M5 9.5h14M5 15h14",
		outlineDots: "M12 12.3v0",
		filled:
			"M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM5.6 8.7h12.8V10H5.6zM5.6 15.3h12.8v1.3H5.6zM9.05 5.4h1.3v3.3h-1.3zM9.05 10h1.3v5.3h-1.3zM9.05 16.6h1.3v2h-1.3zM13.65 5.4h1.3v3.3h-1.3zM13.65 16.6h1.3v2h-1.3zM14.3 10.65a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
	},
	fretboard: {
		outline: "M2 7.5h20M2 12h20M2 16.5h20M7 5v14M13 5v14M18.5 5v14",
		filled:
			"M3 4.5h18a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 18V6A1.5 1.5 0 0 1 3 4.5zM6.35 6.5h1.3v11h-1.3zM12.35 6.5h1.3v11h-1.3zM17.85 6.5h1.3v11h-1.3zM3.5 9.6h2.85v1.3H3.5zM7.65 9.6h4.7v1.3h-4.7zM13.65 9.6h4.2v1.3h-4.2zM19.15 9.6h1.35v1.3h-1.35zM3.5 13.1h2.85v1.3H3.5zM7.65 13.1h4.7v1.3h-4.7zM13.65 13.1h4.2v1.3h-4.2zM19.15 13.1h1.35v1.3h-1.35z",
	},
	books: {
		outline: "M12 6.5C10.5 5 8 4.5 4 4.5v14c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2v-14c-4 0-6.5.5-8 2zM12 6.5v14",
		filled:
			"M11.2 6C9.6 4.6 7.2 4 3.6 4a.9.9 0 0 0-.9.9v13.2c0 .5.4.9.9.9 3.6 0 6 .5 7.6 1.8zM12.8 6c1.6-1.4 4-2 7.6-2 .5 0 .9.4.9.9v13.2a.9.9 0 0 1-.9.9c-3.6 0-6 .5-7.6 1.8z",
	},
	me: {
		outline: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c.6-3.7 3.7-6.5 7.5-6.5s6.9 2.8 7.5 6.5",
		filled: "M12 12.6a4.6 4.6 0 1 0 0-9.2 4.6 4.6 0 0 0 0 9.2zM3.8 20.2c.5-4.1 4-7 8.2-7s7.7 2.9 8.2 7a1 1 0 0 1-1 1.1H4.8a1 1 0 0 1-1-1.1z",
	},
};

/**
 * A destination's icon: both drawings stacked, CSS showing the filled one (in the module
 * colour) when the link is `aria-current="page"`.
 */
export function NavIcon({ name }: { name: IconKey }) {
	const icon = ICONS[name];
	return (
		<span className="gp-nic" aria-hidden>
			<svg className="gp-nic-o" viewBox="0 0 24 24">
				<path d={icon.outline} />
				{icon.outlineDots && <path d={icon.outlineDots} strokeWidth={name === "chords" ? 5 : 4.2} />}
			</svg>
			<svg className="gp-nic-f" viewBox="0 0 24 24">
				<path d={icon.filled} fillRule="evenodd" />
			</svg>
		</span>
	);
}
