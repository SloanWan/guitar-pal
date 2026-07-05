import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MusicalText from "@/components/MusicalText";

describe("MusicalText", () => {
  it("wraps symbol segments in a span", () => {
    const html = renderToStaticMarkup(<MusicalText text="C#" />);
    expect(html).toContain("♯");
    // outer wrapper + symbol span = 2 spans
    expect((html.match(/<span/g) ?? []).length).toBe(2);
  });

  it("text segments render as plain text with no extra wrapper element", () => {
    const html = renderToStaticMarkup(<MusicalText text="major" />);
    expect(html).toContain("major");
    // only the outer wrapper span — no extra span for the text segment
    expect((html.match(/<span/g) ?? []).length).toBe(1);
  });

  it("mixes text and symbol spans correctly (7b5)", () => {
    const html = renderToStaticMarkup(<MusicalText text="7b5" />);
    expect(html).toContain("♭");
    expect(html).toContain("7");
    expect(html).toContain("5");
  });

  it("forwards className to outer wrapper", () => {
    const html = renderToStaticMarkup(<MusicalText text="A" className="font-bold" />);
    expect(html).toContain('class="font-bold"');
  });

  it("symbolClassName overrides default on symbol spans", () => {
    const html = renderToStaticMarkup(
      <MusicalText text="C#" symbolClassName="custom-sym" />,
    );
    expect(html).toContain('class="custom-sym"');
  });

  it("empty text renders an empty wrapper span", () => {
    const html = renderToStaticMarkup(<MusicalText text="" />);
    expect(html).toBe("<span></span>");
  });
});
