import type { Duration } from "@/lib/fingerpickTypes";

/** How many flags a value's stem carries; null for an open head. */
const FLAGS: Partial<Record<Duration, number>> = {
	quarter: 0,
	"dotted-quarter": 0,
	eighth: 1,
	"dotted-eighth": 1,
	sixteenth: 2,
	"32nd": 3,
};

/** A note value drawn as a note: the toolbar's buttons. */
export default function NoteGlyph({ duration }: { duration: Duration }) {
	if (duration === "whole") {
		return (
			<svg viewBox="0 0 24 24" aria-hidden>
				<ellipse cx="12" cy="13" rx="5.4" ry="3.6" fill="none" stroke="currentColor" strokeWidth="2.2" />
			</svg>
		);
	}
	if (duration === "half") {
		return (
			<svg viewBox="0 0 24 24" aria-hidden>
				<ellipse cx="10" cy="17" rx="4" ry="2.9" transform="rotate(-22 10 17)" fill="none" stroke="currentColor" strokeWidth="1.9" />
				<path d="M13.7 15.8V3.5" stroke="currentColor" strokeWidth="1.9" />
			</svg>
		);
	}
	const flags = FLAGS[duration] ?? 0;
	const dotted = duration.startsWith("dotted");
	return (
		<svg viewBox="0 0 24 24" aria-hidden>
			<ellipse cx="9" cy="17" rx="4" ry="2.9" transform="rotate(-22 9 17)" fill="currentColor" />
			<path d="M12.7 15.8V2.5" stroke="currentColor" strokeWidth="1.9" />
			{Array.from({ length: flags }, (_, i) => (
				<path
					key={i}
					d={`M12.7 ${2.5 + i * 3.6}c.4 2.4 4.8 2.8 3.9 6.5`}
					fill="none"
					stroke="currentColor"
					strokeWidth="1.8"
					strokeLinecap="round"
				/>
			))}
			{dotted && <circle cx="19" cy="17" r="1.6" fill="currentColor" />}
		</svg>
	);
}
