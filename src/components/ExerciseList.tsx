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
import {
	createExercise,
	getExercises,
	deleteExercise,
	removeAllRoutineExercisesByExerciseId,
	getRoutineNamesForExercise,
} from "@/lib/exercises";

import { CATEGORY_LABELS, CATEGORY_COLORS } from "@/lib/constants";

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
	const [activeCategory, setActiveCategory] = useState<string | null>(null);
	const [pendingDelete, setPendingDelete] = useState<{
		id: string;
		routineNames: string[];
	} | null>(null);

	const presentCategories = CATEGORIES.filter((cat) => exercises.some((e) => e.category === cat));

	// Clear filter if the active category disappears from the list
	useEffect(() => {
		if (activeCategory && !presentCategories.includes(activeCategory as Exercise["category"])) {
			setActiveCategory(null);
		}
	}, [exercises]);

	const filteredExercises = activeCategory
		? exercises.filter((e) => e.category === activeCategory)
		: exercises;

	async function handleAddExercise() {
		if (!title.trim()) return;
		setLoading(true);
		const newExercise = await createExercise(title, category, description || null);
		onAddExercise(newExercise);
		setTitle("");
		setDescription("");
		setShowForm(false);
		setLoading(false);
	}

	async function handleDeleteExercise(id: string) {
		const routineNames = await getRoutineNamesForExercise(id);
		if (routineNames.length > 0) {
			setPendingDelete({ id, routineNames });
		} else {
			await deleteExercise(id);
			onExerciseChange();
		}
	}

	async function handleConfirmDelete() {
		if (!pendingDelete) return;
		await removeAllRoutineExercisesByExerciseId(pendingDelete.id);
		await deleteExercise(pendingDelete.id);
		setPendingDelete(null);
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

			{/* Category filter bar */}
			{presentCategories.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					<button
						onClick={() => setActiveCategory(null)}
						style={{ transition: "background-color 150ms ease, color 150ms ease" }}
						className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
							activeCategory === null
								? "bg-primary text-primary-foreground"
								: "border border-border text-muted-foreground hover:bg-muted"
						}`}
					>
						All
					</button>
					{presentCategories.map((cat) => (
						<button
							key={cat}
							onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
							style={{ transition: "background-color 150ms ease, color 150ms ease" }}
							className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
								activeCategory === cat
									? CATEGORY_COLORS[cat]
									: "border border-border text-muted-foreground hover:bg-muted"
							}`}
						>
							{CATEGORY_LABELS[cat]}
						</button>
					))}
				</div>
			)}

			{/* Exercise list */}
			<div className="rounded-xl border border-border bg-card overflow-hidden">
				{exercises.length === 0 ? (
					<div className="px-4 py-10 text-center text-sm text-muted-foreground">
						No exercises yet. Add one to get started.
					</div>
				) : filteredExercises.length === 0 ? (
					<div className="px-4 py-10 text-center text-sm text-muted-foreground">
						No exercises in this category.
					</div>
				) : (
					<AnimatePresence initial={false} mode="popLayout">
						{filteredExercises.map((exercise, i) => (
							<motion.div
								key={exercise.id}
								layoutId={exercise.id}
								layout
								initial={{ opacity: 0, y: -8 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, x: -16 }}
								transition={{
									duration: 0.15,
									layout: { type: "spring", stiffness: 500, damping: 35 },
								}}
								className={
									i < filteredExercises.length - 1 ? "border-b border-border" : ""
								}
							>
								{/* Exercise row */}
								<div className="flex items-center justify-between px-4 py-3">
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
										onClick={() =>
											pendingDelete?.id === exercise.id
												? setPendingDelete(null)
												: handleDeleteExercise(exercise.id)
										}
										className="shrink-0 text-muted-foreground hover:text-destructive"
									>
										<Trash2 className="size-3.5" />
									</Button>
								</div>

								{/* Inline deletion warning */}
								<AnimatePresence initial={false}>
									{pendingDelete?.id === exercise.id && (
										<motion.div
											initial={{ height: 0, opacity: 0 }}
											animate={{ height: "auto", opacity: 1 }}
											exit={{ height: 0, opacity: 0 }}
											transition={{ duration: 0.2, ease: "easeInOut" }}
											style={{ overflow: "hidden" }}
										>
											<div className="border-t border-border px-4 py-3 space-y-2 bg-muted/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
												<div className="space-y-1">
													<p className="text-xs text-muted-foreground">
														This exercise is used in{" "}
														<span className="font-medium text-foreground border border-red-200 bg-red-100/50 px-1 rounded">
															{pendingDelete.routineNames.length === 1
																? pendingDelete.routineNames[0]
																: pendingDelete.routineNames
																		.slice(0, -1)
																		.join(", ") +
																	" and " +
																	pendingDelete.routineNames.at(
																		-1,
																	)}
														</span>
														.
													</p>
													<p className="text-xs text-muted-foreground">
														Deleting it will remove it from{" "}
														{pendingDelete.routineNames.length === 1
															? "that routine"
															: "those routines"}{" "}
														too.
													</p>
												</div>
												<div className="flex gap-2">
													<Button
														size="sm"
														variant="outline"
														className="h-7 text-xs"
														onClick={() => setPendingDelete(null)}
													>
														Cancel
													</Button>
													<Button
														size="sm"
														variant="destructive"
														className="h-7 text-xs"
														onClick={handleConfirmDelete}
													>
														Delete anyway
													</Button>
												</div>
											</div>
										</motion.div>
									)}
								</AnimatePresence>
							</motion.div>
						))}
					</AnimatePresence>
				)}
			</div>
		</div>
	);
}
