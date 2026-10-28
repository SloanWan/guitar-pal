import { useSheetSide } from "@/components/ui/sheet";
import { useStoredState } from "@/components/useStoredState";
import { PLAYER_DOCK_KEY, readDock, type PlayerDock } from "@/lib/playerDock";

/**
 * Where the player floats, remembered per viewer and shared by every page that
 * has one. A phone has no room beside the stage, so there it stays at the
 * bottom whatever was chosen on a wider screen.
 */
export function usePlayerDock(): { dock: PlayerDock; canDock: boolean; moveDock: (dock: PlayerDock) => void } {
	const [choice, moveDock] = useStoredState<PlayerDock>(PLAYER_DOCK_KEY, "bottom", { parse: readDock, format: String });
	const canDock = useSheetSide(true) === "right";
	return { dock: canDock ? choice : "bottom", canDock, moveDock };
}
