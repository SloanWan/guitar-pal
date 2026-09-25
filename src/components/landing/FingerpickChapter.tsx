"use client";

import dynamic from "next/dynamic";
import { Pause, Play, Square } from "lucide-react";
import { STRUM_BPM_MAX, STRUM_BPM_MIN } from "@/lib/strumPatterns";
import { fingerpickStage } from "@/lib/landing/fingerpickStage";
import Chapter, { type ChapterCaption } from "./Chapter";
import { BpmReadout, MODULE_LABEL, Pill, UNIT_LABEL } from "./landingUi";

/* VexFlow is a large dependency the rest of the landing never needs; the
   stave arrives once the visitor has the page. Its box keeps the frame's
   height meanwhile. */
const FingerpickDemo = dynamic(() => import("./FingerpickDemo"), {
	ssr: false,
	loading: () => <div className="min-h-[150px]" aria-hidden="true" />,
});

const CAPTIONS: readonly ChapterCaption[] = [
	{
		lead: "Real TAB, note by note.",
		text: "Hammer-ons, pull-offs, slides, bends, harmonics — twenty-one techniques drawn on the stave the way a book prints them.",
	},
	{
		lead: "Follow the cursor.",
		text: "Click any note to seek. The chord line above tells you which shape your hand is holding, capo included.",
	},
	{
		lead: "Loop the hard bar.",
		text: "Select a measure, slow it to 60, tap the tempo back up when it sticks. Undo anything.",
	},
];

const FADER_SCALE = ["40", "SLOW", "FOLK", "POP", "ROCK", "220"];

function TransportButton({ on = false, children }: { on?: boolean; children: React.ReactNode }) {
	return (
		<span
			aria-hidden="true"
			className={`flex size-11 items-center justify-center border transition-colors duration-150 ${
				on ? "border-denim bg-denim text-on-denim" : "border-line-strong text-ink-dim"
			}`}
		>
			{children}
		</span>
	);
}

export default function FingerpickChapter({ index }: { index: number }) {
	return (
		<Chapter
			index={index}
			name="Fingerpick Studio"
			title="TAB that plays itself."
			captions={CAPTIONS}
			cta={{ href: "/fingerpick", label: "Open Fingerpick →" }}
			frame={{ title: "Travis picking", meta: "Am · C" }}
			position={(p) => fingerpickStage(p).position}
		>
			{(p) => {
				const s = fingerpickStage(p);
				const fill = `${(((s.bpm - STRUM_BPM_MIN) / (STRUM_BPM_MAX - STRUM_BPM_MIN)) * 100).toFixed(1)}%`;
				return (
					<>
						<FingerpickDemo stage={s} />
						<div className="mt-4 flex flex-wrap items-end gap-6">
							<div className="flex gap-2">
								<TransportButton on={s.cursor !== null}>
									{s.cursor ? <Pause className="size-3.5" strokeWidth={1.5} /> : <Play className="size-3.5" strokeWidth={1.5} />}
								</TransportButton>
								<TransportButton>
									<Square className="size-3" strokeWidth={1.5} />
								</TransportButton>
								<Pill on={s.loop}>Loop</Pill>
							</div>
							<div className="min-w-[160px] flex-1">
								<div className="flex items-baseline gap-3">
									<span className={MODULE_LABEL}>Tempo</span>
									<BpmReadout bpm={s.bpm} size="sm" />
									<span className={UNIT_LABEL}>BPM</span>
								</div>
								{/* The rack's fader, at rest: the fill and thumb follow the readout. */}
								<div className="relative mt-2.5 h-[3px] bg-line-strong" aria-hidden="true">
									<span
										className="absolute inset-y-0 left-0 bg-denim transition-[width] duration-150 ease-out"
										style={{ width: fill }}
									/>
									<span
										className="absolute top-1/2 h-[18px] w-2.5 -translate-x-1/2 -translate-y-1/2 bg-ink transition-[left] duration-150 ease-out"
										style={{ left: fill }}
									/>
								</div>
								<div className="mt-2 flex justify-between font-mono text-[8px] tracking-[0.08em] text-ink-faint">
									{FADER_SCALE.map((t) => (
										<span key={t}>{t}</span>
									))}
								</div>
							</div>
						</div>
					</>
				);
			}}
		</Chapter>
	);
}
