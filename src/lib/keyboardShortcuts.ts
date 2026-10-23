// Shared guards for the page-level keyboard shortcuts (space to play, ⌘K to
// search). A window-level handler sees every keystroke in the document, so both
// questions below have to be answered the same way everywhere — otherwise space
// eats a character in one field and not another.

/**
 * True when the keystroke belongs to somewhere the user is typing: a text
 * field, a select, or a contenteditable surface. Range inputs are deliberately
 * excluded — a focused volume fader should not swallow the transport key.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
	if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
		return true;
	}
	if (target instanceof HTMLInputElement) return target.type !== "range";
	// `=== true`, not a bare truthiness check: jsdom leaves isContentEditable
	// undefined on plain elements, which would return undefined rather than false.
	return target instanceof HTMLElement && target.isContentEditable === true;
}

/**
 * True while a modal dialog is on screen. Dialogs are only mounted while open,
 * so their presence in the document is the whole test. Inside one, the dialog's
 * own keys win: space belongs to the button under the cursor, not to the
 * transport running behind the overlay.
 */
export function isModalOpen(doc: Document = document): boolean {
	const open = doc.querySelectorAll('[data-slot="dialog-content"], [role="dialog"], [role="alertdialog"]');
	// A popover (a tempo panel, a delete confirmation) is anchored to the page and
	// does not take it over, so the transport key still belongs to the page.
	return [...open].some((el) => el.closest("[data-radix-popper-content-wrapper]") === null);
}

/** Controls a mouse or a finger leaves focused after using them. */
const POINTER_FOCUSED = 'button, a[href], summary, [role="button"], [role="radio"], [role="switch"], [role="tab"], [role="slider"], [role="checkbox"], input[type="range"], input[type="checkbox"], input[type="radio"]';

/**
 * Whether focus left on `el` by a pointer should be let go of, so the page's
 * keys (space to play) are not taken by the last thing clicked. Keyboard focus
 * is never touched, and neither is focus inside a dialog, menu or list box,
 * which manage their own.
 */
export function releasesPointerFocus(el: Element | null): boolean {
	if (!el || !el.matches(POINTER_FOCUSED)) return false;
	return el.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-slot="dialog-content"]') === null;
}

/**
 * Whether a page-level shortcut should run for this event: not while typing,
 * not while a dialog is up, and never as half of a modifier combination.
 */
export function shouldRunPageShortcut(e: KeyboardEvent): boolean {
	if (e.metaKey || e.ctrlKey || e.altKey) return false;
	if (isTypingTarget(e.target)) return false;
	return !isModalOpen();
}
