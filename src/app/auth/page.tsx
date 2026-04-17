"use client";

import { signIn, signUp } from "@/lib/auth";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AuthPage() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<Error | null>(null);
	const [loading, setLoading] = useState(false);

	const router = useRouter();

	async function handleSignIn() {
		setLoading(true);
		setError(null);
		const { error } = await signIn(email, password);
		if (error) setError(error);
		else router.push("/dashboard");
		setLoading(false);
	}

	async function handleSignUp() {
		setLoading(true);
		setError(null);
		const { error } = await signUp(email, password);
		if (error) setError(error);
		else router.push("/dashboard");
		setLoading(false);
	}

	return (
		<div className="min-h-screen flex items-center justify-center">
			<Card className="max-w-md w-full">
				<CardHeader>
					<CardTitle>Guitar Pal</CardTitle>
				</CardHeader>
				<CardContent>
					<Tabs defaultValue="sign-in">
						<TabsList className="w-full">
							<TabsTrigger value="sign-in" className="w-full">
								Sign In
							</TabsTrigger>
							<TabsTrigger value="sign-up" className="w-full">
								Sign Up
							</TabsTrigger>
						</TabsList>
						<TabsContent value="sign-in" className="space-y-4">
							<div className="space-y-2">
								<Label>Email</Label>
								<Input
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
								></Input>
							</div>
							<div className="space-y-2">
								<Label>Password</Label>
								<Input
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
								></Input>
							</div>
							{error && <p className="text-red-500 text-sm">{error.message}</p>}
							<Button className="w-full" onClick={handleSignIn} disabled={loading}>
								{loading ? "Signing In..." : "Sign In"}
							</Button>
						</TabsContent>
						<TabsContent value="sign-up" className="space-y-4">
							<div className="space-y-2">
								<Label>Email</Label>
								<Input
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
								></Input>
							</div>
							<div className="space-y-2">
								<Label>Password</Label>
								<Input
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
								></Input>
							</div>
							{error && <p className="text-red-500 text-sm">{error.message}</p>}
							<Button className="w-full" onClick={handleSignUp} disabled={loading}>
								{loading ? "Signing Up..." : "Sign Up"}
							</Button>
						</TabsContent>
					</Tabs>
				</CardContent>
			</Card>
		</div>
	);
}
