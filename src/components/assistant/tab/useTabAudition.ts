"use client";

import { useEffect, useRef, useState } from "react";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { claimAudition } from "@/lib/assistant/audition";
import { useFingerpickAudioEngine } from "@/components/fingerpick/useFingerpickAudioEngine";

/**
 * A card's tab, played once on the fingerpick page's engine. The samples load
 * on the first press, not when the card appears, so a thread of cards opens
 * no audio until one is heard. Hearing one card silences any other.
 */
export function useTabAudition(pattern: FingerpickPattern) {
	const { isLoaded, isPlaying, load, play, stop } = useFingerpickAudioEngine();
	const [asked, setAsked] = useState(false);
	const pendingRef = useRef(false);
	const releaseRef = useRef<(() => void) | null>(null);

	// A press made while the samples were loading plays once they are in.
	useEffect(() => {
		if (!isLoaded || !pendingRef.current) return;
		pendingRef.current = false;
		play(pattern);
	});

	useEffect(() => {
		if (isPlaying) return;
		releaseRef.current?.();
		releaseRef.current = null;
	}, [isPlaying]);
	useEffect(() => () => releaseRef.current?.(), []);

	const isPreparing = asked && !isLoaded;

	function toggle() {
		if (isPlaying || isPreparing) {
			pendingRef.current = false;
			setAsked(false);
			stop();
			return;
		}
		releaseRef.current = claimAudition(() => {
			pendingRef.current = false;
			stop();
		});
		if (isLoaded) return play(pattern);
		pendingRef.current = true;
		setAsked(true);
		void load();
	}

	return { isPlaying, isPreparing, toggle };
}
