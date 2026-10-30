"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Segmented } from "@/components/ui/segmented";
import { readMode } from "@/lib/assistant/conversation";
import { askAssistant } from "@/lib/assistant/handoff";

type AskMode = "strum" | "tab" | "general";

const MODES: readonly { value: AskMode; label: string }[] = [
	{ value: "strum", label: "Strum" },
	{ value: "tab", label: "Tab" },
	{ value: "general", label: "General" },
];

const PLACEHOLDER: Record<AskMode, string> = {
	strum: "Chords and a rhythm",
	tab: "A picking pattern or a tab",
	general: "Ask anything about playing",
};

// Sentences each assistant reads (docs/assistant-grammar.md); General takes a question.
const SUGGESTIONS: Record<AskMode, readonly string[]> = {
	strum: ["C G Am F, D DU UDU at 90 bpm", "C Am F G, capo 2", "give me a slow folk strum in C G Am F"],
	tab: ["travis picking in Am", "waltz in C", "Em: R 3 2 1 2 3 in 3/4"],
	general: ["What makes Am7 sound soft?", "A 6/8 strum for a slow song in D", "How do I practise chord changes?"],
};

/**
 * The assistant, on the page: the player picks which one and says it here, and
 * the conversation opens in the header's panel — the one thread every page shares.
 * A suggestion only fills the line; sending is the player's.
 */
export default function AskCard() {
	const [mode, setMode] = useState<AskMode>("strum");
	const [text, setText] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	// The mode the thread was left in, read on the client (it is kept in this tab's storage).
	useEffect(() => {
		const stored = readMode();
		if (stored === "strum" || stored === "tab" || stored === "general") queueMicrotask(() => setMode(stored));
	}, []);

	function submit(e: FormEvent) {
		e.preventDefault();
		const sentence = text.trim();
		if (sentence === "") return;
		askAssistant({ text: sentence, mode });
		setText("");
	}

	return (
		<section className="hm-ask" aria-label="Ask the assistant">
			<Segmented dense label="Assistant" options={MODES} value={mode} onChange={setMode} className="justify-self-start" />
			<form className="hm-askbox" onSubmit={submit}>
				<input
					ref={inputRef}
					type="text"
					value={text}
					onChange={(e) => setText(e.target.value)}
					placeholder={PLACEHOLDER[mode]}
					aria-label="Ask the assistant"
					autoComplete="off"
				/>
				<Button variant="ink" size="sm" type="submit" aria-label="Send" disabled={text.trim() === ""}>
					<ArrowRight aria-hidden />
				</Button>
			</form>
			<div className="hm-chips">
				{SUGGESTIONS[mode].map((s) => (
					<Chip
						key={s}
						onClick={() => {
							setText(s);
							inputRef.current?.focus();
						}}
					>
						{s}
					</Chip>
				))}
			</div>
		</section>
	);
}
