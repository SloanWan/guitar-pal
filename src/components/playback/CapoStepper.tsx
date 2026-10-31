import "./playback.css";
import { Stepper } from "@/components/ui/stepper";
import { STRUM_CAPO_MAX } from "@/lib/strumPatterns";

/** The capo's fret, 0 (none) to the highest a capo goes: Strum's and Tab's, the same small stepper. */
export default function CapoStepper({
	capo,
	onCapo,
	className,
}: {
	capo: number;
	onCapo: (fret: number) => void;
	className?: string;
}) {
	return (
		<span className={className ? `pb-capo ${className}` : "pb-capo"}>
			<span className="pb-lab">Capo</span>
			<Stepper label="capo" value={capo} onChange={onCapo} min={0} max={STRUM_CAPO_MAX} dense />
		</span>
	);
}
