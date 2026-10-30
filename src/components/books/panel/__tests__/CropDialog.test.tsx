import { describe, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { CropInspector } from "@/components/books/panel/CropDialog";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("CropInspector", () => {
	it("closes on Escape before the panel under it hears it", () => {
		const host = document.createElement("div");
		document.body.appendChild(host);
		const root = createRoot(host);
		const onClose = vi.fn();
		act(() => root.render(<CropInspector crop={{ url: "/crop.png", alt: "Page 2, Exercise" }} onClose={onClose} />));
		expect(host.querySelector('[role="region"]')?.getAttribute("aria-label")).toBe("Page 2, Exercise");
		let seenByPanel: boolean | null = null;
		const panel = (e: KeyboardEvent) => {
			seenByPanel = e.defaultPrevented;
		};
		window.addEventListener("keydown", panel);
		act(() => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
		window.removeEventListener("keydown", panel);
		expect(onClose).toHaveBeenCalledTimes(1);
		// The panel's listener sees it handled, and so leaves the panel open.
		expect(seenByPanel).toBe(true);
		act(() => root.unmount());
		host.remove();
	});
});
