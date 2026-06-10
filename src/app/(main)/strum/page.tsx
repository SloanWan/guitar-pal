import StepGrid from "@/components/strum/StepGrip";
import { PRESET_STRUM_PATTERNS } from "@/lib/strumPatterns";

export default function StrumPage() {
	return (
		<div className="min-h-screen bg-background">
			<div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
				<h1 className="text-3xl font-bold mb-4">Strumming Playground</h1>
				<p className="text-lg text-muted-foreground">
					This is where the strumming machine will be implemented. Stay tuned for updates!
				</p>
				<div>NavBar: playground | library</div>
				<div>
					<h2>Strumming Patterns</h2>
					<div className="flex flex-col items-center capitalize gap-4">
						{PRESET_STRUM_PATTERNS.map((pattern, patternIdx) => {
							return (
								<div key={patternIdx}>
									<StepGrid
										beats={pattern.beats}
										name={pattern.name}
										activeCell={null}
									/>
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
}
