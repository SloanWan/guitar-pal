import { Pick } from "@/components/ui/pick";
import { useWriteGate } from "@/components/offline/WriteGate";
import { cn } from "@/lib/utils";

interface Props {
	pressed: boolean;
	onPressedChange: (pressed: boolean) => void;
	/** What it keeps, e.g. "Favourite Am7"; the pressed state says whether it is kept. */
	label: string;
	className?: string;
}

/**
 * Keep something as a favourite: a pick, grey until kept, then the module's
 * colour and tilted. A keep is a write, so offline it is closed for a
 * signed-in player, with the reason as its title (#469).
 */
export function PickToggle({ pressed, onPressedChange, label, className }: Props) {
	const gate = useWriteGate();
	return (
		<button
			type="button"
			className={cn("gp-pick-toggle gp-focus", className)}
			aria-pressed={pressed}
			aria-label={label}
			title={gate.reason ?? label}
			disabled={gate.blocked}
			onClick={() => onPressedChange(!pressed)}
		>
			<Pick />
		</button>
	);
}
