/**
 * The Guitar Pal mark (#352, spec v1.1 §2): one guitar-pick path, and the "Resting pick"
 * logo built from it — four picks fanned from a shared point (the v1 hand) plus a fifth
 * laid almost flat in front of the hand's right foot.
 */

/** The pick, point down, in a 24 × 26 box. Every pick in the product is this path. */
export const PICK_PATH =
	"M12 25.2C10.6 25.2 3.4 15.8 1.6 10.2C.4 6.4 1.4 2.6 5.6 1.5C8 .9 10 .8 12 .8C14 .8 16 .9 18.4 1.5C22.6 2.6 23.6 6.4 22.4 10.2C20.6 15.8 13.4 25.2 12 25.2Z";
export const PICK_VIEWBOX = "0 0 24 26";

/** One pick of the mark: top-left (x, y), width w, turned r degrees about (px, py). */
export interface MarkPick {
	x: number;
	y: number;
	w: number;
	px: number;
	py: number;
	r: number;
}

const handPick = (r: number): MarkPick => ({ x: 8, y: 3, w: 14, px: 15, py: 16.65, r });
const centredPick = (cx: number, cy: number, w: number, r: number): MarkPick => ({
	x: cx - w / 2,
	y: cy - (w * 13) / 24,
	w,
	px: cx,
	py: cy,
	r,
});

/** Back to front; the index is the colour slot (--gp-lg0 … --gp-lg4). */
export const MARK_PICKS: readonly MarkPick[] = [
	handPick(-34),
	handPick(-11),
	handPick(12),
	handPick(35),
	centredPick(21.6, 20.2, 13, 74),
];

/** The pick outline sampled for bounding boxes. */
const OUTLINE: readonly (readonly [number, number])[] = [
	[12, 25.2], [7, 19.5], [3.4, 14.6], [1.6, 10.2], [0.9, 6.5], [2, 3.6], [5.6, 1.5], [9, 0.9],
	[12, 0.8], [15, 0.9], [18.4, 1.5], [22, 3.6], [23.1, 6.5], [22.4, 10.2], [20.6, 14.6], [17, 19.5],
];

function outlineOf(p: MarkPick): [number, number][] {
	const k = p.w / 24;
	const a = (p.r * Math.PI) / 180;
	const c = Math.cos(a);
	const s = Math.sin(a);
	return OUTLINE.map(([u, v]) => {
		const x = p.x + u * k - p.px;
		const y = p.y + v * k - p.py;
		return [p.px + x * c - y * s, p.py + x * s + y * c];
	});
}

/** A square viewBox around the picks with a 0.9 margin ("2.81 0.97 26.64 26.64" for the logo). */
export function markViewBox(picks: readonly MarkPick[] = MARK_PICKS, pad = 0.9): string {
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	for (const p of picks)
		for (const [x, y] of outlineOf(p)) {
			x0 = Math.min(x0, x);
			y0 = Math.min(y0, y);
			x1 = Math.max(x1, x);
			y1 = Math.max(y1, y);
		}
	const side = Math.max(x1 - x0, y1 - y0) + pad * 2;
	const cx = (x0 + x1) / 2;
	const cy = (y0 + y1) / 2;
	return [cx - side / 2, cy - side / 2, side, side].map((v) => v.toFixed(2)).join(" ");
}

/** The SVG transform that places PICK_PATH as this pick. */
export function pickTransform(p: MarkPick): string {
	return `rotate(${p.r} ${p.px} ${p.py}) translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) scale(${(p.w / 24).toFixed(4)})`;
}

/** How far a pick's gap is cast, in mark units (decided 2026-10-30, "medium"). */
export const GAP_CAST = 1.4;

/**
 * Where a pick's gap lies: the pick's own outline in the ground colour, drawn under it and
 * cast toward the pick behind, so the white between two picks is a crescent that follows
 * the pick's edge — a projection, not an even stroke (whose overlaps at the tips kinked).
 * The hand's picks lie to the left of the one in front; the resting pick's (the hand's
 * front pick) to its upper left. The back pick has nothing behind it: null.
 */
export function gapOffset(index: number): readonly [number, number] | null {
	if (index <= 0 || index >= MARK_PICKS.length) return null;
	if (index === MARK_PICKS.length - 1) return [-GAP_CAST * 0.8, -GAP_CAST * 0.7];
	return [-GAP_CAST, GAP_CAST * 0.32];
}

/* ------------------------------------------------------------------------------------
   The arrival (played on the first visit to Home and when the logo is clicked to go there)
   - collapse (replay only), −120 → 0 ms: the hand eases back to 0°, the fifth pick lifts and fades
   - the fan opens, 0 → 605 ms: pick j starts at j × 45 ms and turns from 0° to its angle on a
     damped spring (ζ 0.76, ω 9.5) normalised to 470 ms
   - the fifth pick lands, 300 → 780 ms: from (+9, −10) turned +32°, opaque within 80 ms,
     a 3% squash between 45% and 80% of its run
   ------------------------------------------------------------------------------------ */
export const LOGO_OPEN_MS = 780;
export const LOGO_CLOSE_MS = 120;
const STAGGER_MS = 45;
const SPRING_MS = 470;
const LAND_START_MS = 300;
const LAND_MS = 480;

/** A damped spring from 0 to 1 over p ∈ [0, 1] (ζ 0.76: about 2.5% overshoot, no bounce beyond). */
export function springE(p: number): number {
	if (p <= 0) return 0;
	if (p >= 1) return 1;
	const z = 0.76;
	const w = 9.5;
	const wd = w * Math.sqrt(1 - z * z);
	return 1 - Math.exp(-z * w * p) * (Math.cos(wd * p) + ((z * w) / wd) * Math.sin(wd * p));
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** A pick's animated pose: an extra transform before its resting one, and an opacity. */
export interface PickPose {
	/** Applied outside pickTransform(); null = at rest. */
	transform: string | null;
	/** null = fully visible (no override). */
	opacity: number | null;
}

const REST: PickPose = { transform: null, opacity: null };

/**
 * Every pick's pose t ms into the arrival. Negative t is the collapse (replay only);
 * null or t ≥ LOGO_OPEN_MS is the resting mark — also what reduced motion shows.
 */
export function logoPose(t: number | null, picks: readonly MarkPick[] = MARK_PICKS): PickPose[] {
	return picks.map((p, j) => {
		if (t === null || t >= LOGO_OPEN_MS) return REST;
		if (j < 4) {
			const s = t < 0 ? 1 - ((t + LOGO_CLOSE_MS) / LOGO_CLOSE_MS) ** 2 : springE((t - j * STAGGER_MS) / SPRING_MS);
			return { transform: `rotate(${(-p.r * (1 - s)).toFixed(2)} ${p.px} ${p.py})`, opacity: null };
		}
		if (t < 0) {
			const c = (t + LOGO_CLOSE_MS) / LOGO_CLOSE_MS;
			return { transform: `translate(0 ${(-4 * c).toFixed(2)})`, opacity: 1 - c };
		}
		const q = (t - LAND_START_MS) / LAND_MS;
		if (q <= 0) return { transform: null, opacity: 0 };
		const s1 = springE(q);
		const s2 = springE(clamp((q - 0.1) / 0.9, 0, 1));
		const dx = 9 * (1 - s1);
		const dy = -10 * (1 - s2);
		const dr = 32 * (1 - s1);
		const squash = q > 0.45 && q < 0.8 ? Math.sin((Math.PI * (q - 0.45)) / 0.35) : 0;
		const sx = 1 + 0.03 * squash;
		const sy = 1 - 0.03 * squash;
		const { px: cx, py: cy } = p;
		return {
			transform: `translate(${dx.toFixed(2)} ${dy.toFixed(2)}) rotate(${dr.toFixed(2)} ${cx} ${cy}) translate(${cx} ${cy}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${-cx} ${-cy})`,
			opacity: Math.min(1, q * 6),
		};
	});
}

export interface LogoPlayerDeps {
	/** Writes one frame (null = rest). */
	apply: (poses: PickPose[]) => void;
	now: () => number;
	raf: (cb: (ts: number) => void) => number;
	cancel: (id: number) => void;
	/** Under reduced motion the player only writes the rest pose; the caller fades the mark in. */
	reducedMotion: () => boolean;
}

/** Plays the arrival on rAF; stops on its own at LOGO_OPEN_MS and on stop(). */
export function createLogoPlayer({ apply, now, raf, cancel, reducedMotion }: LogoPlayerDeps) {
	let id = 0;
	const stop = () => {
		if (id) cancel(id);
		id = 0;
	};
	const play = ({ collapse = false }: { collapse?: boolean } = {}): "animated" | "reduced" => {
		stop();
		if (reducedMotion()) {
			apply(logoPose(null));
			return "reduced";
		}
		const t0 = now();
		const offset = collapse ? -LOGO_CLOSE_MS : 0;
		const frame = () => {
			const t = offset + (now() - t0);
			apply(logoPose(t));
			id = t < LOGO_OPEN_MS ? raf(frame) : 0;
		};
		apply(logoPose(offset));
		id = raf(frame);
		return "animated";
	};
	return { play, stop, isRunning: () => id !== 0 };
}
