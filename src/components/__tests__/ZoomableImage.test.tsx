import { describe, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import ZoomableImage, { ZOOM_MAX, ZOOM_MIN, anchoredScroll, stepZoom } from "@/components/ZoomableImage";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("stepZoom", () => {
	it("steps by half and stops at the ends", () => {
		expect(stepZoom(1, 1)).toBe(1.5);
		expect(stepZoom(1, -1)).toBe(0.67);
		expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
		expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
		let s = 1;
		for (let i = 0; i < 20; i++) s = stepZoom(s, 1);
		expect(s).toBe(ZOOM_MAX);
	});
});

describe("anchoredScroll", () => {
	it("keeps the clicked point under the pointer as the content grows", () => {
		// The pointer is 100px into a box scrolled 50px: content x = 150. At
		// twice the size that point is at 300, so the box scrolls to 300 − 100.
		expect(
			anchoredScroll({ clientX: 110, clientY: 40, rect: { left: 10, top: 20 }, scrollLeft: 50, scrollTop: 0, ratio: 2 }),
		).toEqual({ left: 200, top: 20 });
	});

	it("never asks for a negative scroll when shrinking", () => {
		expect(
			anchoredScroll({ clientX: 10, clientY: 10, rect: { left: 0, top: 0 }, scrollLeft: 0, scrollTop: 0, ratio: 0.5 }),
		).toEqual({ left: 0, top: 0 });
	});
});

describe("ZoomableImage", () => {
	it("arms a tool from the button and zooms where the image is clicked", () => {
		const host = document.createElement("div");
		document.body.appendChild(host);
		const onClose = vi.fn();
		const root = createRoot(host);
		act(() => root.render(<ZoomableImage src="https://signed/crop.png" alt="Page 206" onClose={onClose} />));
		const img = host.querySelector("img");
		const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
		const clickImage = () => act(() => img?.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 30, clientY: 30 })));

		expect(img?.style.width).toBe("100%");
		// No tool armed: a click does nothing.
		clickImage();
		expect(img?.style.width).toBe("100%");

		act(() => button("Zoom in")?.click());
		expect(button("Zoom in")?.getAttribute("aria-pressed")).toBe("true");
		clickImage();
		expect(img?.style.width).toBe("150%");
		expect(host.textContent).toContain("150%");
		clickImage();
		expect(img?.style.width).toBe("225%");

		// The other tool takes over; the same button again disarms.
		act(() => button("Zoom out")?.click());
		expect(button("Zoom in")?.getAttribute("aria-pressed")).toBe("false");
		clickImage();
		expect(img?.style.width).toBe("150%");
		act(() => button("Zoom out")?.click());
		clickImage();
		expect(img?.style.width).toBe("150%");

		// The fit button says which way fit is from here.
		expect(button("Fit to width")).toBeNull();
		act(() => button("Shrink to fit")?.click());
		expect(img?.style.width).toBe("100%");
		expect(button("Fit to width")?.disabled).toBe(true);
		act(() => button("Zoom out")?.click());
		clickImage();
		expect(img?.style.width).toBe("67%");
		expect(button("Grow to fit")).not.toBeNull();
		act(() => button("Grow to fit")?.click());
		expect(img?.style.width).toBe("100%");

		act(() => button("Close")?.click());
		expect(onClose).toHaveBeenCalledTimes(1);
		act(() => root.unmount());
		host.remove();
	});
});
