import type { Profile } from "@/lib/profile";
import UserAvatar from "./UserAvatar";

/**
 * The "who am I" row at the top of an account panel: chip, display name, and
 * the email underneath (the login identity, kept visible even when the name is
 * a nickname), at the top of the account menu.
 */
export default function UserIdentity({ profile }: { profile: Profile }) {
	return (
		<div className="flex min-w-0 items-center gap-2.5">
			<UserAvatar profile={profile} />
			<div className="flex min-w-0 flex-col gap-0.5">
				<span className="truncate font-body text-[14px] font-semibold text-ink">
					{profile.displayName}
				</span>
				{profile.email && (
					<span className="truncate font-body text-[12.5px] text-ink-3">
						{profile.email}
					</span>
				)}
			</div>
		</div>
	);
}
