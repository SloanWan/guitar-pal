"use client";

import { useCallback, useSyncExternalStore, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** From this width a sheet is a right-hand panel instead of rising from the bottom. */
export const SHEET_PANEL_MIN_WIDTH = 720;

export type SheetSide = "bottom" | "right";

/** Which way a sheet opens at a viewport this wide. */
export function sheetSide(viewportWidth: number): SheetSide {
	return viewportWidth >= SHEET_PANEL_MIN_WIDTH ? "right" : "bottom";
}

const PANEL_QUERY = `(min-width: ${SHEET_PANEL_MIN_WIDTH}px)`;

/**
 * The side for the current viewport, followed while the sheet is open (a phone turned
 * sideways) and not listened for while it is shut.
 */
export function useSheetSide(open: boolean): SheetSide {
	const subscribe = useCallback(
		(onChange: () => void) => {
			if (!open || typeof window === "undefined" || !window.matchMedia) return () => {};
			const mq = window.matchMedia(PANEL_QUERY);
			mq.addEventListener("change", onChange);
			return () => mq.removeEventListener("change", onChange);
		},
		[open],
	);
	return useSyncExternalStore(
		subscribe,
		() => sheetSide(window.innerWidth),
		() => "bottom",
	);
}

export interface SheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: ReactNode;
	description?: ReactNode;
	/** The control that opens it; focus returns there on close. */
	trigger?: ReactNode;
	children: ReactNode;
}

/**
 * A sheet (spec §8): rises from the bottom below 720px (a grabber, at most 88% tall, a 40%
 * scrim), a 380px right panel from 720px. Escape and the scrim close it; focus is trapped
 * inside and handed back on close; the page behind does not scroll. `dialog.tsx` stays for
 * confirms.
 */
export function Sheet({ open, onOpenChange, title, description, trigger, children }: SheetProps) {
	const side = useSheetSide(open);
	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			{trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
			<Dialog.Portal>
				<Dialog.Overlay className="gp-scrim" />
				<Dialog.Content
					className="gp-sheet"
					data-side={side}
					// without a description, say so — Radix otherwise warns that one is missing
					{...(description ? {} : { "aria-describedby": undefined })}
				>
					<div className="gp-sheet-grab" aria-hidden />
					<div className="gp-sheet-head">
						<Dialog.Title className="gp-sheet-title">{title}</Dialog.Title>
						<Dialog.Close asChild>
							<Button variant="icon" size="sm" aria-label="Close">
								<X aria-hidden />
							</Button>
						</Dialog.Close>
					</div>
					{description ? (
						<Dialog.Description className="gp-sheet-desc">{description}</Dialog.Description>
					) : null}
					<div className="gp-sheet-body">{children}</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
