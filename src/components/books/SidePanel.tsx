import { X } from "lucide-react";
import { EYEBROW } from "@/components/books/bookUi";

/**
 * The panel beside the book (#233, #240): the right half at lg, a sheet
 * over the page below it, with a labelled header and its close. What goes
 * in it — a draft to play, a page to read — is the caller's.
 */
export default function SidePanel({
	label,
	ariaLabel,
	onClose,
	panelRef,
	testId,
	children,
}: {
	label: string;
	/** The landmark's name when the visible label carries state ("· saved"). */
	ariaLabel?: string;
	onClose: () => void;
	/** The element itself, for what opens inside it (the editor). */
	panelRef?: (el: HTMLElement | null) => void;
	testId?: string;
	children: React.ReactNode;
}) {
	return (
		<aside
			ref={panelRef}
			aria-label={ariaLabel ?? label}
			data-testid={testId}
			className="fixed inset-0 z-50 flex flex-col bg-surface motion-safe:animate-[draft-panel-in_var(--dur-drawer)_var(--ease-drawer)_both] lg:relative lg:z-auto lg:h-full lg:w-1/2 lg:flex-none lg:border-l lg:border-line"
		>
			<header className="flex h-10 flex-none items-center justify-between gap-3 border-b border-line px-4">
				<h2 className={`${EYEBROW} text-ink-dim`}>{label}</h2>
				<button
					type="button"
					aria-label="Close"
					onClick={onClose}
					className="flex size-7 items-center justify-center text-ink-faint transition-colors duration-(--dur-hover) hover:text-denim-accent focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:-outline-offset-2"
				>
					<X className="size-4" strokeWidth={1.5} />
				</button>
			</header>
			{children}
		</aside>
	);
}
