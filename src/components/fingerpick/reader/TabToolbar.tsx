"use client";

import { useState } from "react";
import { Brackets, ChevronDown, ChevronsDown, ListMusic, Settings2 } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import CapoStepper from "@/components/playback/CapoStepper";
import type { PitchLabelStyle } from "@/lib/fingerpickPitch";
import {
	CHORD_SHAPE_WIDTH_MAX,
	CHORD_SHAPE_WIDTH_MIN,
	SCROLL_SPEED_MAX,
	SCROLL_SPEED_MIN,
	type ChordLineView,
	type FingerpickPrefs,
} from "@/components/fingerpick/useFingerpickPrefs";

const CHORD_OPTIONS: { value: ChordLineView; label: string }[] = [
	{ value: "name", label: "Names" },
	{ value: "diagram", label: "Shapes" },
];

type PitchChoice = "off" | PitchLabelStyle;
const PITCH_OPTIONS: { value: PitchChoice; label: string }[] = [
	{ value: "off", label: "Off" },
	{ value: "name", label: "Name" },
	{ value: "scientific", label: "E4" },
	{ value: "solfege", label: "do re mi" },
	{ value: "jianpu", label: "1 2 3" },
];

interface Props {
	/** Opens the library on a phone, where the toolbar holds its button. Absent on a share page. */
	onOpenLibrary?: () => void;
	/** The tab names chords at all: the chord line's view is a question only then. */
	hasChords: boolean;
	prefs: FingerpickPrefs;
	/** On a phone the capo leaves the title row for the toolbar. */
	capo: number;
	onCapo: (fret: number) => void;
	sectionMode: boolean;
	/** What the next click on the tab picks, or the section picked; null outside section mode. */
	sectionHint: string | null;
	onSectionMode: () => void;
	/**
	 * Always available: switched on with nothing to scroll yet, it starts creeping once the
	 * tab grows past the window (pitch labels, shapes, a narrower window).
	 */
	autoScroll: { on: boolean; toggle: () => void };
}

/**
 * How the tab reads, in one bar that stays at the top while the tab scrolls: the
 * chord line, the pitch under each fret, a section to practise, auto-scroll, and the
 * view's finer settings at the end, in a popover flush with the bar's right edge. Too
 * narrow for one row (below 820px), the chord line and pitch go into a View sheet with
 * those settings; on a phone the capo comes down from the title row too.
 */
export default function TabToolbar({
	onOpenLibrary,
	hasChords,
	prefs,
	capo,
	onCapo,
	sectionMode,
	sectionHint,
	onSectionMode,
	autoScroll,
}: Props) {
	const [sheetOpen, setSheetOpen] = useState(false);
	return (
		<Popover>
			<PopoverAnchor asChild>
				<div className="tb-tool" role="toolbar" aria-label="Tab tools">
					{onOpenLibrary && (
						<button
							type="button"
							className="pb-icon tb-phone"
							onClick={onOpenLibrary}
							aria-label="Open the tab list"
							title="Open the tab list"
						>
							<ListMusic aria-hidden />
						</button>
					)}
					<span className="tb-seglab tb-wide">
						<span className="pb-lab">Chords</span>
						<ChordLine hasChords={hasChords} prefs={prefs} />
					</span>
					<span className="tb-seglab tb-wide">
						<span className="pb-lab">Pitch</span>
						<PitchLine prefs={prefs} />
					</span>
					<Chip className="tb-viewchip" onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
						View
						<ChevronDown aria-hidden />
					</Chip>
					{/* The spare width says what section mode wants next, so nothing moves when it turns on. */}
					<span className="tb-grow pb-lab" role="status">
						{sectionHint}
					</span>
					<CapoStepper capo={capo} onCapo={onCapo} className="tb-phone" />
					<button
						type="button"
						className="pb-icon"
						aria-pressed={sectionMode}
						aria-label={sectionMode ? "Leave section mode" : "Select a section to practise"}
						title={sectionMode ? "Leave section mode (Esc)" : "Select a section to practise"}
						onClick={onSectionMode}
					>
						<Brackets aria-hidden />
					</button>
					<button
						type="button"
						className="pb-icon"
						aria-pressed={autoScroll.on}
						aria-label={autoScroll.on ? "Stop auto-scroll" : "Start auto-scroll"}
						title="Auto-scroll the tab"
						onClick={autoScroll.toggle}
					>
						<ChevronsDown aria-hidden />
					</button>
					<PopoverTrigger asChild>
						<button type="button" className="pb-icon tb-wide" aria-label="View settings" title="View settings">
							<Settings2 aria-hidden />
						</button>
					</PopoverTrigger>
				</div>
			</PopoverAnchor>
			<PopoverContent aria-label="View settings" className="tb-view w-80" data-m="tab" align="end">
				<ViewSettings hasChords={hasChords} prefs={prefs} />
			</PopoverContent>
			<Sheet open={sheetOpen} onOpenChange={setSheetOpen} title="View">
				<div className="tb-view" data-m="tab">
					<div className="tb-view-row">
						<span className="tb-view-name">Chords</span>
						<ChordLine hasChords={hasChords} prefs={prefs} />
					</div>
					<div className="tb-view-row">
						<span className="tb-view-name">Pitch</span>
						<PitchLine prefs={prefs} />
					</div>
					<ViewSettings hasChords={hasChords} prefs={prefs} />
				</div>
			</Sheet>
		</Popover>
	);
}

function ChordLine({ hasChords, prefs }: { hasChords: boolean; prefs: FingerpickPrefs }) {
	return (
		<Segmented
			options={CHORD_OPTIONS}
			value={prefs.chordView}
			onChange={prefs.setChordView}
			label="Chord line"
			dense
			disabled={!hasChords}
		/>
	);
}

function PitchLine({ prefs }: { prefs: FingerpickPrefs }) {
	return (
		<Segmented
			options={PITCH_OPTIONS}
			value={prefs.pitchLabelsOn ? prefs.pitchLabelStyle : "off"}
			onChange={(choice) => {
				prefs.setPitchLabelsOn(choice !== "off");
				if (choice !== "off") prefs.setPitchLabelStyle(choice);
			}}
			label="Pitch under each fret"
			dense
		/>
	);
}

/**
 * The chord shapes' options and the auto-scroll speed. The shapes' options answer only
 * while the chord line shows shapes: until then they are greyed, and the heading says
 * why and offers to turn shapes on.
 */
function ViewSettings({ hasChords, prefs }: { hasChords: boolean; prefs: FingerpickPrefs }) {
	const shapes = hasChords && prefs.chordView === "diagram";
	return (
		<>
			<div className="tb-view-head">
				<span className="pb-lab">Chord shapes</span>
				{!shapes &&
					(hasChords ? (
						<button type="button" className="tb-view-on" onClick={() => prefs.setChordView("diagram")}>
							Show shapes
						</button>
					) : (
						<span className="pb-lab">This tab names no chords</span>
					))}
			</div>
			<div className="tb-view-group" data-off={shapes ? undefined : ""}>
				<Switch
					label="Tones beside each shape"
					checked={prefs.chordTonesOn}
					onCheckedChange={prefs.setChordTonesOn}
					disabled={!shapes}
				/>
				<Switch
					label="Colour frets outside the shape"
					checked={prefs.offShapeOn}
					onCheckedChange={prefs.setOffShapeOn}
					disabled={!shapes}
				/>
				<div className="tb-view-row">
					<span className="tb-view-name">Size</span>
					<Slider
						value={prefs.chordShapeWidth}
						onChange={prefs.setChordShapeWidth}
						label="Chord shape size"
						min={CHORD_SHAPE_WIDTH_MIN}
						max={CHORD_SHAPE_WIDTH_MAX}
						step={4}
						disabled={!shapes}
					/>
				</div>
			</div>
			<span className="pb-lab tb-view-gap">Auto-scroll</span>
			<div className="tb-view-row">
				<span className="tb-view-name">Speed</span>
				<Slider
					value={prefs.scrollSpeed}
					onChange={prefs.setScrollSpeed}
					label="Auto-scroll speed"
					min={SCROLL_SPEED_MIN}
					max={SCROLL_SPEED_MAX}
					step={2}
					valueText={(v) => `${v} pixels a second`}
				/>
			</div>
		</>
	);
}
