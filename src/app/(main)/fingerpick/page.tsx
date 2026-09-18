import FingerpickWorkspace from "@/components/fingerpick/FingerpickWorkspace";

// The page is the workspace with the player's own library. The same workspace
// opens a shared snapshot at /p/[id] (src/lib/sharedItems.ts).
export default function FingerpickPage() {
	return <FingerpickWorkspace />;
}
