import type { Metadata } from "next";
import { Suspense } from "react";
import TabEditPage from "@/components/fingerpick/editor/TabEditPage";
import { NEW_TAB_ID } from "@/lib/tabEditorEntry";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params;
	return { title: `${id === NEW_TAB_ID ? "New tab" : "Edit tab"} | Guitar Pal` };
}

// The tab editor (#358): one of the player's tabs by id, or `new` for a blank tab or a
// handed-over draft (`?draft=`). The tabs live in the browser or the account, so the
// page reads them on the client; signed-out players can use it.
export default async function FingerpickEditPage({ params }: Props) {
	const { id } = await params;
	return (
		<Suspense>
			<TabEditPage id={decodeURIComponent(id)} />
		</Suspense>
	);
}
