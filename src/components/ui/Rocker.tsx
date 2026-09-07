"use client";

/**
 * The app's switch: a bordered track with a block that slides to one side.
 *
 * Deliberately not a pill with a circle in it. Radius is 0 everywhere in this
 * system bar the LED, and a rounded switch would be the one control quietly
 * borrowing another platform's shape.
 *
 * Extracted after a fourth and fifth consumer appeared. Three copies already
 * existed, and they had drifted: the design-system reference page drew the block
 * in `denim` / `ink-dim` while both shipping pages used `denim-accent` /
 * `ink-faint`. The shipping pair is what players have actually been looking at,
 * so that is what this keeps, and the reference page now shows it too.
 */
export interface RockerProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
	disabled?: boolean;
	ariaLabel: string;
}

export default function Rocker({ checked, onChange, disabled, ariaLabel }: RockerProps) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={ariaLabel}
			disabled={disabled}
			onClick={() => onChange(!checked)}
			className={`relative h-5 w-10 shrink-0 border transition-colors duration-100 disabled:cursor-not-allowed ${
				checked ? "border-denim" : "border-line-strong"
			}`}
		>
			<span
				aria-hidden="true"
				className={`absolute top-0.5 h-3.5 w-3.5 transition-all duration-100 ${
					checked ? "left-5 bg-denim-accent" : "left-0.5 bg-ink-faint"
				}`}
			/>
		</button>
	);
}
