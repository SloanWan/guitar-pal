import { ImageResponse } from "next/og";
import { LIGHT_SLOTS, markSvg } from "@/lib/brand/pickMark";
import { LAUNCH_BACKGROUND, LAUNCH_MARK_PX, launchImageFor, launchImages } from "@/lib/pwa/launchScreens";

// Drawn once, at build: one file per screen and orientation (#490).
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams(): { file: string }[] {
	return launchImages().map((image) => ({ file: image.url.slice("/launch/".length) }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }): Promise<Response> {
	const image = launchImageFor((await params).file);
	if (!image) return new Response(null, { status: 404 });
	const side = LAUNCH_MARK_PX * image.ratio;
	const src = `data:image/svg+xml;base64,${Buffer.from(markSvg(side, LIGHT_SLOTS, LAUNCH_BACKGROUND)).toString("base64")}`;
	return new ImageResponse(
		(
			<div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: LAUNCH_BACKGROUND }}>
				{/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse, not a page */}
				<img src={src} width={side} height={side} alt="" />
			</div>
		),
		{ width: image.width, height: image.height },
	);
}
