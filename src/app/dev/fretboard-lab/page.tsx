"use client";

import { useState } from "react";

import FretboardExplorer from "@/components/fretboard/FretboardExplorer";

// Lab for the fretboard primitive: every control the real route has, plus a
// 360px frame so the phone layout (the neck scrolling under a fixed string
// column) can be checked in a desktop browser without resizing it.
export default function FretboardLabPage() {
	const [phoneFrame, setPhoneFrame] = useState(false);

	return (
		<div className="min-h-screen bg-surface px-(--gutter) py-10 text-ink">
			<header className="pb-8">
				<div className="font-mono text-[11px] uppercase tracking-[0.18em] text-denim-accent">
					{"// DEV — FRETBOARD LAB"}
				</div>
				<h1 className="mt-3 font-mono text-3xl font-bold">Scale × chord tones</h1>
				<p className="mt-3 max-w-[70ch] text-sm text-ink-dim">
					One board, one <code className="font-mono">FretMark[]</code>. Scale tones light up
					hollow, the chord sounding now lights up solid, its root in denim. Pick a chord to
					see which scale notes are safe over it; switch labels to degrees to make the shape
					transferable to another key.
				</p>
			</header>

			<section className="mb-6 flex flex-wrap items-end gap-4 border border-line p-4">
				<label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
					<input type="checkbox" checked={phoneFrame} onChange={(e) => setPhoneFrame(e.target.checked)} />
					360px frame
				</label>
			</section>

			<div className={phoneFrame ? "w-90 border border-dashed border-line-strong" : undefined}>
				<FretboardExplorer />
			</div>
		</div>
	);
}
