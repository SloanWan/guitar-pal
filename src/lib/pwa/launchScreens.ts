/**
 * The iOS launch images (#490). Opened from the home screen, iOS shows black until the
 * page's first paint unless it is given a launch image (`apple-touch-startup-image`) whose
 * size is the screen's exactly; it builds none from the manifest. One per screen and
 * orientation: the mark centred on the page colour, where the page's launch curtain
 * (`.gp-launch`) draws it too, so the image hands over to the animation without a seam.
 *
 * Screens are a device's CSS size in portrait and its pixel ratio (iOS 26's iPhones and
 * iPads); a screen missing here falls back to black, nothing worse.
 */

export interface LaunchScreen {
	/** CSS px, portrait. */
	width: number;
	height: number;
	ratio: 2 | 3;
}

export const LAUNCH_SCREENS: readonly LaunchScreen[] = [
	// iPhone
	{ width: 440, height: 956, ratio: 3 }, // 16 / 17 Pro Max
	{ width: 420, height: 912, ratio: 3 }, // Air
	{ width: 402, height: 874, ratio: 3 }, // 16 / 17 Pro, 17
	{ width: 430, height: 932, ratio: 3 }, // 14 / 15 Pro Max, 15 / 16 Plus
	{ width: 393, height: 852, ratio: 3 }, // 14 / 15 Pro, 15, 16
	{ width: 428, height: 926, ratio: 3 }, // 12 / 13 Pro Max, 14 Plus
	{ width: 390, height: 844, ratio: 3 }, // 12, 13, 14, 16e
	{ width: 375, height: 812, ratio: 3 }, // 11 Pro, 12 / 13 mini
	{ width: 414, height: 896, ratio: 3 }, // 11 Pro Max
	{ width: 414, height: 896, ratio: 2 }, // 11
	{ width: 375, height: 667, ratio: 2 }, // SE
	// iPad
	{ width: 1032, height: 1376, ratio: 2 }, // Pro 13 (M4 on)
	{ width: 1024, height: 1366, ratio: 2 }, // Pro 12.9, Air 13
	{ width: 834, height: 1210, ratio: 2 }, // Pro 11 (M4 on)
	{ width: 834, height: 1194, ratio: 2 }, // Pro 11
	{ width: 820, height: 1180, ratio: 2 }, // Air 11, iPad (10th on)
	{ width: 834, height: 1112, ratio: 2 }, // Air (3rd)
	{ width: 810, height: 1080, ratio: 2 }, // iPad (9th)
	{ width: 744, height: 1133, ratio: 2 }, // mini (6th on)
];

/** The mark's side in CSS px, in the image and in the curtain alike. */
export const LAUNCH_MARK_PX = 112;
/** The light page colour (`--gp-page`): the site opens light unless a visitor chose dark. */
export const LAUNCH_BACKGROUND = "#F7F7F8";

export interface LaunchImage {
	/** Device px. */
	width: number;
	height: number;
	ratio: 2 | 3;
	url: string;
	media: string;
}

const fileFor = (width: number, height: number) => `${width}x${height}.png`;

/** Every launch image, portrait and landscape, with the media query iOS picks it by. */
export function launchImages(screens: readonly LaunchScreen[] = LAUNCH_SCREENS): LaunchImage[] {
	return screens.flatMap(({ width, height, ratio }) =>
		(["portrait", "landscape"] as const).map((orientation) => {
			const w = (orientation === "portrait" ? width : height) * ratio;
			const h = (orientation === "portrait" ? height : width) * ratio;
			return {
				width: w,
				height: h,
				ratio,
				url: `/launch/${fileFor(w, h)}`,
				// device-width / -height are the portrait ones in either orientation.
				media: `screen and (device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: ${orientation})`,
			};
		}),
	);
}

/** The launch image a file name names (`1290x2796.png`), or null for any other. */
export function launchImageFor(file: string): LaunchImage | null {
	return launchImages().find((image) => image.url === `/launch/${file}`) ?? null;
}
