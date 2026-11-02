import type { Metadata } from "next";
import "./tabGold.css";
import TabGoldIndex from "./TabGoldIndex";

export const metadata: Metadata = { title: "Tab gold review | Guitar Pal" };

// The tab extractor's gold set (#202): check each reading against its crop.
export default function TabGoldPage() {
	return <TabGoldIndex />;
}
