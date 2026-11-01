import { z } from "zod";
import { base } from "../base";
import {
	Cents,
	CustomerKind,
	CustomerOrigin,
	CustomerSegment,
	CustomerTier,
	DocumentKind,
	FileKey,
	FileRef,
	Id,
	IsoDateTime,
	RentalDisplayStatus,
	RentalNumber,
} from "../common";

const optionalText = z.string().trim().nullable();

const CustomerFields = z.object({
	kind: CustomerKind,
	name: z.string().trim().min(2, "Informe o nome"),
	taxId: optionalText,
	responsible: optionalText,
	authorizedReceivers: z.array(z.string().trim().min(1)),
	whatsapp: optionalText,
	alternatePhone: optionalText,
	address: optionalText,
	neighborhood: optionalText,
	city: optionalText,
	occupation: optionalText,
	origin: CustomerOrigin.nullable(),
	referredBy: optionalText,
	acceptsPromotions: z.boolean(),
	notes: optionalText,
});

export const CreateCustomerInput = CustomerFields.extend({
	whatsapp: z.string().trim().min(8, "Informe o WhatsApp"),
	city: z.string().trim().min(2, "Informe a cidade"),
});
export type CreateCustomerInput = z.input<typeof CreateCustomerInput>;

export const UpdateCustomerInput = CustomerFields.partial().extend({
	id: Id,
	blockedManually: z.boolean().optional(),
	blockReason: optionalText.optional(),
});
export type UpdateCustomerInput = z.input<typeof UpdateCustomerInput>;

export const CustomerDocument = z.object({
	id: Id,
	kind: DocumentKind,
	label: z.string(),
	receivedAt: IsoDateTime,
	file: FileRef,
});
export type CustomerDocument = z.infer<typeof CustomerDocument>;

export const CustomerStats = z.object({
	rentalCount: z.number().int(),
	totalSpentCents: Cents,
	lateCount: z.number().int(),
	openBalanceCents: Cents,
});
export type CustomerStats = z.infer<typeof CustomerStats>;

export const CustomerLastRental = z.object({
	number: RentalNumber,
	startAt: IsoDateTime,
	displayStatus: RentalDisplayStatus,
});
export type CustomerLastRental = z.infer<typeof CustomerLastRental>;

export const Customer = CustomerFields.extend({
	id: Id,
	blockedManually: z.boolean(),
	blockReason: optionalText,
	createdAt: IsoDateTime,
	tier: CustomerTier,
	stats: CustomerStats,
	lastRental: CustomerLastRental.nullable(),
	missingDocuments: z.array(DocumentKind),
});
export type Customer = z.infer<typeof Customer>;

export const CustomerRentalRow = z.object({
	number: RentalNumber,
	equipmentSummary: z.string(),
	startAt: IsoDateTime,
	endAt: IsoDateTime,
	totalCents: Cents,
	displayStatus: RentalDisplayStatus,
});
export type CustomerRentalRow = z.infer<typeof CustomerRentalRow>;

export const CustomerDetail = Customer.extend({
	documents: z.array(CustomerDocument),
	rentals: z.array(CustomerRentalRow),
});
export type CustomerDetail = z.infer<typeof CustomerDetail>;

export const ListCustomersOutput = z.object({
	customers: z.array(Customer),
	counts: z.object({
		ALL: z.number().int(),
		PROFESSIONALS: z.number().int(),
		HOME_RENOVATION: z.number().int(),
		ATTENTION: z.number().int(),
	}),
});

export const customers = {
	list: base
		.input(
			z.object({
				q: z.string().optional(),
				segment: CustomerSegment.optional(),
			}),
		)
		.output(ListCustomersOutput),
	get: base.input(z.object({ id: Id })).output(CustomerDetail),
	create: base.input(CreateCustomerInput).output(Customer),
	update: base.input(UpdateCustomerInput).output(Customer),
	addDocument: base
		.input(
			z.object({
				customerId: Id,
				kind: DocumentKind,
				fileKey: FileKey,
			}),
		)
		.output(CustomerDocument),
};
