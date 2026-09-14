"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import { toast } from "sonner";

import Link from "@/components/AppLink";
import { resendSignUpConfirmation, signIn, signUp } from "@/lib/auth";
import { authErrorMessage } from "@/lib/authErrors";
import {
	isPlausibleEmail,
	parseAuthMode,
	readRememberedEmail,
	rememberEmail,
	rememberMethod,
	type AuthMode,
} from "@/lib/authForm";
import { passwordStrength } from "@/lib/passwordStrength";
import { displayNameOf } from "@/lib/profile";
import { safeRedirectPath } from "@/lib/safeRedirect";
import PasswordStrengthMeter from "@/components/auth/PasswordStrengthMeter";
import TabStripBackdrop from "@/components/TabStripBackdrop";
import { fingerpickToTabStrip } from "@/lib/fingerpickToTabStrip";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import { ERROR_TEXT, HELP, INPUT, LABEL, PRIMARY, SECONDARY } from "@/components/auth/formStyles";

/** Seconds before the confirmation email can be sent again. */
const RESEND_COOLDOWN_S = 60;

/* The waltz preset drifts behind the card, the way the landing hero's strips
   do — laid out once at module load; it never changes. */
const WALTZ_STRIP = fingerpickToTabStrip(
	PRESET_FINGERPICK_PATTERNS.find((p) => p.id === "waltz") ?? PRESET_FINGERPICK_PATTERNS[0],
);

const COPY: Record<AuthMode, { title: string; submit: string; pending: string }> = {
	signin: { title: "Sign in", submit: "Sign in", pending: "Signing in…" },
	signup: { title: "Create account", submit: "Create account", pending: "Creating account…" },
};

function AuthPageInner() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const redirect = safeRedirectPath(searchParams.get("redirect"));
	const mode = parseAuthMode(searchParams.get("mode"));

	const [email, setEmail] = useState("");
	const [emailTouched, setEmailTouched] = useState(false);
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [capsLock, setCapsLock] = useState(false);
	const [busy, setBusy] = useState(false);
	// Tagged with the tab it came from, so switching tabs drops the previous
	// verdict without an effect: an error from sign-in is not shown on sign-up.
	const [verdict, setVerdict] = useState<{ mode: AuthMode; message: string } | null>(null);
	const error = verdict?.mode === mode ? verdict.message : null;
	// Set once sign-up returns a user but no session: the project requires
	// email confirmation, so there is nothing to navigate to yet.
	const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

	const emailRef = useRef<HTMLInputElement>(null);
	const passwordRef = useRef<HTMLInputElement>(null);

	// The last email that signed in here is prefilled and focus skips to the
	// password — lighter than a "remember me" box and what most people expect.
	useEffect(() => {
		const remembered = readRememberedEmail();
		if (remembered) {
			// One-shot restore from persisted storage after mount; the extra
			// render is intentional and bounded to this single prefill.
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setEmail(remembered);
			passwordRef.current?.focus();
		} else {
			emailRef.current?.focus();
		}
	}, []);

	const emailOk = isPlausibleEmail(email);
	const showEmailError = emailTouched && email.length > 0 && !emailOk;
	// Strength gates sign-up only. An existing account may hold a password the
	// meter would now refuse; sign-in lets the server answer instead.
	const strength = useMemo(
		() => (mode === "signup" ? passwordStrength(password, email) : null),
		[mode, password, email],
	);
	const canSubmit =
		emailOk && password.length > 0 && (strength === null || strength.acceptable);

	function hrefFor(target: AuthMode): string {
		const params = new URLSearchParams();
		if (target === "signup") params.set("mode", "signup");
		const raw = searchParams.get("redirect");
		if (raw) params.set("redirect", raw);
		const query = params.toString();
		return query ? `/auth?${query}` : "/auth";
	}

	function trackCapsLock(e: KeyboardEvent<HTMLInputElement>) {
		setCapsLock(e.getModifierState("CapsLock"));
	}

	// On success `busy` deliberately stays true: `router.push` resolves before
	// the navigation lands, and resetting would flash the idle button while
	// the next page is still loading. The page unmounts anyway.
	async function handleSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (busy || !canSubmit) return;
		setBusy(true);
		setVerdict(null);
		const address = email.trim();

		// The greeting is raised before navigating: the Toaster lives in the
		// root layout, so it survives the route change.
		if (mode === "signin") {
			const { data, error } = await signIn(address, password);
			if (error) {
				setVerdict({ mode, message: authErrorMessage(error) });
				setBusy(false);
				return;
			}
			toast.success(data.user ? `Welcome back, ${displayNameOf(data.user)}` : "Welcome back");
		} else {
			const { data, error } = await signUp(address, password);
			if (error) {
				setVerdict({ mode, message: authErrorMessage(error) });
				setBusy(false);
				return;
			}
			if (!data.session) {
				setAwaitingConfirmation(true);
				setBusy(false);
				return;
			}
			toast.success(`Welcome, ${displayNameOf(data.session.user)}`);
		}

		rememberEmail(address);
		rememberMethod("email");
		router.push(redirect);
	}

	const copy = COPY[mode];
	const errorId = error ? "auth-error" : undefined;

	return (
		<div className="relative flex min-h-full flex-col justify-center overflow-hidden py-10 max-sm:py-6">
			<TabStripBackdrop front={WALTZ_STRIP} back={WALTZ_STRIP} direction="right" />
			<div className="relative z-2 mx-auto w-full max-w-105 px-(--gutter)">
				{/* Sign-up sits on a denim wash so the two tabs read as two places,
				    not one form with a different label. The wash is translucent, so
				    it is painted over an opaque panel (as a ::before, kept under the
				    content) rather than straight over the TAB strips behind. */}
				<section
					className={`relative isolate border bg-panel p-6 transition-[border-color] duration-(--dur-hover) before:absolute before:inset-0 before:-z-10 before:bg-denim-tint before:transition-opacity before:duration-(--dur-hover) before:content-[''] max-sm:p-5 ${
						mode === "signup" ? "border-denim before:opacity-100" : "border-line before:opacity-0"
					}`}
				>
					{/* Eyebrow + LED: the lamp lights while a request is in flight,
					    the same "LED = active" the topbar teaches. */}
					<div className="mb-1 flex items-center justify-between">
						<span className="font-mono text-[length:var(--text-eyebrow-size)] uppercase tracking-[var(--text-eyebrow-ls)] text-ink-dim">
							Account
						</span>
						<span
							className={`size-1.5 rounded-full transition-[background,box-shadow] duration-200 ${
								busy ? "bg-denim-accent shadow-(--glow-led)" : "bg-ink-faint"
							}`}
							aria-hidden="true"
						/>
					</div>
					<h1 className="mb-6 font-mono text-(length:--text-h3-size) font-medium tracking-[0.02em]">
						{awaitingConfirmation ? "Check your inbox" : copy.title}
					</h1>

					{awaitingConfirmation ? (
						<InboxNotice
							email={email.trim()}
							onBack={() => {
								setAwaitingConfirmation(false);
								setPassword("");
								router.replace(hrefFor("signin"));
							}}
						/>
					) : (
						<>
							<ModeTabs mode={mode} hrefFor={hrefFor} disabled={busy} />

							<form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-5">
								<fieldset disabled={busy} className="flex flex-col gap-5">
									<div className="flex flex-col gap-1.5">
										<label htmlFor="auth-email" className={LABEL}>
											Email
										</label>
										<input
											ref={emailRef}
											id="auth-email"
											name="email"
											type="email"
											autoComplete="email"
											inputMode="email"
											spellCheck={false}
											placeholder="you@example.com"
											value={email}
											onChange={(e) => setEmail(e.target.value)}
											onBlur={() => setEmailTouched(true)}
											aria-invalid={showEmailError || undefined}
											aria-describedby={showEmailError ? "auth-email-error" : errorId}
											className={INPUT}
										/>
										{showEmailError && (
											<span id="auth-email-error" className={ERROR_TEXT}>
												Enter a valid email address
											</span>
										)}
									</div>

									<div className="flex flex-col gap-1.5">
										<label htmlFor="auth-password" className={LABEL}>
											Password
										</label>
										<div className="relative">
											<input
												ref={passwordRef}
												id="auth-password"
												name="password"
												type={showPassword ? "text" : "password"}
												autoComplete={mode === "signin" ? "current-password" : "new-password"}
												placeholder={mode === "signup" ? "8+ characters" : "••••••••"}
												value={password}
												onChange={(e) => setPassword(e.target.value)}
												onKeyDown={trackCapsLock}
												onKeyUp={trackCapsLock}
												onBlur={() => setCapsLock(false)}
												aria-describedby={errorId}
												className={`${INPUT} pr-10`}
											/>
											<button
												type="button"
												onClick={() => setShowPassword((v) => !v)}
												aria-label={showPassword ? "Hide password" : "Show password"}
												aria-pressed={showPassword}
												className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-faint transition-colors duration-(--dur-hover) hover:text-ink focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:-outline-offset-2"
											>
												{showPassword ? (
													<EyeOff className="size-4" strokeWidth={1.5} aria-hidden="true" />
												) : (
													<Eye className="size-4" strokeWidth={1.5} aria-hidden="true" />
												)}
											</button>
										</div>
										{capsLock && (
											<span className={HELP} aria-live="polite">
												Caps Lock is on
											</span>
										)}
										{strength && (
											<PasswordStrengthMeter strength={strength} empty={password.length === 0} />
										)}
									</div>
								</fieldset>

								{/* Always mounted so the live region exists before the first
								    error lands — screen readers ignore a region that appears
								    with its content. */}
								<p id="auth-error" role="alert" aria-live="polite" className={`${ERROR_TEXT} empty:hidden`}>
									{error}
								</p>

								<button type="submit" disabled={busy || !canSubmit} className={`${PRIMARY} w-full self-stretch`}>
									{busy ? copy.pending : copy.submit}
								</button>
							</form>
						</>
					)}
				</section>

				{!awaitingConfirmation && (
					<p className={`${HELP} mt-5 text-center`}>
						{mode === "signin" ? (
							<>
								No account?{" "}
								<Link href={hrefFor("signup")} replace scroll={false} className="text-denim-accent underline-offset-4 hover:underline">
									Create one
								</Link>
							</>
						) : (
							<>
								Have an account?{" "}
								<Link href={hrefFor("signin")} replace scroll={false} className="text-denim-accent underline-offset-4 hover:underline">
									Sign in
								</Link>
							</>
						)}
					</p>
				)}
			</div>
		</div>
	);
}

/**
 * Hairline segmented switch, latched like the topbar nav: the open tab sits
 * on `bg-surface`, sunk 1px. Links, not buttons, so a tab is deep-linkable
 * (`?mode=signup`) and survives a reload.
 */
function ModeTabs({
	mode,
	hrefFor,
	disabled,
}: {
	mode: AuthMode;
	hrefFor: (target: AuthMode) => string;
	disabled: boolean;
}) {
	const tabs: { value: AuthMode; label: string }[] = [
		{ value: "signin", label: "Sign in" },
		{ value: "signup", label: "Create account" },
	];
	return (
		<nav
			aria-label="Sign in or create account"
			className={`flex divide-x divide-line-strong border border-line-strong ${disabled ? "pointer-events-none opacity-60" : ""}`}
		>
			{tabs.map(({ value, label }) => {
				const active = value === mode;
				return (
					<Link
						key={value}
						href={hrefFor(value)}
						replace
						scroll={false}
						aria-current={active ? "page" : undefined}
						className={`flex h-(--h-control) flex-1 items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] transition-[color,background-color] duration-(--dur-hover) ease-out focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1 ${
							active
								? "bg-surface font-medium text-denim-accent"
								: "text-ink hover:text-denim-accent"
						}`}
					>
						<span className={active ? "translate-y-px" : ""}>{label}</span>
					</Link>
				);
			})}
		</nav>
	);
}

/**
 * Shown in place of the form after a sign-up that needs email confirmation.
 * The resend button cools down for a minute — Supabase rate-limits the
 * endpoint anyway, so hammering it only earns an error.
 */
function InboxNotice({ email, onBack }: { email: string; onBack: () => void }) {
	const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
	const [sending, setSending] = useState(false);
	const [note, setNote] = useState<string | null>(null);

	useEffect(() => {
		if (cooldown <= 0) return;
		const id = setInterval(() => setCooldown((s) => s - 1), 1000);
		return () => clearInterval(id);
	}, [cooldown]);

	async function resend() {
		setSending(true);
		setNote(null);
		const { error } = await resendSignUpConfirmation(email);
		setSending(false);
		if (error) {
			setNote(authErrorMessage(error));
			return;
		}
		setNote("Sent. Give it a minute to arrive.");
		setCooldown(RESEND_COOLDOWN_S);
	}

	return (
		<div className="flex flex-col gap-5">
			<div className="flex items-start gap-3">
				<span className="flex size-9 flex-none items-center justify-center border border-line-strong text-denim-accent">
					<MailCheck className="size-4" strokeWidth={1.5} aria-hidden="true" />
				</span>
				<p className="font-sans text-sm text-ink-dim">
					We sent a confirmation link to{" "}
					<span className="font-mono text-ink">{email}</span>. Open it to finish
					creating your account, then sign in.
				</p>
			</div>

			<p className={`${HELP} empty:hidden`} aria-live="polite">
				{note}
			</p>

			<div className="flex gap-2">
				<button type="button" onClick={onBack} className={PRIMARY}>
					Back to sign in
				</button>
				<button
					type="button"
					onClick={resend}
					disabled={sending || cooldown > 0}
					className={SECONDARY}
				>
					{sending ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
				</button>
			</div>
			<p className={HELP}>Wrong address? Go back and try again with the right one.</p>
		</div>
	);
}

export default function AuthPage() {
	return (
		<Suspense fallback={null}>
			<AuthPageInner />
		</Suspense>
	);
}
