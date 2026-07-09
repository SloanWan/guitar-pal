"use client";
import { useState, useEffect, useRef } from "react";

export default function NavBarScrollWrapper({ children }: { children: React.ReactNode }) {
	const [navVisible, setNavVisible] = useState(true);
	const navVisibleRef = useRef(true);
	const lastScrollYRef = useRef(0);
	const scrollUpDistanceRef = useRef(0);

	useEffect(() => {
		// Only activate on the fingerpick page; restore on other pages.
		// We check inside the handler (not just at mount) because the fingerpick
		// page adds the body class in its own mount effect which may run after ours.
		const mainEl = document.querySelector("main");
		if (!mainEl) return;

		const navAutoScrollingRef = { current: false };

		function handleAutoScrollStart() { navAutoScrollingRef.current = true; }
		function handleAutoScrollEnd() { navAutoScrollingRef.current = false; }

		window.addEventListener("fingerpick-autoscroll-start", handleAutoScrollStart);
		window.addEventListener("fingerpick-autoscroll-end", handleAutoScrollEnd);

		function handleScroll() {
			if (navAutoScrollingRef.current) return;
			if (!document.body.classList.contains("fingerpick-page")) {
				// Navigated away — ensure NavBar is visible.
				if (!navVisibleRef.current) {
					navVisibleRef.current = true;
					setNavVisible(true);
				}
				return;
			}
			const currentY = mainEl!.scrollTop;
			const delta = currentY - lastScrollYRef.current;
			lastScrollYRef.current = currentY;

			if (delta > 0) {
				scrollUpDistanceRef.current = 0;
				if (navVisibleRef.current) {
					navVisibleRef.current = false;
					setNavVisible(false);
				}
			} else {
				scrollUpDistanceRef.current += Math.abs(delta);
				if (scrollUpDistanceRef.current >= 40 && !navVisibleRef.current) {
					navVisibleRef.current = true;
					setNavVisible(true);
				}
			}
		}

		function handleRestore() {
			scrollUpDistanceRef.current = 0;
			if (!navVisibleRef.current) {
				navVisibleRef.current = true;
				setNavVisible(true);
			}
		}

		mainEl.addEventListener("scroll", handleScroll, { passive: true });
		window.addEventListener("fingerpick-controls-restore", handleRestore);
		return () => {
			mainEl.removeEventListener("scroll", handleScroll);
			window.removeEventListener("fingerpick-controls-restore", handleRestore);
			window.removeEventListener("fingerpick-autoscroll-start", handleAutoScrollStart);
			window.removeEventListener("fingerpick-autoscroll-end", handleAutoScrollEnd);
		};
	}, []);

	return (
		<div
			className="sticky top-0 z-10 transition-transform duration-300 ease-out"
			style={{ transform: navVisible ? "translateY(0)" : "translateY(-100%)" }}
		>
			{children}
		</div>
	);
}
