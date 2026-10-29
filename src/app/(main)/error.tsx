"use client";

import ErrorScreen, { type ErrorScreenProps } from "@/components/status/ErrorScreen";

/* Inside the group's layout, so the header and tab bar survive the error. */
export default function Error(props: ErrorScreenProps) {
	return <ErrorScreen {...props} />;
}
