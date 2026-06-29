"use client";

import { useState } from "react";
import { FingerpickPattern } from "@/lib/fingerpickTypes";
import TabMeasure from "@/components/fingerpick/TabMeasure";
import { X, SquareMenu } from "lucide-react";

// p-i-m-a arpeggio on open strings: thumb (low E), index (D), middle (G), ring (high e)
const EXAMPLE_PATTERN: FingerpickPattern = {
	id: "pima-open",
	name: "p-i-m-a (open strings)",
	bpm: 80,
	timeSignature: [4, 4],
	measures: [
		{
			id: "m1",
			slots: [
				{
					id: "s1",
					duration: "quarter",
					strings: [null, null, null, null, null, 0],
				},
				{
					id: "s2",
					duration: "quarter",
					strings: [null, null, null, 0, null, null],
				},
				{
					id: "s3",
					duration: "quarter",
					strings: [null, null, 0, null, null, null],
				},
				{
					id: "s4",
					duration: "quarter",
					strings: [0, null, null, null, null, null],
				},
			],
		},
		{
			id: "m2",
			slots: [
				{
					id: "s5",
					duration: "eighth",
					strings: [null, null, null, null, null, 0],
				},
				{
					id: "s6",
					duration: "eighth",
					strings: [null, null, null, 0, null, null],
				},
				{
					id: "s7",
					duration: "eighth",
					strings: [null, null, 0, null, null, null],
				},
				{
					id: "s8",
					duration: "eighth",
					strings: [0, null, null, null, null, null],
				},
				{
					id: "s9",
					duration: "eighth",
					strings: [null, null, null, null, null, 0],
				},
				{
					id: "s10",
					duration: "eighth",
					strings: [null, null, null, 0, null, null],
				},
				{
					id: "s11",
					duration: "eighth",
					strings: [null, null, 0, null, null, null],
				},
				{
					id: "s12",
					duration: "eighth",
					strings: [0, null, null, null, null, null],
				},
			],
		},
	],
};

export default function FingerpickPage() {
	const [showLibrary, setShowLibrary] = useState(false);
	const [pattern] = useState<FingerpickPattern>(EXAMPLE_PATTERN);

	return (
		<div className="md:h-[calc(100vh-3.5rem)] flex flex-col md:flex-row md:overflow-hidden bg-slate-50">
			{/* Left sidebar — lg: static; below lg: slide-in overlay */}
			<div
				className={`fixed inset-y-0 left-0 z-40 w-72 h-full border-r border-slate-200 bg-white flex flex-col shrink-0 transition-transform duration-200 ease-in-out lg:relative lg:inset-auto lg:z-auto lg:translate-x-0 ${
					showLibrary ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				<div className="flex items-center justify-between px-5 py-4 shrink-0 border-b border-slate-200">
					<h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
						Pattern Library
					</h2>
					<button
						onClick={() => setShowLibrary(false)}
						className="lg:hidden h-8 w-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
					>
						<X size={18} />
					</button>
				</div>
				<div className="flex-1 flex items-center justify-center">
					<p className="text-xs text-slate-400 text-center px-4">
						Pattern library coming soon
					</p>
				</div>
			</div>

			{/* Backdrop — tap outside to close library on mobile/tablet */}
			{showLibrary && (
				<div
					className="fixed inset-0 z-30 bg-black/20 lg:hidden"
					onClick={() => setShowLibrary(false)}
				/>
			)}

			{/* Centre — TAB editor */}
			<div className="md:flex-1 flex flex-col items-center justify-center px-4 md:px-8 py-6 md:py-0 md:overflow-hidden">
				<div className="relative w-full max-w-4xl">
					<div className="mb-4">
						<h1 className="text-lg font-semibold text-slate-700">{pattern.name}</h1>
						<p className="text-xs text-slate-400 uppercase tracking-wider mt-0.5">
							{pattern.bpm} BPM &middot; {pattern.timeSignature[0]}/
							{pattern.timeSignature[1]}
						</p>
					</div>

					<div className="overflow-x-auto bg-white rounded-xl border border-slate-100 p-6 flex flex-col gap-8">
						{pattern.measures.map((measure, idx) => (
							<div key={measure.id}>
								<p className="text-[10px] font-semibold uppercase tracking-widest text-slate-300 mb-2">
									Bar {idx + 1}
								</p>
								<TabMeasure measure={measure} />
							</div>
						))}
					</div>

					{/* Mobile library toggle */}
					{!showLibrary && (
						<button
							onClick={() => setShowLibrary(true)}
							className="absolute top-0 right-0 lg:hidden flex items-center gap-2 text-white text-sm font-semibold rounded-md px-2 py-2 shadow-lg transition-all duration-200 active:scale-95"
							style={{ backgroundColor: "var(--denim)" }}
						>
							<SquareMenu />
						</button>
					)}
				</div>
			</div>

			{/* Right panel — controls */}
			<div className="w-full border-t border-slate-200 bg-white md:w-55 md:border-t-0 md:border-l lg:w-70 md:h-full md:shrink-0 flex flex-col">
				<h2 className="w-full px-5 py-4 shrink-0 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
					Controls
				</h2>
				<div className="flex-1 flex items-center justify-center">
					<p className="text-xs text-slate-400 text-center px-4">
						Controls coming soon
					</p>
				</div>
			</div>
		</div>
	);
}
