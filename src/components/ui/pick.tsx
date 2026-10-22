import { forwardRef, type CSSProperties } from "react";
import { MARK_PICKS, PICK_PATH, PICK_VIEWBOX, gapStrokeWidth, markViewBox, pickTransform } from "@/lib/brand/pickMark";

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
 * The "Resting pick" logo. Each pick wears a hairline of the ground colour (`--mk-gap`,
 * defaulting to the page) so the overlaps still read at 16px. The groups carry
 * `data-pick` so the arrival can pose them (useLogoArrival).
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
				{MARK_PICKS.map((p, j) => (
					<g key={j} data-pick={j}>
						<path
							d={PICK_PATH}
							transform={pickTransform(p)}
							fill={`var(${SLOT_VAR[slots]}${j})`}
							stroke="var(--mk-gap, var(--gp-page))"
							strokeWidth={gapStrokeWidth(p)}
							strokeLinejoin="round"
						/>
					</g>
				))}
			</svg>
		);
	},
);
