export interface SegmentedOption {
	value: string;
	label: string;
}

export interface SegmentedProps {
	options: readonly SegmentedOption[];
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	/** As tall as a Rocker (20 px), with smaller type — for a picker that sits beside one. */
	dense?: boolean;
}

// Segmented pills: hairline-bordered row, exactly one denim-filled active
// segment. Used for loop gap, subdivision, and the mobile Loop/Once control.
export default function Segmented({ options, value, onChange, disabled, dense }: SegmentedProps) {
	return (
		<div
			className={`flex border border-line-strong ${dense ? "h-5" : ""} ${
				disabled ? "pointer-events-none" : ""
			}`}
		>
			{options.map((opt, i) => {
				const on = opt.value === value;
				return (
					<button
						key={opt.value}
						type="button"
						disabled={disabled}
						onClick={() => onChange(opt.value)}
						className={`flex-1 font-mono tracking-[0.08em] uppercase transition-colors ${
							dense ? "h-full px-1 text-[9px] leading-none" : "py-1.5 text-[10px]"
						} ${
							i > 0 ? "border-l border-line-strong" : ""
						} ${on ? "bg-denim text-on-denim" : "text-ink-dim hover:text-denim"}`}
					>
						{opt.label}
					</button>
				);
			})}
		</div>
	);
}
