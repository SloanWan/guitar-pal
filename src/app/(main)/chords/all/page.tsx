// Static segment `/chords/all` takes priority over the `/chords/[rootSlug]` dynamic route.
// No real root slug collides with "all" — root slugs are chromatic note names
// (a, ab, b, bb, c, c-sharp, d, db, e, eb, f, f-sharp, g, gb).

import Link from "next/link";
import type { Metadata } from "next";
import { getAllChordsWithVoicings } from "@/lib/chords";
import { rootToSlug, suffixToSlug } from "@/lib/chordSlug";
import {
  buildAllChordsRootFirst,
  buildAllChordsCategories,
} from "@/lib/chordBrowseSections";
import BrowseGrid from "@/components/chords/BrowseGrid";
import ChordToc from "@/components/chords/ChordToc";
import ChordTocMobile from "@/components/chords/ChordTocMobile";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "All Guitar Chords | Guitar Pal",
  description: "Browse all 449 guitar chord shapes, grouped by root or quality.",
};

type Props = { searchParams: Promise<{ group?: string }> };

export default async function AllChordsPage({ searchParams }: Props) {
  const { group } = await searchParams;
  const grouping = group === "category" ? "category-first" : "root-first";
  const allChords = await getAllChordsWithVoicings();

  function buildHref(root: string, suffix: string) {
    return `/chords/${rootToSlug(root)}/${suffixToSlug(suffix)}`;
  }

  const sections =
    grouping === "category-first"
      ? buildAllChordsCategories(allChords, buildHref)
      : buildAllChordsRootFirst(allChords, buildHref);

  return (
    <>
      <ChordToc sections={sections} />
      <ChordTocMobile sections={sections} />
      <div className="min-h-screen bg-background">
        <div className="container mx-auto py-8">
          <div className="flex flex-col items-center gap-6">
            <div className="flex w-full items-center justify-between">
              <Link
                href="/chords"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                ← Chord Library
              </Link>
              <h1 className="text-2xl font-semibold">All Chords</h1>
              <div className="w-24" aria-hidden />
            </div>

            {/* Grouping toggle — display preference, stays as query param */}
            <div className="flex gap-2">
              <Button asChild size="sm" variant={grouping === "root-first" ? "default" : "outline"}>
                <Link href="/chords/all">By Root</Link>
              </Button>
              <Button
                asChild
                size="sm"
                variant={grouping === "category-first" ? "default" : "outline"}
              >
                <Link href="/chords/all?group=category">By Category</Link>
              </Button>
            </div>

            <BrowseGrid sections={sections} />
          </div>
        </div>
      </div>
    </>
  );
}
