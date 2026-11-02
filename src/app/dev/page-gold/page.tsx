import type { Metadata } from "next";
import "../tab-gold/tabGold.css";
import "./pageGold.css";
import PageGoldIndex from "./PageGoldIndex";

export const metadata: Metadata = { title: "Page gold review | Guitar Pal" };

// The page classifier's gold set (#422): check each page's kind, notation and exercise count.
export default function PageGoldPage() {
	return <PageGoldIndex />;
}
