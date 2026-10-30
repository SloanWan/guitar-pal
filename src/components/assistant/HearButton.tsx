"use client";

import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pick, type Lang } from "@/lib/assistant/lang";

/** A card's "Hear it": plays what the card holds once, and stops it. Half the footer, so the label can change without the row moving. */
export default function HearButton({
	playing,
	preparing,
	disabled,
	onClick,
	lang = "en",
}: {
	playing: boolean;
	preparing: boolean;
	disabled?: boolean;
	onClick: () => void;
	lang?: Lang;
}) {
	return (
		<Button variant="secondary" size="sm" loading={preparing} disabled={disabled} onClick={onClick}>
			{playing ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
			{playing ? pick(lang, "Stop", "停止") : pick(lang, "Hear it", "试听")}
		</Button>
	);
}
