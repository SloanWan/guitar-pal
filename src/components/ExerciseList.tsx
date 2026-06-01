"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { useState, useEffect } from "react";
import { Exercise, CATEGORIES } from "@/types/database";
import { createExercise, getExercises, deleteExercise } from "@/lib/exercises";

const CATEGORY_LABELS: Record<string, string> = {
	chord: "Chord",
	chord_change: "Chord Change",
	picking: "Picking",
	scale: "Scale",
	strumming: "Strumming",
	fingering: "Fingering",
	ear_training: "Ear Training",
	arpeggio: "Arpeggio",
	theory: "Theory",
	song: "Song",
};

const CATEGORY_COLORS: Record<string, string> = {
	chord: "bg-amber-100 text-amber-800",
	chord_change: "bg-orange-100 text-orange-800",
	picking: "bg-green-100 text-green-800",
	scale: "bg-blue-100 text-blue-800",
	strumming: "bg-purple-100 text-purple-800",
	fingering: "bg-pink-100 text-pink-800",
	ear_training: "bg-cyan-100 text-cyan-800",
	arpeggio: "bg-indigo-100 text-indigo-800",
	theory: "bg-gray-100 text-gray-800",
	song: "bg-red-100 text-red-800",
};

export default function ExerciseList({
	exercises,
	onExerciseChange,
	onAddExercise,
}: {
	exercises: Exercise[];
	onExerciseChange: () => void;
	onAddExercise: (exercise: Exercise) => void;
}) {
	const [showForm, setShowForm] = useState(false);
	const [title, setTitle] = useState("");
	const [category, setCategory] = useState<Exercise["category"]>("chord");
	const [description, setDescription] = useState("");
	const [loading, setLoading] = useState(false);

	async function handleAddExercise() {
		if (!title.trim()) return;
		setLoading(true);
		const newExercise = await createExercise(title, category, description || null);
		// onExerciseChange();
		onAddExercise(newExercise);
		setTitle("");
		setDescription("");
		setShowForm(false);
		setLoading(false);
	}

	async function handleDeleteExercise(id: string) {
		await deleteExercise(id);
		onExerciseChange();
	}

	return (
		<div className="space-y-4">
			{/* Section header */}
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-base font-semibold">Exercises</h2>
					<p className="text-xs text-muted-foreground">{exercises.length} total</p>
				</div>
				<Button
					size="sm"
					variant={showForm ? "secondary" : "default"}
					onClick={() => setShowForm((v) => !v)}
				>
					<Plus className="size-3.5" />
					Add Exercise
				</Button>
			</div>

			{/* Collapsible add form */}
			<AnimatePresence initial={false}>
				{showForm && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: "easeInOut" }}
						style={{ overflow: "hidden" }}
					>
						<div className="rounded-xl border border-border bg-card p-4 space-y-3">
							<div className="grid grid-cols-2 gap-3">
								<div className="space-y-1.5">
									<Label className="text-xs">Category</Label>
									<Select
										value={category}
										onValueChange={(v) =>
											setCategory(v as Exercise["category"])
										}
									>
										<SelectTrigger className="h-8 text-xs">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												{CATEGORIES.map((cat) => (
													<SelectItem
														key={cat}
														value={cat}
														className="text-xs"
													>
														{CATEGORY_LABELS[cat]}
													</SelectItem>
												))}
											</SelectGroup>
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1.5">
									<Label className="text-xs">Name</Label>
									<Input
										className="h-8 text-xs"
										placeholder="e.g. C Major Scale"
										value={title}
										onChange={(e) => setTitle(e.target.value)}
										onKeyDown={(e) => e.key === "Enter" && handleAddExercise()}
									/>
								</div>
							</div>
							<div className="space-y-1.5">
								<Label className="text-xs">
									Description{" "}
									<span className="text-muted-foreground">(optional)</span>
								</Label>
								<Input
									className="h-8 text-xs"
									placeholder="Brief description..."
									value={description}
									onChange={(e) => setDescription(e.target.value)}
								/>
							</div>
							<div className="flex justify-end gap-2">
								<Button
									size="sm"
									variant="outline"
									onClick={() => setShowForm(false)}
								>
									Cancel
								</Button>
								<Button
									size="sm"
									disabled={loading || !title.trim()}
									onClick={handleAddExercise}
								>
									{loading ? "Adding..." : "Add"}
								</Button>
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Exercise list */}
			<div className="rounded-xl border border-border bg-card overflow-hidden">
				{exercises.length === 0 ? (
					<div className="px-4 py-10 text-center text-sm text-muted-foreground">
						No exercises yet. Add one to get started.
					</div>
				) : (
					<AnimatePresence initial={false}>
						{exercises.map((exercise, i) => (
							<motion.div
								key={exercise.id}
								initial={{ opacity: 0, y: -8 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, x: -16 }}
								transition={{ duration: 0.15 }}
								className={`flex items-center justify-between px-4 py-3 ${
									i < exercises.length - 1 ? "border-b border-border" : ""
								}`}
							>
								<div className="flex items-center gap-3 min-w-0">
									<span
										className={`shrink-0 inline-flex items-center rounded-md ${CATEGORY_COLORS[exercise.category]} px-2 py-0.5 text-xs font-medium`}
									>
										{CATEGORY_LABELS[exercise.category]}
									</span>
									<span className="text-sm font-medium truncate">
										{exercise.title}
									</span>
									{exercise.description && (
										<span className="text-xs text-muted-foreground truncate hidden sm:block">
											{exercise.description}
										</span>
									)}
								</div>
								<Button
									size="icon-sm"
									variant="ghost"
									onClick={() => handleDeleteExercise(exercise.id)}
									className="shrink-0 text-muted-foreground hover:text-destructive"
								>
									<Trash2 className="size-3.5" />
								</Button>
							</motion.div>
						))}
					</AnimatePresence>
				)}
			</div>
		</div>
	);
}
