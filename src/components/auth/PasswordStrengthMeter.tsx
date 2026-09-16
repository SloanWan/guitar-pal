import type { PasswordStrength, StrengthLevel } from "@/lib/passwordStrength";

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
 * Shared by the change-password form and (later) sign-up.
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
	const fill = strength.acceptable ? "bg-denim-accent" : "bg-destructive";
	return (
		<div className="flex flex-col gap-1.5" aria-live="polite">
			<div className="flex items-center gap-2">
				<div className="flex flex-1 gap-1" aria-hidden="true">
					{[0, 1, 2, 3].map((i) => (
						<span
							key={i}
							className={`h-1 flex-1 transition-colors duration-(--dur-hover) ${
								i < lit ? fill : "bg-line-strong"
							}`}
						/>
					))}
				</div>
				<span
					className={`w-12 text-right font-mono text-[10px] uppercase tracking-[0.1em] ${
						strength.acceptable ? "text-denim-accent" : "text-destructive"
					}`}
				>
					{LEVEL_LABEL[strength.level]}
				</span>
			</div>
			{strength.hint && (
				<p className="font-mono text-[11px] tracking-[0.02em] text-ink-dim">{strength.hint}</p>
			)}
		</div>
	);
}
