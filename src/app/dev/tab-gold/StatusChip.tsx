import type { TabGoldStatus } from "@/lib/tabGold";

export const STATUS_LABEL: Record<TabGoldStatus, string> = {
	unchecked: "Unchecked",
	confirmed: "Model right",
	corrected: "Corrected",
	unusable: "Unusable",
};

export default function StatusChip({ status }: { status: TabGoldStatus }) {
	return (
		<span className="tg-status" data-status={status}>
			{STATUS_LABEL[status]}
		</span>
	);
}
