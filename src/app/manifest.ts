import type { MetadataRoute } from "next";
import { APP_DESCRIPTION } from "@/lib/brand/app";

/**
 * The installable app's identity: the Resting-pick logo on its light tile
 * (#352). The maskable icon is the same mark on a full-bleed tile, inside the
 * safe zone a launcher's mask keeps (#468).
 */
export default function manifest(): MetadataRoute.Manifest {
	return {
		id: "/",
		name: "Guitar Pal",
		short_name: "Guitar Pal",
		description: APP_DESCRIPTION,
		start_url: "/",
		scope: "/",
		display: "standalone",
		background_color: "#F7F7F8",
		theme_color: "#F7F7F8",
		icons: [
			{ src: "/icon-192.png", sizes: "192x192", type: "image/png" },
			{ src: "/icon-512.png", sizes: "512x512", type: "image/png" },
			{ src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
		],
		shortcuts: [
			{ name: "Strum", url: "/strum" },
			{ name: "Tab", url: "/tab" },
			{ name: "Chords", url: "/chords" },
		],
	};
}
