"use client";

import { useState } from "react";
import { List } from "lucide-react";
import { buildToc } from "@/lib/chordToc";
import type { BrowseSection } from "@/lib/chordBrowseSections";
import MusicalText from "@/components/MusicalText";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Props {
  sections: BrowseSection[];
}

export default function ChordTocMobile({ sections }: Props) {
  const [open, setOpen] = useState(false);
  const entries = buildToc(sections);

  function handleSelect(id: string) {
    setOpen(false);
    // Brief delay lets the dialog close before the scroll jump fires
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  }

  return (
    <div className="fixed bottom-6 right-4 z-40 lg:hidden">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label="Jump to chord section"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-denim text-white shadow-lg transition-transform active:scale-95"
          >
            <List className="h-5 w-5" />
          </button>
        </DialogTrigger>
        <DialogContent className="max-h-[75vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Jump to…</DialogTitle>
          </DialogHeader>
          <nav className="flex flex-col">
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => handleSelect(entry.id)}
                className={cn(
                  "rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-denim-tint",
                  entry.level === 1
                    ? "font-medium"
                    : "pl-6 text-muted-foreground",
                )}
              >
                <MusicalText text={entry.label} />
              </button>
            ))}
          </nav>
        </DialogContent>
      </Dialog>
    </div>
  );
}
