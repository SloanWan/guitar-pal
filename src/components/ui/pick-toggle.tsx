import { Pick } from "@/components/ui/pick";
import { cn } from "@/lib/utils";

interface Props {
	pressed: boolean;
	onPressedChange: (pressed: boolean) => void;
	/** What it keeps, e.g. "Favourite Am7"; the pressed state says whether it is kept. */
	label: string;
	className?: string;
}

/** Keep something as a favourite: a pick, grey until kept, then the module's colour and tilted. */
export function PickToggle({ pressed, onPressedChange, label, className }: Props) {
	return (
		<button
			type="button"
			className={cn("gp-pick-toggle gp-focus", className)}
			aria-pressed={pressed}
			aria-label={label}
			title={label}
			onClick={() => onPressedChange(!pressed)}
		>
			<Pick />
		</button>
	);
}
