"use client";

import { Component, type ReactNode } from "react";
import { reportError } from "@/lib/telemetry/client";

interface Props {
	/** What stands in for the part that failed. */
	fallback: ReactNode;
	/** A change in any of these is a new attempt: the part renders again. */
	resetKeys: readonly unknown[];
	children: ReactNode;
}

interface State {
	failed: boolean;
}

/**
 * A boundary around one risky part of a page (#447): when it throws, that part
 * gives way to its fallback and the error is reported — the rest of the page,
 * and playback, carry on. The route's error screen stays for everything else.
 */
export default class ReportedBoundary extends Component<Props, State> {
	state: State = { failed: false };

	static getDerivedStateFromError(): State {
		return { failed: true };
	}

	componentDidCatch(error: unknown): void {
		reportError(error, "component");
	}

	componentDidUpdate(prev: Props): void {
		if (!this.state.failed) return;
		const keys = this.props.resetKeys;
		if (keys.length !== prev.resetKeys.length || keys.some((key, i) => !Object.is(key, prev.resetKeys[i]))) {
			this.setState({ failed: false });
		}
	}

	render(): ReactNode {
		return this.state.failed ? this.props.fallback : this.props.children;
	}
}
