"use client";

import { useEffect, useState } from "react";
import type { User, UserIdentity } from "@supabase/supabase-js";
import { toast } from "sonner";
import { KeyRound, Mail, Palette, Trash2, UserRound } from "lucide-react";

import { useUser } from "@/hooks/useUser";
import {
	deleteAccountData,
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
import { forgetSignIn } from "@/lib/authForm";
import UserAvatar from "@/components/UserAvatar";
import { ThemeSwitch } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import PasswordField from "@/components/auth/PasswordField";
import PasswordStrengthMeter from "@/components/auth/PasswordStrengthMeter";
import { FORM_ERROR, FORM_HELP, FORM_LEAD, PAGE_GUTTER } from "@/components/auth/formText";
import "./settings.css";
import { useNavRouter } from "@/components/nav-progress";

/** Seconds before the one-time code can be sent again. */
const RESEND_COOLDOWN_S = 60;

export default function SettingsPage() {
	const { user, loading } = useUser();

	return (
		/* One column of panels at every width: every section is a set of controls,
		   and a settings page is read top to bottom, not scanned side by side. */
		<div className={`gp-rise mx-auto box-content flex max-w-160 flex-col gap-4 py-8 max-sm:py-6 ${PAGE_GUTTER}`}>
			<h1 className="mb-2 font-gp-display text-(length:--gp-t-xl) leading-(--gp-lh-head) font-bold tracking-[-0.015em] text-gp-ink min-[960px]:text-(length:--gp-t-xl-lg)">
				Settings
			</h1>

			<Section icon={<Palette />} anim="palette" title="Appearance">
				<ThemeSwitch />
			</Section>

			{loading || !user ? (
				// The proxy guards /settings, so a resolved null user is only ever a
				// sign-out mid-visit; the skeleton is the right thing either way.
				<Skeleton className="h-[560px] rounded-gp-lg" />
			) : (
				<>
					<IdentityCard user={user} />
					<EmailCard user={user} />
					<PasswordCard email={user.email} />
					<DeleteCard user={user} />
				</>
			)}
		</div>
	);
}

/** Which hover touch a section's icon gets (settings.css). */
type SectionIcon = "palette" | "profile" | "email" | "password" | "delete";

/** A Panel whose title carries its icon — one per section of the page. The
 *  icon answers a hover like the strum page's tool icons, but is not a button. */
function Section({
	icon,
	anim,
	title,
	children,
}: {
	icon: React.ReactNode;
	anim: SectionIcon;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<Panel
			className="p-5 max-sm:p-4"
			title={
				<span className="flex items-center gap-2">
					<span className="set-icon" data-anim={anim} aria-hidden="true">
						{icon}
					</span>
					{title}
				</span>
			}
		>
			{children}
		</Panel>
	);
}

function ErrorLine({ message }: { message: string | null }) {
	if (!message) return null;
	return (
		<p role="alert" className={FORM_ERROR}>
			{message}
		</p>
	);
}

/** A row's label over its value: what is set now, beside the buttons that change it. */
function Current({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex min-w-0 flex-col gap-1">
			<span className="gp-field-label">{label}</span>
			<span className="truncate text-(length:--gp-t-body) text-gp-ink">{children}</span>
		</div>
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
			className={`gp-focus rounded-full outline-offset-2 transition-[outline-color,opacity] duration-(--gp-d-state) hover:opacity-90 ${
				selected ? "outline-2 outline-gp-ink" : ""
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
	const router = useNavRouter();
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
		<Section icon={<UserRound />} anim="profile" title="Profile">
			<form onSubmit={handleSubmit} className="flex flex-col gap-5">
				{/* Preview and nickname share a row: the chip is the thing the name
				    changes, so they read as one control. */}
				<div className="flex items-start gap-4">
					<UserAvatar profile={preview} className="mt-[22px] size-16 rounded-full text-2xl" />
					<Field
						className="min-w-0 flex-1"
						label="Nickname"
						help={
							<>
								Shown as <span className="font-semibold text-gp-ink-2">{preview.displayName}</span>. Empty falls
								back to your account name. {nickname.length}/{NICKNAME_MAX_LENGTH}
							</>
						}
					>
						{(control) => (
							<Input
								{...control}
								type="text"
								autoComplete="nickname"
								value={nickname}
								onChange={(e) => setNickname(e.target.value)}
								placeholder={providerNameOf(user) ?? user.email?.split("@")[0] ?? ""}
								maxLength={NICKNAME_MAX_LENGTH}
							/>
						)}
					</Field>
				</div>

				<div className="gp-field">
					<span className="gp-field-label">On the chip</span>
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
								className="size-9 rounded-full text-[13px]"
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
									className="size-9 rounded-full text-[13px]"
								/>
							</Choice>
						))}
					</div>
				</div>

				<div className="gp-field">
					<span className="gp-field-label">Colour</span>
					<div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2">
						<Choice
							selected={color === null}
							onSelect={() => setColor(null)}
							label={`Auto (${hashed})`}
						>
							<span className="flex size-9 items-center justify-center rounded-full bg-gp-well text-[11.5px] font-semibold text-gp-ink-2">
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
									className="size-9 rounded-full text-[13px]"
								/>
							</Choice>
						))}
					</div>
				</div>

				<ErrorLine message={error} />
				<Button type="submit" loading={busy} disabled={!dirty} className="self-start">
					Save profile
				</Button>
			</form>
		</Section>
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
		<Section icon={<Mail />} anim="email" title="Email">
			<div className="flex flex-col gap-5">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<Current label="Current">{email ?? "—"}</Current>
					<div className="flex gap-2">
						<Button
							variant="secondary"
							size="sm"
							onClick={() => open("change")}
							aria-expanded={mode === "change"}
						>
							Change
						</Button>
						<Button
							variant="secondary"
							size="sm"
							onClick={() => open("unlink")}
							disabled={!canUnlink}
							aria-expanded={mode === "unlink"}
							title={canUnlink ? undefined : "Email is your only way to sign in"}
						>
							Unlink
						</Button>
					</div>
				</div>

				{!canUnlink && (
					<p className={FORM_HELP}>
						Email is your only sign-in method, so it can be changed but not unlinked.
					</p>
				)}

				{pendingTo && (
					<p className="rounded-gp-md bg-gp-well px-3.5 py-3 text-(length:--gp-t-ui) leading-(--gp-lh-body) text-gp-ink-2">
						Confirmation links are on their way to both <span className="font-semibold text-gp-ink">{email}</span>{" "}
						and <span className="font-semibold text-gp-ink">{pendingTo}</span>. The change completes once you
						click both.
					</p>
				)}

				{mode === "change" && (
					<form onSubmit={handleChange} className="flex flex-col gap-4 border-t border-gp-line pt-5">
						<Field label="New email" help="We'll send a confirmation link to both addresses.">
							{(control) => (
								<Input
									{...control}
									type="email"
									autoComplete="email"
									autoFocus
									value={next}
									onChange={(e) => setNext(e.target.value)}
									placeholder="you@example.com"
								/>
							)}
						</Field>
						<ErrorLine message={error} />
						<Button type="submit" loading={busy} disabled={!validEmail} className="self-start">
							Send confirmation
						</Button>
					</form>
				)}

				{mode === "unlink" && (
					<div className="flex flex-col gap-4 border-t border-gp-line pt-5">
						<p className={FORM_LEAD}>
							You&apos;ll no longer be able to sign in with {email} and a password.
							Your other sign-in method keeps working.
						</p>
						<ErrorLine message={error} />
						<Button variant="danger" onClick={handleUnlink} loading={busy} className="self-start">
							Unlink email
						</Button>
					</div>
				)}
			</div>
		</Section>
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
		<Section icon={<KeyRound />} anim="password" title="Password">
			{step !== "sent" ? (
				<div className="flex flex-col gap-5">
					<div className="flex flex-wrap items-end justify-between gap-3">
						<Current label="Current">••••••••</Current>
						<Button
							variant="secondary"
							size="sm"
							onClick={() => {
								setStep((s) => (s === "confirm" ? "idle" : "confirm"));
								setError(null);
							}}
							aria-expanded={step === "confirm"}
						>
							Change password
						</Button>
					</div>

					{step === "confirm" && (
						<div className="flex flex-col gap-4 border-t border-gp-line pt-5">
							<p className={FORM_LEAD}>
								Changing your password needs a one-time code. We&apos;ll email it to{" "}
								<span className="font-semibold text-gp-ink">{email}</span>. Send it now?
							</p>
							<ErrorLine message={error} />
							<div className="flex gap-2">
								<Button onClick={sendCode} loading={busy}>
									Send code
								</Button>
								<Button variant="ghost" onClick={() => setStep("idle")} disabled={busy}>
									Cancel
								</Button>
							</div>
						</div>
					)}
				</div>
			) : (
				<form onSubmit={handleSubmit} className="flex flex-col gap-5">
					<Field label="Code from your email" help={`Sent to ${email}. Codes expire after a few minutes.`}>
						{(control) => (
							<div className="flex gap-2">
								<Input
									{...control}
									type="text"
									inputMode="numeric"
									autoComplete="one-time-code"
									autoFocus
									value={code}
									onChange={(e) => setCode(e.target.value)}
									placeholder="123456"
									className="max-w-40 font-gp-num tabular-nums"
								/>
								<Button variant="secondary" onClick={sendCode} disabled={busy || cooldown > 0}>
									{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend"}
								</Button>
							</div>
						)}
					</Field>

					<div className="gp-field">
						<label htmlFor="new-password" className="gp-field-label">
							New password
						</label>
						<PasswordField
							id="new-password"
							autoComplete="new-password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
						/>
						<PasswordStrengthMeter strength={strength} empty={password.length === 0} />
					</div>

					<div className="gp-field">
						<label htmlFor="confirm-password" className="gp-field-label">
							Confirm
						</label>
						<PasswordField
							id="confirm-password"
							autoComplete="new-password"
							value={confirm}
							onChange={(e) => setConfirm(e.target.value)}
							aria-invalid={(confirm.length > 0 && !matches) || undefined}
						/>
						{confirm.length > 0 && !matches && <span className={FORM_ERROR}>Doesn&apos;t match</span>}
					</div>

					<ErrorLine message={error} />
					<div className="flex gap-2">
						<Button type="submit" loading={busy} disabled={!canSubmit}>
							Change password
						</Button>
						{/* Backs out and clears the typed fields; the emailed code stays
						    valid, so the resend cooldown is left running. */}
						<Button variant="ghost" onClick={reset} disabled={busy}>
							Cancel
						</Button>
					</div>
				</form>
			)}
		</Section>
	);
}

/* ---------------------------------------------------------------------------
   Delete. Two ways out: the data alone (the account and profile stay), or the
   account with it. Either asks again inline — the password for a password
   account, the email typed out otherwise — and the server checks the same.
   ------------------------------------------------------------------------ */
type DeleteScope = "data" | "account";

const DELETE_COPY: Record<
	DeleteScope,
	{ label: string; summary: string; open: string; warning: string; action: string }
> = {
	data: {
		label: "Your data",
		summary: "Patterns, progressions, tabs, chords, favourites, books and share links.",
		open: "Delete data",
		warning:
			"Everything you have saved goes: patterns, progressions, tabs, your chords and favourites, uploaded books and the links you shared. Your account, sign-in and profile stay. This can't be undone.",
		action: "Delete my data",
	},
	account: {
		label: "Account",
		summary: "All of your data, plus the account and its sign-in.",
		open: "Delete account",
		warning:
			"Your account and everything in it go, and you are signed out. Signing up again with this email starts an empty account. This can't be undone.",
		action: "Delete my account",
	},
};

function DeleteCard({ user }: { user: User }) {
	const router = useNavRouter();
	const hasPassword = (user.identities ?? []).some((i) => i.provider === "email");
	// Without a password to ask for, the player types their email (or the
	// word, for an account with none) — a deliberate act, not a stray tap.
	const phrase = user.email ?? "delete";

	const [open, setOpen] = useState<DeleteScope | null>(null);
	const [proof, setProof] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const ready = hasPassword
		? proof.length > 0
		: proof.trim().toLowerCase() === phrase.toLowerCase();

	function toggle(scope: DeleteScope) {
		setOpen((current) => (current === scope ? null : scope));
		setProof("");
		setError(null);
	}

	async function handleDelete(e: React.FormEvent) {
		e.preventDefault();
		if (!open || !ready || busy) return;
		setBusy(true);
		setError(null);
		const { error } = await deleteAccountData(open, hasPassword ? proof : null);
		setBusy(false);
		if (error) {
			setError(error.message);
			return;
		}
		if (open === "account") {
			forgetSignIn();
			toast.success("Your account is deleted");
			router.replace("/");
			return;
		}
		setOpen(null);
		setProof("");
		toast.success("Your data is deleted");
		router.refresh();
	}

	return (
		<Section icon={<Trash2 />} anim="delete" title="Delete">
			<div className="flex flex-col gap-5">
				{(["data", "account"] as const).map((scope) => {
					const copy = DELETE_COPY[scope];
					return (
						<div key={scope} className="flex flex-col gap-5">
							<div className="flex flex-wrap items-end justify-between gap-3">
								<div className="flex min-w-0 flex-col gap-1">
									<span className="gp-field-label">{copy.label}</span>
									<span className={FORM_HELP}>{copy.summary}</span>
								</div>
								<Button
									variant="secondary"
									size="sm"
									className="set-danger"
									onClick={() => toggle(scope)}
									aria-expanded={open === scope}
								>
									{copy.open}
								</Button>
							</div>

							{open === scope && (
								<form onSubmit={handleDelete} className="flex flex-col gap-4 border-t border-gp-line pt-5">
									<p className={FORM_LEAD}>{copy.warning}</p>
									{hasPassword ? (
										<div className="gp-field">
											<label htmlFor="delete-password" className="gp-field-label">
												Your password
											</label>
											<PasswordField
												id="delete-password"
												autoComplete="current-password"
												autoFocus
												value={proof}
												onChange={(e) => setProof(e.target.value)}
											/>
										</div>
									) : (
										<Field label={`Type ${phrase} to confirm`}>
											{(control) => (
												<Input
													{...control}
													autoComplete="off"
													autoCapitalize="off"
													spellCheck={false}
													autoFocus
													value={proof}
													onChange={(e) => setProof(e.target.value)}
												/>
											)}
										</Field>
									)}
									<ErrorLine message={error} />
									<div className="flex flex-wrap gap-2">
										<Button type="submit" variant="danger" loading={busy} disabled={!ready}>
											{copy.action}
										</Button>
										<Button type="button" variant="ghost" onClick={() => toggle(scope)} disabled={busy}>
											Cancel
										</Button>
									</div>
								</form>
							)}
						</div>
					);
				})}
			</div>
		</Section>
	);
}
