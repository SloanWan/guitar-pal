export type StepValue = "D" | "U" | "X" | "" | "DG" | "UG" | "D3" | "U3";

export type Beat = StepValue[]; // length = 1|2|3|4

export type TickMode = "quarter" | "eighth" | "sixteenth";

export interface StrumPattern {
	id: string;
	name: string;
	beats: Beat[];
	description: string;
}

export const PRESET_STRUM_PATTERNS: StrumPattern[] = [
	{
		id: "4-4 on the one",
		name: "on the one",
		beats: [
			["D", "UG"],
			["", ""],
			["", ""],
			["", ""],
		],
		description: "D . . .",
	},
	{
		id: "4-4 on the beats",
		name: "on the beat",
		beats: [
			["D", "UG"],
			["D", "UG"],
			["D", "UG"],
			["D", "UG"],
		],
		description: "D D D D",
	},
	{
		id: "4-4 old faithful",
		name: "old faithful",
		beats: [
			["D", "UG"],
			["D", "U"],
			["DG", "U"],
			["D", "UG"],
		],
		description: "D DU UD",
	},
	{
		id: "4-4 triplet on one",
		name: "triplet on one",
		beats: [
			["D3", "U3", "D3"],
			["D", "UG"],
			["D", "UG"],
			["D", "UG"],
		],
		description: "DUD D D D",
	},
	{
		id: "4-4 boaf",
		name: "birds of a feather",
		beats: [
			["D", "UG", "DG", "U"],
			["D", "U", "D", "UG"],
			["DG", "U", "D", "U"],
			["D", "UG", "D", "U"],
		],
		description: "Billie Ilish",
	},
	{
		id: "3-4 test",
		name: "hualala",
		beats: [
			["D", "UG", "DG"],
			["D", "U", "D"],
			["D", "UG", "DG"],
			["D", "U", "D"],
		],
		description: "Billie Ilish",
	},
	{
		id: "4-4 triplet on 1 and 3",
		name: "triplet on 1+3",
		beats: [
			["D3", "U3", "D3"],
			["D", "UG"],
			["D3", "U3", "D3"],
			["D", "UG"],
		],
		description: "DUD D D D",
	},
	{
		id: "test1",
		name: "test1",
		beats: [
			["D", "UG"],
			["D", "U"],
			["DG", "U"],
			["D", "UG"],
		],
		description: "D DU UD",
	},
	{
		id: "muted",
		name: "muted",
		beats: [
			["D", "X", "U", "X"],
			["D", "X", "U", "X"],
			["U", "X"],
			["D", "X"],
		],
		description: "D DU UD",
	},
];
