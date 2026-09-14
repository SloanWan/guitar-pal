import type { Profile } from "@/lib/profile";
import UserAvatar from "./UserAvatar";

/**
 * The "who am I" row at the top of an account panel: chip, display name, and
 * the email underneath (the login identity, kept visible even when the name is
 * a nickname). Shared by the desktop UserMenu and the collapsed NavBarMenu so
 * both panels read identically.
 */
export default function UserIdentity({ profile }: { profile: Profile }) {
	return (
		<div className="flex min-w-0 items-center gap-2.5">
			<UserAvatar profile={profile} />
			<div className="flex min-w-0 flex-col gap-0.5">
				<span className="truncate font-mono text-[12px] font-medium tracking-[0.02em] text-ink">
					{profile.displayName}
				</span>
				{profile.email && (
					<span className="truncate font-mono text-[11px] tracking-[0.04em] text-ink-faint">
						{profile.email}
					</span>
				)}
			</div>
		</div>
	);
}
