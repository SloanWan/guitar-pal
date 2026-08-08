// scripts/spike-cv.ts
import { config } from "dotenv";
config({ path: ".env.local" });

import Anthropic from "@anthropic-ai/sdk";
import { createReadStream } from "fs";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

async function main() {
	const imagePath = process.argv[2];
	if (!imagePath) {
		console.error("Usage: npx tsx scripts/spike-cv.ts <image-path>");
		process.exit(1);
	}

	// ── Step 1: upload the image via Files API → get file_id ──
	const fileObject = await client.beta.files.upload(
		{ file: createReadStream(imagePath) },
		{ headers: { "anthropic-beta": "files-api-2025-04-14" } },
	);
	console.log("uploaded, file_id:", fileObject.id);

	// ── Step 2: call with code execution + container_upload ──
	const response = await client.beta.messages.create({
		model: "claude-sonnet-4-6",
		betas: ["files-api-2025-04-14"],
		max_tokens: 8096,
		messages: [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "使用 code execution 工具，通过像素级测量(numpy/PIL/scipy)读取这张吉他 tab：先放大看整体结构，再写代码测弦线 y 坐标定弦号、连通域定位品位数字、量符干像素高度分辨八分/四分音符。逐音符输出弦、品、时值，以及每一步的坐标依据。",
					},
					{ type: "container_upload", file_id: fileObject.id },
				],
			},
		],
		tools: [{ type: "code_execution_20260521", name: "code_execution" }],
	});

	// ── Step 3: print the response ──
	for (const block of response.content) {
		if (block.type === "text") {
			console.log("\n=== TEXT ===\n", block.text);
		} else if (block.type === "server_tool_use") {
			console.log("\n=== CODE RAN ===\n", JSON.stringify(block.input, null, 2));
		}
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
