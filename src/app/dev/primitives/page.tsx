"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, ChevronRight, Copy, Hand, Music, Plus, Rows4, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, PlayPick, type ButtonVariant } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { Stepper } from "@/components/ui/stepper";
import { NavCard } from "@/components/ui/card";
import { ListRow } from "@/components/ui/list-row";
import { Panel } from "@/components/ui/panel";
import { Field, Input, SearchInput } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
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

const CARDS = [
	{ id: "old-faithful", title: "Old faithful", meta: "4/4 · ♩ 90" },
	{ id: "on-the-beat", title: "On the beat", meta: "4/4 · ♩ 80" },
	{ id: "travis", title: "Travis basics", meta: "12 bars · capo 2" },
];
const ROWS: readonly { title: string; subline: string; icon: typeof Rows4; module: ModuleKey }[] = [
	{ title: "Folk sixteenths", subline: "4/4 · ♩ 76", icon: Rows4, module: "strum" },
	{ title: "Travis basics", subline: "12 bars · capo 2", icon: Hand, module: "tab" },
	{ title: "Cadd9", subline: "x32033", icon: Music, module: "chords" },
	{ title: "吉他三月通", subline: "Chapter 3", icon: BookOpen, module: "books" },
];

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
	const [card, setCard] = useState("old-faithful");
	const [row, setRow] = useState(1);
	const [name, setName] = useState("");
	const [query, setQuery] = useState("");
	const [tempo, setTempo] = useState(90);
	const [sheetOpen, setSheetOpen] = useState(false);
	const [loadingKey, setLoadingKey] = useState(0);

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
						<Stepper label="capo (small)" value={capo} min={0} max={12} onChange={setCapo} size="sm" />
						<Stepper label="bars" value={4} onChange={() => {}} disabled />
					</div>
				</Section>

				<Section title="Nav card">
					<div className="grid gap-4 sm:grid-cols-3">
						{CARDS.map((c) => (
							<NavCard key={c.id} selected={card === c.id} onClick={() => setCard(c.id)} className="p-4">
								<span className="gp-title text-[15px] font-semibold">{c.title}</span>
								<span className="mt-1 block text-[13px] text-gp-ink-3">{c.meta}</span>
							</NavCard>
						))}
					</div>
				</Section>

				<Section title="List row">
					<div className="grid max-w-120 gap-2">
						{ROWS.map((r, i) => (
							<ListRow
								key={r.title}
								title={r.title}
								subline={r.subline}
								icon={r.icon}
								module={r.module}
								selected={row === i}
								onClick={() => setRow(i)}
								trailing={<ChevronRight aria-hidden />}
							/>
						))}
					</div>
				</Section>

				<Section title="Panel and input">
					<Panel title="Save this pattern" className="flex max-w-120 flex-col gap-4">
						<Field label="Name" help="Shown in your library." error={name.length > 24 ? "Keep it under 24 characters." : undefined}>
							{(control) => <Input {...control} value={name} onChange={(e) => setName(e.target.value)} placeholder="Old faithful" />}
						</Field>
						<SearchInput aria-label="Filter patterns" placeholder="Filter patterns" value={query} onChange={(e) => setQuery(e.target.value)} />
						<Input aria-label="Disabled field" placeholder="Disabled" disabled />
					</Panel>
				</Section>

				<Section title="Slider">
					<div className="flex max-w-120 flex-col gap-2">
						<Slider
							label="Tempo"
							value={tempo}
							min={40}
							max={240}
							onChange={setTempo}
							ticks={[60, 90, 120, 180]}
							snap={{ points: [60, 90, 120, 180], within: 3 }}
							valueText={(v) => `${v} BPM`}
						/>
						<span className="text-[13px] text-gp-ink-3">{tempo} BPM — snaps to the ticks</span>
						<Slider label="Volume (disabled)" value={40} onChange={() => {}} disabled />
					</div>
				</Section>

				<Section title="Sheet and toast">
					<div className="flex flex-wrap gap-3">
						<Sheet
							open={sheetOpen}
							onOpenChange={setSheetOpen}
							title="Pattern options"
							description="A bottom sheet on a phone, a right panel from 720px."
							trigger={<Button variant="secondary">Open sheet</Button>}
						>
							<div className="grid gap-2">
								<ListRow title="Duplicate" subline="A copy in your library" icon={Copy} />
								<ListRow title="Open in Tab" subline="As a fingerpicking pattern" icon={Hand} module="tab" />
							</div>
						</Sheet>
						<Button variant="secondary" onClick={() => toast("Pattern saved")}>
							Show toast
						</Button>
						<Button variant="secondary" onClick={() => toast.error("Could not save")}>
							Show error toast
						</Button>
					</div>
				</Section>

				<Section title="Skeleton">
					<div className="flex max-w-120 flex-col gap-3">
						<Button variant="ghost" className="self-start" onClick={() => setLoadingKey((k) => k + 1)}>
							Wait again
						</Button>
						<Skeleton key={loadingKey} className="h-16" />
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
