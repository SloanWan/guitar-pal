"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, EllipsisVertical, Plane, Play, Share, Smartphone, SquarePlus, Star, Copy, Wifi } from "lucide-react";
import { useInView, useReducedMotion } from "@/components/landing/song/motion";
import type { DocLang } from "@/lib/docs/docLang";
import "./installDemo.css";

/**
 * Adding Guitar Pal to the home screen, acted out on a drawn phone (#525): the
 * browser, its share sheet or menu, the confirmation, the icon arriving on the
 * home screen, then the app opened full screen with airplane mode on and the
 * beat still running. Used by the landing's step 8 and `/docs/install`.
 *
 * The phone is drawn from Candy tokens, not from any system's UI. Every layer
 * is always in the screen and the frame number picks which show, so a layer
 * slides in and out instead of mounting, and the card never changes size. The
 * frames loop while the demo is on screen; a press on a step shows that frame
 * and holds it. Reduced motion never plays — the steps are pressed through.
 */

export type DemoPlatform = "ios" | "android";

/** How long each frame shows, in ms, before the next. */
const FRAME_MS = [2000, 1900, 1700, 1700, 3400] as const;
const FRAMES = FRAME_MS.length;

const CAPTIONS: Record<DocLang, Record<DemoPlatform, readonly string[]>> = {
	en: {
		ios: ["Tap Share", "Add to Home Screen", "Tap Add", "It's on your home screen", "Opens full screen, plays offline"],
		android: ["Tap ⋮", "Install app", "Tap Install", "It's on your home screen", "Opens full screen, plays offline"],
	},
	zh: {
		ios: ["点分享", "添加到主屏幕", "点添加", "出现在主屏幕上", "全屏打开，离线也能播放"],
		android: ["点 ⋮", "安装应用", "点安装", "出现在主屏幕上", "全屏打开，离线也能播放"],
	},
};

/** The words drawn on the phone itself. */
const SCREEN: Record<DocLang, { add: string; cancel: string; install: string; installQ: string; copy: string; favourite: string; newTab: string; bookmarks: string; label: (p: DemoPlatform) => string }> = {
	en: {
		add: "Add",
		cancel: "Cancel",
		install: "Install",
		installQ: "Install app?",
		copy: "Copy",
		favourite: "Add to Favourites",
		newTab: "New tab",
		bookmarks: "Bookmarks",
		label: (p) =>
			p === "ios"
				? "A phone adding Guitar Pal from Safari's Share sheet to the home screen, then opening it full screen in airplane mode, still playing"
				: "A phone installing Guitar Pal from Chrome's menu, then opening it from the home screen full screen in airplane mode, still playing",
	},
	zh: {
		add: "添加",
		cancel: "取消",
		install: "安装",
		installQ: "安装应用？",
		copy: "拷贝",
		favourite: "添加到个人收藏",
		newTab: "新标签页",
		bookmarks: "书签",
		label: (p) =>
			p === "ios"
				? "一台手机从 Safari 的分享菜单把 Guitar Pal 添加到主屏幕，再全屏打开，开着飞行模式照样播放"
				: "一台手机从 Chrome 菜单安装 Guitar Pal，再从主屏幕全屏打开，开着飞行模式照样播放",
	},
};

const ICON = "/icon-192.png";

/** The finger on this frame's target: drawn inside the target, so it lands on it at any size. */
function Tap({ on }: { on: boolean }) {
	return on ? <span className="idm-tap" aria-hidden /> : null;
}

/** Which frame shows: looping while on screen and playing, held once a step is pressed. */
function useFrame(inView: boolean) {
	const reduce = useReducedMotion();
	const [frame, setFrame] = useState(0);
	const [held, setHeld] = useState(false);

	useEffect(() => {
		if (inView) return;
		// Off screen: start over, playing, when it comes back.
		queueMicrotask(() => {
			setFrame(0);
			setHeld(false);
		});
	}, [inView]);

	useEffect(() => {
		if (!inView || held || reduce) return;
		const id = window.setTimeout(() => setFrame((f) => (f + 1) % FRAMES), FRAME_MS[frame]);
		return () => clearTimeout(id);
	}, [inView, held, reduce, frame]);

	const show = (f: number) => {
		setFrame(f);
		setHeld(true);
	};
	return { frame, show };
}

/** The app as it appears in the browser and installed: a rhythm grid, its beat lit while it plays. */
function MiniApp() {
	return (
		<div className="idm-app">
			<div className="idm-app-head">
				{/* eslint-disable-next-line @next/next/no-img-element -- the app's own icon, drawn small */}
				<img src={ICON} alt="" />
				<i />
			</div>
			<i className="idm-app-title" />
			<div className="idm-grid">
				{Array.from({ length: 8 }, (_, i) => (
					<span key={i} style={{ "--i": i } as React.CSSProperties}>
						{i % 2 ? "↑" : "↓"}
					</span>
				))}
			</div>
			<i className="idm-app-line" />
			<i className="idm-app-line idm-short" />
			<span className="idm-play">
				<Play aria-hidden />
			</span>
		</div>
	);
}

function HomeScreen({ frame }: { frame: number }) {
	return (
		<div className="idm-home">
			{Array.from({ length: 11 }, (_, i) => (
				<i key={i} className="idm-tile" />
			))}
			<span className="idm-mine">
				<span className="idm-mine-icon">
					{/* eslint-disable-next-line @next/next/no-img-element -- the icon the home screen gets */}
					<img src={ICON} alt="" />
					<Tap on={frame === 3} />
				</span>
				<b>Guitar Pal</b>
			</span>
		</div>
	);
}

function Phone({ platform, frame, lang }: { platform: DemoPlatform; frame: number; lang: DocLang }) {
	const t = SCREEN[lang];
	return (
		<div className="idm-phone" data-frame={frame} data-platform={platform} role="img" aria-label={t.label(platform)}>
			<div className="idm-screen">
				<div className="idm-status">
					<span>8:15</span>
					<span className="idm-status-r">{frame === 4 ? <Plane aria-hidden /> : <Wifi aria-hidden />}</span>
				</div>

				{platform === "android" && (
					<div className="idm-bar idm-bar-top">
						<span className="idm-url">guitarpal.sloanwan.com</span>
						<span className="idm-key">
							<EllipsisVertical aria-hidden />
							<Tap on={frame === 0} />
						</span>
					</div>
				)}

				<MiniApp />

				{platform === "ios" && (
					<div className="idm-bar idm-bar-bottom">
						<span className="idm-key">
							<ChevronLeft aria-hidden />
						</span>
						<span className="idm-url">guitarpal.sloanwan.com</span>
						<span className="idm-key">
							<Share aria-hidden />
							<Tap on={frame === 0} />
						</span>
					</div>
				)}

				<i className="idm-scrim" />

				{platform === "ios" ? (
					<>
						<div className="idm-sheet">
							<span className="idm-row">
								<Copy aria-hidden />
								{t.copy}
							</span>
							<span className="idm-row idm-row-on">
								<SquarePlus aria-hidden />
								{CAPTIONS[lang].ios[1]}
								<Tap on={frame === 1} />
							</span>
							<span className="idm-row">
								<Star aria-hidden />
								{t.favourite}
							</span>
						</div>
						<div className="idm-confirm">
							<div className="idm-confirm-head">
								<span>{t.cancel}</span>
								<b className="idm-confirm-go">
									{t.add}
									<Tap on={frame === 2} />
								</b>
							</div>
							<div className="idm-confirm-body">
								{/* eslint-disable-next-line @next/next/no-img-element -- the icon being added */}
								<img src={ICON} alt="" />
								<span>Guitar Pal</span>
							</div>
						</div>
					</>
				) : (
					<>
						<div className="idm-menu">
							<span className="idm-row">{t.newTab}</span>
							<span className="idm-row">
								<Star aria-hidden />
								{t.bookmarks}
							</span>
							<span className="idm-row idm-row-on">
								<Smartphone aria-hidden />
								{CAPTIONS[lang].android[1]}
								<Tap on={frame === 1} />
							</span>
						</div>
						<div className="idm-dialog">
							{/* eslint-disable-next-line @next/next/no-img-element -- the icon being installed */}
							<img src={ICON} alt="" />
							<b>{t.installQ}</b>
							<span>Guitar Pal</span>
							<div className="idm-dialog-keys">
								<span>{t.cancel}</span>
								<b className="idm-confirm-go">
									{t.install}
									<Tap on={frame === 2} />
								</b>
							</div>
						</div>
					</>
				)}

				<HomeScreen frame={frame} />
			</div>
		</div>
	);
}

export default function InstallDemo({ platform, lang = "en" }: { platform: DemoPlatform; lang?: DocLang }) {
	const ref = useRef<HTMLDivElement>(null);
	const inView = useInView(ref);
	const { frame, show } = useFrame(inView);
	const captions = CAPTIONS[lang][platform];

	return (
		<div ref={ref} className="idm">
			<div className="idm-body">
				<Phone platform={platform} frame={frame} lang={lang} />
				<ol className="idm-steps">
				{captions.map((caption, i) => (
					<li key={i}>
						<button
							type="button"
							className="idm-step gp-focus"
							aria-current={frame === i ? "step" : undefined}
							onClick={() => show(i)}
						>
							<span className="idm-step-n">{i + 1}</span>
							{caption}
						</button>
					</li>
				))}
				</ol>
			</div>
		</div>
	);
}
