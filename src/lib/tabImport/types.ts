import type { FingerpickPattern } from "@/lib/fingerpickTypes";

export type ImportedTabDraft = {
	id?: string;
	name?: string;
	description?: string;
	bpm?: unknown;
	timeSignature?: unknown;
	measures?: unknown[];
	repeats?: RepeatDirective[];
};

export type RepeatDirective = {
	/** Inclusive range over ORIGINAL measure indices. */
	range: [number, number];
	/** Total occurrences — the range appears this many times consecutively. */
	times: number;
};

export type ValidationIssue = {
	code: string;
	path: string;
	message: string;
	original?: unknown;
	repairedTo?: unknown;
};

export type NormalizeResult = {
	pattern: FingerpickPattern | null;
	errors: ValidationIssue[];
	warnings: ValidationIssue[];
	truncated: boolean;
};

export type TechniqueSupport = {
	renderSupported: boolean;
	audioSupported: boolean;
};
