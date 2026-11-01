import { z } from "zod";
import { base } from "../base";
import { Cents, Id, NonNegativeCents, SignalMode } from "../common";

export const TypePricing = z.object({
	typeId: Id,
	name: z.string(),
	codes: z.array(z.string()),
	dailyPriceCents: Cents.nullable(),
	depositCents: Cents.nullable(),
	turnaroundHours: z.number().int().nonnegative(),
});
export type TypePricing = z.infer<typeof TypePricing>;

export const LotPricingRow = z.object({
	lotId: Id,
	name: z.string(),
	perPiece: z.boolean(),
	dailyPriceCents: Cents.nullable(),
	depositCents: Cents.nullable(),
	turnaroundHours: z.number().int().nonnegative(),
});
export type LotPricingRow = z.infer<typeof LotPricingRow>;

export const DeliveryFee = z.object({
	city: z.string(),
	feeCents: Cents.nullable(),
});
export type DeliveryFee = z.infer<typeof DeliveryFee>;

export const SignalRule = z.object({
	mode: SignalMode.nullable(),
	valueCents: NonNegativeCents.nullable(),
	percent: z.number().min(0).max(100).nullable(),
});
export type SignalRule = z.infer<typeof SignalRule>;

export const Settings = z.object({
	types: z.array(TypePricing),
	lots: z.array(LotPricingRow),
	deliveryFees: z.array(DeliveryFee),
	signal: SignalRule,
	signalDeadlineHours: z.number().int().positive(),
	dailiesRuleDescription: z.string(),
	lateFeeRuleDescription: z.string(),
});
export type Settings = z.infer<typeof Settings>;

export const UpdateSettingsInput = z.object({
	types: z
		.array(
			z.object({
				typeId: Id,
				dailyPriceCents: NonNegativeCents.nullable().optional(),
				depositCents: NonNegativeCents.nullable().optional(),
				turnaroundHours: z.number().int().nonnegative().optional(),
			}),
		)
		.optional(),
	lots: z
		.array(
			z.object({
				lotId: Id,
				dailyPriceCents: NonNegativeCents.nullable().optional(),
				depositCents: NonNegativeCents.nullable().optional(),
				turnaroundHours: z.number().int().nonnegative().optional(),
			}),
		)
		.optional(),
	deliveryFees: z
		.array(
			z.object({ city: z.string(), feeCents: NonNegativeCents.nullable() }),
		)
		.optional(),
	signal: SignalRule.optional(),
	signalDeadlineHours: z.number().int().positive().optional(),
});
export type UpdateSettingsInput = z.input<typeof UpdateSettingsInput>;

export const settings = {
	get: base.output(Settings),
	update: base.input(UpdateSettingsInput).output(Settings),
};
