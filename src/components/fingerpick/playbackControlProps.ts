import type { MetronomeSubdivision } from "./useFingerpickAudioEngine";
import type { LoopGapSeconds } from "./playbackConstants";

// What the desktop panel and the mobile drawer both show, handed to them as one
// bundle so the two surfaces can never drift apart in what they control.

export interface TransportControls {
	isLoaded: boolean;
	isPlaying: boolean;
	isPaused: boolean;
	/** Off = loop the tab; on = play it once. */
	playOnce: boolean;
	setPlayOnce: (playOnce: boolean) => void;
	loopGap: LoopGapSeconds;
	onLoopGapChange: (gap: LoopGapSeconds) => void;
	onPlayPause: () => void;
	onStop: () => void;
}

export interface TempoControlsProps {
	bpm: number;
	/** The pattern's own tempo, for the reset control. */
	defaultBpm: number;
	/** Steppers, tap tempo and reset — reschedules immediately. */
	onBpmChange: (bpm: number) => void;
	/** Slider ticks — display only until the drag ends. */
	onSliderChange: (raw: number) => void;
	onSliderPointerDown: () => void;
	onSliderPointerUp: () => void;
	onTapTempo: () => void;
}

export interface MetronomeControlsProps {
	enabled: boolean;
	setEnabled: (enabled: boolean) => void;
	gain: number;
	setGain: (gain: number) => void;
	subdivision: MetronomeSubdivision;
	setSubdivision: (subdivision: MetronomeSubdivision) => void;
}

export interface NoteSoundControlsProps {
	gain: number;
	setGain: (gain: number) => void;
}

export interface PlaybackControlProps {
	transport: TransportControls;
	tempo: TempoControlsProps;
	metronome: MetronomeControlsProps;
	noteSound: NoteSoundControlsProps;
}
