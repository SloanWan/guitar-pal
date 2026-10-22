"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Copy, Plus, Save, Trash2 } from "lucide-react";
import { Button, PlayPick, type ButtonVariant } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { Stepper } from "@/components/ui/stepper";
import type { ModuleKey } from "@/lib/moduleForPath";

// Every Candy primitive (#353) in every variant and state, under a chosen module and
// theme. The smoke suite (e2e/smoke/primitives.spec.ts) presses things here.

const MODULES: readonly { value: ModuleKey; label: string }[] = [
	{ value: "home", label: "Home" },
	{ value: "strum", label: "Strum" },
	{ value: "tab", label: "Tab" },
	{ value: "chords", label: "Chords" },
	{ value: "fb", label: "Fretboard" },
	{ value: "books", label: "Books" },
];
const THEMES = [
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
] as const;

const BUTTONS: readonly { variant: ButtonVariant; label: string; icon?: ReactNode }[] = [
	{ variant: "primary", label: "Save", icon: <Save aria-hidden /> },
	{ variant: "secondary", label: "Duplicate", icon: <Copy aria-hidden /> },
	{ variant: "ink", label: "Continue" },
	{ variant: "danger", label: "Delete", icon: <Trash2 aria-hidden /> },
	{ variant: "ghost", label: "Cancel" },
];
const STATES = ["Rest", "Disabled", "Loading"] as const;

export default function PrimitivesPage() {
	const [module, setModule] = useState<ModuleKey>("strum");
	const [theme, setTheme] = useState<"light" | "dark">("light");
	const [playing, setPlaying] = useState(false);
	const [chips, setChips] = useState({ down: true, up: false, mute: false });
	const [mode, setMode] = useState("loop");
	const [sub, setSub] = useState("8");
	const [metronome, setMetronome] = useState(false);
	const [countIn, setCountIn] = useState(true);
	const [bpm, setBpm] = useState(96);
	const [capo, setCapo] = useState(0);

	// The theme is the document's; put back whatever was there on the way out.
	useEffect(() => {
		const root = document.documentElement;
		const before = root.dataset.theme;
		root.dataset.theme = theme;
		return () => {
			if (before) root.dataset.theme = before;
		};
	}, [theme]);

	return (
		<div data-m={module} className="min-h-screen bg-gp-page px-4 py-8 font-gp-body text-gp-ink sm:px-8">
			<div className="mx-auto flex max-w-240 flex-col gap-10">
				<header className="flex flex-col gap-4">
					<h1 className="font-gp-display text-[28px] font-bold tracking-[-0.01em]">Primitives</h1>
					<div className="flex flex-wrap gap-3">
						<Segmented label="Module" options={MODULES} value={module} onChange={setModule} dense />
						<Segmented label="Theme" options={THEMES} value={theme} onChange={setTheme} dense />
					</div>
				</header>

				<Section title="Button">
					<div className="flex flex-col gap-4">
						{STATES.map((state) => (
							<div key={state} role="group" aria-label={state} className="flex flex-wrap items-center gap-4">
								<span className="w-20 text-[13px] font-semibold text-gp-ink-3">{state}</span>
								{BUTTONS.map((b) => (
									<Button key={b.variant} variant={b.variant} disabled={state === "Disabled"} loading={state === "Loading"}>
										{b.icon}
										{b.label}
									</Button>
								))}
								<Button variant="icon" aria-label="Add" disabled={state === "Disabled"}>
									<Plus aria-hidden />
								</Button>
							</div>
						))}
						<div role="group" aria-label="Sizes" className="flex flex-wrap items-center gap-4">
							<span className="w-20 text-[13px] font-semibold text-gp-ink-3">Sizes</span>
							<Button>Medium</Button>
							<Button size="sm">Small</Button>
							<Button size="xs">Extra small</Button>
							<Button variant="secondary" size="sm">Small</Button>
							<Button variant="secondary" size="xs">Extra small</Button>
						</div>
					</div>
				</Section>

				<Section title="Play pick">
					<div className="flex items-end gap-6">
						<PlayPick playing={playing} onClick={() => setPlaying((p) => !p)} />
						<PlayPick playing={playing} size="sm" aria-label="Play (small)" onClick={() => setPlaying((p) => !p)} />
						<PlayPick playing={false} disabled aria-label="Play (disabled)" />
					</div>
				</Section>

				<Section title="Chip">
					<div className="flex flex-wrap items-center gap-3">
						<Chip>
							<Plus aria-hidden />
							Add bar
						</Chip>
						<Chip disabled>Add bar (disabled)</Chip>
						{(Object.keys(chips) as (keyof typeof chips)[]).map((k) => (
							<Chip key={k} pressed={chips[k]} onPressedChange={(on) => setChips((c) => ({ ...c, [k]: on }))}>
								{k[0].toUpperCase() + k.slice(1)}
							</Chip>
						))}
						<Chip pressed={false} disabled>
							Mute (disabled)
						</Chip>
					</div>
				</Section>

				<Section title="Segmented">
					<div className="flex flex-col items-start gap-4">
						<Segmented
							label="Playback"
							options={[
								{ value: "loop", label: "Loop" },
								{ value: "once", label: "Once" },
							]}
							value={mode}
							onChange={setMode}
						/>
						<Segmented
							label="Subdivision"
							dense
							options={[
								{ value: "4", label: "1/4" },
								{ value: "8", label: "1/8" },
								{ value: "16", label: "1/16" },
								{ value: "t", label: "Triplet" },
							]}
							value={sub}
							onChange={setSub}
						/>
						<div className="w-full max-w-90">
							<Segmented
								label="Playback (full width)"
								full
								options={[
									{ value: "loop", label: "Loop" },
									{ value: "once", label: "Once" },
								]}
								value={mode}
								onChange={setMode}
							/>
						</div>
						<Segmented
							label="Playback (disabled)"
							disabled
							options={[
								{ value: "loop", label: "Loop" },
								{ value: "once", label: "Once" },
							]}
							value="loop"
							onChange={() => {}}
						/>
					</div>
				</Section>

				<Section title="Switch">
					<div className="flex flex-col items-start">
						<Switch label="Metronome" checked={metronome} onCheckedChange={setMetronome} />
						<Switch label="Count-in" checked={countIn} onCheckedChange={setCountIn} />
						<Switch label="Accent (disabled)" disabled />
					</div>
				</Section>

				<Section title="Stepper">
					<div className="flex flex-col items-start gap-4">
						<Stepper label="tempo" unit="BPM" value={bpm} min={40} max={240} onChange={setBpm} tap />
						<Stepper label="capo" value={capo} min={0} max={12} onChange={setCapo} />
						<Stepper label="bars" value={4} onChange={() => {}} disabled />
					</div>
				</Section>
			</div>
		</div>
	);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section aria-label={title} className="flex flex-col gap-4">
			<h2 className="font-gp-display text-[19px] font-bold">{title}</h2>
			{children}
		</section>
	);
}
