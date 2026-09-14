"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User, UserIdentity } from "@supabase/supabase-js";
import { toast } from "sonner";
import { KeyRound, Mail, UserRound } from "lucide-react";

import { useUser } from "@/hooks/useUser";
import {
	refreshSession,
	sendReauthenticationCode,
	unlinkIdentity,
	updateEmail,
	updatePassword,
	updateProfileMetadata,
} from "@/lib/auth";
import {
	AVATAR_COLORS,
	AVATAR_COLOR_KEY,
	AVATAR_ICONS,
	AVATAR_ICON_KEY,
	NICKNAME_KEY,
	NICKNAME_MAX_LENGTH,
	avatarIconFor,
	isAvatarColor,
	nicknameOf,
	profileOf,
	providerNameOf,
} from "@/lib/profile";
import type { AvatarColor, AvatarIcon } from "@/lib/profile";
import { passwordStrength } from "@/lib/passwordStrength";
import UserAvatar from "@/components/UserAvatar";
import PasswordStrengthMeter from "@/components/auth/PasswordStrengthMeter";
import { BUTTON, HELP, INPUT, LABEL, PRIMARY, SECONDARY } from "@/components/auth/formStyles";

const DANGER = `${BUTTON} self-start bg-destructive text-white hover:bg-destructive/90`;

/* Two columns from 900px up (the same break the home grid uses), stacked
   below, each card aligned to the top of its column. */
const GRID = "grid grid-cols-2 items-start gap-5 max-[900px]:grid-cols-1";

/** Seconds before the one-time code can be sent again. */
const RESEND_COOLDOWN_S = 60;

export default function SettingsPage() {
	const { user, loading } = useUser();

	return (
		<div className="mx-auto max-w-300 px-(--gutter) py-8 max-sm:py-6">
			{/* One line, not the home page's display size: this page has to fit a
			    laptop viewport with all three cards in view. */}
			<h1 className="mb-6 font-mono text-(length:--text-h3-size) font-medium tracking-[0.02em]">
				Settings
			</h1>

			{loading || !user ? (
				// The proxy guards /settings, so a resolved null user is only ever a
				// sign-out mid-visit; the skeleton is the right thing either way.
				<div className={GRID}>
					<div className="h-96 animate-pulse border border-line bg-denim-tint" />
					<div className="flex flex-col gap-5">
						<div className="h-40 animate-pulse border border-line bg-denim-tint" />
						<div className="h-40 animate-pulse border border-line bg-denim-tint" />
					</div>
				</div>
			) : (
				<div className={GRID}>
					<IdentityCard user={user} />
					{/* Sign-in credentials stack in the right column; identity, the
					    taller card, holds the left on its own. */}
					<div className="flex flex-col gap-5">
						<EmailCard user={user} />
						<PasswordCard email={user.email} />
					</div>
				</div>
			)}
		</div>
	);
}

function Card({
	icon,
	title,
	children,
}: {
	icon: React.ReactNode;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="border border-line bg-panel p-4">
			<h2 className="mb-4 flex items-center gap-2 font-mono text-[length:var(--text-eyebrow-size)] uppercase tracking-[var(--text-eyebrow-ls)] text-ink-dim">
				<span className="text-denim-accent">{icon}</span>
				{title}
			</h2>
			{children}
		</section>
	);
}

function ErrorLine({ message }: { message: string | null }) {
	if (!message) return null;
	return (
		<p role="alert" className="font-mono text-[11px] tracking-[0.02em] text-destructive">
			{message}
		</p>
	);
}

/** A square option in a radio group — the chip previews and the icon grid. */
function Choice({
	selected,
	onSelect,
	label,
	children,
}: {
	selected: boolean;
	onSelect: () => void;
	label: string;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			role="radio"
			aria-checked={selected}
			aria-label={label}
			title={label}
			onClick={onSelect}
			className={`transition-[outline-color,opacity] duration-(--dur-hover) hover:opacity-90 focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-2 ${
				selected ? "outline-2 outline-offset-2 outline-denim-accent" : ""
			}`}
		>
			{children}
		</button>
	);
}

/* ---------------------------------------------------------------------------
   Nickname, what the chip shows (initial or an icon) and its colour. All
   three live in user_metadata; the preview is the same component the topbar
   renders, fed the unsaved values, so what you see is what will ship.
   ------------------------------------------------------------------------ */
function IdentityCard({ user }: { user: User }) {
	const router = useRouter();
	const chosenColor = user.user_metadata?.[AVATAR_COLOR_KEY];
	// What is saved right now — the baseline "dirty" is measured against.
	const [saved, setSaved] = useState({
		nickname: nicknameOf(user) ?? "",
		color: isAvatarColor(chosenColor) ? chosenColor : null,
		icon: avatarIconFor(user),
	});
	const [nickname, setNickname] = useState(saved.nickname);
	const [color, setColor] = useState<AvatarColor | null>(saved.color);
	const [icon, setIcon] = useState<AvatarIcon | null>(saved.icon);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const preview = profileOf({
		id: user.id,
		email: user.email,
		user_metadata: {
			...user.user_metadata,
			[NICKNAME_KEY]: nickname,
			[AVATAR_COLOR_KEY]: color,
			[AVATAR_ICON_KEY]: icon,
		},
	});
	const hashed = profileOf({ id: user.id, user_metadata: {} }).color;
	const dirty =
		nickname.trim() !== saved.nickname || color !== saved.color || icon !== saved.icon;

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!dirty || busy) return;
		setBusy(true);
		setError(null);
		const trimmed = nickname.trim();
		const { error } = await updateProfileMetadata({
			nickname: trimmed || null,
			avatarColor: color,
			avatarIcon: icon,
		});
		setBusy(false);
		if (error) {
			setError(error.message);
			return;
		}
		setSaved({ nickname: trimmed, color, icon });
		setNickname(trimmed);
		toast.success("Profile saved");
		// The topbar is server-rendered; refresh so it picks the change up.
		router.refresh();
	}

	return (
		<Card icon={<UserRound className="size-3.5" strokeWidth={1.5} />} title="Identity">
			<form onSubmit={handleSubmit} className="flex flex-col gap-4">
				{/* Preview and nickname share a row: the chip is the thing the name
				    changes, so they read as one control. */}
				<div className="flex items-end gap-4">
					<UserAvatar profile={preview} className="size-16 text-2xl" />
					<div className="flex min-w-0 flex-1 flex-col gap-1.5">
						<label htmlFor="nickname" className={LABEL}>
							Nickname
						</label>
						<input
							id="nickname"
							type="text"
							autoComplete="nickname"
							value={nickname}
							onChange={(e) => setNickname(e.target.value)}
							placeholder={providerNameOf(user) ?? user.email?.split("@")[0] ?? ""}
							maxLength={NICKNAME_MAX_LENGTH}
							className={INPUT}
						/>
					</div>
				</div>
				<span className="-mt-2 font-mono text-[10px] tracking-[0.04em] text-ink-faint">
					Shown as <span className="text-ink-dim">{preview.displayName}</span>. Empty falls back
					to your account name. {nickname.length}/{NICKNAME_MAX_LENGTH}
				</span>

				<div className="flex flex-col gap-1.5">
					<span className={LABEL}>On the chip</span>
					{/* The initial first, then the icons, all drawn in the colour picked
					    below so switching either updates the other's previews. */}
					<div
						role="radiogroup"
						aria-label="On the chip"
						className="flex flex-wrap gap-2"
					>
						<Choice
							selected={icon === null}
							onSelect={() => setIcon(null)}
							label="Your initial"
						>
							<UserAvatar
								profile={{
									initial: preview.initial,
									color: preview.color,
									icon: null,
								}}
								className="size-8 text-[12px]"
							/>
						</Choice>
						{AVATAR_ICONS.map((id) => (
							<Choice
								key={id}
								selected={icon === id}
								onSelect={() => setIcon(id)}
								label={id}
							>
								<UserAvatar
									profile={{
										initial: preview.initial,
										color: preview.color,
										icon: id,
									}}
									className="size-8 text-[12px]"
								/>
							</Choice>
						))}
					</div>
				</div>

				<div className="flex flex-col gap-1.5">
					<span className={LABEL}>Colour</span>
					<div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2">
						<Choice
							selected={color === null}
							onSelect={() => setColor(null)}
							label={`Auto (${hashed})`}
						>
							<span className="flex size-8 items-center justify-center border border-line-strong font-mono text-[9px] uppercase tracking-[0.1em] text-ink-dim">
								Auto
							</span>
						</Choice>
						{AVATAR_COLORS.map((c) => (
							<Choice
								key={c}
								selected={color === c}
								onSelect={() => setColor(c)}
								label={c}
							>
								<UserAvatar
									profile={{
										initial: preview.initial,
										color: c,
										icon: preview.icon,
									}}
									className="size-8 text-[12px]"
								/>
							</Choice>
						))}
					</div>
				</div>

				<ErrorLine message={error} />
				<button type="submit" disabled={!dirty || busy} className={PRIMARY}>
					{busy ? "Saving…" : "Save profile"}
				</button>
			</form>
		</Card>
	);
}

/* ---------------------------------------------------------------------------
   Email. The current address is the resting state; "Change" and "Unlink"
   each open their own form underneath. Unlink is only offered when another
   sign-in method exists — Supabase refuses to remove the last identity, and
   we would rather not show a button that can only fail.
   ------------------------------------------------------------------------ */
function EmailCard({ user }: { user: User }) {
	const email = user.email ?? null;
	const identities: UserIdentity[] = user.identities ?? [];
	const emailIdentity = identities.find((i) => i.provider === "email") ?? null;
	const canUnlink = emailIdentity !== null && identities.length > 1;

	const [mode, setMode] = useState<"idle" | "change" | "unlink">("idle");
	const [next, setNext] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pendingTo, setPendingTo] = useState<string | null>(null);

	const trimmed = next.trim();
	const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed !== email;

	function open(next: "change" | "unlink") {
		setMode((current) => (current === next ? "idle" : next));
		setError(null);
	}

	async function handleChange(e: React.FormEvent) {
		e.preventDefault();
		if (!validEmail || busy) return;
		setBusy(true);
		setError(null);
		const { error } = await updateEmail(trimmed);
		setBusy(false);
		if (error) {
			setError(error.message);
			return;
		}
		setPendingTo(trimmed);
		setNext("");
		setMode("idle");
	}

	async function handleUnlink() {
		if (!emailIdentity || busy) return;
		setBusy(true);
		setError(null);
		const { error } = await unlinkIdentity(emailIdentity);
		if (error) {
			setBusy(false);
			setError(error.message);
			return;
		}
		// unlinkIdentity doesn't push a new user through onAuthStateChange;
		// a session refresh does.
		await refreshSession();
		setBusy(false);
		setMode("idle");
		toast.success("Email sign-in unlinked");
	}

	return (
		<Card icon={<Mail className="size-3.5" strokeWidth={1.5} />} title="Email">
			<div className="flex flex-col gap-5">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div className="flex min-w-0 flex-col gap-1.5">
						<span className={LABEL}>Current</span>
						<span className="truncate font-mono text-sm text-ink">{email ?? "—"}</span>
					</div>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={() => open("change")}
							aria-expanded={mode === "change"}
							className={`${SECONDARY} ${mode === "change" ? "border-denim text-denim-accent" : ""}`}
						>
							Change
						</button>
						<button
							type="button"
							onClick={() => open("unlink")}
							disabled={!canUnlink}
							aria-expanded={mode === "unlink"}
							title={canUnlink ? undefined : "Email is your only way to sign in"}
							className={`${SECONDARY} ${mode === "unlink" ? "border-denim text-denim-accent" : ""}`}
						>
							Unlink
						</button>
					</div>
				</div>

				{!canUnlink && (
					<p className={HELP}>
						Email is your only sign-in method, so it can be changed but not unlinked.
					</p>
				)}

				{pendingTo && (
					<p className="border border-denim bg-denim-tint px-3 py-2 font-mono text-[11px] tracking-[0.02em] text-ink">
						Confirmation links are on their way to both {email} and {pendingTo}. The
						change completes once you click both.
					</p>
				)}

				{mode === "change" && (
					<form
						onSubmit={handleChange}
						className="flex flex-col gap-4 border-t border-line pt-5"
					>
						<div className="flex flex-col gap-1.5">
							<label htmlFor="new-email" className={LABEL}>
								New email
							</label>
							<input
								id="new-email"
								type="email"
								autoComplete="email"
								autoFocus
								value={next}
								onChange={(e) => setNext(e.target.value)}
								placeholder="you@example.com"
								className={INPUT}
							/>
							<span className={HELP}>
								We&apos;ll send a confirmation link to both addresses.
							</span>
						</div>
						<ErrorLine message={error} />
						<button type="submit" disabled={!validEmail || busy} className={PRIMARY}>
							{busy ? "Sending…" : "Send confirmation"}
						</button>
					</form>
				)}

				{mode === "unlink" && (
					<div className="flex flex-col gap-4 border-t border-line pt-5">
						<p className={HELP}>
							You&apos;ll no longer be able to sign in with {email} and a password.
							Your other sign-in method keeps working.
						</p>
						<ErrorLine message={error} />
						<button
							type="button"
							onClick={handleUnlink}
							disabled={busy}
							className={DANGER}
						>
							{busy ? "Unlinking…" : "Unlink email"}
						</button>
					</div>
				)}
			</div>
		</Card>
	);
}

/* ---------------------------------------------------------------------------
   Password. Gated behind a one-time code emailed to the account: nothing
   about the password is shown or changeable until the code arrives, so a
   session left open on a shared machine can't be turned into a takeover.
   ------------------------------------------------------------------------ */
function PasswordCard({ email }: { email: string | undefined }) {
	// idle → confirm (asks before an email goes out) → sent (code + new password).
	const [step, setStep] = useState<"idle" | "confirm" | "sent">("idle");
	const [cooldown, setCooldown] = useState(0);
	const [code, setCode] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// One interval for the resend countdown; cleared when it reaches zero or
	// the card unmounts.
	useEffect(() => {
		if (cooldown <= 0) return;
		const id = setInterval(() => setCooldown((s) => s - 1), 1000);
		return () => clearInterval(id);
	}, [cooldown]);

	const strength = passwordStrength(password, email);
	const matches = confirm === password;
	const canSubmit =
		code.trim().length > 0 && strength.acceptable && matches && confirm.length > 0;

	async function sendCode() {
		if (busy || cooldown > 0) return;
		setBusy(true);
		setError(null);
		const { error } = await sendReauthenticationCode();
		setBusy(false);
		if (error) {
			setError(error.message);
			return;
		}
		setStep("sent");
		setCooldown(RESEND_COOLDOWN_S);
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!canSubmit || busy) return;
		setBusy(true);
		setError(null);
		const { error } = await updatePassword(password, code.trim());
		setBusy(false);
		if (error) {
			setError(error.message);
			return;
		}
		reset();
		toast.success("Password updated");
	}

	function reset() {
		setStep("idle");
		setCode("");
		setPassword("");
		setConfirm("");
		setError(null);
	}

	return (
		<Card icon={<KeyRound className="size-3.5" strokeWidth={1.5} />} title="Password">
			{step !== "sent" ? (
				<div className="flex flex-col gap-5">
					<div className="flex flex-wrap items-end justify-between gap-3">
						<div className="flex flex-col gap-1.5">
							<span className={LABEL}>Current</span>
							<span className="font-mono text-sm text-ink">••••••••</span>
						</div>
						<button
							type="button"
							onClick={() => {
								setStep((s) => (s === "confirm" ? "idle" : "confirm"));
								setError(null);
							}}
							aria-expanded={step === "confirm"}
							className={`${SECONDARY} ${step === "confirm" ? "border-denim text-denim-accent" : ""}`}
						>
							Change password
						</button>
					</div>

					{step === "confirm" && (
						<div className="flex flex-col gap-4 border-t border-line pt-5">
							<p className={HELP}>
								Changing your password needs a one-time code. We&apos;ll email it to{" "}
								<span className="text-ink">{email}</span>. Send it now?
							</p>
							<ErrorLine message={error} />
							<div className="flex gap-2">
								<button
									type="button"
									onClick={sendCode}
									disabled={busy}
									className={SECONDARY}
								>
									{busy ? "Sending…" : "Send code"}
								</button>
								<button
									type="button"
									onClick={() => setStep("idle")}
									disabled={busy}
									className={`${BUTTON} text-ink-faint hover:text-ink-dim`}
								>
									Cancel
								</button>
							</div>
						</div>
					)}
				</div>
			) : (
				<form onSubmit={handleSubmit} className="flex flex-col gap-5">
					<div className="flex flex-col gap-1.5">
						<label htmlFor="reauth-code" className={LABEL}>
							Code from your email
						</label>
						<div className="flex gap-2">
							<input
								id="reauth-code"
								type="text"
								inputMode="numeric"
								autoComplete="one-time-code"
								autoFocus
								value={code}
								onChange={(e) => setCode(e.target.value)}
								placeholder="123456"
								className={`${INPUT} max-w-40`}
							/>
							<button
								type="button"
								onClick={sendCode}
								disabled={busy || cooldown > 0}
								className={SECONDARY}
							>
								{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend"}
							</button>
						</div>
						<span className={HELP}>
							Sent to {email}. Codes expire after a few minutes.
						</span>
					</div>

					<div className="flex flex-col gap-1.5">
						<label htmlFor="new-password" className={LABEL}>
							New password
						</label>
						<input
							id="new-password"
							type="password"
							autoComplete="new-password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							className={INPUT}
						/>
						<PasswordStrengthMeter strength={strength} empty={password.length === 0} />
					</div>

					<div className="flex flex-col gap-1.5">
						<label htmlFor="confirm-password" className={LABEL}>
							Confirm
						</label>
						<input
							id="confirm-password"
							type="password"
							autoComplete="new-password"
							value={confirm}
							onChange={(e) => setConfirm(e.target.value)}
							aria-invalid={confirm.length > 0 && !matches}
							className={INPUT}
						/>
						{confirm.length > 0 && !matches && (
							<span className="font-mono text-[11px] tracking-[0.02em] text-destructive">
								Doesn&apos;t match
							</span>
						)}
					</div>

					<ErrorLine message={error} />
					<div className="flex gap-2">
						<button type="submit" disabled={!canSubmit || busy} className={PRIMARY}>
							{busy ? "Updating…" : "Change password"}
						</button>
						{/* Backs out and clears the typed fields; the emailed code stays
						    valid, so the resend cooldown is left running. */}
						<button
							type="button"
							onClick={reset}
							disabled={busy}
							className={`${BUTTON} text-ink-faint hover:text-ink-dim`}
						>
							Cancel
						</button>
					</div>
				</form>
			)}
		</Card>
	);
}
