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
	askHeading: string;
	askLead: string;
	askName: string;
	/** `hint` is what goes with the request, written beside it, not copied. */
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
			"Add Guitar Pal as an MCP connector in Claude, Cursor, VS Code or any MCP client, and ask for strumming patterns and tabs that play.",
		heading: "Connect Guitar Pal to your AI",
		lead: "Add Guitar Pal to the AI app you already use. Ask it for a strumming pattern or a tab, or show it a photo of one, and you get back a link that opens in the player.",
		urlLabel: "Server URL",
		urlNote: "No account and no API key. Guitar Pal is a remote MCP server (Streamable HTTP).",
		copy: (what) => `Copy the ${what}`,
		copied: "Copied.",
		copyFailed: "Could not reach the clipboard. Select the text and copy it instead.",
		clientsHeading: "Add it to your app",
		clientsLabel: "Your app",
		clients: {
			claude: {
				label: "Claude",
				steps: [
					"In claude.ai or the Claude desktop app, open `Customize → Connectors` and choose `Add custom connector`.",
					"Name it Guitar Pal and paste the server URL. Leave the advanced settings empty: there is no sign-in.",
					"In a chat, open the `+` menu and turn Guitar Pal on under Connectors.",
				],
				snippetAfter: 1,
				snippetName: "server URL",
				note: "On the Free plan you can add one custom connector. A connector added on claude.ai shows up in the desktop app too.",
			},
			claudeCode: {
				label: "Claude Code",
				steps: [
					"Run this in your terminal:",
					"Start Claude Code and type `/mcp` to check that guitar-pal is connected.",
				],
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
			other: {
				label: "Other",
				steps: [
					"Any client that takes a remote MCP server: add the server URL as a Streamable HTTP server, with no authentication.",
					"ChatGPT and other chat apps: add it where the app takes a remote MCP server (connectors, or developer mode). Some apps only accept servers that sign you in with OAuth, and may refuse this one.",
					"A client that only launches local servers: bridge to the URL with `mcp-remote` (needs Node.js):",
				],
				snippetAfter: 2,
				snippetName: "bridge config",
			},
		},
		askHeading: "Try asking",
		askLead: "Write it the way you would ask a friend. Each answer comes with a link.",
		askName: "request",
		asks: [
			{ text: "A slow 6/8 fingerpicking pattern over Am–F–C–G, thumb on the bass." },
			{ text: "Strum pattern for a campfire song, C G Am F, 90 bpm." },
			{ text: "Bring this into Guitar Pal.", hint: "With a photo of a tab" },
			{ text: "Make bar 2 of that tab simpler.", hint: "After it gave you a link" },
		],
		backHeading: "What you get back",
		back: [
			"A link like `guitarpal.sloanwan.com/p/aB3xK9mQ2z`. It opens the full player: play, loop a section, change the tempo. No account needed.",
			"`Import` copies it into your own library, where you can edit it. Signed out, the copy stays in this browser; signed in, it joins your account.",
			"Each link is a snapshot: asking for a change makes a new one. Links stop opening after 30 days, so import the ones you want to keep.",
			"Guitar Pal checks what the AI writes before it makes a link. When the AI read a tab off a photo, the notes it was unsure of are listed on the page: check those against the original.",
			"One network can make up to 20 new links an hour.",
		],
		referenceLead: "Tools, limits and running your own server:",
		referenceLink: "the full MCP reference on GitHub",
	},
	zh: {
		title: "把 Guitar Pal 接入你的 AI | Guitar Pal",
		description: "在 Claude、Cursor、VS Code 或任何支持 MCP 的应用里添加 Guitar Pal，让 AI 写出能直接播放的节奏型和六线谱。",
		heading: "把 Guitar Pal 接入你的 AI",
		lead: "把 Guitar Pal 加进你平时用的 AI 应用。让它写一个扫弦节奏或一段六线谱，或者发一张谱子的照片给它，它会回你一个链接，点开就能在播放器里弹。",
		urlLabel: "服务器地址",
		urlNote: "不用注册账号，也不用 API key。Guitar Pal 是一个远程 MCP 服务器（Streamable HTTP）。",
		copy: (what) => `复制${what}`,
		copied: "已复制。",
		copyFailed: "无法访问剪贴板，请选中文字手动复制。",
		clientsHeading: "添加到你的应用",
		clientsLabel: "你的应用",
		clients: {
			claude: {
				label: "Claude",
				steps: [
					"在 claude.ai 或 Claude 桌面版里打开 `Customize → Connectors`，选 `Add custom connector`。",
					"名字填 Guitar Pal，粘贴服务器地址。高级设置留空，不需要登录。",
					"在对话里打开 `+` 菜单，在 Connectors 下打开 Guitar Pal。",
				],
				snippetAfter: 1,
				snippetName: "服务器地址",
				note: "免费版可以添加一个自定义 connector。在 claude.ai 添加的 connector，桌面版里也能用。",
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
			other: {
				label: "其他",
				steps: [
					"支持远程 MCP 服务器的客户端：把服务器地址按 Streamable HTTP 添加，不需要认证。",
					"ChatGPT 等聊天应用：在应用接受远程 MCP 服务器的地方添加（connectors 或开发者模式）。有些应用只接受用 OAuth 登录的服务器，可能会拒绝这个。",
					"只能启动本地服务器的客户端：用 `mcp-remote` 桥接到这个地址（需要 Node.js）：",
				],
				snippetAfter: 2,
				snippetName: "桥接配置",
			},
		},
		askHeading: "可以这样问",
		askLead: "像问朋友一样写就行。每个回答都会带一个链接。",
		askName: "这句",
		asks: [
			{ text: "来一个慢一点的 6/8 指弹，和弦 Am–F–C–G，拇指弹低音。" },
			{ text: "篝火歌的扫弦节奏，C G Am F，90 bpm。" },
			{ text: "把这个导入 Guitar Pal。", hint: "附上一张六线谱的照片" },
			{ text: "把刚才那段的第 2 小节改简单一点。", hint: "拿到链接之后，在同一个对话里" },
		],
		backHeading: "你会得到什么",
		back: [
			"一个形如 `guitarpal.sloanwan.com/p/aB3xK9mQ2z` 的链接，打开就是完整的播放器：播放、循环某一段、调速度，不用账号。",
			"点 `Import` 会把它复制进你自己的曲库，在那里可以编辑。没登录时副本存在这个浏览器里，登录后存进你的账号。",
			"每个链接都是一份快照，改一次就是一个新链接。链接 30 天后失效，想留下的记得导入。",
			"AI 写的东西，Guitar Pal 会先检查一遍再生成链接。从照片读谱时，AI 没把握的音会列在页面上，记得对照原谱看一下。",
			"同一个网络每小时最多生成 20 个新链接。",
		],
		referenceLead: "工具列表、调用限制、自己部署服务器：",
		referenceLink: "GitHub 上的完整 MCP 说明",
	},
};
