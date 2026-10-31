/**
 * The text lines the account forms (sign-in, reset, settings) share around the
 * Candy Field / Input primitives: a help line and an error line, the same
 * sizes as `gp-field-help`. Class strings rather than components, so each form
 * keeps its own ids and live regions.
 */

export const FORM_HELP = "text-[12.5px] leading-[1.4] text-ink-3";
export const FORM_ERROR = "text-[12.5px] leading-[1.4] text-bad";
/** A sentence under a title — what the form is for. */
export const FORM_LEAD = "text-(length:--gp-t-body) leading-(--gp-lh-body) text-ink-2";
/** An inline text link: ink, underlined, the underline darkening on hover. */
export const TEXT_LINK =
	"gp-focus rounded-xs font-semibold text-ink underline decoration-edge decoration-1 underline-offset-4 transition-[text-decoration-color] duration-(--gp-d-state) hover:decoration-ink";
/** The page's side inset, the header's: 16px on a phone, 24px from 720px, 32px from 960px. */
export const PAGE_GUTTER =
	"px-(--gp-gutter-phone) min-[720px]:px-(--gp-gutter-tablet) min-[960px]:px-(--gp-gutter-desktop)";
