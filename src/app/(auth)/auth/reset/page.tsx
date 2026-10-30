"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";

import Link from "@/components/AppLink";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { requestPasswordReset, setRecoveredPassword } from "@/lib/auth";
import { authErrorMessage } from "@/lib/authErrors";
import { isPlausibleEmail, readRememberedEmail, rememberEmail } from "@/lib/authForm";
import { passwordStrength } from "@/lib/passwordStrength";
import { createClient } from "@/lib/supabase";
import PasswordField from "@/components/auth/PasswordField";
import PasswordStrengthMeter from "@/components/auth/PasswordStrengthMeter";
import { FORM_ERROR, FORM_HELP, FORM_LEAD, PAGE_GUTTER, TEXT_LINK } from "@/components/auth/formText";

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
			<div className={`w-full ${PAGE_GUTTER}`}>
				<div className="gp-rise mx-auto max-w-110">
					<Panel className="p-7 max-sm:p-5" aria-busy={stage === "verifying" || undefined}>
						<h1 className="mb-5 font-gp-display text-(length:--gp-t-xl) leading-(--gp-lh-head) font-bold tracking-[-0.015em] text-gp-ink">
							{TITLE[stage]}
						</h1>

						{stage === "request" && (
							<form onSubmit={handleRequest} noValidate className="flex flex-col gap-5">
								<p className={FORM_LEAD}>
									Enter the email on your account and we&apos;ll send a link to set a new
									password.
								</p>
								<fieldset disabled={busy}>
									<Field
										label="Email"
										error={showEmailError ? "Enter a valid email address" : undefined}
									>
										{(control) => (
											<Input
												{...control}
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
												aria-describedby={control["aria-describedby"] ?? errorId}
											/>
										)}
									</Field>
								</fieldset>
								<p id="reset-error" role="alert" aria-live="polite" className={`${FORM_ERROR} empty:hidden`}>
									{error}
								</p>
								<Button type="submit" loading={busy} disabled={!emailOk} className="w-full">
									Send reset link
								</Button>
							</form>
						)}

						{stage === "sent" && (
							<div className="flex flex-col gap-5">
								<div className="flex items-start gap-3">
									<span className="flex size-10 flex-none items-center justify-center rounded-gp-md bg-gp-well text-gp-ink">
										<MailCheck className="size-5" strokeWidth={1.75} aria-hidden="true" />
									</span>
									<p className={FORM_LEAD}>
										If <span className="font-semibold break-all text-gp-ink">{email.trim()}</span> has an
										account, a reset link is on its way. Open it in this browser to choose
										a new password.
									</p>
								</div>
								<p id="reset-error" role="alert" aria-live="polite" className={`${FORM_ERROR} empty:hidden`}>
									{error}
								</p>
								<div className="flex flex-wrap gap-2">
									<Button
										variant="secondary"
										onClick={() => void sendLink()}
										loading={busy}
										disabled={cooldown > 0}
									>
										{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend link"}
									</Button>
									<Button
										variant="ghost"
										onClick={() => {
											setError(null);
											setStage("request");
										}}
									>
										Change email
									</Button>
								</div>
							</div>
						)}

						{stage === "verifying" && (
							<p className={FORM_LEAD}>Checking your link…</p>
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
								<p className={FORM_LEAD}>
									This link has expired or was opened in a different browser from the one
									that requested it. Request a new one below and open it here.
								</p>
								<Button
									onClick={() => {
										setError(null);
										router.replace("/auth/reset");
										setStage("request");
									}}
									className="w-full"
								>
									Request a new link
								</Button>
							</div>
						)}
					</Panel>

					{(stage === "request" || stage === "sent" || stage === "expired") && (
						<p className={`${FORM_HELP} mt-5 text-center text-(length:--gp-t-ui)`}>
							Remembered it?{" "}
							<Link href="/auth" className={TEXT_LINK}>
								Sign in
							</Link>
						</p>
					)}
				</div>
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
			<p className={FORM_LEAD}>
				Signed in as <span className="font-semibold break-all text-gp-ink">{email}</span>.
			</p>
			<fieldset disabled={busy} className="flex flex-col gap-5">
				<div className="gp-field">
					<label htmlFor="new-password" className="gp-field-label">
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
				<div className="gp-field">
					<label htmlFor="confirm-password" className="gp-field-label">
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
						<span id="confirm-error" className={FORM_ERROR}>
							Doesn&apos;t match
						</span>
					)}
				</div>
			</fieldset>
			<p id="reset-error" role="alert" aria-live="polite" className={`${FORM_ERROR} empty:hidden`}>
				{error}
			</p>
			<Button type="submit" loading={busy} disabled={!canSubmit} className="w-full">
				Set new password
			</Button>
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
