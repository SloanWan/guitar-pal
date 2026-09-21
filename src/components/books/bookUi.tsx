import type { ButtonHTMLAttributes } from "react";
import type { BookStatus } from "@/lib/books/types";

/**
 * The few shared pieces of the book pages: a hairline panel with a module
 * label, the two button weights, and the LED that carries a book's status.
 * Same language as the rest of the app (v3): mono tracked labels, no
 * radius, denim for the active state.
 */

export const EYEBROW =
	"font-mono text-[length:var(--text-eyebrow-size)] uppercase tracking-[var(--text-eyebrow-ls)]";
export const MONO_META = "font-mono text-[11px] uppercase tracking-[0.08em] text-ink-faint";

export function Panel({
	label,
	aside,
	children,
}: {
	label: string;
	aside?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<section className="border border-line bg-panel">
			<header className="flex h-10 items-center justify-between gap-3 border-b border-line px-4">
				<h2 className={`${EYEBROW} text-ink-dim`}>{label}</h2>
				{aside}
			</header>
			{children}
		</section>
	);
}

const BUTTON_BASE =
	"inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap border px-3 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors duration-(--dur-hover) focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1 disabled:pointer-events-none disabled:opacity-50 motion-safe:active:translate-y-px";

export function DenimButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
	return (
		<button
			type="button"
			{...props}
			className={`${BUTTON_BASE} border-denim bg-denim text-on-denim hover:bg-denim-accent ${className}`}
		/>
	);
}

export function GhostButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
	return (
		<button
			type="button"
			{...props}
			className={`${BUTTON_BASE} border-line-strong bg-transparent text-ink hover:border-denim hover:text-denim-accent ${className}`}
		/>
	);
}

export function DangerButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
	return (
		<button
			type="button"
			{...props}
			className={`${BUTTON_BASE} border-line-strong bg-transparent text-ink-dim hover:border-destructive hover:text-destructive ${className}`}
		/>
	);
}

/**
 * Dormant for a book waiting on its upload, breathing while it scans, lit
 * when ready, dark red when the scan failed.
 */
export function StatusLed({ status }: { status: BookStatus }) {
	const cls = {
		uploaded: "bg-ink-faint",
		scanning:
			"bg-denim-accent shadow-(--glow-led) animate-[ledbreathe_2.4s_ease-in-out_infinite] motion-reduce:animate-none",
		ready: "bg-denim-accent shadow-(--glow-led)",
		failed: "bg-destructive",
	}[status];
	return <span aria-hidden="true" className={`inline-block size-1.5 flex-none rounded-full ${cls}`} />;
}

export const STATUS_LABEL: Record<BookStatus, string> = {
	uploaded: "Waiting for upload",
	scanning: "Scanning",
	ready: "Ready",
	failed: "Failed",
};
