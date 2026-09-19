import StrumWorkspace from "@/components/strum/StrumWorkspace";

// The page is the workspace with the player's own library. The same workspace
// opens a shared snapshot at /p/[id] (src/lib/sharedItems.ts).
export default function StrumPage() {
	return <StrumWorkspace />;
}
