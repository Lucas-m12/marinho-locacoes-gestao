import { describe, expect, it } from "vitest";
import {
	isDocumentRetentionOver,
	lastCustomerActivity,
	pendingUploadCutoff,
	subtractMonths,
} from "./retention";

const NOW = "2026-11-02T12:00:00.000Z";

const rental = (
	endsAt: string,
	extra: Partial<Record<string, string>> = {},
) => ({
	createdAt: extra.createdAt ?? endsAt,
	endsAt,
	returnedAt: extra.returnedAt ?? null,
	closedAt: extra.closedAt ?? null,
});

describe("subtractMonths", () => {
	it("volta meses inteiros", () => {
		expect(subtractMonths(NOW, 24).toISOString()).toBe(
			"2024-11-02T12:00:00.000Z",
		);
	});

	it("usa o último dia quando o mês de destino é mais curto", () => {
		expect(subtractMonths("2026-03-31T10:00:00.000Z", 1).toISOString()).toBe(
			"2026-02-28T10:00:00.000Z",
		);
	});
});

describe("lastCustomerActivity", () => {
	it("é o cadastro quando o cliente nunca alugou", () => {
		expect(
			lastCustomerActivity({ createdAt: "2023-05-10T10:00:00Z", rentals: [] }),
		).toEqual(new Date("2023-05-10T10:00:00Z"));
	});

	it("é a data mais recente entre as locações, incluindo devolução e encerramento", () => {
		expect(
			lastCustomerActivity({
				createdAt: "2022-01-01T10:00:00Z",
				rentals: [
					rental("2023-01-10T10:00:00Z"),
					rental("2023-06-10T10:00:00Z", {
						returnedAt: "2023-06-12T10:00:00Z",
						closedAt: "2023-06-15T10:00:00Z",
					}),
				],
			}),
		).toEqual(new Date("2023-06-15T10:00:00Z"));
	});
});

describe("isDocumentRetentionOver", () => {
	const oldDocument = { receivedAt: "2024-01-10T10:00:00Z" };

	it("apaga quando o cliente está sem locação há mais que o prazo", () => {
		expect(
			isDocumentRetentionOver(
				oldDocument,
				{
					createdAt: "2023-01-01T10:00:00Z",
					rentals: [rental("2024-01-12T10:00:00Z")],
				},
				NOW,
				24,
			),
		).toBe(true);
	});

	it("mantém quando houve locação dentro do prazo", () => {
		expect(
			isDocumentRetentionOver(
				oldDocument,
				{
					createdAt: "2023-01-01T10:00:00Z",
					rentals: [rental("2025-02-01T10:00:00Z")],
				},
				NOW,
				24,
			),
		).toBe(false);
	});

	it("mantém um documento recebido dentro do prazo", () => {
		expect(
			isDocumentRetentionOver(
				{ receivedAt: "2025-12-01T10:00:00Z" },
				{ createdAt: "2023-01-01T10:00:00Z", rentals: [] },
				NOW,
				24,
			),
		).toBe(false);
	});

	it("respeita o prazo configurado", () => {
		const customer = {
			createdAt: "2023-01-01T10:00:00Z",
			rentals: [rental("2025-06-01T10:00:00Z")],
		};
		expect(
			isDocumentRetentionOver(
				{ receivedAt: "2025-05-01T10:00:00Z" },
				customer,
				NOW,
				24,
			),
		).toBe(false);
		expect(
			isDocumentRetentionOver(
				{ receivedAt: "2025-05-01T10:00:00Z" },
				customer,
				NOW,
				12,
			),
		).toBe(true);
	});
});

describe("pendingUploadCutoff", () => {
	it("considera vencido o upload pendente com mais de 24 h", () => {
		expect(pendingUploadCutoff(NOW).toISOString()).toBe(
			"2026-11-01T12:00:00.000Z",
		);
	});
});
