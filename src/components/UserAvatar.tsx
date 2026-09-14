import {
	AudioLines,
	Disc3,
	Drum,
	Flame,
	Guitar,
	Headphones,
	Mic,
	Music,
	Piano,
	Sparkles,
	Star,
	Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AvatarColor, AvatarIcon, Profile } from "@/lib/profile";
import { cn } from "@/lib/utils";

/* One literal class pair per palette slot so Tailwind can see them — the
   utilities are declared next to the tokens in globals.css. Fill and ink
   travel together: the ink is a deep shade of its own fill. */
const COLOR_CLASS: Record<AvatarColor, string> = {
	rose: "bg-avatar-rose text-avatar-rose-ink",
	clay: "bg-avatar-clay text-avatar-clay-ink",
	sand: "bg-avatar-sand text-avatar-sand-ink",
	olive: "bg-avatar-olive text-avatar-olive-ink",
	sage: "bg-avatar-sage text-avatar-sage-ink",
	mist: "bg-avatar-mist text-avatar-mist-ink",
	mauve: "bg-avatar-mauve text-avatar-mauve-ink",
	stone: "bg-avatar-stone text-avatar-stone-ink",
};

/** The drawing behind each AVATAR_ICONS id. */
export const AVATAR_ICON_COMPONENTS: Record<AvatarIcon, LucideIcon> = {
	guitar: Guitar,
	music: Music,
	mic: Mic,
	headphones: Headphones,
	drum: Drum,
	piano: Piano,
	"audio-lines": AudioLines,
	disc: Disc3,
	star: Star,
	zap: Zap,
	flame: Flame,
	sparkles: Sparkles,
};

/**
 * The user's initial — or their chosen icon — on a coloured square. Square,
 * not round: the v3 system is `--radius: 0` everywhere and the chip sits among
 * other square topbar controls at the same height. Decorative by default; the
 * trigger that wraps it carries the accessible name.
 *
 * Sizing: `size-*` sets the square; the glyph scales with the font size, so
 * pass `text-*` alongside for anything but the topbar size. The icon is drawn
 * at 1.2em so it fills the chip the way a bold capital does.
 */
export default function UserAvatar({
	profile,
	className,
}: {
	profile: Pick<Profile, "initial" | "color" | "icon">;
	className?: string;
}) {
	const Icon = profile.icon ? AVATAR_ICON_COMPONENTS[profile.icon] : null;
	return (
		<span
			aria-hidden="true"
			className={cn(
				"flex size-(--h-control) shrink-0 select-none items-center justify-center font-mono text-[15px] font-bold leading-none",
				COLOR_CLASS[profile.color],
				className,
			)}
		>
			{Icon ? (
				<Icon className="size-[1.2em]" strokeWidth={2} strokeLinecap="square" />
			) : (
				profile.initial
			)}
		</span>
	);
}
