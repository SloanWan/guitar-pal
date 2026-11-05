import type { Metadata } from "next";
import "@/components/books/books.css";
import "../../../tab-gold/tabGold.css";
import "../../cropGold.css";
import CropGoldReview from "../../CropGoldReview";

export const metadata: Metadata = { title: "Review a page's crops | Guitar Pal" };

type Props = { params: Promise<{ batch: string; id: string }> };

export default async function CropGoldReviewPage({ params }: Props) {
	const { batch, id } = await params;
	return <CropGoldReview key={`${batch}/${id}`} batch={batch} id={id} />;
}
