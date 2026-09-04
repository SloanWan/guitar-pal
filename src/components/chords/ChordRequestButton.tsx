"use client";

import { useCallback, useState } from "react";
import { reportChordRequest, type SubmissionVerdict } from "@/lib/chordRequests";

const REPORT_MESSAGES: Record<SubmissionVerdict, string> = {
	ok: "Thanks — we'll look into adding it.",
	duplicate: "You've already reported that.",
	throttled: "Please wait a moment before reporting again.",
	empty: "",
};

type ReportState = "idle" | "sending" | { done: SubmissionVerdict } | { error: true };

interface Props {
	query: string;
	label?: string;
	className?: string;
}

// "Report a missing chord" button plus its result copy. Carries no reset logic of its
// own — callers key it on the query so a new query mounts a fresh button.
export default function ChordRequestButton({
	query,
	label = "Report this chord as missing",
	className = "rounded-md bg-denim px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-denim-dark",
}: Props) {
	const [state, setState] = useState<ReportState>("idle");

	const submit = useCallback(async () => {
		setState("sending");
		try {
			setState({ done: await reportChordRequest(query) });
		} catch {
			setState({ error: true });
		}
	}, [query]);

	if (state === "sending") return <p className="text-sm text-ink-dim">Sending…</p>;

	if (typeof state === "object" && "done" in state) {
		return <p className="text-sm text-denim">{REPORT_MESSAGES[state.done]}</p>;
	}

	if (typeof state === "object" && "error" in state) {
		return (
			<button
				type="button"
				onClick={submit}
				className="text-sm text-denim underline hover:text-denim-dark"
			>
				Couldn&apos;t send — tap to retry
			</button>
		);
	}

	return (
		<button type="button" onClick={submit} className={className}>
			{label}
		</button>
	);
}
