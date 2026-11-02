import type { Metadata } from "next";
import "@/components/books/books.css";
import "../../../tab-gold/tabGold.css";
import "../../pageGold.css";
import PageGoldReview from "../../PageGoldReview";

export const metadata: Metadata = { title: "Review a page | Guitar Pal" };

type Props = { params: Promise<{ set: string; id: string }> };

export default async function PageGoldReviewPage({ params }: Props) {
	const { set, id } = await params;
	return <PageGoldReview key={`${set}/${id}`} set={set} id={id} />;
}
