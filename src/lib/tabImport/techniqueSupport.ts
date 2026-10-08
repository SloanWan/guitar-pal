import type { Technique } from "@/lib/fingerpickTypes";
import type { TechniqueSupport } from "./types";

// What the app really does with each technique today:
//  - renderSupported: fingerpickToVexFlow.ts draws it (connectors, Bend arrows,
//    vibrato glyph, annotations).
//  - audioSupported: fingerpickScheduler.ts voices it (legato gains, the slide
//    handoff, bend/vibrato detune curves).
// Keep this in step with those two files — the importer warns from it.
// Typed Record so adding a new Technique member causes a compile error until classified.
export const TECHNIQUE_SUPPORT: Record<NonNullable<Technique>, TechniqueSupport> = {
	"hammer-on":           { renderSupported: true,  audioSupported: true  },
	"pull-off":            { renderSupported: true,  audioSupported: true  },
	"slide-up":            { renderSupported: true,  audioSupported: true  },
	"slide-down":          { renderSupported: true,  audioSupported: true  },
	"vibrato":             { renderSupported: true,  audioSupported: true  },
	"vibrato-wide":        { renderSupported: true,  audioSupported: true  },
	"tapping":             { renderSupported: true,  audioSupported: true  },
	"trill":               { renderSupported: true,  audioSupported: true  },
	"bend-full":           { renderSupported: true,  audioSupported: true  },
	"bend-half":           { renderSupported: true,  audioSupported: true  },
	"bend-quarter":        { renderSupported: true,  audioSupported: true  },
	"bend-release":        { renderSupported: true,  audioSupported: true  },
	"pre-bend":            { renderSupported: true,  audioSupported: true  },
	"pre-bend-release":    { renderSupported: true,  audioSupported: true  },
	"vibrato-bar":         { renderSupported: false, audioSupported: false },
	"harmonic-natural":    { renderSupported: false, audioSupported: false },
	"harmonic-artificial": { renderSupported: false, audioSupported: false },
	"whammy-dive":         { renderSupported: false, audioSupported: false },
	"whammy-pull":         { renderSupported: false, audioSupported: false },
	"pick-scrape":         { renderSupported: false, audioSupported: false },
	"grace-note":          { renderSupported: false, audioSupported: false },
};

export function isRenderSupported(technique: NonNullable<Technique>): boolean {
	return TECHNIQUE_SUPPORT[technique].renderSupported;
}
