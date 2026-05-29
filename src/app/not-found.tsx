import Link from "next/link";

export default function NotFound() {
	return (
		<div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
			<h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
			<p className="text-lg text-muted-foreground mb-6">
				Sorry, the page you're looking for doesn't exist.
			</p>
			<Link href="/" className="text-amber-600 hover:underline">
				Go back home
			</Link>
		</div>
	);
}
