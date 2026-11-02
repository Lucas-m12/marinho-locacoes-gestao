import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

type FakeRequest = {
	method: string;
	path: string;
	query: URLSearchParams;
	authorization: string | undefined;
	body: Buffer;
};

function readBody(request: IncomingMessage): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		request.on("data", (chunk: Buffer) => chunks.push(chunk));
		request.on("end", () => resolve(Buffer.concat(chunks)));
		request.on("error", reject);
	});
}

describe("R2Storage.putFile", () => {
	const requests: FakeRequest[] = [];
	const objects = new Map<string, Buffer>();
	const parts = new Map<number, Buffer>();
	let failPart: number | null = null;
	let server: Server;
	let endpoint = "";
	let dir = "";

	beforeAll(async () => {
		dir = await mkdtemp(join(tmpdir(), "r2-test-"));
		server = createServer(async (request, response) => {
			const url = new URL(request.url ?? "/", "http://localhost");
			const body = await readBody(request);
			const query = url.searchParams;
			requests.push({
				method: request.method ?? "",
				path: url.pathname,
				query,
				authorization: request.headers.authorization,
				body,
			});
			if (request.method === "POST" && query.has("uploads")) {
				response.end(
					"<InitiateMultipartUploadResult><UploadId>envio-1</UploadId></InitiateMultipartUploadResult>",
				);
				return;
			}
			if (request.method === "PUT" && query.has("partNumber")) {
				const partNumber = Number(query.get("partNumber"));
				if (partNumber === failPart) {
					response.statusCode = 400;
					response.end("<Error><Code>InvalidPart</Code></Error>");
					return;
				}
				parts.set(partNumber, body);
				response.setHeader("ETag", `"etag-${partNumber}"`);
				response.end();
				return;
			}
			if (request.method === "POST" && query.has("uploadId")) {
				const numbers = [
					...body.toString().matchAll(/<PartNumber>(\d+)<\/PartNumber>/g),
				].map((match) => Number(match[1]));
				objects.set(
					url.pathname,
					Buffer.concat(
						numbers.map((number) => parts.get(number) ?? Buffer.alloc(0)),
					),
				);
				response.end(
					"<CompleteMultipartUploadResult></CompleteMultipartUploadResult>",
				);
				return;
			}
			if (request.method === "PUT") {
				objects.set(url.pathname, body);
				response.end();
				return;
			}
			response.end();
		});
		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve),
		);
		endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		await new Promise((resolve) => server.close(resolve));
		await rm(dir, { recursive: true, force: true });
	});

	beforeEach(() => {
		requests.length = 0;
		objects.clear();
		parts.clear();
		failPart = null;
	});

	function bucket() {
		return new R2Storage({
			accountId: "conta",
			accessKeyId: "chave",
			secretAccessKey: "segredo",
			bucket: "marinho-backups",
			endpoint,
		});
	}

	async function fileWith(content: string): Promise<string> {
		const path = join(dir, `${crypto.randomUUID()}.dump`);
		await writeFile(path, content);
		return path;
	}

	it("envia um arquivo pequeno num PUT só, assinado", async () => {
		const path = await fileWith("backup pequeno");
		const result = await bucket().putFile(
			"postgres/2026/11/02/a.dump",
			path,
			"application/octet-stream",
			1024,
		);
		expect(result).toEqual({ sizeBytes: 14, parts: 1 });
		expect(requests).toHaveLength(1);
		expect(requests[0]?.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
		expect(
			objects.get("/marinho-backups/postgres/2026/11/02/a.dump")?.toString(),
		).toBe("backup pequeno");
	});

	it("divide um arquivo grande em partes e junta na ordem", async () => {
		const path = await fileWith("0123456789abcdefghij-fim");
		const result = await bucket().putFile(
			"postgres/2026/11/02/b.dump",
			path,
			"application/octet-stream",
			10,
		);
		expect(result).toEqual({ sizeBytes: 24, parts: 3 });
		expect(requests.map((request) => request.method)).toEqual([
			"POST",
			"PUT",
			"PUT",
			"PUT",
			"POST",
		]);
		expect(
			objects.get("/marinho-backups/postgres/2026/11/02/b.dump")?.toString(),
		).toBe("0123456789abcdefghij-fim");
	});

	it("cancela o envio em partes quando uma parte falha", async () => {
		failPart = 2;
		const path = await fileWith("0123456789abcdefghij-fim");
		await expect(
			bucket().putFile("postgres/c.dump", path, "application/octet-stream", 10),
		).rejects.toThrow(/parte 2/);
		const last = requests.at(-1);
		expect(last?.method).toBe("DELETE");
		expect(last?.query.get("uploadId")).toBe("envio-1");
		expect(objects.size).toBe(0);
	});
});
