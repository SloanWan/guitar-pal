import type { PasswordStrength, StrengthLevel } from "@/lib/passwordStrength";
import { FORM_HELP } from "./formText";

const LEVEL_LABEL: Record<StrengthLevel, string> = {
	weak: "Weak",
	fair: "Fair",
	good: "Good",
	strong: "Strong",
};

/* Lit segments per level. Weak lights one so an unacceptable password still
   shows the bar exists; the colour, not the count, says it is refused. */
const LIT: Record<StrengthLevel, number> = { weak: 1, fair: 2, good: 3, strong: 4 };

/**
 * Four segments and one line of advice under a password field. Renders
 * nothing for an empty field, so the form reads clean until typing starts.
 * Shared by sign-up, the reset page and the change-password form.
 */
export default function PasswordStrengthMeter({
	strength,
	empty,
}: {
	strength: PasswordStrength;
	empty: boolean;
}) {
	if (empty) return null;
	const lit = LIT[strength.level];
	const fill = strength.acceptable ? "bg-ok" : "bg-bad";
	return (
		<div className="flex flex-col gap-1.5" aria-live="polite">
			<div className="flex items-center gap-2.5">
				<div className="flex flex-1 gap-1" aria-hidden="true">
					{[0, 1, 2, 3].map((i) => (
						<span
							key={i}
							className={`h-1.5 flex-1 rounded-pill transition-colors duration-(--gp-d-state) ${
								i < lit ? fill : "bg-well"
							}`}
						/>
					))}
				</div>
				<span
					className={`w-14 text-right text-(length:--gp-t-cap) font-semibold ${
						strength.acceptable ? "text-ok" : "text-bad"
					}`}
				>
					{LEVEL_LABEL[strength.level]}
				</span>
			</div>
			{strength.hint && <p className={FORM_HELP}>{strength.hint}</p>}
		</div>
	);
}
