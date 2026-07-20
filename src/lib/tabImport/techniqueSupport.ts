import type { Technique } from "@/lib/fingerpickTypes";
import type { TechniqueSupport } from "./types";

// Derived from fingerpickToVexFlow.ts (renderSupported) and
// useFingerpickAudioEngine.ts (audioSupported).
// Typed Record so adding a new Technique member causes a compile error until classified.
export const TECHNIQUE_SUPPORT: Record<NonNullable<Technique>, TechniqueSupport> = {
	"hammer-on":           { renderSupported: true,  audioSupported: true  },
	"pull-off":            { renderSupported: true,  audioSupported: true  },
	"slide-up":            { renderSupported: true,  audioSupported: false },
	"slide-down":          { renderSupported: true,  audioSupported: false },
	"vibrato":             { renderSupported: true,  audioSupported: false },
	"vibrato-wide":        { renderSupported: true,  audioSupported: false },
	"tapping":             { renderSupported: true,  audioSupported: true  },
	"trill":               { renderSupported: true,  audioSupported: true  },
	"bend-full":           { renderSupported: false, audioSupported: false },
	"bend-half":           { renderSupported: false, audioSupported: false },
	"bend-quarter":        { renderSupported: false, audioSupported: false },
	"bend-release":        { renderSupported: false, audioSupported: false },
	"pre-bend":            { renderSupported: false, audioSupported: false },
	"pre-bend-release":    { renderSupported: false, audioSupported: false },
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
