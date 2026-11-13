import type { DocLang } from "@/lib/docs/docLang";
import type { ConnectClient } from "@/lib/mcp/connectGuide";

/**
 * The words of `/docs/mcp`, one set per language, kept in step by hand.
 * Text between backticks is drawn as code: a menu path, a file, a command.
 */

export interface ClientGuide {
	/** The picker's label. */
	label: string;
	steps: readonly string[];
	/** The client's snippet shows under this step. */
	snippetAfter: number;
	/** What the snippet is, for its copy button's name. */
	snippetName: string;
	note?: string;
}

export interface McpGuideCopy {
	title: string;
	description: string;
	heading: string;
	lead: string;
	urlLabel: string;
	urlNote: string;
	/** The copy button's name, before what it copies. */
	copy: (what: string) => string;
	copied: string;
	copyFailed: string;
	clientsHeading: string;
	clientsLabel: string;
	clients: Record<ConnectClient, ClientGuide>;
	modelsHeading: string;
	models: readonly string[];
	askHeading: string;
	askLead: string;
	askName: string;
	/** `hint` is what the request is for, written above it, not copied. */
	asks: readonly { text: string; hint?: string }[];
	backHeading: string;
	back: readonly string[];
	referenceLead: string;
	referenceLink: string;
}

export const MCP_REFERENCE_URL = "https://github.com/SloanWan/guitar-pal/blob/main/docs/mcp.md";

export const MCP_GUIDE_COPY: Record<DocLang, McpGuideCopy> = {
	en: {
		title: "Connect Guitar Pal to your AI | Guitar Pal",
		description:
			"Add Guitar Pal to Claude, ChatGPT, Claude Code, Cursor or VS Code, and ask for strumming patterns and tabs that play.",
		heading: "Connect Guitar Pal to your AI",
		lead: "Ask Claude or ChatGPT for a strumming pattern or a fingerpicking tab, or show it a photo of a tab, and get back a link that plays it in Guitar Pal.",
		urlLabel: "Server URL",
		urlNote: "No account and no API key.",
		copy: (what) => `Copy the ${what}`,
		copied: "Copied.",
		copyFailed: "Could not reach the clipboard. Select the text and copy it instead.",
		clientsHeading: "Add it to your app",
		clientsLabel: "Your app",
		clients: {
			claude: {
				label: "Claude",
				steps: [
					"In claude.ai or the Claude app, open `Customize → Connectors → + Add → Add custom connector`.",
					"Name it Guitar Pal, paste the server URL and choose `No sign-in`.",
					"In a chat, turn Guitar Pal on from `+ → Connectors` in the message box.",
				],
				snippetAfter: 1,
				snippetName: "server URL",
				note: "Works on every Claude plan; the Free plan allows one custom connector. A connector added on the web shows up in the desktop and mobile apps too.",
			},
			chatgpt: {
				label: "ChatGPT",
				steps: [
					"On the web, open `chatgpt.com/plugins` and press `+ → Add custom MCP server`.",
					"Name it Guitar Pal, paste the server URL and choose `No authentication`.",
					"Tick `I understand and want to continue`, then press `Create as a plugin`.",
					"In a new chat, type `@` and pick Guitar Pal.",
				],
				snippetAfter: 1,
				snippetName: "server URL",
				note: "Needs ChatGPT Plus or a higher plan; Free accounts cannot add it. Adding works on the web only; once added, it works in the apps too.",
			},
			claudeCode: {
				label: "Claude Code",
				steps: ["Run this in your terminal:", "Start Claude Code and type `/mcp` to check that guitar-pal is connected."],
				snippetAfter: 0,
				snippetName: "command",
				note: "Add `--scope user` to have it in every project, not only the current one.",
			},
			cursor: {
				label: "Cursor",
				steps: [
					"Open `~/.cursor/mcp.json` to use it in every project, or `.cursor/mcp.json` inside one project.",
					"Add the server. If the file already lists servers, put the `guitar-pal` entry inside its `mcpServers`.",
					"In Cursor's settings, under MCP, check that guitar-pal is on, then ask in the chat in Agent mode.",
				],
				snippetAfter: 1,
				snippetName: "config",
			},
			vscode: {
				label: "VS Code",
				steps: [
					"Create `.vscode/mcp.json` in your project, or run `MCP: Open User Configuration` from the Command Palette to use it everywhere.",
					"Add the server:",
					"Open Copilot Chat in Agent mode. Guitar Pal's tools are listed under the tools button.",
				],
				snippetAfter: 1,
				snippetName: "config",
			},
		},
		modelsHeading: "Which model",
		models: [
			"Claude: any current model writes strumming patterns and tabs well. To read a tab image, use Opus or Sonnet; Haiku gets about half the notes wrong.",
			"ChatGPT: avoid Instant, which transcribes poorly or skips the tool. Use a Thinking model at medium effort or above.",
			"Even Opus and Sonnet sometimes put a number on the neighbouring string when reading an image, so compare the result with the original.",
		],
		askHeading: "Try asking",
		askLead: "Name Guitar Pal in the request; ChatGPT in particular may not use it otherwise.",
		askName: "request",
		asks: [
			{
				text: "Use Guitar Pal to write a slow 6/8 fingerpicking pattern over Am–F–C–G, thumb on the bass.",
				hint: "Write a fingerpicking tab",
			},
			{ text: "Make me a Guitar Pal strumming pattern for C G Am F at 90 bpm.", hint: "Write a strumming pattern" },
			{ text: "Bring this tab into Guitar Pal.", hint: "Read a tab image — attach a photo or screenshot" },
			{ text: "Make bar 2 of that Guitar Pal tab simpler.", hint: "Change it — after you got a link" },
		],
		backHeading: "What you get back",
		back: [
			"A link like `guitarpal.sloanwan.com/p/aB3xK9mQ2z` that opens in the player: play, loop, change the tempo. No account needed.",
			"`Import` copies it into your library to edit it: in this browser when signed out, to your account when signed in.",
			"Each change makes a new link; links stop working after 30 days.",
			"When reading an image, the AI lists the notes it was unsure of under the title. Check those against the original, and fix them in the editor after `Import`.",
		],
		referenceLead: "Tools and running your own server:",
		referenceLink: "the MCP reference on GitHub",
	},
	zh: {
		title: "把 Guitar Pal 接入你的 AI | Guitar Pal",
		description: "在 Claude、ChatGPT、Claude Code、Cursor 或 VS Code 里添加 Guitar Pal，让 AI 写出能直接播放的节奏型和六线谱。",
		heading: "把 Guitar Pal 接入你的 AI",
		lead: "让 Claude 或 ChatGPT 写一个扫弦节奏或一段指弹谱，或者发一张六线谱的照片给它，它会回你一个链接，点开就能在 Guitar Pal 里播放。",
		urlLabel: "服务器地址",
		urlNote: "不用注册账号，也不用 API key。",
		copy: (what) => `复制${what}`,
		copied: "已复制。",
		copyFailed: "无法访问剪贴板，请选中文字手动复制。",
		clientsHeading: "添加到你的应用",
		clientsLabel: "你的应用",
		clients: {
			claude: {
				label: "Claude",
				steps: [
					"在 claude.ai 或 Claude App 里打开 `Customize → Connectors → + Add → Add custom connector`。",
					"名字填 Guitar Pal，粘贴服务器地址，认证选 `No sign-in`。",
					"在对话里，从输入框的 `+ → Connectors` 打开 Guitar Pal。",
				],
				snippetAfter: 1,
				snippetName: "服务器地址",
				note: "所有 Claude 套餐都能用，免费版可以添加一个自定义 connector。在网页版添加后，桌面版和手机 App 里也能用。",
			},
			chatgpt: {
				label: "ChatGPT",
				steps: [
					"在网页版打开 `chatgpt.com/plugins`，点 `+ → Add custom MCP server`。",
					"名字填 Guitar Pal，粘贴服务器地址，认证选 `No authentication`。",
					"勾选 `I understand and want to continue`，点 `Create as a plugin`。",
					"新开一个对话，输入 `@` 选中 Guitar Pal。",
				],
				snippetAfter: 1,
				snippetName: "服务器地址",
				note: "需要 ChatGPT Plus 或更高的订阅，免费账号加不了。只能在网页版添加，加好后桌面版和手机 App 里也能用。",
			},
			claudeCode: {
				label: "Claude Code",
				steps: ["在终端里运行：", "启动 Claude Code，输入 `/mcp`，确认 guitar-pal 已连接。"],
				snippetAfter: 0,
				snippetName: "命令",
				note: "加上 `--scope user` 可以在所有项目里使用，而不只是当前项目。",
			},
			cursor: {
				label: "Cursor",
				steps: [
					"打开 `~/.cursor/mcp.json`（所有项目通用），或者项目里的 `.cursor/mcp.json`（只用于这个项目）。",
					"加入这个服务器。文件里已经有别的服务器时，把 `guitar-pal` 这一项放进已有的 `mcpServers` 里。",
					"在 Cursor 设置的 MCP 部分确认 guitar-pal 已开启，然后在 Agent 模式的对话里提问。",
				],
				snippetAfter: 1,
				snippetName: "配置",
			},
			vscode: {
				label: "VS Code",
				steps: [
					"在项目里新建 `.vscode/mcp.json`；想在所有项目里用，就从命令面板运行 `MCP: Open User Configuration`。",
					"加入这个服务器：",
					"在 Agent 模式下打开 Copilot Chat，Guitar Pal 的工具会出现在工具按钮里。",
				],
				snippetAfter: 1,
				snippetName: "配置",
			},
		},
		modelsHeading: "用哪个模型",
		models: [
			"Claude：现在的几个模型写扫弦和六线谱都没问题。要读谱子的图片，用 Opus 或 Sonnet；Haiku 读图大约一半的音会错。",
			"ChatGPT：别用 Instant，它读谱不准，有时干脆不调用工具。用 Thinking 模型，思考强度选 medium 或以上。",
			"Opus 和 Sonnet 读图也偶尔会把数字写到相邻的弦上，记得对照原谱检查。",
		],
		askHeading: "可以这样问",
		askLead: "在请求里点名 Guitar Pal，尤其是 ChatGPT，不点名它可能不会用。",
		askName: "这句",
		asks: [
			{ text: "用 Guitar Pal 写一个慢一点的 6/8 指弹，和弦 Am–F–C–G，拇指弹低音。", hint: "写指弹谱" },
			{ text: "用 Guitar Pal 给我一个 C G Am F 的扫弦节奏，90 bpm。", hint: "写扫弦节奏" },
			{ text: "把这张谱导入 Guitar Pal。", hint: "读谱 —— 附上一张六线谱的照片或截图" },
			{ text: "把刚才那段 Guitar Pal 谱的第 2 小节改简单一点。", hint: "修改 —— 拿到链接之后，在同一个对话里" },
		],
		backHeading: "你会得到什么",
		back: [
			"一个形如 `guitarpal.sloanwan.com/p/aB3xK9mQ2z` 的链接，打开就是播放器：播放、循环、调速度，不用账号。",
			"点 `Import` 会把它复制进你的曲库，在那里可以编辑：没登录时存在这个浏览器里，登录后存进你的账号。",
			"每改一次就是一个新链接，链接 30 天后失效。",
			"从图片读谱时，AI 没把握的音会列在标题下面，记得对照原谱看一下，点 `Import` 后可以在编辑器里改。",
		],
		referenceLead: "工具列表、自己部署服务器：",
		referenceLink: "GitHub 上的 MCP 说明",
	},
};
