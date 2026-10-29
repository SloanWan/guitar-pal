import { forwardRef, type CSSProperties } from "react";
import { MARK_PICKS, PICK_PATH, PICK_VIEWBOX, gapOffset, markViewBox, pickTransform } from "@/lib/brand/pickMark";

/** One pick (point down), filled with currentColor unless told otherwise. */
export function Pick({ className, title, style }: { className?: string; title?: string; style?: CSSProperties }) {
	return (
		<svg
			viewBox={PICK_VIEWBOX}
			className={className}
			style={style}
			fill="currentColor"
			role={title ? "img" : undefined}
			aria-label={title}
			aria-hidden={title ? undefined : true}
		>
			<path d={PICK_PATH} />
		</svg>
	);
}

/**
 * Which colours the five slots wear. "theme" follows data-theme (--gp-lg0…4); the app-icon
 * tiles are fixed — a light tile always wears the light slots, a dark tile the dark ones.
 */
export type MarkSlots = "theme" | "light" | "dark";

const SLOT_VAR: Record<MarkSlots, string> = { theme: "--gp-lg", light: "--gp-lgl", dark: "--gp-lgd" };
const VIEWBOX = markViewBox();

/**
 * The "Resting pick" logo. Under each pick but the back one lies its gap: the pick's own
 * outline in the ground colour (`--mk-gap`, defaulting to the page), cast toward the pick
 * behind (gapOffset), so the picks part with crescents that follow their edges and the
 * overlaps still read at 16px. The groups carry `data-pick` so the arrival can pose them
 * (useLogoArrival) — a pick's gap moves with it.
 */
export const PickMark = forwardRef<SVGSVGElement, { slots?: MarkSlots; className?: string; title?: string }>(
	function PickMark({ slots = "theme", className, title }, ref) {
		return (
			<svg
				ref={ref}
				viewBox={VIEWBOX}
				className={className}
				overflow="visible"
				role={title ? "img" : undefined}
				aria-label={title}
				aria-hidden={title ? undefined : true}
			>
				{MARK_PICKS.map((p, j) => {
					const gap = gapOffset(j);
					return (
						<g key={j} data-pick={j}>
							{gap && (
								<path
									d={PICK_PATH}
									transform={`translate(${gap[0]} ${gap[1]}) ${pickTransform(p)}`}
									fill="var(--mk-gap, var(--gp-page))"
								/>
							)}
							<path d={PICK_PATH} transform={pickTransform(p)} fill={`var(${SLOT_VAR[slots]}${j})`} />
						</g>
					);
				})}
			</svg>
		);
	},
);
