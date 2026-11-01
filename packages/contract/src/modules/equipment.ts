import { z } from "zod";
import { base } from "../base";
import {
	Cents,
	FileKey,
	FileRef,
	Id,
	IsoDateTime,
	ItemCode,
	LotPricing,
	NonNegativeCents,
	OccurrenceKind,
	RentalDisplayStatus,
	RentalNumber,
	UnitPhotoSlot,
	UnitStatus,
} from "../common";

export const ChecklistTemplateItem = z.object({
	id: Id,
	label: z.string(),
	note: z.string(),
	occurrenceKind: OccurrenceKind,
});
export type ChecklistTemplateItem = z.infer<typeof ChecklistTemplateItem>;

export const EquipmentType = z.object({
	id: Id,
	name: z.string(),
	nicknames: z.array(z.string()),
	description: z.string().nullable(),
	dailyPriceCents: Cents.nullable(),
	depositCents: Cents.nullable(),
	turnaroundHours: z.number().int().nonnegative(),
	accessories: z.string().nullable(),
	checklist: z.array(ChecklistTemplateItem),
	unitCount: z.number().int(),
});
export type EquipmentType = z.infer<typeof EquipmentType>;

export const CreateTypeInput = z.object({
	name: z.string().trim().min(2, "Informe o nome do tipo"),
	nicknames: z.array(z.string().trim().min(1)).default([]),
	description: z.string().trim().nullable(),
	dailyPriceCents: NonNegativeCents.nullable(),
	depositCents: NonNegativeCents.nullable(),
	turnaroundHours: z.number().int().nonnegative().default(12),
	accessories: z.string().trim().nullable(),
});
export type CreateTypeInput = z.input<typeof CreateTypeInput>;

export const UpdateTypeInput = CreateTypeInput.partial().extend({ id: Id });
export type UpdateTypeInput = z.input<typeof UpdateTypeInput>;

export const KnownDamage = z.object({
	id: Id,
	description: z.string(),
	recordedAt: IsoDateTime,
	recordedBy: z.string(),
	photo: FileRef.nullable(),
});
export type KnownDamage = z.infer<typeof KnownDamage>;

export const UnitPhoto = z.object({
	slot: UnitPhotoSlot,
	file: FileRef,
});
export type UnitPhoto = z.infer<typeof UnitPhoto>;

export const Unit = z.object({
	id: Id,
	code: ItemCode,
	typeId: Id,
	typeName: z.string(),
	name: z.string(),
	shortName: z.string(),
	status: UnitStatus,
	statusReason: z.string().nullable(),
	dailyPriceCents: Cents.nullable(),
	depositCents: Cents.nullable(),
	voltage: z.string().nullable(),
	serialNumber: z.string().nullable(),
	accessories: z.string().nullable(),
	owner: z.string().nullable(),
	labelApplied: z.boolean(),
	purchaseValueCents: Cents.nullable(),
	replacementValueCents: Cents.nullable(),
	notes: z.string().nullable(),
	nicknames: z.array(z.string()),
});
export type Unit = z.infer<typeof Unit>;

export const UnitLocation = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("BASE") }),
	z.object({
		kind: z.literal("WITH_CUSTOMER"),
		rentalNumber: RentalNumber,
		customerName: z.string(),
		dueAt: IsoDateTime,
		overdue: z.boolean(),
	}),
	z.object({
		kind: z.literal("LEAVING"),
		rentalNumber: RentalNumber,
		startAt: IsoDateTime,
	}),
	z.object({
		kind: z.literal("IN_MAINTENANCE"),
		reason: z.string(),
		expectedBackAt: IsoDateTime.nullable(),
	}),
	z.object({
		kind: z.literal("IN_INSPECTION"),
		returnedAt: IsoDateTime.nullable(),
	}),
	z.object({
		kind: z.literal("QUOTED"),
		rentalNumber: RentalNumber,
		startAt: IsoDateTime,
		endAt: IsoDateTime,
	}),
	z.object({ kind: z.literal("OTHER"), reason: z.string().nullable() }),
]);
export type UnitLocation = z.infer<typeof UnitLocation>;

export const UnitListItem = Unit.extend({ location: UnitLocation });
export type UnitListItem = z.infer<typeof UnitListItem>;

export const UnitCounts = z.record(z.string(), z.number().int());

export const ListUnitsInput = z.object({
	status: UnitStatus.optional(),
	q: z.string().optional(),
});

export const ListUnitsOutput = z.object({
	units: z.array(UnitListItem),
	counts: UnitCounts,
	total: z.number().int(),
});

export const UnitStats = z.object({
	rentalCount: z.number().int(),
	rentedDays: z.number().int(),
	revenueCents: Cents,
	maintenanceCents: Cents,
});
export type UnitStats = z.infer<typeof UnitStats>;

export const UnitRentalRow = z.object({
	number: RentalNumber,
	customerName: z.string(),
	startAt: IsoDateTime,
	endAt: IsoDateTime,
	valueCents: Cents,
	displayStatus: RentalDisplayStatus,
});
export type UnitRentalRow = z.infer<typeof UnitRentalRow>;

export const UnitDetail = UnitListItem.extend({
	photos: z.array(UnitPhoto),
	knownDamages: z.array(KnownDamage),
	allowedTransitions: z.array(UnitStatus),
	stats: UnitStats,
	rentals: z.array(UnitRentalRow),
});
export type UnitDetail = z.infer<typeof UnitDetail>;

export const CreateUnitInput = z.object({
	typeId: Id,
	code: ItemCode.nullable().default(null),
	name: z.string().trim().min(2, "Informe o nome da unidade"),
	shortName: z.string().trim().nullable().default(null),
	voltage: z.string().trim().nullable(),
	serialNumber: z.string().trim().nullable(),
	accessories: z.string().trim().nullable(),
	owner: z.string().trim().nullable(),
	labelApplied: z.boolean().default(false),
	purchaseValueCents: NonNegativeCents.nullable(),
	replacementValueCents: NonNegativeCents.nullable(),
	notes: z.string().trim().nullable(),
});
export type CreateUnitInput = z.input<typeof CreateUnitInput>;

export const UpdateUnitInput = CreateUnitInput.omit({
	code: true,
	typeId: true,
})
	.partial()
	.extend({
		code: ItemCode,
		dailyPriceCents: NonNegativeCents.nullable().optional(),
		depositCents: NonNegativeCents.nullable().optional(),
	});
export type UpdateUnitInput = z.input<typeof UpdateUnitInput>;

export const ChangeUnitStatusInput = z.object({
	code: ItemCode,
	to: UnitStatus,
	reason: z.string().trim().optional(),
});

export const AddUnitPhotoInput = z.object({
	code: ItemCode,
	slot: UnitPhotoSlot,
	fileKey: FileKey,
});

export const AddKnownDamageInput = z.object({
	code: ItemCode,
	description: z.string().trim().min(3, "Descreva o dano"),
	fileKey: FileKey.nullable().default(null),
});
export type AddKnownDamageInput = z.input<typeof AddKnownDamageInput>;

export const LotNextBooking = z.object({
	rentalNumber: RentalNumber,
	startAt: IsoDateTime,
	displayStatus: RentalDisplayStatus,
	quantity: z.number().int(),
});

export const Lot = z.object({
	id: Id,
	code: ItemCode,
	name: z.string(),
	nicknames: z.array(z.string()),
	pricing: LotPricing,
	total: z.number().int().nonnegative(),
	inMaintenance: z.number().int().nonnegative(),
	retired: z.number().int().nonnegative(),
	dailyPriceCents: Cents.nullable(),
	depositCents: Cents.nullable(),
	kitComposition: z.string().nullable(),
	assetCode: z.string().nullable(),
	turnaroundHours: z.number().int().nonnegative(),
	checklist: z.array(ChecklistTemplateItem),
	freeToday: z.number().int(),
	reservedToday: z.number().int(),
	nextBooking: LotNextBooking.nullable(),
});
export type Lot = z.infer<typeof Lot>;

export const UpdateLotInput = z.object({
	id: Id,
	total: z.number().int().nonnegative().optional(),
	inMaintenance: z.number().int().nonnegative().optional(),
	retired: z.number().int().nonnegative().optional(),
	dailyPriceCents: NonNegativeCents.nullable().optional(),
	depositCents: NonNegativeCents.nullable().optional(),
	kitComposition: z.string().trim().nullable().optional(),
	assetCode: z.string().trim().nullable().optional(),
});
export type UpdateLotInput = z.input<typeof UpdateLotInput>;

export const equipment = {
	listTypes: base.output(z.array(EquipmentType)),
	listUnits: base.input(ListUnitsInput).output(ListUnitsOutput),
	getUnit: base.input(z.object({ code: ItemCode })).output(UnitDetail),
	createType: base.input(CreateTypeInput).output(EquipmentType),
	updateType: base.input(UpdateTypeInput).output(EquipmentType),
	createUnit: base.input(CreateUnitInput).output(Unit),
	updateUnit: base.input(UpdateUnitInput).output(Unit),
	changeUnitStatus: base.input(ChangeUnitStatusInput).output(Unit),
	addUnitPhoto: base.input(AddUnitPhotoInput).output(UnitPhoto),
	addKnownDamage: base.input(AddKnownDamageInput).output(KnownDamage),
	listLots: base.output(z.array(Lot)),
	updateLot: base.input(UpdateLotInput).output(Lot),
};
