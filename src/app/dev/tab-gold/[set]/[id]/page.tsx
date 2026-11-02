import type { Metadata } from "next";
import "@/components/books/books.css";
import "@/components/fingerpick/reader/tab.css";
import "../../tabGold.css";
import TabGoldReview from "../../TabGoldReview";

export const metadata: Metadata = { title: "Review a reading | Guitar Pal" };

type Props = { params: Promise<{ set: string; id: string }> };

export default async function TabGoldReviewPage({ params }: Props) {
	const { set, id } = await params;
	return <TabGoldReview key={`${set}/${id}`} set={set} id={id} />;
}
