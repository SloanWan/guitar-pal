"use client";

import { useRouter } from "next/navigation";
import { getUser } from "@/lib/auth";
import { useEffect, useState } from "react";

import ExerciseList from "@/components/ExerciseList";

export default function DashboardPage() {
	const router = useRouter();
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		async function checkUser() {
			const user = await getUser();
			if (!user) router.push("/auth");
			setLoading(false);
		}
		checkUser();
	}, [router]);

	if (loading)
		return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

	return (
		<div className="min-h-screen p-8">
			<h1>Header: Guitar Pal</h1>
			<p>Welcome to your online guitar studio space</p>
			<ExerciseList />
		</div>
	);
}
