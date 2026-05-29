export default function Home() {
	return (
		<div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
			<main className="">
				Welcome to Guitar Pal! Please{" "}
				<a
					href="/auth"
					className="text-blue-500 underline hover:text-blue-700 transition-colors"
				>
					sign in
				</a>{" "}
				to access your dashboard and start building your guitar practice routines.
			</main>
		</div>
	);
}
