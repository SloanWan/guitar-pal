"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Ellipsis, ExternalLink, ListTree, Pencil, RefreshCw, Trash2 } from "lucide-react";
import Link from "@/components/AppLink";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { bookFileUrl } from "@/lib/books/api";
import type { BookDetail } from "@/lib/books/types";
import { TOC_SOURCE_LABEL } from "@/lib/books/types";

export function bookMeta(book: BookDetail): string {
	const parts: string[] = [];
	if (book.page_count) parts.push(`${book.page_count} pages`);
	if (book.toc_source) parts.push(`Chapters · ${TOC_SOURCE_LABEL[book.toc_source]}`);
	parts.push(`Uploaded ${new Date(book.created_at).toLocaleDateString()}`);
	return parts.join(" · ");
}

/**
 * The top of a book's page (#404): the way back to the shelf, the title, what
 * the book is, and — for the player's own — one ⋯ menu holding what can be
 * done to it. Rename turns the title into a field in place: Enter or leaving
 * it saves, Escape keeps the old one.
 */
export default function BookHeader({
	book,
	readOnly,
	onRename,
	onEditRanges,
	onRescan,
	onDelete,
}: {
	book: BookDetail;
	readOnly: boolean;
	/** Resolves true once saved; the field stays open on false. */
	onRename: (title: string) => Promise<boolean>;
	onEditRanges: () => void;
	onRescan: () => void;
	onDelete: () => void;
}) {
	const [renaming, setRenaming] = useState(false);
	const fieldRef = useRef<HTMLInputElement>(null);
	const settled = book.status === "ready" || book.status === "failed";
	return (
		<header className="bk-bh">
			<Link href="/books" className="bk-back">
				<ArrowLeft aria-hidden />
				Books
			</Link>
			<div className="bk-bh-row">
				<div className="bk-bh-t">
					{renaming ? (
						<TitleField
							ref={fieldRef}
							title={book.title}
							onDone={async (title) => {
								if (title === null || (await onRename(title))) setRenaming(false);
							}}
						/>
					) : (
						<h1 className="bk-h1 bk-bh-title">{book.title}</h1>
					)}
					<p className="bk-meta">{readOnly ? `Sample · ${bookMeta(book)}` : bookMeta(book)}</p>
				</div>
				{readOnly ? null : (
					<BookMenu
						book={book}
						canEditRanges={settled && book.page_count !== null}
						canRescan={settled}
						onRename={() => setRenaming(true)}
						onRenameReady={() => {
							fieldRef.current?.focus();
							fieldRef.current?.select();
						}}
						onEditRanges={onEditRanges}
						onRescan={onRescan}
						onDelete={onDelete}
					/>
				)}
			</div>
		</header>
	);
}

function TitleField({
	ref,
	title,
	onDone,
}: {
	ref: React.RefObject<HTMLInputElement | null>;
	title: string;
	onDone: (title: string | null) => void;
}) {
	const [value, setValue] = useState(title);
	// Escape cancels; the blur that follows must not save what it threw away.
	const cancelled = useRef(false);
	// Focused on arrival; from the menu, again once the menu lets focus go.
	useEffect(() => {
		ref.current?.focus();
		ref.current?.select();
	}, [ref]);
	return (
		<input
			ref={ref}
			className="bk-h1 bk-bh-field"
			aria-label="Book title"
			value={value}
			maxLength={200}
			onChange={(e) => setValue(e.target.value)}
			onKeyDown={(e) => {
				if (e.key === "Enter") ref.current?.blur();
				if (e.key === "Escape") {
					// Not the panel's Escape too.
					e.preventDefault();
					cancelled.current = true;
					onDone(null);
				}
			}}
			onBlur={() => {
				if (!cancelled.current) onDone(value);
			}}
		/>
	);
}

function BookMenu({
	book,
	canEditRanges,
	canRescan,
	onRename,
	onRenameReady,
	onEditRanges,
	onRescan,
	onDelete,
}: {
	book: BookDetail;
	canEditRanges: boolean;
	canRescan: boolean;
	onRename: () => void;
	/** The menu has closed after Rename: focus can go to the field now. */
	onRenameReady: () => void;
	onEditRanges: () => void;
	onRescan: () => void;
	onDelete: () => void;
}) {
	// The PDF's link is signed for an hour: asked for when the menu opens, so the
	// item can be a plain link (a window opened after an await is a popup).
	const [file, setFile] = useState<string | null>(null);
	const [open, setOpen] = useState(false);
	// Rename hands focus to the title's field once the menu has closed — while
	// it is open its focus trap holds on, and closing it would take focus back.
	const renaming = useRef(false);
	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		void bookFileUrl(book)
			.catch(() => null)
			.then((url) => {
				if (!cancelled) setFile(url);
			});
		return () => {
			cancelled = true;
		};
	}, [open, book]);
	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<Button variant="icon" size="sm" aria-label="Book actions">
					<Ellipsis aria-hidden />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				data-m="books"
				className="w-60"
				onCloseAutoFocus={(e) => {
					if (!renaming.current) return;
					renaming.current = false;
					e.preventDefault();
					onRenameReady();
				}}
			>
				<DropdownMenuItem
					onSelect={() => {
						renaming.current = true;
						onRename();
					}}
				>
					<Pencil aria-hidden />
					Rename
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={onEditRanges} disabled={!canEditRanges}>
					<ListTree aria-hidden />
					Edit chapter ranges
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={onRescan} disabled={!canRescan}>
					<RefreshCw aria-hidden />
					Rescan the PDF
				</DropdownMenuItem>
				<DropdownMenuItem asChild disabled={file === null}>
					<a href={file ?? undefined} target="_blank" rel="noreferrer">
						<ExternalLink aria-hidden />
						Open the PDF
					</a>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem variant="destructive" onSelect={onDelete}>
					<Trash2 aria-hidden />
					Delete book…
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
