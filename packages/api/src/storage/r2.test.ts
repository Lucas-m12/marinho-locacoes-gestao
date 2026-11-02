import { describe, expect, it } from "vitest";
import { R2Storage } from "./r2";

const storage = new R2Storage({
	accountId: "conta",
	accessKeyId: "chave",
	secretAccessKey: "segredo",
	bucket: "marinho-dev",
});

describe("R2Storage", () => {
	it("assina o PUT na URL, com validade e o Content-Type", async () => {
		const url = new URL(
			await storage.presignPut(
				"checklist_photo/2026/11/a.jpg",
				"image/jpeg",
				600,
			),
		);
		expect(url.origin).toBe("https://conta.r2.cloudflarestorage.com");
		expect(url.pathname).toBe("/marinho-dev/checklist_photo/2026/11/a.jpg");
		expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
		expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
		expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain(
			"content-type",
		);
		expect(url.searchParams.get("X-Amz-Credential")).toContain("/auto/s3/");
	});

	it("assina o GET de leitura", async () => {
		const url = new URL(
			await storage.presignGet("customer_document/2026/11/b.pdf", 600),
		);
		expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
		expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
	});
});
