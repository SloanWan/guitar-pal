"use client";

import { forwardRef, useState } from "react";
import type { ComponentProps, KeyboardEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FORM_HELP } from "./formText";

/**
 * A password input with the two things every password field here needs: a
 * show/hide toggle and a caps-lock warning. Everything else — label, id,
 * autocomplete, aria wiring — is the caller's, passed straight through.
 */
const PasswordField = forwardRef<
	HTMLInputElement,
	Omit<ComponentProps<"input">, "type" | "className">
>(function PasswordField({ onKeyDown, onKeyUp, onBlur, ...props }, ref) {
	const [shown, setShown] = useState(false);
	const [capsLock, setCapsLock] = useState(false);

	function trackCapsLock(e: KeyboardEvent<HTMLInputElement>) {
		setCapsLock(e.getModifierState("CapsLock"));
	}

	return (
		<>
			<div className="relative">
				<Input
					ref={ref}
					type={shown ? "text" : "password"}
					onKeyDown={(e) => {
						trackCapsLock(e);
						onKeyDown?.(e);
					}}
					onKeyUp={(e) => {
						trackCapsLock(e);
						onKeyUp?.(e);
					}}
					onBlur={(e) => {
						setCapsLock(false);
						onBlur?.(e);
					}}
					className="pr-11"
					{...props}
				/>
				<button
					type="button"
					onClick={() => setShown((v) => !v)}
					aria-label={shown ? "Hide password" : "Show password"}
					aria-pressed={shown}
					className="gp-focus absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-ink-3 transition-colors duration-(--gp-d-state) hover:text-ink"
				>
					{shown ? (
						<EyeOff className="size-4.5" strokeWidth={1.75} aria-hidden="true" />
					) : (
						<Eye className="size-4.5" strokeWidth={1.75} aria-hidden="true" />
					)}
				</button>
			</div>
			{capsLock && (
				<span className={FORM_HELP} aria-live="polite">
					Caps Lock is on
				</span>
			)}
		</>
	);
});

export default PasswordField;
