// scripts/spike.ts
import { config } from "dotenv";
config({ path: ".env.local" });

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { EMIT_TAB_TOOL } from "../src/lib/tabImport/visionToolSchema";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const READING_PROMPT = `You are reading a single guitar tablature image and emitting it via the emit_tab tool.

Work in this exact order. Do not skip to filling the tool until you have done all steps:

1. TIME SIGNATURE: Find the time signature (e.g. 4/4, 3/4, 6/8). If none is shown, assume 4/4.

2. BAR LINES: Identify the vertical bar lines that separate measures. Count the measures.

3. PER MEASURE, read RHYTHM FIRST, before fret numbers:
   Look at each note's stem, flag, and beam to determine its duration (whole, half,
   quarter, eighth, sixteenth). Beamed notes are eighths or shorter. A note with no
   flag/beam and a filled head is a quarter. Do NOT default every note to a quarter — read
   the actual stems. The durations within one measure must sum to a full bar for the time
   signature; if your durations don't fill the bar, you misread a rhythm — re-read it.

4. PER NOTE, read STRING then FRET:
   The tab has 6 horizontal lines. The TOP line is the high-e string = string index 0.
   The BOTTOM line is the low-E string = string index 5. So top-to-bottom the indices are
   0,1,2,3,4,5. Check BOTH ends: confirm the top line is 0 and the bottom line is 5, then
   locate each number by counting from the nearer edge. Low strings (indices 3,4,5) are
   easy to miscount — verify against the bottom line.

5. Muted/dead notes marked "x" use fret "x". Notes tied to the previous same-fret note set
   tied=true. Hammer-on/pull-off/slide connect DIFFERENT frets — use technique, not tied.

6. If you are unsure about any note's fret or duration, set confidence "low" and explain in
   note, rather than guessing silently.

Emit exactly what the image shows, measure by measure, in order.`;

const READING_PROMPT_CHINESE = `逐音符分析这段吉他 tab。必须基于坐标测量，不要目测估计。

步骤：
1. 先测量 6 条弦线的 y 坐标，从上到下记为 string 0（高音e）到 string 5（低音E）。
2. 测量每个 fret 数字的 x 坐标和它所在的弦线 y，确定它在第几弦第几品。x 坐标相同的多个数字表示同时发声。
3. 测量每根符干（stem）的 x 坐标。找出哪些符干被同一条横梁（beam）连接——被连接的是八分音符或更短，孤立无梁无符尾的是四分音符。beam 分组必须基于符干 x 坐标的实际测量，不要凭间距印象判断。
4. 按 x 坐标顺序输出每个音：弦、品、时值，各自的坐标依据。
5. 一致性自检（必须执行，发现矛盾就回到对应步骤重测）
- 数出品位数字的总个数 A。
- 数出符干的总根数 B（注意：一个双音/和弦共用一根符干，但每根符干下方可能有多个数字）。
- 数出你最终输出的发声位置总数 C。
- 用时值验证：把每个音符的时值加起来，必须正好等于该小节拍号要求的总拍数。若不等，说明漏读或错读了音符或时值，返回步骤3重数符干和横梁。
- 逐列核对：对每一个不同的 x 坐标，列出该列上所有弦的数字。确认没有把两个不同 x 的音错误合并成一列，也没有把一列拆成两个。

只有当 A、B、C 与时值总和四者自洽时，才输出最终结果。`;

async function main() {
	const imagePath = process.argv[2];
	if (!imagePath) {
		console.error("Usage: npx tsx scripts/spike.ts <image-path>");
		process.exit(1);
	}

	const imageBase64 = readFileSync(imagePath, { encoding: "base64" });
	const mediaType = imagePath.endsWith(".png") ? "image/png" : "image/jpeg";

	// const response = await client.messages.create({
	// 	model: "claude-sonnet-4-5",
	// 	max_tokens: 4096,
	// 	tools: [EMIT_TAB_TOOL as any],
	// 	tool_choice: { type: "tool", name: "emit_tab" },
	// 	messages: [
	// 		{
	// 			role: "user",
	// 			content: [
	// 				{
	// 					type: "image",
	// 					source: { type: "base64", media_type: mediaType, data: imageBase64 },
	// 				},
	// 				{
	// 					type: "text",
	// 					text: "Read this guitar tab note by note. For each note give: string, fret, and duration, and say what visual feature told you the duration.",
	// 				},
	// 			],
	// 		},
	// 	],
	// });

	// const toolUse = response.content.find((b) => b.type === "tool_use");
	// console.log(JSON.stringify(toolUse?.input, null, 2));

	// no tool use
	const response = await client.messages.create({
		model: "claude-sonnet-4-6",
		max_tokens: 4096,

		messages: [
			{
				role: "user",
				content: [
					{
						type: "image",
						source: { type: "base64", media_type: mediaType, data: imageBase64 },
					},
					{
						type: "text",
						// text: "Read this guitar tab note by note. For each note give: string index (0=high e, 5=low E), fret, and duration (whole/half/quarter/eighth/sixteenth). For each duration, state what visual feature in the image told you it — the stem, flag, or beam. Go measure by measure.",
						// text: "逐音符描述这段 tab:每个音在第几弦第几品,时值多少,依据图里什么视觉特征判断的",
						text: READING_PROMPT_CHINESE,
					},
				],
			},
		],
	});

	const text = response.content
		.filter((b): b is Anthropic.TextBlock => b.type === "text")
		.map((b) => b.text)
		.join("\n");
	console.log(text);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
