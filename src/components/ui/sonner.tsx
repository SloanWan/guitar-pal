"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
	return (
		<Sonner
			position="bottom-right"
			toastOptions={{
				classNames: {
					toast: "bg-white border border-slate-200 shadow-lg text-slate-900",
					description: "text-slate-500",
				},
			}}
		/>
	);
}
