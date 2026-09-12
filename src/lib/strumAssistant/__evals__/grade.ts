import type { AssistantProposal } from "@/lib/strumAssistant/types";
import { patternNotation } from "@/lib/strumNotation";
import type { EvalCase, EvalExpectation } from "@/lib/strumAssistant/__evals__/cases";

/**
 * Programmatic grading, shared by the offline test and the model runner so a
 * case is judged the same way whichever path produced its answer.
 */

export interface GradeResult {
	pass: boolean;
	failures: string[];
}

/** A proposal against what the case expects of one. Absent fields are not judged. */
export function gradeProposal(expect: EvalExpectation, proposal: AssistantProposal): GradeResult {
	const failures: string[] = [];

	if (expect.chordRoots !== undefined) {
		const roots = proposal.chords.map((c) => c.root);
		if (JSON.stringify(roots) !== JSON.stringify(expect.chordRoots)) {
			failures.push(`chords ${JSON.stringify(roots)}, expected ${JSON.stringify(expect.chordRoots)}`);
		}
	}
	if (expect.rhythm !== undefined && proposal.rhythm !== expect.rhythm) {
		failures.push(`rhythm "${proposal.rhythm}", expected "${expect.rhythm}"`);
	}
	if (expect.notation !== undefined) {
		const written = patternNotation(proposal.bars[0]?.beats ?? []);
		if (written !== expect.notation) {
			failures.push(`first bar reads "${written}", expected "${expect.notation}"`);
		}
	}
	if (expect.bpm !== undefined) {
		const [lo, hi] = expect.bpm;
		if (proposal.bpm === null || proposal.bpm < lo || proposal.bpm > hi) {
			failures.push(`bpm ${proposal.bpm}, expected ${lo}–${hi}`);
		}
	}
	if (expect.bars !== undefined && proposal.bars.length !== expect.bars) {
		failures.push(`${proposal.bars.length} bars, expected ${expect.bars}`);
	}
	if (expect.rhythmGuessed !== undefined && proposal.warnings.rhythmGuessed !== expect.rhythmGuessed) {
		failures.push(`rhythmGuessed ${proposal.warnings.rhythmGuessed}, expected ${expect.rhythmGuessed}`);
	}
	if (expect.unresolved !== undefined) {
		for (const word of expect.unresolved) {
			if (!proposal.warnings.unresolvedChords.includes(word)) {
				failures.push(`"${word}" was not reported as unresolved`);
			}
		}
	}

	return { pass: failures.length === 0, failures };
}

/**
 * A model answer that carried no draft. Right when the case asked for one;
 * otherwise a miss, since every other expectation needs a proposal to judge.
 */
export function gradeNoDraft(expect: EvalExpectation): GradeResult {
	if (expect.noDraft === true) return { pass: true, failures: [] };
	return { pass: false, failures: ["no draft was offered"] };
}

/** Pass rate per path, the headline number. */
export function summarize(
	results: readonly { case: EvalCase; grade: GradeResult }[],
): Record<string, { passed: number; total: number }> {
	const out: Record<string, { passed: number; total: number }> = {};
	for (const { case: c, grade } of results) {
		const bucket = (out[c.path] ??= { passed: 0, total: 0 });
		bucket.total += 1;
		if (grade.pass) bucket.passed += 1;
	}
	return out;
}
