"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Bookmark, BookmarkCheck, History, Pencil, Sparkles, Trash2, X } from "lucide-react";
import Link from "@/components/AppLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListRow } from "@/components/ui/list-row";
import { CHAT_TITLE_MAX, cleanTitle, type SavedChatSummary } from "@/lib/assistant/chatLibrary";
import { deleteChat, listChats, renameChat } from "@/lib/assistantChatStore";

/**
 * The chat library (#401): the General conversations a signed-in player saved.
 * `SaveLine` sits at the foot of a thread; `ChatLibrary` takes the panel's
 * place when the head's Chats button is pressed, and is where a chat is
 * opened, renamed or deleted.
 */

/** Where signing in starts, coming back to this page. */
export function signInHref(pathname: string | null): string {
	return `/auth?redirect=${encodeURIComponent(pathname ?? "/")}`;
}

/** At the foot of a thread that holds a model's reply: keep it, or say it is kept. A fixed height, whatever it says. */
export function SaveLine({
	signedIn,
	saved,
	state,
	pathname,
	onSave,
	onOpenLibrary,
	onHide,
}: {
	signedIn: boolean;
	saved: boolean;
	state: "idle" | "saving" | "error";
	pathname: string | null;
	onSave: () => void;
	onOpenLibrary: () => void;
	/** Put the "Saved" line away for this chat; the copy keeps updating. */
	onHide: () => void;
}) {
	if (!signedIn) {
		return (
			<div className="as-saveline">
				<Bookmark aria-hidden="true" />
				<span>
					<Link href={signInHref(pathname)} className="as-link">
						Sign in
					</Link>{" "}
					to save this chat
				</span>
			</div>
		);
	}
	if (saved) {
		return (
			<div className="as-saveline" data-saved="">
				<BookmarkCheck aria-hidden="true" />
				<span>Saved · updates as you talk</span>
				<Button variant="ghost" size="xs" onClick={onOpenLibrary}>
					Your chats
				</Button>
				<Button variant="ghost" size="xs" className="as-icon-btn" aria-label="Hide this line" title="Hide this line" onClick={onHide}>
					<X aria-hidden="true" />
				</Button>
			</div>
		);
	}
	return (
		<div className="as-saveline">
			<Button variant="ghost" size="xs" onClick={onSave} loading={state === "saving"}>
				<Bookmark aria-hidden="true" />
				Save this chat
			</Button>
			{state === "error" && <span className="as-saveline-err">Could not save — try again</span>}
		</div>
	);
}

const dayFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/** Today's chats by the time, older ones by the day. */
function when(iso: string, now: Date): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	return date.toDateString() === now.toDateString() ? timeFormat.format(date) : dayFormat.format(date);
}

export default function ChatLibrary({
	userId,
	pathname,
	currentId,
	busy,
	onOpen,
	onDeleted,
	onBack,
}: {
	/** Null for a guest, who is asked to sign in. */
	userId: string | null;
	pathname: string | null;
	/** The saved chat the thread is now, if any. */
	currentId: string | null;
	/** A reply is on its way: opening another chat waits for it. */
	busy: boolean;
	/** Resolves false when the chat is gone. */
	onOpen: (id: string) => Promise<boolean>;
	onDeleted: (id: string) => void;
	onBack: () => void;
}) {
	const [chats, setChats] = useState<SavedChatSummary[] | null>(null);
	const [failed, setFailed] = useState(false);
	const [confirming, setConfirming] = useState<string | null>(null);
	const [opening, setOpening] = useState<string | null>(null);
	/** The chat being renamed, and what is typed so far. */
	const [renaming, setRenaming] = useState<{ id: string; text: string } | null>(null);
	const [renameFailed, setRenameFailed] = useState<string | null>(null);

	useEffect(() => {
		if (userId === null) return;
		let cancelled = false;
		listChats(userId)
			.then((list) => {
				if (!cancelled) setChats(list);
			})
			.catch((err: unknown) => {
				console.error("[assistant] listing saved chats failed:", err);
				if (!cancelled) setFailed(true);
			});
		return () => {
			cancelled = true;
		};
	}, [userId]);

	async function open(id: string) {
		setOpening(id);
		try {
			if (await onOpen(id)) return;
			// Deleted elsewhere since the list was read.
			setChats((list) => list?.filter((c) => c.id !== id) ?? null);
		} catch (err) {
			console.error("[assistant] opening a saved chat failed:", err);
		} finally {
			setOpening(null);
		}
	}

	async function rename(id: string, typed: string) {
		setRenaming(null);
		const before = chats?.find((c) => c.id === id)?.title;
		const title = cleanTitle(typed);
		if (title === null || title === before) return;
		setRenameFailed(null);
		setChats((list) => list?.map((c) => (c.id === id ? { ...c, title } : c)) ?? null);
		try {
			await renameChat(id, title);
		} catch (err) {
			console.error("[assistant] renaming a saved chat failed:", err);
			setChats((list) => list?.map((c) => (c.id === id && before !== undefined ? { ...c, title: before } : c)) ?? null);
			setRenameFailed(id);
		}
	}

	async function remove(id: string) {
		setConfirming(null);
		try {
			await deleteChat(id);
			setChats((list) => list?.filter((c) => c.id !== id) ?? null);
			onDeleted(id);
		} catch (err) {
			console.error("[assistant] deleting a saved chat failed:", err);
		}
	}

	const now = new Date();
	let body;
	if (userId === null) {
		body = (
			<p className="as-lib-note">
				Saved General chats live in your account.{" "}
				<Link href={signInHref(pathname)} className="as-link">
					Sign in
				</Link>{" "}
				to keep them.
			</p>
		);
	} else if (failed) {
		body = <p className="as-lib-note">Your chats could not be loaded. Try again in a moment.</p>;
	} else if (chats === null) {
		body = <p className="as-lib-note">Loading…</p>;
	} else if (chats.length === 0) {
		body = (
			<p className="as-lib-note">
				No saved chats yet. Ask something in General, then press “Save this chat” under the answer.
			</p>
		);
	} else {
		body = (
			<ul className="as-lib-list">
				{chats.map((chat) =>
					renaming?.id === chat.id ? (
						<li key={chat.id} className="as-lib-item">
							<form
								className="as-lib-rename"
								data-own-escape=""
								onSubmit={(e) => {
									e.preventDefault();
									void rename(chat.id, renaming.text);
								}}
							>
								<Input
									autoFocus
									value={renaming.text}
									maxLength={CHAT_TITLE_MAX}
									aria-label="Chat title"
									onFocus={(e) => e.currentTarget.select()}
									onChange={(e) => setRenaming({ id: chat.id, text: e.target.value })}
									onKeyDown={(e) => {
										if (e.key === "Escape") setRenaming(null);
									}}
								/>
								<Button size="xs" type="submit">
									Save
								</Button>
								<Button variant="ghost" size="xs" onClick={() => setRenaming(null)}>
									Cancel
								</Button>
							</form>
						</li>
					) : (
						<li key={chat.id} className="as-lib-item">
							<ListRow
								icon={Sparkles}
								title={chat.title}
								subline={
									renameFailed === chat.id
										? "Could not rename — try again"
										: chat.id === currentId
											? `Open now · ${when(chat.updatedAt, now)}`
											: when(chat.updatedAt, now)
								}
								selected={chat.id === currentId}
								disabled={busy || opening !== null}
								aria-busy={opening === chat.id || undefined}
								onClick={() => void open(chat.id)}
							/>
							{confirming === chat.id ? (
								<span className="as-lib-confirm">
									<Button variant="danger" size="xs" onClick={() => void remove(chat.id)}>
										Delete
									</Button>
									<Button variant="ghost" size="xs" onClick={() => setConfirming(null)}>
										Keep
									</Button>
								</span>
							) : (
								<span className="as-lib-actions">
									<Button
										variant="ghost"
										size="xs"
										className="as-icon-btn"
										aria-label={`Rename “${chat.title}”`}
										onClick={() => {
											setConfirming(null);
											setRenameFailed(null);
											setRenaming({ id: chat.id, text: chat.title });
										}}
									>
										<Pencil aria-hidden="true" />
									</Button>
									<Button
										variant="ghost"
										size="xs"
										className="as-icon-btn"
										aria-label={`Delete “${chat.title}”`}
										onClick={() => {
											setRenaming(null);
											setConfirming(chat.id);
										}}
									>
										<Trash2 aria-hidden="true" />
									</Button>
								</span>
							)}
						</li>
					),
				)}
			</ul>
		);
	}

	return (
		<div className="as-lib">
			<div className="as-lib-head">
				<Button variant="ghost" size="xs" onClick={onBack}>
					<ArrowLeft aria-hidden="true" />
					Back to the chat
				</Button>
				<span className="as-lib-title">
					<History aria-hidden="true" />
					Your chats
				</span>
			</div>
			<div className="as-lib-body">{body}</div>
		</div>
	);
}
