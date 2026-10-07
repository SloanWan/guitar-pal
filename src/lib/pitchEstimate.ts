/**
 * Fundamental-pitch estimation for audio audits (dev labs). Normalised
 * autocorrelation with parabolic peak refinement — robust enough for a plucked
 * guitar sample, which is what the bend lab measures. Not used by playback.
 */

export interface PitchEstimateOptions {
	/** Lowest fundamental considered (Hz). Guitar low E is 82 Hz. */
	minHz?: number;
	/** Highest fundamental considered (Hz). */
	maxHz?: number;
}

export interface PitchEstimate {
	/** Estimated fundamental in Hz, or null when the window is silent or aperiodic. */
	hz: number | null;
	/** Peak normalised autocorrelation (0–1): how periodic the window was. */
	clarity: number;
}

const DEFAULT_MIN_HZ = 60;
const DEFAULT_MAX_HZ = 1500;
/** Below this normalised correlation the window is treated as unpitched. */
const MIN_CLARITY = 0.5;
/** RMS under which the window is silence. */
const SILENCE_RMS = 1e-4;

/** Equal-tempered frequency of a MIDI note (A4 = 69 = 440 Hz). */
export function midiToHz(midi: number): number {
	return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Signed distance from `refHz` to `hz` in cents. */
export function centsBetween(hz: number, refHz: number): number {
	return 1200 * Math.log2(hz / refHz);
}

/**
 * Estimate the fundamental of one window of samples.
 *
 * Normalised autocorrelation (McLeod's NSDF form): for each lag τ in the
 * allowed range, r(τ) = 2·Σ x[i]x[i+τ] / Σ (x[i]² + x[i+τ]²). The first lag
 * whose peak clears `MIN_CLARITY` (and is a local maximum) wins, which keeps
 * the estimate on the fundamental rather than an octave below; the peak is
 * then refined by parabolic interpolation to sub-sample precision.
 */
export function estimatePitchHz(
	samples: Float32Array,
	sampleRate: number,
	options: PitchEstimateOptions = {},
): PitchEstimate {
	const minHz = options.minHz ?? DEFAULT_MIN_HZ;
	const maxHz = options.maxHz ?? DEFAULT_MAX_HZ;
	const n = samples.length;
	const minLag = Math.max(1, Math.floor(sampleRate / maxHz));
	const maxLag = Math.min(n - 2, Math.ceil(sampleRate / minHz));
	if (maxLag <= minLag) return { hz: null, clarity: 0 };

	let energy = 0;
	for (let i = 0; i < n; i++) energy += samples[i] * samples[i];
	if (Math.sqrt(energy / n) < SILENCE_RMS) return { hz: null, clarity: 0 };

	const nsdf = new Float32Array(maxLag + 1);
	for (let lag = minLag; lag <= maxLag; lag++) {
		let acf = 0;
		let norm = 0;
		for (let i = 0; i + lag < n; i++) {
			const a = samples[i];
			const b = samples[i + lag];
			acf += a * b;
			norm += a * a + b * b;
		}
		nsdf[lag] = norm > 0 ? (2 * acf) / norm : 0;
	}

	// Walk the lags from short to long: the first clear peak is the fundamental.
	// Later peaks (multiples of the period) are at least as high but one octave down.
	let bestLag = -1;
	let bestValue = 0;
	let lag = minLag + 1;
	while (lag < maxLag) {
		if (nsdf[lag] > nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1] && nsdf[lag] >= MIN_CLARITY) {
			// Take the highest point of this peak's hump, then stop at the hump's end.
			let peakLag = lag;
			while (lag + 1 < maxLag && nsdf[lag + 1] >= nsdf[lag] * 0.98 && nsdf[lag + 1] > 0) {
				lag++;
				if (nsdf[lag] > nsdf[peakLag]) peakLag = lag;
			}
			bestLag = peakLag;
			bestValue = nsdf[peakLag];
			break;
		}
		lag++;
	}
	if (bestLag < 0) {
		// No clear peak: report the strongest correlation anyway so the caller can
		// show "unpitched" with its clarity.
		for (let l = minLag; l <= maxLag; l++) if (nsdf[l] > bestValue) bestValue = nsdf[l];
		return { hz: null, clarity: Math.max(0, bestValue) };
	}

	// Parabolic interpolation around the peak.
	const y0 = nsdf[bestLag - 1];
	const y1 = nsdf[bestLag];
	const y2 = nsdf[bestLag + 1];
	const denom = y0 - 2 * y1 + y2;
	const shift = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
	const period = bestLag + Math.max(-1, Math.min(1, shift));
	return { hz: sampleRate / period, clarity: bestValue };
}
