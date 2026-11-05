import type { Metadata } from "next";
import "../tab-gold/tabGold.css";
import "./cropGold.css";
import CropGoldIndex from "./CropGoldIndex";

export const metadata: Metadata = { title: "Crop review | Guitar Pal" };

// The tab reader's crops (#424): check each page's boxes before anything is read.
export default function CropGoldPage() {
	return <CropGoldIndex />;
}
