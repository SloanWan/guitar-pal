"use client";

import { useId, type ComponentProps, type ReactNode, type Ref } from "react";
import { Search as SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InputProps extends ComponentProps<"input"> {
	ref?: Ref<HTMLInputElement>;
}

/** A text field (spec §8): a field-coloured well with a 1px line, 44px, 10px radius. */
export function Input({ className, ref, ...props }: InputProps) {
	return <input ref={ref} className={cn("gp-input", className)} {...props} />;
}

/** A search field: the input with an 18px magnifier inside its left edge. */
export function SearchInput({ className, ref, type, ...props }: InputProps) {
	return (
		<div className={cn("gp-search", className)}>
			<SearchIcon aria-hidden />
			<input ref={ref} type={type ?? "search"} className="gp-input" {...props} />
		</div>
	);
}

export interface FieldProps {
	label: ReactNode;
	/** Shown under the field; replaced by `error` while there is one. */
	help?: ReactNode;
	/** Marks the field invalid (a 2px ring) and says why under it. */
	error?: ReactNode;
	className?: string;
	/** The control, given the ids that tie it to its label and its help line. */
	children: (control: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => ReactNode;
}

/** A label, a control and its help or error line, wired together for assistive tech. */
export function Field({ label, help, error, className, children }: FieldProps) {
	const id = useId();
	const note = error ?? help;
	const noteId = `${id}-note`;
	return (
		<div className={cn("gp-field", className)}>
			<label htmlFor={id} className="gp-field-label">
				{label}
			</label>
			{children({ id, "aria-describedby": note ? noteId : undefined, "aria-invalid": error ? true : undefined })}
			{note && (
				<p id={noteId} className="gp-field-help" data-error={error ? "" : undefined}>
					{note}
				</p>
			)}
		</div>
	);
}
