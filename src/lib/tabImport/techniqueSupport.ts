import type { Technique } from "@/lib/fingerpickTypes";
import type { TechniqueSupport } from "./types";

// Derived from fingerpickToVexFlow.ts (renderSupported) and
// fingerpickScheduler.ts (audioSupported: legato gains, bend/vibrato detune curves).
// Typed Record so adding a new Technique member causes a compile error until classified.
export const TECHNIQUE_SUPPORT: Record<NonNullable<Technique>, TechniqueSupport> = {
	"hammer-on":           { renderSupported: true,  audioSupported: true  },
	"pull-off":            { renderSupported: true,  audioSupported: true  },
	"slide-up":            { renderSupported: true,  audioSupported: false },
	"slide-down":          { renderSupported: true,  audioSupported: false },
	"vibrato":             { renderSupported: true,  audioSupported: true  },
	"vibrato-wide":        { renderSupported: true,  audioSupported: true  },
	"tapping":             { renderSupported: true,  audioSupported: true  },
	"trill":               { renderSupported: true,  audioSupported: true  },
	"bend-full":           { renderSupported: false, audioSupported: true  },
	"bend-half":           { renderSupported: false, audioSupported: true  },
	"bend-quarter":        { renderSupported: false, audioSupported: true  },
	"bend-release":        { renderSupported: false, audioSupported: true  },
	"pre-bend":            { renderSupported: false, audioSupported: true  },
	"pre-bend-release":    { renderSupported: false, audioSupported: true  },
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
