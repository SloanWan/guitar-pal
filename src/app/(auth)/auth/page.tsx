"use client";

import { signIn, signUp } from "@/lib/auth";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Guitar } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function AuthPageInner() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<Error | null>(null);
	const [loading, setLoading] = useState(false);
	const router = useRouter();
	const searchParams = useSearchParams();
	const redirect = searchParams.get("redirect") ?? "/dashboard";

	async function handleSignIn() {
		setLoading(true);
		setError(null);
		const { error } = await signIn(email, password);
		if (error) setError(error);
		else router.push(redirect);
		setLoading(false);
	}

	async function handleSignUp() {
		setLoading(true);
		setError(null);
		const { error } = await signUp(email, password);
		if (error) setError(error);
		else router.push(redirect);
		setLoading(false);
	}

	return (
		<div className="min-h-screen flex items-center justify-center bg-background px-4">
			<div className="w-full max-w-sm space-y-6">
				{/* Brand mark */}
				<div className="flex flex-col items-center gap-3 text-center">
					<div className="flex items-center justify-center size-12 rounded-xl bg-denim-tint text-denim">
						<Guitar className="size-6" />
					</div>
					<div>
						<h1 className="text-xl font-semibold tracking-tight">Guitar Pal</h1>
						<p className="text-sm text-muted-foreground">
							Your personal practice studio
						</p>
					</div>
				</div>

				{/* Auth card */}
				<Card>
					<CardContent className="pt-4 pb-5">
						<Tabs defaultValue="sign-in">
							<TabsList className="w-full">
								<TabsTrigger value="sign-in" className="flex-1">
									Sign In
								</TabsTrigger>
								<TabsTrigger value="sign-up" className="flex-1">
									Sign Up
								</TabsTrigger>
							</TabsList>

							<TabsContent value="sign-in" className="space-y-4 mt-4">
								<div className="space-y-1.5">
									<Label>Email</Label>
									<Input
										type="email"
										placeholder="you@example.com"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
									/>
								</div>
								<div className="space-y-1.5">
									<Label>Password</Label>
									<Input
										type="password"
										placeholder="••••••••"
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
									/>
								</div>
								{error && (
									<p className="text-destructive text-sm">{error.message}</p>
								)}
								<Button
									className="w-full"
									onClick={handleSignIn}
									disabled={loading}
								>
									{loading ? "Signing in..." : "Sign In"}
								</Button>
							</TabsContent>

							<TabsContent value="sign-up" className="space-y-4 mt-4">
								<div className="space-y-1.5">
									<Label>Email</Label>
									<Input
										type="email"
										placeholder="you@example.com"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
									/>
								</div>
								<div className="space-y-1.5">
									<Label>Password</Label>
									<Input
										type="password"
										placeholder="••••••••"
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										onKeyDown={(e) => e.key === "Enter" && handleSignUp()}
									/>
								</div>
								{error && (
									<p className="text-destructive text-sm">{error.message}</p>
								)}
								<Button
									className="w-full"
									onClick={handleSignUp}
									disabled={loading}
								>
									{loading ? "Creating account..." : "Create Account"}
								</Button>
							</TabsContent>
						</Tabs>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

export default function AuthPage() {
	return (
		<Suspense fallback={null}>
			<AuthPageInner />
		</Suspense>
	);
}
