/**
 * Speed up each pass (#386): while looping, every pass plays a little faster than
 * the one before, from a share of the tempo up to the tempo itself, then holds.
 */

/** How much faster each pass gets, in percent of the tempo. */
export const SPEED_STEPS = [2, 5, 10] as const;
/** Where the first pass may start, in percent of the tempo. */
export const SPEED_START_MIN = 50;
export const SPEED_START_MAX = 95;
export const SPEED_START_STEP = 5;

export interface SpeedTrainer {
	/** The first pass's share of the tempo, in percent. */
	start: number;
	/** What each pass adds, in percent of the tempo. */
	step: number;
}

export const DEFAULT_SPEED_TRAINER: SpeedTrainer = { start: 70, step: 5 };

/** The share of the tempo a pass plays at; `pass` counts from 0, the first pass of the run. */
export function trainerPercent(pass: number, trainer: SpeedTrainer): number {
	return Math.min(100, trainer.start + trainer.step * Math.max(0, pass));
}

/** A share of a tempo, as the whole beats a metronome can play. */
export function trainerBpm(bpm: number, percent: number): number {
	return Math.round((bpm * percent) / 100);
}

/** Where the run is, for the line under the tray's Speed up row. */
export function speedUpLine(
	bpm: number,
	trainer: SpeedTrainer,
	state: { loop: boolean; on: boolean; progress: { pass: number; percent: number } | null },
): string {
	if (!state.loop) return "Needs Loop: a pass has to come round again to speed up.";
	if (!state.on) return `Off — every pass at ${bpm} BPM.`;
	if (state.progress) {
		const { pass, percent } = state.progress;
		return `Pass ${pass + 1} · ${trainerBpm(bpm, percent)} of ${bpm} BPM${percent >= 100 ? " — at tempo" : ""}`;
	}
	return `Starts at ${trainerBpm(bpm, trainer.start)} BPM, +${trainer.step}% a pass, holds at ${bpm}.`;
}
