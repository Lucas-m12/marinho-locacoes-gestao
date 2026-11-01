import type {
	CustomerTier,
	RentalDisplayStatus,
	UnitStatus,
} from "@marinho-gestao/domain";
import { cn } from "@marinho-gestao/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import {
	CUSTOMER_TIER_LABELS,
	RENTAL_STATUS_LABELS,
	UNIT_STATUS_LABELS,
} from "@/lib/labels";

const chip = cva(
	"inline-flex items-center rounded-full font-bold whitespace-nowrap",
	{
		variants: {
			tone: {
				available: "bg-status-available text-status-available-foreground",
				reserved: "bg-status-reserved text-status-reserved-foreground",
				active: "bg-status-active text-status-active-foreground",
				waiting: "bg-status-waiting text-status-waiting-foreground",
				alert: "bg-status-alert text-status-alert-foreground",
				draft:
					"border-line-strong bg-status-draft text-status-draft-foreground border",
				critical: "bg-status-critical text-status-critical-foreground",
			},
			size: {
				sm: "min-h-6 px-2.5 text-xs",
				md: "min-h-[26px] px-2.5 text-[13px]",
				lg: "min-h-7 px-3 text-sm",
			},
		},
		defaultVariants: { size: "md" },
	},
);

type Tone = NonNullable<VariantProps<typeof chip>["tone"]>;

const UNIT_TONES: Record<UnitStatus, Tone> = {
	AVAILABLE: "available",
	SEPARATED: "reserved",
	RENTED: "active",
	IN_INSPECTION: "waiting",
	IN_MAINTENANCE: "alert",
	DAMAGED: "alert",
	NOT_RETURNED: "critical",
	BLOCKED: "waiting",
	RETIRED: "draft",
};

const RENTAL_TONES: Record<RentalDisplayStatus, Tone> = {
	QUOTE: "draft",
	AWAITING_DEPOSIT: "waiting",
	CONFIRMED: "reserved",
	SEPARATED: "reserved",
	ON_SITE: "active",
	RETURNED: "waiting",
	CLOSED: "waiting",
	CANCELED: "draft",
	EXPIRED: "draft",
	OVERDUE: "alert",
};

const TIER_TONES: Record<CustomerTier, Tone> = {
	BLOCKED: "critical",
	ATTENTION: "alert",
	TRUSTED: "available",
	RECURRING: "reserved",
	NEW: "waiting",
};

type ChipSize = VariantProps<typeof chip>["size"];

type StatusChipProps = { size?: ChipSize; className?: string } & (
	| { kind: "unit"; status: UnitStatus }
	| { kind: "rental"; status: RentalDisplayStatus }
	| { kind: "customer"; status: CustomerTier }
	| { kind?: undefined; tone: Tone; children: ReactNode }
);

function resolve(props: StatusChipProps): { tone: Tone; label: ReactNode } {
	switch (props.kind) {
		case "unit":
			return {
				tone: UNIT_TONES[props.status],
				label: UNIT_STATUS_LABELS[props.status],
			};
		case "rental":
			return {
				tone: RENTAL_TONES[props.status],
				label: RENTAL_STATUS_LABELS[props.status],
			};
		case "customer":
			return {
				tone: TIER_TONES[props.status],
				label: CUSTOMER_TIER_LABELS[props.status],
			};
		default:
			return { tone: props.tone, label: props.children };
	}
}

export function StatusChip(props: StatusChipProps) {
	const { tone, label } = resolve(props);
	return (
		<span className={cn(chip({ tone, size: props.size }), props.className)}>
			{label}
		</span>
	);
}
