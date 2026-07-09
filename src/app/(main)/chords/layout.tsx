export default function ChordsLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
			{children}
			<p className="mt-auto py-3 text-center text-[10px] md:text-xs text-muted-foreground border-t border-border">
				voicing data via{" "}
				<a
					href="https://github.com/tombatossals/chords-db"
					target="_blank"
					rel="noopener noreferrer"
					className="underline hover:text-foreground"
				>
					tombatossals/chords-db
				</a>
				{" · "}audio samples via{" "}
				<a
					href="https://github.com/surikov/webaudiofont"
					target="_blank"
					rel="noopener noreferrer"
					className="underline hover:text-foreground"
				>
					WebAudioFont
				</a>
			</p>
		</div>
	);
}
