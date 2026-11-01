import {
	centsToInput,
	parseBRLToCents,
	zonedLocalInputValue,
	zonedTimeToIso,
} from "@marinho-gestao/domain";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@marinho-gestao/ui/components/field";
import { Input } from "@marinho-gestao/ui/components/input";
import {
	NativeSelect,
	NativeSelectOption,
} from "@marinho-gestao/ui/components/native-select";
import { Textarea } from "@marinho-gestao/ui/components/textarea";
import type { ComponentProps, ReactNode } from "react";
import { useEffect, useId, useState } from "react";

type FieldShellProps = {
	label: ReactNode;
	hint?: ReactNode;
	errors?: readonly unknown[];
	className?: string;
	children: (control: {
		id: string;
		invalid: boolean;
		describedBy: string | undefined;
	}) => ReactNode;
};

function toIssue(error: unknown): { message?: string } {
	if (typeof error === "string") return { message: error };
	if (error && typeof error === "object" && "message" in error) {
		return { message: String(error.message) };
	}
	return {};
}

export function FieldShell({
	label,
	hint,
	errors = [],
	className,
	children,
}: FieldShellProps) {
	const id = useId();
	const invalid = errors.length > 0;
	const errorId = `${id}-error`;
	const hintId = `${id}-hint`;
	const describedBy =
		[invalid ? errorId : null, hint ? hintId : null]
			.filter(Boolean)
			.join(" ") || undefined;

	return (
		<Field data-invalid={invalid} className={className}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			{children({ id, invalid, describedBy })}
			{hint && <FieldDescription id={hintId}>{hint}</FieldDescription>}
			<FieldError id={errorId} errors={errors.map(toIssue)} />
		</Field>
	);
}

type BoundField<T> = {
	state: { value: T; meta: { errors: readonly unknown[] } };
	handleChange: (value: T) => void;
	handleBlur: () => void;
};

type BaseProps = {
	label: ReactNode;
	hint?: ReactNode;
	className?: string;
};

export function TextField({
	field,
	label,
	hint,
	className,
	...inputProps
}: BaseProps & {
	field: BoundField<string> | BoundField<string | null>;
} & Omit<ComponentProps<typeof Input>, "value" | "onChange" | "onBlur">) {
	const nullable = (field as BoundField<string | null>).state.value === null;
	return (
		<FieldShell
			label={label}
			hint={hint}
			className={className}
			errors={field.state.meta.errors}
		>
			{({ id, invalid, describedBy }) => (
				<Input
					{...inputProps}
					id={id}
					value={field.state.value ?? ""}
					onBlur={field.handleBlur}
					onChange={(event) => {
						const { value } = event.target;
						(field as BoundField<string | null>).handleChange(
							value === "" && nullable ? null : value,
						);
					}}
					aria-invalid={invalid}
					aria-describedby={describedBy}
				/>
			)}
		</FieldShell>
	);
}

export function NullableTextField({
	field,
	label,
	hint,
	className,
	...inputProps
}: BaseProps & {
	field: BoundField<string | null>;
} & Omit<ComponentProps<typeof Input>, "value" | "onChange" | "onBlur">) {
	return (
		<FieldShell
			label={label}
			hint={hint}
			className={className}
			errors={field.state.meta.errors}
		>
			{({ id, invalid, describedBy }) => (
				<Input
					{...inputProps}
					id={id}
					value={field.state.value ?? ""}
					onBlur={field.handleBlur}
					onChange={(event) => field.handleChange(event.target.value || null)}
					aria-invalid={invalid}
					aria-describedby={describedBy}
				/>
			)}
		</FieldShell>
	);
}

export function TextareaField({
	field,
	label,
	hint,
	className,
	...inputProps
}: BaseProps & {
	field: BoundField<string | null> | BoundField<string>;
} & Omit<ComponentProps<typeof Textarea>, "value" | "onChange" | "onBlur">) {
	return (
		<FieldShell
			label={label}
			hint={hint}
			className={className}
			errors={field.state.meta.errors}
		>
			{({ id, invalid, describedBy }) => (
				<Textarea
					{...inputProps}
					id={id}
					value={field.state.value ?? ""}
					onBlur={field.handleBlur}
					onChange={(event) =>
						(field as BoundField<string>).handleChange(event.target.value)
					}
					aria-invalid={invalid}
					aria-describedby={describedBy}
				/>
			)}
		</FieldShell>
	);
}

export function MoneyField({
	field,
	label,
	hint,
	className,
	placeholder = "0,00",
}: BaseProps & {
	field: BoundField<number | null>;
	placeholder?: string;
}) {
	const [text, setText] = useState(centsToInput(field.state.value));

	useEffect(() => {
		setText((previous) =>
			parseBRLToCents(previous) === field.state.value
				? previous
				: centsToInput(field.state.value),
		);
	}, [field.state.value]);

	return (
		<FieldShell
			label={label}
			hint={hint}
			className={className}
			errors={field.state.meta.errors}
		>
			{({ id, invalid, describedBy }) => (
				<div className="relative">
					<span
						aria-hidden
						className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
					>
						R$
					</span>
					<Input
						id={id}
						inputMode="decimal"
						placeholder={placeholder}
						className="pl-10"
						value={text}
						onBlur={field.handleBlur}
						onChange={(event) => {
							setText(event.target.value);
							field.handleChange(parseBRLToCents(event.target.value));
						}}
						aria-invalid={invalid}
						aria-describedby={describedBy}
					/>
				</div>
			)}
		</FieldShell>
	);
}

export function DateTimeField({
	field,
	label,
	hint,
	className,
	min,
}: BaseProps & {
	field: BoundField<string>;
	min?: string;
}) {
	return (
		<FieldShell
			label={label}
			hint={hint}
			className={className}
			errors={field.state.meta.errors}
		>
			{({ id, invalid, describedBy }) => (
				<DateTimeInput
					id={id}
					value={field.state.value}
					min={min}
					onBlur={field.handleBlur}
					onChange={field.handleChange}
					invalid={invalid}
					describedBy={describedBy}
				/>
			)}
		</FieldShell>
	);
}

export function DateTimeInput({
	id,
	value,
	min,
	onChange,
	onBlur,
	invalid,
	describedBy,
}: {
	id?: string;
	value: string;
	min?: string;
	onChange: (iso: string) => void;
	onBlur?: () => void;
	invalid?: boolean;
	describedBy?: string;
}) {
	return (
		<Input
			id={id}
			type="datetime-local"
			value={value ? zonedLocalInputValue(value) : ""}
			min={min ? zonedLocalInputValue(min) : undefined}
			onBlur={onBlur}
			onChange={(event) => {
				const [day, time] = event.target.value.split("T");
				if (day && time) onChange(zonedTimeToIso(day, time));
			}}
			aria-invalid={invalid}
			aria-describedby={describedBy}
		/>
	);
}

export function SelectField<T extends string>({
	field,
	label,
	hint,
	className,
	options,
	placeholder,
}: BaseProps & {
	field: BoundField<T> | BoundField<T | null>;
	options: readonly { value: T; label: string }[];
	placeholder?: string;
}) {
	return (
		<FieldShell
			label={label}
			hint={hint}
			className={className}
			errors={field.state.meta.errors}
		>
			{({ id, invalid, describedBy }) => (
				<NativeSelect
					id={id}
					value={field.state.value ?? ""}
					onBlur={field.handleBlur}
					onChange={(event) =>
						(field as BoundField<T | null>).handleChange(
							event.target.value === "" ? null : (event.target.value as T),
						)
					}
					aria-invalid={invalid}
					aria-describedby={describedBy}
				>
					{placeholder !== undefined && (
						<NativeSelectOption value="">{placeholder}</NativeSelectOption>
					)}
					{options.map((option) => (
						<NativeSelectOption key={option.value} value={option.value}>
							{option.label}
						</NativeSelectOption>
					))}
				</NativeSelect>
			)}
		</FieldShell>
	);
}
