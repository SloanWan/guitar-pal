/** Where the play pill sits: along the bottom of the stage, or standing up its left side. */
export type PlayerDock = "bottom" | "left";

/** Per-viewer: the dock the player was last left in. */
export const PLAYER_DOCK_KEY = "strumPlayerDock";

/** A stored dock, or the default for anything unreadable. */
export function readDock(raw: string | null): PlayerDock {
	return raw === "left" ? "left" : "bottom";
}

/**
 * Where a pill let go at `point` snaps to inside `area`: whichever edge it is
 * nearer, each distance taken as a share of that edge's own span, so a tall
 * narrow stage and a wide short one judge "near" the same way.
 */
export function dockFor(point: { x: number; y: number }, area: { left: number; top: number; width: number; height: number }): PlayerDock {
	const fromLeft = (point.x - area.left) / Math.max(1, area.width);
	const fromBottom = (area.top + area.height - point.y) / Math.max(1, area.height);
	return fromLeft < fromBottom ? "left" : "bottom";
}

/** The other dock: what pressing the handle without dragging does. */
export function otherDock(dock: PlayerDock): PlayerDock {
	return dock === "left" ? "bottom" : "left";
}
