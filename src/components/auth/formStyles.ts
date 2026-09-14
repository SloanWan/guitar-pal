/**
 * The v3 form vocabulary shared by the account settings page and the sign-in
 * page: mono eyebrow labels, hairline inputs, flat radius-0 buttons. Kept as
 * class strings rather than components so each page composes its own layout.
 */

export const LABEL = "font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint";
export const HELP = "font-mono text-[11px] tracking-[0.02em] text-ink-dim";
export const ERROR_TEXT = "font-mono text-[11px] tracking-[0.02em] text-destructive";
export const INPUT =
	"w-full border border-line-strong bg-surface px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent disabled:opacity-50 aria-invalid:border-destructive";
export const BUTTON =
	"flex h-(--h-control) items-center justify-center px-4 font-mono text-[11px] uppercase tracking-[0.08em] transition-[color,background-color,border-color,transform,translate] duration-(--dur-hover) ease-out motion-safe:active:translate-y-px disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1";
export const PRIMARY = `${BUTTON} self-start bg-denim text-on-denim hover:bg-denim-accent`;
export const SECONDARY = `${BUTTON} border border-line-strong text-ink-dim hover:border-denim hover:text-denim-accent`;
