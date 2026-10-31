"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import {
	ArrowDownUp,
	ArrowRight,
	ArrowUpRight,
	BookOpen,
	Grid3x3,
	Hash,
	ImageIcon,
	ListMusic,
	MessageCircle,
	Plug,
	type LucideIcon,
} from "lucide-react";
import Link from "@/components/AppLink";
import HearButton from "@/components/assistant/HearButton";
import ChordDiagramSVG from "@/components/chords/ChordDiagramSVG";
import Fretboard from "@/components/fretboard/Fretboard";
import { NeckLegend, type LegendItem } from "@/components/fretboard/parts";
import RhythmGrid, { type RhythmPosition } from "@/components/strum/stage/RhythmGrid";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ModuleBadge } from "@/components/ui/list-row";
import { Pick } from "@/components/ui/pick";
import { patternHandoff, stashHandoff } from "@/lib/assistant/handoff";
import type { AssistantProposal } from "@/lib/assistant/types";
import { voicingToDiagramShape } from "@/lib/chordVoicing";
import { chordTonesFromMidi, overlayChordTones } from "@/lib/fretboard/overlay";
import { scaleMarks, scaleRootPitchClass, type ScaleSpec } from "@/lib/fretboard/scales";
import type { FretWindow } from "@/lib/fretboard/types";
import { chordAbbreviation } from "@/lib/strumProgressions";
import {
	SONG,
	SONG_BAR_SHAPES,
	SONG_RHYTHM,
	SONG_SENTENCE,
	SONG_SHAPES,
	SONG_TAB,
	SONG_TURN,
	shapeMidi,
} from "@/lib/landing/song";
import { CapoTag, SongSource } from "./SongCard";
import { useSongPlayer, type TabSlot } from "./SongPlayer";
import { useInView, useSequence, useTicker, useTypewriter } from "./motion";
import { useAirStrum } from "./Eggs";
import { strumFromSweep } from "@/lib/landing/eggs";
import "@/components/strum/strum.css";
import "@/components/assistant/assistant.css";
import "./landing.css";
import { useNavRouter } from "@/components/nav-progress";

const SongTab = dynamic(() => import("./SongTab"), {
	ssr: false,
	loading: () => <div className="min-h-[150px]" aria-hidden="true" />,
});

type Module = "home" | "strum" | "tab" | "chords" | "fb" | "books";

/** One sixteenth at the song's tempo, in ms: the silent previews walk at the speed the song plays. */
const SIXTEENTH_MS = 60_000 / SONG.bpm / 4;

/** Hidden but holding its place, then arriving: a demo's parts appear without the card changing size. */
const arrive = (shown: boolean) => (shown ? "ld-in" : "invisible");

/** One step of the song: its copy on the left, the tool doing it on the right (stacked below 960px). */
function Step({
	n,
	module,
	icon,
	tool,
	tag,
	title,
	children,
	demo,
	link,
	broad = false,
}: {
	n: number;
	module: Module;
	icon: LucideIcon;
	tool: string;
	tag?: string;
	title: string;
	children: React.ReactNode;
	demo: React.ReactNode;
	link: { href: string; label: string; external?: boolean };
	/** The demo takes two thirds of the row — a stave wants the room for two bars a line. */
	broad?: boolean;
}) {
	const linkClass =
		"gp-focus inline-flex items-center gap-1.5 rounded-xs font-semibold text-ink underline decoration-edge underline-offset-4 transition-[text-decoration-color] duration-(--gp-d-state) hover:decoration-ink";
	return (
		<li
			data-m={module}
			className={`ld-step grid items-start gap-6 border-t border-line py-12 max-sm:py-9 min-[960px]:gap-12 ${
				broad
					? "min-[960px]:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]"
					: "min-[960px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
			}`}
		>
			<div className="flex flex-col items-start gap-3">
				<span className="flex items-center gap-2 text-(length:--gp-t-ui) font-semibold text-ink-2">
					<span className="font-num text-ink-3 tabular-nums">{n}</span>
					<ModuleBadge icon={icon} />
					{tool}
					{tag && (
						<span className="rounded-pill bg-well px-2 py-0.5 text-[11.5px] font-semibold text-ink-3">{tag}</span>
					)}
				</span>
				<h2 className="font-display text-(length:--gp-t-l) leading-(--gp-lh-head) font-bold text-balance text-ink min-[960px]:text-(length:--gp-t-l-lg)">
					{title}
				</h2>
				<div className="max-w-[46ch] text-(length:--gp-t-body) leading-(--gp-lh-body) text-ink-2">{children}</div>
				{link.external ? (
					<a href={link.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
						{link.label}
						<ArrowRight className="size-4" aria-hidden />
					</a>
				) : (
					<Link href={link.href} className={linkClass}>
						{link.label}
						<ArrowRight className="size-4" aria-hidden />
					</Link>
				)}
			</div>
			<div className="min-w-0 rounded-lg bg-card p-5 max-sm:p-4">{demo}</div>
		</li>
	);
}

/** A line under a previewing demo: what is moving is a walk-through, the sound is one press away. */
function PreviewNote({ on }: { on: boolean }) {
	return (
		<p className={`text-(length:--gp-t-cap) text-ink-3 transition-opacity duration-(--gp-d-state) ${on ? "" : "opacity-0"}`}>
			A silent walk-through — press play on the song to hear it.
		</p>
	);
}

/* ---- 1 · Say it: the sentence is typed, then read ---------------------- */

/**
 * The assistant's proposal card as the panel draws it (`ProposalPreview`), but
 * played by the page's one player: Hear it strums the song, so the card's grid
 * and chord line follow the same bar as every other step, and no second engine
 * or chord lookup is started for a demo.
 */
function SongProposalCard({ proposal, shown }: { proposal: AssistantProposal; shown: boolean }) {
	const router = useNavRouter();
	const { mode, playing, preparing, toggle, playAs, bar, rhythmPosition } = useSongPlayer();
	const strumming = playing && mode === "strum";
	return (
		// Unseen until it arrives, which also keeps its buttons out of the tab order.
		<div className={`as-card ${shown ? "" : "invisible"}`} data-m="strum">
			<div className="as-card-h">
				<span className="as-card-t">{proposal.name}</span>
				<span className="as-card-meta">
					{proposal.capo !== null && <span>capo {proposal.capo}</span>}
					{proposal.bpm !== null && <span>{proposal.bpm} BPM</span>}
				</span>
			</div>
			<div className="as-card-b">
				<div className="as-chordline">
					{proposal.chords.map((chord, i) => (
						<span key={i} data-on={strumming && bar === i ? "" : undefined}>
							{chordAbbreviation(chord)}
						</span>
					))}
				</div>
				<div className="as-rhythm">
					<RhythmGrid rhythm={SONG_RHYTHM} meter={SONG.meter} position={strumming ? rhythmPosition : null} />
				</div>
			</div>
			<div className="as-card-f">
				<HearButton
					playing={strumming}
					preparing={strumming && preparing}
					onClick={() => (strumming ? toggle() : playAs("strum"))}
				/>
				<Button
					size="sm"
					onClick={() => {
						stashHandoff(patternHandoff(proposal));
						router.push("/strum");
					}}
				>
					Open in Strum
					<ArrowUpRight aria-hidden />
				</Button>
			</div>
		</div>
	);
}

function SayIt() {
	const ref = useRef<HTMLDivElement>(null);
	const inView = useInView(ref);
	const typed = useTypewriter(SONG_SENTENCE, inView);
	const done = typed >= SONG_SENTENCE.length;
	// After the last key: the assistant thinks, answers, then its card arrives.
	const phase = useSequence(done, [350, 700, 450]);
	const proposal = SONG_TURN.proposal;
	// The panel's pieces blow up as they mount, so each one mounts again as it
	// arrives; until then it holds its place unseen and the card keeps its size.
	return (
		<div ref={ref} className="flex flex-col gap-3.5">
			<p className="as-you relative">
				{/* The whole sentence holds the bubble's size; the typed part is drawn over it. */}
				<span className="invisible" aria-hidden>
					{SONG_SENTENCE}
				</span>
				<span className={`absolute inset-x-[13px] top-[9px] ${done ? "" : "ld-caret"}`} aria-hidden>
					{SONG_SENTENCE.slice(0, typed)}
				</span>
				<span className="sr-only">{SONG_SENTENCE}</span>
			</p>
			<div className="as-reply" data-m="strum">
				<div className="as-row">
					<Pick className={`as-who ${phase >= 1 ? "" : "invisible"}`} />
					<div className="as-stack">
						<div className="grid w-full justify-items-start">
							<div key={`typing-${phase === 1}`} className={`as-bub col-start-1 row-start-1 self-start ${phase === 1 ? "" : "invisible"}`}>
								<span className="as-typing" aria-label="Writing a reply">
									<i />
									<i />
									<i />
								</span>
							</div>
							<div
								key={`said-${phase >= 2}`}
								className={`as-bub col-start-1 row-start-1 ${phase >= 2 ? "" : "invisible"}`}
								data-pos={proposal ? "top" : undefined}
							>
								{SONG_TURN.text}
							</div>
						</div>
						{proposal && <SongProposalCard key={`card-${phase >= 3}`} proposal={proposal} shown={phase >= 3} />}
					</div>
				</div>
			</div>
		</div>
	);
}

/* ---- 2 · The shapes: each one plucked in turn -------------------------- */

function Shapes() {
	const ref = useRef<HTMLDivElement>(null);
	const inView = useInView(ref);
	const { bar, playing } = useSongPlayer();
	const tick = useTicker(inView && !playing, 1500);
	const now = bar !== null ? SONG_BAR_SHAPES[bar] : inView ? tick % SONG_SHAPES.length : null;
	// A new run each time the lifted shape changes, so its strings are plucked again.
	const run = bar !== null ? bar : tick;
	return (
		<div ref={ref} className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
				<CapoTag />
				<SongSource />
			</div>
			{/* The Chords board's cards (hub.css): the name, what it sounds behind the capo, the
			    shape; the one sounding wears the module's ring. */}
			<ul className="grid grid-cols-4 gap-3 max-sm:grid-cols-2">
				{SONG_SHAPES.map((s, i) => (
					<li
						key={s.name}
						aria-current={now === i ? "true" : undefined}
						className={`flex flex-col items-center gap-1 rounded-md bg-page px-1.5 pt-3 pb-2 transition-shadow duration-(--gp-d-state) ease-linear ${
							now === i ? "shadow-[0_0_0_2px_var(--gp-m-500)]" : ""
						}`}
					>
						<span className="text-[24px] font-extrabold tracking-[-0.02em] text-ink">{s.name}</span>
						<span className="-mt-1 text-[12px] leading-3.75 font-[650] text-m-700">sounds {s.sounds}</span>
						<ChordDiagramSVG
							{...voicingToDiagramShape(s.voicing)}
							size="compact"
							pluck={now === i ? { run, gapS: 0.05 } : null}
						/>
					</li>
				))}
			</ul>
		</div>
	);
}

/* ---- 3 · The neck: the chords take turns over the scale ---------------- */

const KEY: ScaleSpec = { root: "C", scale: "major" };
const NECK: FretWindow = { fromFret: 0, toFret: 12 };
const SCALE = scaleMarks(KEY, NECK, "note");
/** The Fretboard page's key in Chords mode, with the scale the chord sits on. */
const NECK_LEGEND: readonly LegendItem[] = [
	{ emphasis: "root", label: "Root" },
	{ emphasis: "chordTone", tone: "third", label: "3rd" },
	{ emphasis: "chordTone", tone: "fifth", label: "5th" },
	{ emphasis: "chordTone", tone: "seventh", label: "7th" },
	{ emphasis: "scaleTone", label: "Scale tone" },
];

function Neck() {
	const ref = useRef<HTMLDivElement>(null);
	const inView = useInView(ref);
	const { bar, playing } = useSongPlayer();
	// Until a chip is pressed the chords take turns; a press holds the one chosen.
	const [chosen, setChosen] = useState<number | null>(null);
	const tick = useTicker(inView && !playing && chosen === null, 2000);
	const shown = bar !== null ? SONG_BAR_SHAPES[bar] : (chosen ?? tick % SONG_SHAPES.length);
	const marks = useMemo(
		() =>
			overlayChordTones(
				SCALE,
				chordTonesFromMidi(shapeMidi(SONG_SHAPES[shown].voicing), scaleRootPitchClass(SONG_SHAPES[shown].chord.root)),
				KEY,
				NECK,
				"note",
			),
		[shown],
	);
	return (
		<div ref={ref} className="flex flex-col gap-3">
			<p className="text-(length:--gp-t-cap) text-ink-3">
				Frets counted from the capo · C major, {SONG_SHAPES[shown].name} on top
			</p>
			<div>
				<div className="overflow-x-auto">
					<div className="min-w-[560px]">
						<Fretboard
							marks={marks}
							fromFret={NECK.fromFret}
							toFret={NECK.toFret}
							pressable={false}
							label={`C major with ${SONG_SHAPES[shown].name} on the neck`}
						/>
					</div>
				</div>
				<NeckLegend items={NECK_LEGEND} />
			</div>
			<div className="flex flex-wrap gap-2" role="group" aria-label="Song chords">
				{SONG_SHAPES.map((s, i) => (
					<Chip key={s.name} pressed={shown === i} onPressedChange={() => setChosen(i)}>
						{s.name} <span className="font-normal opacity-70">{s.numeral}</span>
					</Chip>
				))}
			</div>
		</div>
	);
}

/* ---- 4 · Strum: the grid walks at the song's tempo --------------------- */

const BEAT_CELLS = SONG_RHYTHM[0][0].length;
const STRUM_CELLS = SONG_RHYTHM[0].length * BEAT_CELLS;

/** A sweep older than this starts again from where the pointer is. */
const SWEEP_STALE_MS = 150;

function StrumIt() {
	const ref = useRef<HTMLDivElement>(null);
	const inView = useInView(ref);
	const { rhythmPosition, playing, mode, bar } = useSongPlayer();
	const previewing = inView && !(playing && mode === "strum");
	const cell = useTicker(previewing, SIXTEENTH_MS) % STRUM_CELLS;
	const preview: RhythmPosition = { bar: 0, beat: Math.floor(cell / BEAT_CELLS), cell: cell % BEAT_CELLS };

	// Easter egg: sweep fast down or up across the grid and it strums — the
	// chord sounding (C while the song is stopped), behind the capo.
	const airStrum = useAirStrum();
	const sweep = useRef<{ y: number; t: number } | null>(null);
	function onPointerMove(e: React.PointerEvent) {
		const from = sweep.current;
		if (!from || e.timeStamp - from.t > SWEEP_STALE_MS) {
			sweep.current = { y: e.clientY, t: e.timeStamp };
			return;
		}
		const direction = strumFromSweep(e.clientY - from.y, e.timeStamp - from.t);
		if (!direction) return;
		sweep.current = { y: e.clientY, t: e.timeStamp };
		const shape = SONG_SHAPES[bar === null ? 0 : SONG_BAR_SHAPES[bar]];
		airStrum(direction, shapeMidi(shape.voicing).map((m) => m + SONG.capo));
	}

	return (
		<div ref={ref} className="flex flex-col gap-3">
			<div
				className="st-contain touch-pan-x"
				data-m="strum"
				onPointerMove={onPointerMove}
				onPointerLeave={() => {
					sweep.current = null;
				}}
			>
				{/* the grid zone carries the cell sizes RhythmGrid measures with */}
				<div className="st-gridzone">
					<RhythmGrid rhythm={SONG_RHYTHM} meter={SONG.meter} position={previewing ? preview : rhythmPosition} />
				</div>
			</div>
			<PreviewNote on={previewing} />
		</div>
	);
}

/* ---- 5 · Pick: the cursor walks the stave ------------------------------ */

const TAB_SLOTS: readonly TabSlot[] = SONG_TAB.measures.flatMap((m, measureIndex) =>
	m.slots.map((_, slotIndex) => ({ measureIndex, slotIndex })),
);

function PickIt() {
	const ref = useRef<HTMLDivElement>(null);
	const inView = useInView(ref, 0.2);
	const { tabSlot, playing, mode } = useSongPlayer();
	const previewing = inView && !(playing && mode === "pick");
	const tick = useTicker(previewing, SIXTEENTH_MS);
	return (
		<div ref={ref} className="flex flex-col items-start gap-3">
			<CapoTag />
			<SongTab pattern={SONG_TAB} slot={previewing ? TAB_SLOTS[tick % TAB_SLOTS.length] : tabSlot} preview={previewing} />
			<PreviewNote on={previewing} />
		</div>
	);
}

/* ---- 6 · Books: a page is read, an exercise comes out ------------------ */

/** The sample book's page-3 exercise, cut by its parse (`lib/books/sample/sanyuetong.json`). */
const BOOK_CROP = "/samples/sanyuetong/p0003-1.png";

function FromBook() {
	const ref = useRef<HTMLDivElement>(null);
	const inView = useInView(ref);
	const phase = useSequence(inView, [150, 1200, 500]);
	return (
		<div ref={ref} className="flex flex-col gap-4">
			<div className={`w-full max-w-90 rounded-md bg-white ${phase >= 1 ? "ld-scan" : ""}`}>
				{/* eslint-disable-next-line @next/next/no-img-element -- a static sample crop, shown at its own size */}
				<img src={BOOK_CROP} alt="An exercise cropped from page 3 of the sample book" className="w-full" />
			</div>
			<div className="grid min-w-0">
				<span
					className={`ld-dots col-start-1 row-start-1 self-center text-(length:--gp-t-cap) text-ink-3 ${
						phase === 1 || phase === 2 ? "" : "invisible"
					}`}
					aria-hidden
				>
					Reading page 3
					<i />
					<i />
					<i />
				</span>
				{/* The chapter card's draft row (Books, DraftRow): the crop, the name, the page and the facts. */}
				<div
					className={`col-start-1 row-start-1 flex items-center gap-3.5 rounded-md bg-card p-2 shadow-(--gp-ring-c) max-sm:gap-2.5 ${arrive(phase >= 3)}`}
				>
					<span className="h-11.5 w-37.5 flex-none overflow-hidden rounded-sm bg-white shadow-(--gp-ring-c) max-sm:h-10 max-sm:w-24">
						{/* eslint-disable-next-line @next/next/no-img-element -- the same static crop, as the row's thumbnail */}
						<img src={BOOK_CROP} alt="" className="size-full object-cover object-[0_50%]" />
					</span>
					<span className="flex min-w-0 flex-col gap-0.75">
						<b className="truncate text-(length:--gp-t-row) font-[650] text-ink">⑤弦:A-B-C</b>
						<span className="flex flex-wrap items-center gap-x-1.5 text-(length:--gp-t-cap) font-medium text-ink-3 tabular-nums">
							<span className="inline-flex h-6 items-center rounded-xs bg-s2 px-1.75 text-[12.5px] font-semibold text-ink-2">
								p.3
							</span>
							Tab · 4 bars · ♩=120
						</span>
					</span>
				</div>
			</div>
		</div>
	);
}

/* ---- 7 · Your AI chat: a photo in, a playable tab out ------------------ */

function InYourChat() {
	const ref = useRef<HTMLDivElement>(null);
	const inView = useInView(ref);
	const phase = useSequence(inView, [200, 700, 1300]);
	return (
		<div
			ref={ref}
			className="flex flex-col gap-3"
			role="img"
			aria-label="An example AI chat: a photo of a riff's tab goes in, Guitar Pal reads it and hands back a link that plays it"
		>
			<span className="flex items-center gap-1.5 text-(length:--gp-t-cap) text-ink-3">
				<MessageCircle className="size-3.5" aria-hidden />
				Your AI chat
			</span>
			<div
				className={`flex max-w-[85%] flex-col gap-2 self-end rounded-lg rounded-br-xs bg-ink p-2.5 text-on-ink ${arrive(phase >= 1)}`}
			>
				<span className="flex items-center gap-2 rounded-sm bg-white/12 px-2.5 py-2 text-(length:--gp-t-cap)">
					<ImageIcon className="size-4" aria-hidden />
					riff-from-the-video.jpg
				</span>
				<span className="px-1 text-(length:--gp-t-ui)">turn this riff into something I can practise</span>
			</div>
			<div className="flex max-w-[90%] flex-col gap-2.5">
				<span
					className={`inline-flex items-center gap-1.5 self-start rounded-pill bg-well px-2.5 py-1 text-(length:--gp-t-cap) text-ink-2 ${arrive(phase >= 2)}`}
				>
					<Plug className="size-3.5" aria-hidden />
					Guitar Pal · <code className="font-num">import_tab</code>
					<span className={`ld-dots ${phase === 2 ? "" : "hidden"}`} aria-hidden>
						<i />
						<i />
						<i />
					</span>
				</span>
				<span className={`text-(length:--gp-t-ui) text-ink-2 ${arrive(phase >= 3)}`}>
					Read it: four bars, capo 2. Here it is, ready to play:
				</span>
				<span className={`flex items-center gap-3 rounded-md bg-well p-3 ${arrive(phase >= 3)}`}>
					<ListMusic className="size-5 flex-none text-ink-3" aria-hidden />
					<span className="flex min-w-0 flex-col">
						<span className="truncate font-semibold text-ink">Your riff — open in Guitar Pal</span>
						<span className="text-(length:--gp-t-cap) text-ink-3">Plays without an account · import it to keep it</span>
					</span>
				</span>
			</div>
		</div>
	);
}

/** Steps one to seven: the song from a sentence to the player's hands, then the other ways in. */
export default function SongSteps() {
	return (
		<ol>
			<Step
				n={1}
				module="home"
				icon={MessageCircle}
				tool="Assistant"
				title="Say it."
				demo={<SayIt />}
				link={{ href: "/docs/assistant-grammar", label: "What the assistant reads" }}
			>
				Type the song the way you would text a friend. The assistant reads the chords, the strokes, the tempo and the
				capo, and sets the song up in Strum.
			</Step>
			<Step
				n={2}
				module="chords"
				icon={Grid3x3}
				tool="Chords"
				title="Learn the four shapes."
				demo={<Shapes />}
				link={{ href: "/chords", label: "Open Chords" }}
			>
				C, Am7, Dm7 and G — all open shapes. With the capo on 2 they sound as D, Bm7, Em7 and A. The shape playing is the
				one outlined.
			</Step>
			<Step
				n={3}
				module="fb"
				icon={Hash}
				tool="Fretboard"
				title="See why they fit."
				demo={<Neck />}
				link={{ href: "/fretboard", label: "Open Fretboard" }}
			>
				Count frets from the capo and the song is in C major: C, Am7, Dm7 and G are its I, vi, ii and V, so every chord
				tone sits inside the scale. The capo lifts the whole thing a whole step, into D.
			</Step>
			<Step
				n={4}
				module="strum"
				icon={ArrowDownUp}
				tool="Strum"
				title="Strum it."
				demo={<StrumIt />}
				link={{ href: "/strum", label: "Open Strum" }}
			>
				The <i>birds of a feather</i> pattern: sixteenth notes, the same rhythm under every chord. Play the song strummed
				and the grid follows.
			</Step>
			<Step
				n={5}
				module="tab"
				icon={ListMusic}
				tool="Tab"
				title="Then pick it."
				demo={<PickIt />}
				link={{ href: "/fingerpick", label: "Open Tab" }}
				broad
			>
				Guitar Pal&apos;s own arrangement, a bar for each chord above: thumb on the bass, fingers on the top strings.
				Switch the player to Pick and the cursor follows the note that is sounding.
			</Step>
			<Step
				n={6}
				module="books"
				icon={BookOpen}
				tool="Books"
				tag="Preview"
				title="Or start from your book."
				demo={<FromBook />}
				link={{ href: "/books/sample", label: "Open the sample book" }}
			>
				Learning from a method book? Upload the PDF, and its exercises come back as patterns you can play beside the page.
			</Step>
			<Step
				n={7}
				module="home"
				icon={Plug}
				tool="In your AI chat"
				title="Every riff you find, ready to play."
				demo={<InYourChat />}
				link={{
					href: "https://github.com/SloanWan/guitar-pal/blob/main/docs/mcp.md",
					label: "How to connect",
					external: true,
				}}
			>
				Heard a riff you want to learn? Snap its tab or describe it in the AI app you already use, with Guitar Pal added
				as a connector. Guitar Pal checks what the AI read and turns it into a tab that plays. Import the ones you like
				and they wait in one place, ready whenever you want to practise or come back to them. Works in AI apps that
				support MCP connectors.
			</Step>
		</ol>
	);
}
