"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
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
}

// "Report a missing chord" and what came of it. Callers key it on the query, so a
// new query mounts a fresh button.
export default function ChordRequestButton({ query, label = "Report this chord as missing" }: Props) {
	const [state, setState] = useState<ReportState>("idle");

	const submit = useCallback(async () => {
		setState("sending");
		try {
			setState({ done: await reportChordRequest(query) });
		} catch {
			setState({ error: true });
		}
	}, [query]);

	if (typeof state === "object" && "done" in state) {
		return <p className="m-0 text-sm text-ink-2">{REPORT_MESSAGES[state.done]}</p>;
	}

	return (
		<Button variant="secondary" size="xs" loading={state === "sending"} onClick={submit}>
			{typeof state === "object" ? "Couldn't send — try again" : label}
		</Button>
	);
}
