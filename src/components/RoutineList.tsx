"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Plus,
	Trash2,
	Play,
	ChevronRight,
	ChevronDown,
	Clock,
	Pencil,
	ArrowUp,
	ArrowDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
	createRoutine,
	getRoutines,
	deleteRoutine,
	getRoutineExercises,
	addExerciseToRoutine,
	removeExerciseFromRoutine,
	updateRoutineExerciseDuration,
	swapRoutineExerciseOrder,
} from "@/lib/routines";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { Routine, RoutineExercise, Exercise, CATEGORIES } from "@/types/database";
import { CATEGORY_LABELS, CATEGORY_COLORS } from "@/lib/constants";

type RoutineExerciseWithExercise = RoutineExercise & { exercise: Exercise };

export default function RoutineList({ exercises }: { exercises: Exercise[] }) {
	const [showForm, setShowForm] = useState(false);
	const [loading, setLoading] = useState(false);
	const [title, setTitle] = useState("");
	const [routines, setRoutines] = useState<Routine[]>([]);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [routineExercisesMap, setRoutineExercisesMap] = useState<
		Record<string, RoutineExerciseWithExercise[]>
	>({});
	const [loadingExercises, setLoadingExercises] = useState<string | null>(null);
	const [selectedCategory, setSelectedCategory] = useState<Exercise["category"] | "">("");
	const [selectedExerciseId, setSelectedExerciseId] = useState<string>("");
	const [duration, setDuration] = useState<number | "">("");

	const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);

	const router = useRouter();
	const filteredExercises = exercises.filter((ex) => ex.category === selectedCategory);

	const editingRoutine = routines.find((r) => r.id === editingRoutineId) ?? null;
	const dialogExercises = editingRoutineId ? (routineExercisesMap[editingRoutineId] ?? []) : [];

	useEffect(() => {
		getRoutines().then(setRoutines);
	}, []);

	const previousExercisesLength = useRef(exercises.length);
	useEffect(() => {
		if (exercises.length < previousExercisesLength.current) {
			setRoutineExercisesMap({});
			setExpandedId(null);
		}
		previousExercisesLength.current = exercises.length;
	}, [exercises]);

	// Fetch exercises for dialog if not yet loaded
	useEffect(() => {
		if (!editingRoutineId || routineExercisesMap[editingRoutineId]) return;
		getRoutineExercises(editingRoutineId).then((exs) =>
			setRoutineExercisesMap((prev) => ({ ...prev, [editingRoutineId]: exs })),
		);
	}, [editingRoutineId]);

	async function handleAddRoutine() {
		if (!title.trim()) return;
		setLoading(true);
		try {
			const routine = await createRoutine(title);
			setRoutines((prev) => [routine, ...prev]);
			setTitle("");
			setShowForm(false);
		} catch (error) {
			console.error("Error creating routine:", error);
		} finally {
			setLoading(false);
		}
	}

	async function handleToggleRoutine(routine: Routine) {
		if (expandedId === routine.id) {
			setExpandedId(null);
			return;
		}
		setExpandedId(routine.id);
		if (!routineExercisesMap[routine.id]) {
			setLoadingExercises(routine.id);
			try {
				const routineExercises = await getRoutineExercises(routine.id);
				setRoutineExercisesMap((prev) => ({ ...prev, [routine.id]: routineExercises }));
			} catch (error) {
				console.error("Error fetching routine exercises:", error);
			} finally {
				setLoadingExercises(null);
			}
		}
	}

	async function handleDeleteRoutine(e: React.MouseEvent, id: string) {
		e.stopPropagation();
		try {
			await deleteRoutine(id);
			setRoutines((prev) => prev.filter((r) => r.id !== id));
			if (expandedId === id) setExpandedId(null);
		} catch (error) {
			console.error("Error deleting routine:", error);
		}
	}

	async function handleRemoveExerciseFromRoutine(routineId: string, routineExerciseId: string) {
		await removeExerciseFromRoutine(routineExerciseId);
		setRoutineExercisesMap((prev) => ({
			...prev,
			[routineId]: prev[routineId].filter((re) => re.id !== routineExerciseId),
		}));
	}

	async function handleUpdateDuration(
		routineId: string,
		routineExerciseId: string,
		mins: number,
	) {
		await updateRoutineExerciseDuration(routineExerciseId, mins);
		setRoutineExercisesMap((prev) => ({
			...prev,
			[routineId]: prev[routineId].map((re) =>
				re.id === routineExerciseId ? { ...re, duration_minutes: mins } : re,
			),
		}));
	}

	async function handleSwapOrder(routineId: string, idA: string, idB: string) {
		await swapRoutineExerciseOrder(idA, idB);
		setRoutineExercisesMap((prev) => {
			const list = prev[routineId];
			const a = list.find((re) => re.id === idA)!;
			const b = list.find((re) => re.id === idB)!;
			const aOrder = a.order_index;
			const updated = list.map((re) => {
				if (re.id === idA) return { ...re, order_index: b.order_index };
				if (re.id === idB) return { ...re, order_index: aOrder };
				return re;
			});
			return { ...prev, [routineId]: updated.sort((x, y) => x.order_index - y.order_index) };
		});
	}

	function closeDialog() {
		setEditingRoutineId(null);
		setSelectedCategory("");
		setSelectedExerciseId("");
		setDuration("");
	}

	async function handleAddExerciseToRoutine(routineId: string) {
		if (!selectedExerciseId || !duration) return;
		const currentRoutineExercises = routineExercisesMap[routineId] || [];
		const orderIdx = currentRoutineExercises.length;
		try {
			const newRE = await addExerciseToRoutine(
				routineId,
				selectedExerciseId,
				duration as number,
				orderIdx,
			);
			const exercise = exercises.find((ex) => ex.id === selectedExerciseId);
			if (!exercise) return;
			setRoutineExercisesMap((prev) => ({
				...prev,
				[routineId]: [...(prev[routineId] || []), { ...newRE, exercise }],
			}));
			setSelectedCategory("");
			setSelectedExerciseId("");
			setDuration("");
		} catch (error) {
			console.error("Error adding exercise to routine:", error);
		}
	}

	return (
		<div className="space-y-4">
			{/* Section header */}
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-base font-semibold">Routines</h2>
					<p className="text-xs text-muted-foreground">{routines.length} total</p>
				</div>
				<Button
					size="sm"
					variant={showForm ? "secondary" : "default"}
					onClick={() => setShowForm((v) => !v)}
				>
					<Plus className="size-3.5" />
					New Routine
				</Button>
			</div>

			{/* Collapsible create form */}
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
							<div className="space-y-1.5">
								<Label className="text-xs">Routine name</Label>
								<Input
									className="h-8 text-xs"
									placeholder="e.g. Morning warmup"
									value={title}
									onChange={(e) => setTitle(e.target.value)}
									onKeyDown={(e) => e.key === "Enter" && handleAddRoutine()}
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
									onClick={handleAddRoutine}
								>
									{loading ? "Creating..." : "Create"}
								</Button>
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Routines list */}
			<div className="rounded-xl border border-border bg-card overflow-hidden">
				{routines.length === 0 ? (
					<div className="px-4 py-10 text-center text-sm text-muted-foreground">
						No routines yet. Create one to get started.
					</div>
				) : (
					<AnimatePresence initial={false}>
						{routines.map((routine, i) => {
							const isExpanded = expandedId === routine.id;
							const routineExercises = routineExercisesMap[routine.id] || [];
							const totalMins = routineExercises.reduce(
								(sum, re) => sum + re.duration_minutes,
								0,
							);

							return (
								<motion.div
									key={routine.id}
									layout
									transition={{
										layout: { type: "spring", stiffness: 500, damping: 35 },
									}}
									className={
										i < routines.length - 1 ? "border-b border-border" : ""
									}
								>
									{/* Routine header row */}
									<div
										className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-muted/40 transition-colors"
										onClick={() => handleToggleRoutine(routine)}
									>
										<div className="flex items-center gap-2 min-w-0">
											{isExpanded ? (
												<ChevronDown className="size-4 text-muted-foreground shrink-0" />
											) : (
												<ChevronRight className="size-4 text-muted-foreground shrink-0" />
											)}
											<span className="text-sm font-medium truncate">
												{routine.title}
											</span>
											{routineExercises.length > 0 && (
												<span className="text-xs text-muted-foreground shrink-0">
													{routineExercises.length} ex · {totalMins}m
												</span>
											)}
										</div>
										<div className="flex items-center gap-1 shrink-0">
											<Button
												size="sm"
												variant="secondary"
												onClick={(e) => {
													e.stopPropagation();
													router.push(`/session/${routine.id}`);
												}}
											>
												<Play className="size-3.5" />
												Start
											</Button>
											<Button
												size="icon-sm"
												variant="ghost"
												onClick={(e) => {
													e.stopPropagation();
													setEditingRoutineId(routine.id);
												}}
												className="text-muted-foreground"
												title="Edit"
											>
												<Pencil className="size-3.5" />
											</Button>
											<Button
												size="icon-sm"
												variant="ghost"
												onClick={(e) => handleDeleteRoutine(e, routine.id)}
												className="text-muted-foreground hover:text-destructive"
											>
												<Trash2 className="size-3.5" />
											</Button>
										</div>
									</div>

									{/* Expanded panel */}
									<AnimatePresence initial={false}>
										{isExpanded && (
											<motion.div
												initial={{ height: 0, opacity: 0 }}
												animate={{ height: "auto", opacity: 1 }}
												exit={{ height: 0, opacity: 0 }}
												transition={{ duration: 0.2, ease: "easeInOut" }}
												style={{ overflow: "hidden" }}
											>
												<div className="px-4 pb-4 border-t border-border bg-muted/20">
													{loadingExercises === routine.id ? (
														<p className="text-xs text-muted-foreground pt-3">
															Loading...
														</p>
													) : routineExercises.length > 0 ? (
														<div className="space-y-1.5 pt-3">
															{routineExercises.map((re) => (
																<div
																	key={re.id}
																	className="flex items-center justify-between text-xs"
																>
																	<div className="flex items-center gap-2">
																		<span
																			className={`inline-flex items-center rounded-md ${CATEGORY_COLORS[re.exercise.category]} px-1.5 py-0.5 text-[10px] font-medium`}
																		>
																			{
																				CATEGORY_LABELS[
																					re.exercise
																						.category
																				]
																			}
																		</span>
																		<span>
																			{re.exercise.title}
																		</span>
																	</div>
																	<div className="flex items-center gap-1 text-muted-foreground">
																		<Clock className="size-3" />
																		<span>
																			{re.duration_minutes}m
																		</span>
																	</div>
																</div>
															))}
														</div>
													) : (
														<p className="text-xs text-muted-foreground pt-3">
															No exercises added yet.
														</p>
													)}
												</div>
											</motion.div>
										)}
									</AnimatePresence>
								</motion.div>
							);
						})}
					</AnimatePresence>
				)}
			</div>

			{/* Edit routine dialog */}
			<Dialog
				open={editingRoutineId !== null}
				onOpenChange={(open: boolean) => {
					if (!open) closeDialog();
				}}
			>
				<DialogContent className="max-w-md sm:max-w-xl">
					<DialogHeader>
						<DialogTitle className="text-base">{editingRoutine?.title}</DialogTitle>
						<DialogDescription className="sr-only">
							Manage exercises in this routine
						</DialogDescription>
					</DialogHeader>

					{/* Exercise rows */}
					<div className="divide-y divide-border min-h-0">
						{dialogExercises.length === 0 ? (
							<p className="text-xs text-muted-foreground">No exercises yet.</p>
						) : (
							<AnimatePresence initial={false}>
								{dialogExercises.map((re, i) => (
									<motion.div
										key={re.id}
										initial={{ opacity: 0, y: 8 }}
										animate={{ opacity: 1, y: 0 }}
										exit={{ opacity: 0, y: 8 }}
										transition={{ duration: 0.15 }}
										className="flex items-center gap-2 py-1.5"
									>
										<span
											className={`inline-flex items-center rounded-md ${CATEGORY_COLORS[re.exercise.category]} px-1.5 py-0.5 text-[10px] font-medium shrink-0`}
										>
											{CATEGORY_LABELS[re.exercise.category]}
										</span>
										<span className="text-sm flex-1 w-30 sm:w-60 overflow-hidden text-ellipsis">
											{re.exercise.title}
										</span>
										<div className="flex items-center gap-2">
											<Input
												key={re.id + re.duration_minutes}
												type="number"
												className="h-7 text-xs w-14 shrink-0"
												defaultValue={re.duration_minutes}
												// onBlur: update duration if changed and >0, only if value is different to avoid unnecessary API calls
												onBlur={(e) => {
													const val = Number(e.target.value);
													if (val > 0 && val !== re.duration_minutes) {
														handleUpdateDuration(
															editingRoutineId!,
															re.id,
															val,
														);
													}
												}}
											/>
											<span className="text-xs text-muted-foreground shrink-0">
												m
											</span>
										</div>
										<Button
											size="icon-sm"
											variant="ghost"
											disabled={i === 0}
											onClick={() =>
												handleSwapOrder(
													editingRoutineId!,
													re.id,
													dialogExercises[i - 1].id,
												)
											}
											className="hover:text-emerald-600!"
										>
											<ArrowUp className="size-3.5" />
										</Button>
										<Button
											size="icon-sm"
											variant="ghost"
											disabled={i === dialogExercises.length - 1}
											onClick={() =>
												handleSwapOrder(
													editingRoutineId!,
													re.id,
													dialogExercises[i + 1].id,
												)
											}
											className="hover:text-amber-600!"
										>
											<ArrowDown className="size-3.5" />
										</Button>
										<Button
											size="icon-sm"
											variant="ghost"
											onClick={() =>
												handleRemoveExerciseFromRoutine(
													editingRoutineId!,
													re.id,
												)
											}
											className="text-muted-foreground hover:text-destructive"
										>
											<Trash2 className="size-3.5" />
										</Button>
									</motion.div>
								))}
							</AnimatePresence>
						)}
					</div>

					{/* Add exercise */}
					<div className="space-y-2 pt-2 border-border">
						<p className="text-sm font-medium text-muted-foreground">Add exercise</p>
						<div className="flex gap-2">
							<Select
								value={selectedCategory}
								onValueChange={(v) => {
									setSelectedCategory(v as Exercise["category"]);
									setSelectedExerciseId("");
								}}
							>
								<SelectTrigger className="h-7 text-[12px]">
									<SelectValue placeholder="Category" />
								</SelectTrigger>
								<SelectContent>
									{CATEGORIES.map((cat) => (
										<SelectItem key={cat} value={cat}>
											{CATEGORY_LABELS[cat]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Select
								value={selectedExerciseId}
								onValueChange={setSelectedExerciseId}
								disabled={!selectedCategory || filteredExercises.length === 0}
							>
								<SelectTrigger className="h-7 text-[12px] max-w-60 sm:max-w-100 overflow-hidden text-ellipsis">
									<SelectValue
										placeholder={
											!selectedCategory
												? "Pick category first"
												: filteredExercises.length === 0
													? "None in category"
													: "Exercise"
										}
									/>
								</SelectTrigger>
								<SelectContent>
									{filteredExercises.map((ex) => (
										<SelectItem key={ex.id} value={ex.id}>
											{ex.title}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex gap-2">
							<Input
								type="number"
								className="h-7 text-[11px] w-50"
								placeholder="Duration (min)"
								value={duration}
								onChange={(e) => setDuration(Number(e.target.value))}
							/>
							<Button
								size="sm"
								disabled={!selectedCategory || !selectedExerciseId || !duration}
								onClick={() => handleAddExerciseToRoutine(editingRoutineId!)}
								className="w-20 disabled:pointer-events-auto disabled:cursor-not-allowed hover:enabled:bg-amber-700!"
							>
								Add
							</Button>
						</div>
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={closeDialog}>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
