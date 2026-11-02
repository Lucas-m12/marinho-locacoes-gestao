import type {
	CreateCustomerInput,
	Customer,
	CustomerDetail,
	CustomerDocument,
	UpdateCustomerInput,
} from "@marinho-gestao/contract";
import type { DbClient } from "@marinho-gestao/db";
import {
	type CustomerSegment,
	DEFAULT_DOCUMENT_RETENTION_MONTHS,
	type DocumentKind,
	documentRetentionCutoff,
	isDocumentRetentionOver,
} from "@marinho-gestao/domain";
import {
	customerDetail,
	customerDocumentView,
	customerView,
	listCustomers as listCustomersView,
	requireCustomer,
} from "@marinho-gestao/read-model";
import type { z } from "zod";
import { notFound } from "../errors";
import { inTransaction, type ServiceDeps, type SystemDeps } from "./deps";
import { recordEvent } from "./events";
import { requireUsableFile } from "./files";
import { requireUuid } from "./lookups";
import { loadSnapshot } from "./snapshot";

async function viewOf(db: DbClient, id: string, now: Date): Promise<Customer> {
	const snapshot = await loadSnapshot(db, {
		rentals: { customerId: id },
		customers: { id },
	});
	return customerView(snapshot, requireCustomer(snapshot, id), now);
}

export async function listCustomers(
	deps: ServiceDeps,
	input: { q?: string; segment?: CustomerSegment },
) {
	const snapshot = await loadSnapshot(deps.db, {
		rentals: { customer: { archivedAt: null } },
		customers: { archivedAt: null },
	});
	return listCustomersView(snapshot, input, deps.clock());
}

export async function getCustomer(
	deps: ServiceDeps,
	id: string,
): Promise<CustomerDetail> {
	requireUuid("customer", id);
	const snapshot = await loadSnapshot(deps.db, {
		rentals: { customerId: id },
		customers: { id },
	});
	return customerDetail(snapshot, requireCustomer(snapshot, id), deps.clock());
}

export async function createCustomer(
	deps: ServiceDeps,
	input: z.output<typeof CreateCustomerInput>,
): Promise<Customer> {
	return inTransaction(deps.db, async (tx) => {
		const customer = await tx.customer.create({
			data: { ...input, createdAt: deps.clock() },
		});
		await recordEvent(tx, {
			actor: deps.actor,
			action: "customer.created",
			entity: "Customer",
			entityId: customer.id,
			at: deps.clock(),
		});
		return viewOf(tx, customer.id, deps.clock());
	});
}

export async function updateCustomer(
	deps: ServiceDeps,
	input: z.output<typeof UpdateCustomerInput>,
): Promise<Customer> {
	const { id, blockedManually, blockReason, ...fields } = input;
	requireUuid("customer", id);
	return inTransaction(deps.db, async (tx) => {
		const current = await tx.customer.findUnique({ where: { id } });
		if (!current) throw notFound("customer", id);
		const changes = Object.fromEntries(
			Object.entries(fields).filter(([, value]) => value !== undefined),
		);
		const blockedAt =
			blockedManually === undefined
				? undefined
				: blockedManually
					? (current.blockedAt ?? deps.clock())
					: null;
		await tx.customer.update({
			where: { id },
			data: { ...changes, blockedAt, blockedReason: blockReason },
		});
		await recordEvent(tx, {
			actor: deps.actor,
			action:
				blockedManually === undefined
					? "customer.updated"
					: blockedManually
						? "customer.blocked"
						: "customer.unblocked",
			entity: "Customer",
			entityId: id,
			at: deps.clock(),
			payload: { fields: Object.keys(changes) },
		});
		return viewOf(tx, id, deps.clock());
	});
}

export async function addCustomerDocument(
	deps: ServiceDeps,
	input: { customerId: string; kind: DocumentKind; fileKey: string },
): Promise<CustomerDocument> {
	requireUuid("customer", input.customerId);
	return inTransaction(deps.db, async (tx) => {
		const customer = await tx.customer.findUnique({
			where: { id: input.customerId },
		});
		if (!customer) throw notFound("customer", input.customerId);
		await requireUsableFile(tx, deps.actor.id, input.fileKey, [
			"CUSTOMER_DOCUMENT",
		]);
		const document = await tx.customerDocument.create({
			data: {
				customerId: input.customerId,
				kind: input.kind,
				fileKey: input.fileKey,
				receivedAt: deps.clock(),
			},
		});
		await recordEvent(tx, {
			actor: deps.actor,
			action: "customer.documentAdded",
			entity: "Customer",
			entityId: input.customerId,
			at: deps.clock(),
			payload: { documentId: document.id, kind: input.kind },
		});
		const snapshot = await loadSnapshot(tx, {
			customers: { id: input.customerId },
		});
		return customerDocumentView(snapshot, {
			id: document.id,
			kind: document.kind,
			receivedAt: document.receivedAt.toISOString(),
			fileKey: document.fileKey,
		});
	});
}

export async function purgeExpiredCustomerDocuments(deps: SystemDeps): Promise<{
	customers: number;
	documents: number;
	retentionMonths: number;
}> {
	const now = deps.clock();
	const settings = await deps.db.settings.findUnique({
		where: { id: 1 },
		select: { documentRetentionMonths: true },
	});
	const retentionMonths =
		settings?.documentRetentionMonths ?? DEFAULT_DOCUMENT_RETENTION_MONTHS;
	const cutoff = documentRetentionCutoff(now, retentionMonths);
	const candidates = await deps.db.customer.findMany({
		where: { documents: { some: { receivedAt: { lt: cutoff } } } },
		select: {
			id: true,
			createdAt: true,
			documents: {
				where: { receivedAt: { lt: cutoff } },
				select: { id: true, kind: true, fileKey: true, receivedAt: true },
			},
			rentals: {
				select: {
					createdAt: true,
					endsAt: true,
					returnedAt: true,
					closedAt: true,
				},
			},
		},
		orderBy: { createdAt: "asc" },
	});

	let customers = 0;
	let documents = 0;
	for (const customer of candidates) {
		const expired = customer.documents.filter((document) =>
			isDocumentRetentionOver(document, customer, now, retentionMonths),
		);
		if (expired.length === 0) continue;
		for (const document of expired) {
			await deps.storage.delete(document.fileKey);
		}
		await inTransaction(deps.db, async (tx) => {
			await tx.customerDocument.deleteMany({
				where: { id: { in: expired.map((document) => document.id) } },
			});
			await tx.upload.deleteMany({
				where: { fileKey: { in: expired.map((document) => document.fileKey) } },
			});
			await recordEvent(tx, {
				actor: null,
				action: "customer.documentsPurged",
				entity: "Customer",
				entityId: customer.id,
				at: now,
				payload: {
					retentionMonths,
					documents: expired.map(({ id, kind }) => ({ id, kind })),
				},
			});
		});
		customers += 1;
		documents += expired.length;
	}
	return { customers, documents, retentionMonths };
}
