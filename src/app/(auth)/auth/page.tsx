"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";

import Link from "@/components/AppLink";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
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
import PasswordField from "@/components/auth/PasswordField";
import { FORM_ERROR, FORM_HELP, FORM_LEAD, PAGE_GUTTER, TEXT_LINK } from "@/components/auth/formText";
import { useNavRouter } from "@/components/nav-progress";

/** Seconds before the confirmation email can be sent again. */
const RESEND_COOLDOWN_S = 60;

const COPY: Record<AuthMode, { title: string; lead: string; submit: string }> = {
	signin: { title: "Welcome back", lead: "Sign in to pick up your patterns and tabs.", submit: "Sign in" },
	signup: {
		title: "Create your account",
		lead: "Save patterns, tabs and chords, and play them on any device.",
		submit: "Create account",
	},
};

/* Links, not state: each tab is deep-linkable (`?mode=signup`) and survives a reload. */
const MODES = [
	{ value: "signin", label: "Sign in" },
	{ value: "signup", label: "Create account" },
] as const satisfies readonly { value: AuthMode; label: string }[];

function AuthPageInner() {
	const router = useNavRouter();
	const searchParams = useSearchParams();
	const redirect = safeRedirectPath(searchParams.get("redirect"));
	const mode = parseAuthMode(searchParams.get("mode"));

	const [email, setEmail] = useState("");
	const [emailTouched, setEmailTouched] = useState(false);
	const [password, setPassword] = useState("");
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
		<div className="flex min-h-full flex-col justify-center py-10 max-sm:py-6">
			{/* Full width, then capped: a flex item with auto margins would shrink to
			    its content, and the two modes' content differs. */}
			<div className={`w-full ${PAGE_GUTTER}`}>
				<div className="gp-rise mx-auto max-w-110">
					<Panel className="p-7 max-sm:p-5">
						<h1 className="font-gp-display text-(length:--gp-t-xl) leading-(--gp-lh-head) font-bold tracking-[-0.015em] text-gp-ink">
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
								{/* Both leads in one cell, the other one hidden, so the card is as
								    tall in either mode however the lines wrap. */}
								<div className="mt-1.5 grid">
									{MODES.map(({ value }) => (
										<p
											key={value}
											aria-hidden={value !== mode}
											className={`${FORM_LEAD} col-start-1 row-start-1 ${value === mode ? "" : "invisible"}`}
										>
											{COPY[value].lead}
										</p>
									))}
								</div>

								<Segmented
									className="mt-6"
									full
									label="Sign in or create account"
									options={MODES}
									value={mode}
									disabled={busy}
									onChange={(next) => router.replace(hrefFor(next), { scroll: false })}
								/>

								<form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-5">
									<fieldset disabled={busy} className="flex flex-col gap-5">
										<Field
											label="Email"
											error={showEmailError ? "Enter a valid email address" : undefined}
										>
											{(control) => (
												<Input
													{...control}
													ref={emailRef}
													name="email"
													type="email"
													autoComplete="email"
													inputMode="email"
													spellCheck={false}
													placeholder="you@example.com"
													value={email}
													onChange={(e) => setEmail(e.target.value)}
													onBlur={() => setEmailTouched(true)}
													aria-describedby={control["aria-describedby"] ?? errorId}
												/>
											)}
										</Field>

										<div className="gp-field">
											<label htmlFor="auth-password" className="gp-field-label">
												Password
											</label>
											<PasswordField
												ref={passwordRef}
												id="auth-password"
												name="password"
												autoComplete={mode === "signin" ? "current-password" : "new-password"}
												placeholder={mode === "signup" ? "8+ characters" : "••••••••"}
												value={password}
												onChange={(e) => setPassword(e.target.value)}
												aria-describedby={errorId}
											/>
											{/* One slot, as tall as the meter with its hint, in both modes:
											    sign-up's strength meter, sign-in's reset link. Typing or
											    switching modes never changes the card's size. */}
											<div className="min-h-11">
												{strength ? (
													<PasswordStrengthMeter strength={strength} empty={password.length === 0} />
												) : (
													<Link
														href={email ? `/auth/reset?email=${encodeURIComponent(email.trim())}` : "/auth/reset"}
														className={`${TEXT_LINK} text-(length:--gp-t-cap) font-medium`}
													>
														Forgot password?
													</Link>
												)}
											</div>
										</div>
									</fieldset>

									{/* Always mounted so the live region exists before the first
									    error lands — screen readers ignore a region that appears
									    with its content. */}
									<p id="auth-error" role="alert" aria-live="polite" className={`${FORM_ERROR} empty:hidden`}>
										{error}
									</p>

									<Button type="submit" loading={busy} disabled={!canSubmit} className="w-full">
										{copy.submit}
									</Button>
								</form>
							</>
						)}
					</Panel>

					{!awaitingConfirmation && (
						<p className={`${FORM_HELP} mt-5 text-center text-(length:--gp-t-ui)`}>
							{mode === "signin" ? (
								<>
									No account?{" "}
									<Link href={hrefFor("signup")} replace scroll={false} className={TEXT_LINK}>
										Create one
									</Link>
								</>
							) : (
								<>
									Have an account?{" "}
									<Link href={hrefFor("signin")} replace scroll={false} className={TEXT_LINK}>
										Sign in
									</Link>
								</>
							)}
						</p>
					)}
				</div>
			</div>
		</div>
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
		<div className="mt-5 flex flex-col gap-5">
			<div className="flex items-start gap-3">
				<span className="flex size-10 flex-none items-center justify-center rounded-gp-md bg-gp-well text-gp-ink">
					<MailCheck className="size-5" strokeWidth={1.75} aria-hidden="true" />
				</span>
				<p className={FORM_LEAD}>
					We sent a confirmation link to{" "}
					<span className="font-semibold break-all text-gp-ink">{email}</span>. Open it to finish
					creating your account, then sign in.
				</p>
			</div>

			<p className={`${FORM_HELP} empty:hidden`} aria-live="polite">
				{note}
			</p>

			<div className="flex flex-wrap gap-2">
				<Button onClick={onBack}>Back to sign in</Button>
				<Button variant="secondary" onClick={resend} loading={sending} disabled={cooldown > 0}>
					{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
				</Button>
			</div>
			<p className={FORM_HELP}>Wrong address? Go back and try again with the right one.</p>
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
