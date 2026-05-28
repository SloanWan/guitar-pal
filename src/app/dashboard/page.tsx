"use client";

import { useRouter } from "next/navigation";
import { getUser } from "@/lib/auth";
import { useEffect, useState } from "react";

import ExerciseList from "@/components/ExerciseList";
import RoutineList from "@/components/RoutineList";

export default function DashboardPage() {
	const router = useRouter();
	const [loading, setLoading] = useState(true);
	const [validUserId, setValidUserId] = useState<string | null>(null);

	useEffect(() => {
		async function checkUser() {
			const user = await getUser();
			if (!user) router.push("/auth");
			setValidUserId(user?.id || null);
			setLoading(false);
		}
		checkUser();
	}, [router]);

	if (loading)
		return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

	return (
		<div className="min-h-screen p-8 space-y-6">
			<h1 className="text-xl">Guitar Pal</h1>
			<p>Welcome to your online guitar studio space</p>
			<p>This is user id: {validUserId}</p>
			<ExerciseList />
			<RoutineList />
		</div>
	);
}
