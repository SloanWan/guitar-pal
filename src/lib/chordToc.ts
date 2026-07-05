import type { BrowseSection } from "@/lib/chordBrowseSections";

export interface TocEntry {
  id: string;
  label: string;
  level: 1 | 2;
}

// Produces a stable, URL-safe id fragment from a section label.
// Used in both heading elements (as `id=`) and TOC entries (as anchor targets).
export function tocSectionId(label: string): string {
  return label
    .toLowerCase()
    .replace(/#/g, "-sharp")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function tocSubsectionId(sectionLabel: string, subsectionLabel: string): string {
  return `${tocSectionId(sectionLabel)}-${tocSectionId(subsectionLabel)}`;
}

// Pure function — derives TOC entries directly from the rendered sections data.
// Level-1 entries correspond to h3 section headings; level-2 to h4 subsection
// headings (present only in category-first mode).
export function buildToc(sections: BrowseSection[]): TocEntry[] {
  const entries: TocEntry[] = [];
  for (const section of sections) {
    entries.push({ id: tocSectionId(section.label), label: section.label, level: 1 });
  }
  return entries;
}
