import { permanentRedirect } from "next/navigation";

// The player's own chords are the hub's Mine view now.
export default function MyChordsPage() {
	permanentRedirect("/chords?view=mine");
}
