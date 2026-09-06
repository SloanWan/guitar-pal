"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import AssistantPanel from "./AssistantPanel";

/**
 * The topbar's rightmost control: opens the strum assistant over the page.
 *
 * A popover anchored to the topbar rather than a draggable window — dragging
 * buys nothing here and costs mobile layout, focus management and a z-index to
 * maintain. The panel is non-modal so the pattern underneath stays visible and
 * readable while the conversation happens.
 *
 * The panel mounts only while open, so a session that never asks anything never
 * fetches the chord index.
 */
export default function AssistantLauncher() {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				aria-label="Open the strum assistant"
				className="flex size-(--h-control) items-center justify-center border border-line-strong text-ink-dim transition-[color,background-color,border-color] duration-(--dur-hover) ease-out hover:border-denim hover:text-denim-accent active:border-denim active:bg-denim-tint active:duration-(--dur-switch) focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1 data-[state=open]:border-denim data-[state=open]:text-denim-accent"
			>
				<MessageCircle
					className="size-4"
					strokeWidth={1.5}
					strokeLinecap="square"
					aria-hidden="true"
				/>
			</PopoverTrigger>

			<PopoverContent
				align="end"
				sideOffset={8}
				collisionPadding={12}
				// The system's one elevation shadow: this panel floats over content it
				// does not own, where a 1px border alone can disappear into a busy
				// background. See --elev-panel in globals.css.
				className="w-[min(24rem,calc(100vw-1.5rem))] bg-panel p-0 [box-shadow:var(--elev-panel)]"
			>
				<div className="flex items-center justify-between border-b border-line px-3 py-2">
					<span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
						Strum assistant
					</span>
				</div>
				{open && <AssistantPanel />}
			</PopoverContent>
		</Popover>
	);
}
