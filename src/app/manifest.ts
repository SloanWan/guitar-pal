import type { MetadataRoute } from "next";

/** The installable app's identity: the Resting-pick logo on its light tile (#352). */
export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Guitar Pal",
		short_name: "Guitar Pal",
		description: "Build your guitar practice, one routine at a time.",
		start_url: "/",
		display: "standalone",
		background_color: "#F7F7F8",
		theme_color: "#F7F7F8",
		icons: [
			{ src: "/icon-192.png", sizes: "192x192", type: "image/png" },
			{ src: "/icon-512.png", sizes: "512x512", type: "image/png" },
		],
	};
}
