import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getChordsByRoot } from "@/lib/chords";
import { slugToRoot, suffixToSlug } from "@/lib/chordSlug";
import { buildRootSections } from "@/lib/chordBrowseSections";
import MusicalText from "@/components/MusicalText";
import BrowseGrid from "@/components/chords/BrowseGrid";

type Props = { params: Promise<{ rootSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { rootSlug } = await params;
  const root = slugToRoot(rootSlug);
  return { title: `${root} Chords — Chord Charts | Guitar Pal` };
}

export default async function RootPage({ params }: Props) {
  const { rootSlug } = await params;
  const root = slugToRoot(rootSlug);
  const chords = await getChordsByRoot(root);

  if (chords.length === 0) notFound();

  const sections = buildRootSections(
    chords,
    (_r, suffix) => `/chords/${rootSlug}/${suffixToSlug(suffix)}`,
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8">
        <div className="flex flex-col items-center gap-6">
          <div className="flex w-full items-center justify-between">
            <Link
              href="/chords"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← All Roots
            </Link>
            <h1 className="text-2xl font-semibold"><MusicalText text={root} /> Chords</h1>
            <Link
              href="/chords/all"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              All Chords →
            </Link>
          </div>
          <BrowseGrid sections={sections} />
        </div>
      </div>
    </div>
  );
}
