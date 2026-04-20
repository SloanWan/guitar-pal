"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

import { CircleX } from "lucide-react";

import { useState, useEffect } from "react";
import { Exercise } from "@/types/database";
import { createExercise, getExercises, deleteExercise } from "@/lib/exercises";

export default function ExerciseList() {
	const [title, setTitle] = useState("");
	const [category, setCategory] = useState<Exercise["category"]>("chord"); // set default category to "chord"
	const [description, setDescription] = useState("");
	const [loading, setLoading] = useState(false);
	const [exercises, setExercises] = useState<Exercise[]>([]);

	useEffect(() => {
		getExercises()
			.then(setExercises)
			.catch((error) => {
				console.error("Error fetching exercises:", error);
			});
	}, []);

	async function handleAddExercise() {
		if (!title.trim()) return;
		setLoading(true);
		const exercise = await createExercise(title, category, description || null);
		setExercises((prev) => [exercise, ...prev]); // add new exercise to the top of the list
		setTitle("");
		setDescription("");
		setLoading(false);
	}

	async function handleDeleteExercise(id: string) {
		await deleteExercise(id);
		setExercises((prev) => prev.filter((e) => e.id !== id));
	}

	return (
		<div className="space-y-6">
			{/* create exercise */}
			<Card>
				<CardHeader>
					<CardTitle>Add Exercise Items</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label>Name</Label>
						<Input
							placeholder="e.g. C Major Scale"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label>Category</Label>
						<Select
							value={category}
							onValueChange={(value) => setCategory(value as Exercise["category"])}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a category" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectLabel>Exercise Category</SelectLabel>
									<SelectItem value="chord">Chord</SelectItem>
									<SelectItem value="scale">Scale</SelectItem>
									<SelectItem value="fingering">Fingering</SelectItem>
									<SelectItem value="strumming">Strumming</SelectItem>
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label>Description (optional)</Label>
						<Input
							placeholder="e.g. Summary of this exercise..."
							value={description}
							onChange={(e) => setDescription(e.target.value)}
						/>
					</div>
					<Button disabled={loading} onClick={handleAddExercise}>
						{loading ? "Adding..." : "Add Exercise"}
					</Button>
				</CardContent>
			</Card>

			{/* display all exersices */}
			<Card>
				<CardHeader>
					<CardTitle>All Exercises</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{exercises.map((exercise) => (
						<Card key={exercise.id}>
							<CardContent className="flex justify-between">
								<div className="flex gap-2 capitalize">
									<div>{exercise.category}:</div>
									<div>{exercise.title}</div>
								</div>
								<Button
									onClick={() => handleDeleteExercise(exercise.id)}
									variant="destructive"
								>
									<CircleX />
								</Button>
							</CardContent>
						</Card>
					))}
				</CardContent>
			</Card>
		</div>
	);
}
