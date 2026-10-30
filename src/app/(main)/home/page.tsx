import HomePage from "@/components/home/HomePage";

// Signed in only: the proxy sends a signed-out visitor to /auth and back.
export default function Page() {
	return <HomePage />;
}
