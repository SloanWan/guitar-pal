import { Volume2 } from "lucide-react";
import Fader from "@/components/ui/Fader";

export interface NoteSoundControlProps {
	gain: number;
	onChange: (gain: number) => void;
}

// Note volume, with its header; the same block in the desktop panel and the
// mobile drawer.
export function NoteSoundControl({ gain, onChange }: NoteSoundControlProps) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-denim">
				<span className="flex items-center gap-1.5">
					<Volume2 size={12} strokeWidth={2} className="shrink-0" />
					Note Sound
				</span>
				<span className="tabular-nums">{Math.round(gain * 100)}%</span>
			</div>
			<Fader
				min={0}
				max={2}
				step={0.01}
				value={gain}
				onValue={(v) => {
					onChange(v);
					navigator.vibrate?.(10);
				}}
				ticks={[0, 25, 50, 75, 100]}
				tickValues={[0, 0.5, 1, 1.5, 2]}
				scale={["0", "100", "200"]}
				ariaLabel="Note volume"
			/>
		</div>
	);
}
