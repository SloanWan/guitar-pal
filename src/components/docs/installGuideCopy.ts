import type { DocLang } from "@/lib/docs/docLang";
import type { InstallPlatform } from "@/lib/pwa/installPlatform";

/**
 * The words of `/docs/install` (#525), one set per language, kept in step by
 * hand (a test checks the shapes match). Text between backticks is drawn as
 * code: a button or a menu item, as the system names it.
 */

export interface PlatformGuide {
	/** The picker's label. */
	label: string;
	steps: readonly string[];
	note?: string;
	/** How to take it off again. */
	remove: string;
}

export interface InstallGuideCopy {
	title: string;
	description: string;
	heading: string;
	lead: string;
	platformsHeading: string;
	platformsLabel: string;
	platforms: Record<InstallPlatform, PlatformGuide>;
	offlineHeading: string;
	offlineLead: string;
	worksHeading: string;
	works: readonly string[];
	notHeading: string;
	doesNot: readonly string[];
	updatesHeading: string;
	updates: string;
	removeHeading: string;
	removeNote: string;
	/** The outline's label. */
	tocLabel: string;
	supportLead: string;
	supportLink: string;
}

export const INSTALL_GUIDE_COPY: Record<DocLang, InstallGuideCopy> = {
	en: {
		title: "Add Guitar Pal to your home screen | Guitar Pal",
		description:
			"Install Guitar Pal on an iPhone, iPad, Android phone or computer: it opens like an app, full screen, and keeps playing with no signal.",
		heading: "Add Guitar Pal to your home screen",
		lead: "Guitar Pal installs straight from the browser — no app store. It opens from its own icon, full screen, and the tools keep playing with no signal.",
		platformsHeading: "Add it",
		platformsLabel: "Your device",
		platforms: {
			ios: {
				label: "iPhone / iPad",
				steps: [
					"Open Guitar Pal in Safari.",
					"Tap the Share button. On recent versions of iOS it sits in the `⋯` menu at the bottom; on an iPad it is at the top right.",
					"Scroll down and tap `Add to Home Screen`.",
					"Tap `Add`, and open Guitar Pal from its icon from now on.",
				],
				note: "Chrome and Edge on iOS 16.4 or later have `Add to Home Screen` in their Share menu too. If the app opens signed out, sign in once inside it: on an iPhone or iPad the home-screen app keeps its own storage, apart from Safari.",
				remove: "iPhone / iPad: press and hold the icon, then choose to remove it.",
			},
			android: {
				label: "Android",
				steps: [
					"Open Guitar Pal in Chrome.",
					"Tap `⋮` at the top right.",
					"Tap `Install app` (on some phones, `Add to home screen`), then `Install`.",
					"Guitar Pal joins your home screen and your app list.",
				],
				note: "Edge and Samsung Internet install it from their menus too. A phone's built-in browser, or a link opened inside WeChat, may not offer it: open the page in Chrome or Edge first.",
				remove: "Android: press and hold the icon, then `Uninstall`.",
			},
			desktop: {
				label: "Computer",
				steps: [
					"Open Guitar Pal in Chrome or Edge.",
					"Click the install icon at the right end of the address bar, or find `Install Guitar Pal` in the browser's menu (in Chrome, under `Cast, save and share`).",
					"Click `Install`. Guitar Pal opens in its own window, with a place in your Dock, taskbar or Start menu.",
				],
				note: "On a Mac, Safari adds it too: `File → Add to Dock`. Firefox does not install sites.",
				remove: "Computer: in the app window's `⋮` menu, choose `Uninstall Guitar Pal`.",
			},
		},
		offlineHeading: "With no connection",
		offlineLead: "Once Guitar Pal has been opened online on a device, it keeps what it needs to play there.",
		worksHeading: "Still works",
		works: [
			"Strum, Tab and Fretboard open and play — even before you have visited them, since they are fetched in the background on your first visit.",
			"Chords, and the chord pages you have opened.",
			"The guitar and piano sounds.",
			"Signed out, what you save lives on this device and stays editable.",
			"Signed in, your library is there to read; it can be changed again once you are back online.",
		],
		notHeading: "Needs a connection",
		doesNot: ["The assistant.", "Books.", "Sharing a link, or opening one someone sent you.", "Signing in."],
		updatesHeading: "Updates",
		updates: "There is nothing to update by hand: the app is the site. A new version arrives the next time it opens online.",
		removeHeading: "Remove it",
		removeNote: "Removing the app leaves your account and your saved library as they are.",
		tocLabel: "On this page",
		supportLead: "Something not working?",
		supportLink: "Support",
	},
	zh: {
		title: "把 Guitar Pal 添加到主屏幕 | Guitar Pal",
		description: "在 iPhone、iPad、安卓手机或电脑上安装 Guitar Pal：像 App 一样全屏打开，没有网络也能接着弹。",
		heading: "把 Guitar Pal 添加到主屏幕",
		lead: "Guitar Pal 直接从浏览器安装，不用去应用商店。装好后从自己的图标全屏打开，没有网络时工具照样能播放。",
		platformsHeading: "添加方法",
		platformsLabel: "你的设备",
		platforms: {
			ios: {
				label: "iPhone / iPad",
				steps: [
					"用 Safari 打开 Guitar Pal。",
					"点分享按钮。较新的 iOS 把它放在底部的 `⋯` 菜单里；iPad 上在右上角。",
					"往下滑，点 `添加到主屏幕`。",
					"点 `添加`。以后就从主屏幕的图标打开 Guitar Pal。",
				],
				note: "iOS 16.4 及以上的 Chrome 和 Edge，分享菜单里也有 `添加到主屏幕`。如果打开后是未登录状态，在 App 里登录一次即可：iPhone 和 iPad 上，主屏幕 App 的存储和 Safari 是分开的。",
				remove: "iPhone / iPad：长按图标，选择移除。",
			},
			android: {
				label: "安卓",
				steps: [
					"用 Chrome 打开 Guitar Pal。",
					"点右上角的 `⋮`。",
					"点 `安装应用`（有的手机上叫 `添加到主屏幕`），再点 `安装`。",
					"Guitar Pal 会出现在主屏幕和应用列表里。",
				],
				note: "Edge 和三星浏览器的菜单里也能安装。手机自带的浏览器，或在微信里打开的链接，可能没有这个选项：先用 Chrome 或 Edge 打开这个页面。",
				remove: "安卓：长按图标，点 `卸载`。",
			},
			desktop: {
				label: "电脑",
				steps: [
					"用 Chrome 或 Edge 打开 Guitar Pal。",
					"点地址栏右端的安装图标，或在浏览器菜单里找 `安装 Guitar Pal`（Chrome 里在 `投放、保存和分享` 下面）。",
					"点 `安装`。Guitar Pal 会在独立窗口里打开，并出现在程序坞、任务栏或开始菜单里。",
				],
				note: "Mac 上的 Safari 也能添加：`文件 → 添加到程序坞`。Firefox 不支持安装网站。",
				remove: "电脑：在 App 窗口的 `⋮` 菜单里选 `卸载 Guitar Pal`。",
			},
		},
		offlineHeading: "没有网络时",
		offlineLead: "只要在这台设备上联网打开过一次 Guitar Pal，它就会把播放需要的东西留在本机。",
		worksHeading: "照常能用",
		works: [
			"Strum、Tab 和 Fretboard 能打开、能播放——没去过也行，第一次打开网站时它们已在后台下载好。",
			"Chords，以及你打开过的和弦页。",
			"吉他和钢琴的音色。",
			"未登录时，你保存的东西存在这台设备上，照样能改。",
			"登录后，你的曲库可以查看；回到网络后才能修改。",
		],
		notHeading: "需要网络",
		doesNot: ["助手。", "Books。", "分享链接，或打开别人发来的链接。", "登录。"],
		updatesHeading: "更新",
		updates: "不需要手动更新：App 就是网站本身。下次联网打开时就是新版本。",
		removeHeading: "删除",
		removeNote: "删除 App 不会影响你的账号和已保存的曲库。",
		tocLabel: "本页目录",
		supportLead: "遇到问题？",
		supportLink: "支持",
	},
};
