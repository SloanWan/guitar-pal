import type { Metadata } from "next";
import { Suspense } from "react";
import "../../../tabGold.css";
import TabGoldEdit from "../../../TabGoldEdit";

export const metadata: Metadata = { title: "Correct a reading | Guitar Pal" };

type Props = { params: Promise<{ set: string; id: string }> };

// The editor reads its query string, so it renders inside a Suspense boundary.
export default async function TabGoldEditPage({ params }: Props) {
	const { set, id } = await params;
	return (
		<Suspense>
			<TabGoldEdit set={set} id={id} />
		</Suspense>
	);
}
