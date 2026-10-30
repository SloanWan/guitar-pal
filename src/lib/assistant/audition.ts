/**
 * One card sounds at a time. A card that starts playing takes the floor and
 * silences whichever card held it; a card gives the floor back when it stops.
 */

type Stop = () => void;

let current: Stop | null = null;

/**
 * Take the floor for `stop`, stopping the card that had it. Returns the
 * release, which gives the floor back only while this claim still holds it.
 */
export function claimAudition(stop: Stop): () => void {
	const previous = current;
	current = stop;
	if (previous !== null && previous !== stop) previous();
	return () => {
		if (current === stop) current = null;
	};
}
