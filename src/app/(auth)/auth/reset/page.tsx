"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";

import Link from "@/components/AppLink";
import { requestPasswordReset, setRecoveredPassword } from "@/lib/auth";
import { authErrorMessage } from "@/lib/authErrors";
import { isPlausibleEmail, readRememberedEmail, rememberEmail } from "@/lib/authForm";
import { passwordStrength } from "@/lib/passwordStrength";
import { createClient } from "@/lib/supabase";
import PasswordField from "@/components/auth/PasswordField";
import PasswordStrengthMeter from "@/components/auth/PasswordStrengthMeter";
import { ERROR_TEXT, HELP, INPUT, LABEL, PRIMARY, SECONDARY } from "@/components/auth/formStyles";

/** Seconds before the recovery email can be sent again. */
const RESEND_COOLDOWN_S = 60;

/**
 * The page has two halves joined by an email. `request` → `sent` is the
 * first visit: type an address, get a link. `verifying` → `update` is the
 * return: the link lands here with a code, the browser client exchanges it
 * for a session as it initialises, and the new password is set on that
 * session. `expired` is the return gone wrong — an old link, or one opened
 * in a browser other than the one that asked for it (PKCE keeps the other
 * half of the handshake in that browser's storage).
 */
type Stage = "request" | "sent" | "verifying" | "update" | "expired";

const TITLE: Record<Stage, string> = {
	request: "Reset password",
	sent: "Check your inbox",
	verifying: "One moment",
	update: "Choose a new password",
	expired: "Link expired",
};

function ResetPageInner() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const hasCode = searchParams.has("code");

	const [stage, setStage] = useState<Stage>(hasCode ? "verifying" : "request");
	const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
	const [emailTouched, setEmailTouched] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [cooldown, setCooldown] = useState(0);

	// Without a typed address, the one that last signed in here is the best guess.
	useEffect(() => {
		if (email !== "") return;
		const remembered = readRememberedEmail();
		// One-shot restore from persisted storage after mount.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		if (remembered) setEmail(remembered);
		// Runs once: `email` is read for its initial value only.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// The return trip. `getSession` resolves once the client has finished
	// initialising — which, with a code in the URL, includes exchanging it.
	// A session then means the link was good; none means it was not.
	useEffect(() => {
		if (!hasCode) return;
		let cancelled = false;
		const supabase = createClient();
		supabase.auth.getSession().then(({ data }) => {
			if (cancelled) return;
			if (data.session) {
				setEmail(data.session.user.email ?? "");
				setStage("update");
			} else {
				setStage("expired");
			}
		});
		return () => {
			cancelled = true;
		};
	}, [hasCode]);

	useEffect(() => {
		if (cooldown <= 0) return;
		const id = setInterval(() => setCooldown((s) => s - 1), 1000);
		return () => clearInterval(id);
	}, [cooldown]);

	const emailOk = isPlausibleEmail(email);
	const showEmailError = emailTouched && email.length > 0 && !emailOk;

	async function sendLink() {
		if (busy || !emailOk) return;
		setBusy(true);
		setError(null);
		const { error } = await requestPasswordReset(email.trim());
		setBusy(false);
		if (error) {
			setError(authErrorMessage(error));
			return;
		}
		setCooldown(RESEND_COOLDOWN_S);
		setStage("sent");
	}

	function handleRequest(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		void sendLink();
	}

	const errorId = error ? "reset-error" : undefined;

	return (
		<div className="flex min-h-full flex-col justify-center py-10 max-sm:py-6">
			<div className="mx-auto w-full max-w-105 px-(--gutter)">
				<section className="border border-line bg-panel p-6 max-sm:p-5">
					<div className="mb-1 flex items-center justify-between">
						<span className="font-mono text-[length:var(--text-eyebrow-size)] uppercase tracking-[var(--text-eyebrow-ls)] text-ink-dim">
							Account
						</span>
						<span
							className={`size-1.5 rounded-full transition-[background,box-shadow] duration-200 ${
								busy || stage === "verifying"
									? "bg-denim-accent shadow-(--glow-led)"
									: "bg-ink-faint"
							}`}
							aria-hidden="true"
						/>
					</div>
					<h1 className="mb-6 font-mono text-(length:--text-h3-size) font-medium tracking-[0.02em]">
						{TITLE[stage]}
					</h1>

					{stage === "request" && (
						<form onSubmit={handleRequest} noValidate className="flex flex-col gap-5">
							<p className="font-sans text-sm text-ink-dim">
								Enter the email on your account and we&apos;ll send a link to set a new
								password.
							</p>
							<fieldset disabled={busy} className="flex flex-col gap-1.5">
								<label htmlFor="reset-email" className={LABEL}>
									Email
								</label>
								<input
									id="reset-email"
									name="email"
									type="email"
									autoComplete="email"
									inputMode="email"
									spellCheck={false}
									autoFocus
									placeholder="you@example.com"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									onBlur={() => setEmailTouched(true)}
									aria-invalid={showEmailError || undefined}
									aria-describedby={showEmailError ? "reset-email-error" : errorId}
									className={INPUT}
								/>
								{showEmailError && (
									<span id="reset-email-error" className={ERROR_TEXT}>
										Enter a valid email address
									</span>
								)}
							</fieldset>
							<p id="reset-error" role="alert" aria-live="polite" className={`${ERROR_TEXT} empty:hidden`}>
								{error}
							</p>
							<button type="submit" disabled={busy || !emailOk} className={`${PRIMARY} w-full self-stretch`}>
								{busy ? "Sending…" : "Send reset link"}
							</button>
						</form>
					)}

					{stage === "sent" && (
						<div className="flex flex-col gap-5">
							<div className="flex items-start gap-3">
								<span className="flex size-9 flex-none items-center justify-center border border-line-strong text-denim-accent">
									<MailCheck className="size-4" strokeWidth={1.5} aria-hidden="true" />
								</span>
								<p className="font-sans text-sm text-ink-dim">
									If <span className="font-mono text-ink">{email.trim()}</span> has an
									account, a reset link is on its way. Open it in this browser to choose
									a new password.
								</p>
							</div>
							<p id="reset-error" role="alert" aria-live="polite" className={`${ERROR_TEXT} empty:hidden`}>
								{error}
							</p>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={() => void sendLink()}
									disabled={busy || cooldown > 0}
									className={SECONDARY}
								>
									{busy ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend link"}
								</button>
								<button
									type="button"
									onClick={() => {
										setError(null);
										setStage("request");
									}}
									className={SECONDARY}
								>
									Change email
								</button>
							</div>
						</div>
					)}

					{stage === "verifying" && (
						<p className="font-sans text-sm text-ink-dim">Checking your link…</p>
					)}

					{stage === "update" && (
						<UpdateForm
							email={email}
							onDone={() => {
								rememberEmail(email);
								toast.success("Password updated");
								router.push("/home");
							}}
						/>
					)}

					{stage === "expired" && (
						<div className="flex flex-col gap-5">
							<p className="font-sans text-sm text-ink-dim">
								This link has expired or was opened in a different browser from the one
								that requested it. Request a new one below and open it here.
							</p>
							<button
								type="button"
								onClick={() => {
									setError(null);
									router.replace("/auth/reset");
									setStage("request");
								}}
								className={`${PRIMARY} w-full self-stretch`}
							>
								Request a new link
							</button>
						</div>
					)}
				</section>

				{(stage === "request" || stage === "sent" || stage === "expired") && (
					<p className={`${HELP} mt-5 text-center`}>
						Remembered it?{" "}
						<Link href="/auth" className="text-denim-accent underline-offset-4 hover:underline">
							Sign in
						</Link>
					</p>
				)}
			</div>
		</div>
	);
}

/**
 * The new password, twice, gated by the same meter as sign-up. `busy` stays
 * on after success: the page is navigating away.
 */
function UpdateForm({ email, onDone }: { email: string; onDone: () => void }) {
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const strength = useMemo(() => passwordStrength(password, email), [password, email]);
	const matches = password === confirm;
	const canSubmit = strength.acceptable && confirm.length > 0 && matches;

	async function handleSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (busy || !canSubmit) return;
		setBusy(true);
		setError(null);
		const { error } = await setRecoveredPassword(password);
		if (error) {
			setError(authErrorMessage(error));
			setBusy(false);
			return;
		}
		onDone();
	}

	const errorId = error ? "reset-error" : undefined;

	return (
		<form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
			<p className="font-sans text-sm text-ink-dim">
				Signed in as <span className="font-mono text-ink">{email}</span>.
			</p>
			<fieldset disabled={busy} className="flex flex-col gap-5">
				<div className="flex flex-col gap-1.5">
					<label htmlFor="new-password" className={LABEL}>
						New password
					</label>
					<PasswordField
						id="new-password"
						name="new-password"
						autoComplete="new-password"
						autoFocus
						placeholder="8+ characters"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						aria-describedby={errorId}
					/>
					<PasswordStrengthMeter strength={strength} empty={password.length === 0} />
				</div>
				<div className="flex flex-col gap-1.5">
					<label htmlFor="confirm-password" className={LABEL}>
						Confirm
					</label>
					<PasswordField
						id="confirm-password"
						name="confirm-password"
						autoComplete="new-password"
						value={confirm}
						onChange={(e) => setConfirm(e.target.value)}
						aria-invalid={(confirm.length > 0 && !matches) || undefined}
						aria-describedby={confirm.length > 0 && !matches ? "confirm-error" : errorId}
					/>
					{confirm.length > 0 && !matches && (
						<span id="confirm-error" className={ERROR_TEXT}>
							Doesn&apos;t match
						</span>
					)}
				</div>
			</fieldset>
			<p id="reset-error" role="alert" aria-live="polite" className={`${ERROR_TEXT} empty:hidden`}>
				{error}
			</p>
			<button type="submit" disabled={busy || !canSubmit} className={`${PRIMARY} w-full self-stretch`}>
				{busy ? "Updating…" : "Set new password"}
			</button>
		</form>
	);
}

export default function ResetPage() {
	return (
		<Suspense fallback={null}>
			<ResetPageInner />
		</Suspense>
	);
}
