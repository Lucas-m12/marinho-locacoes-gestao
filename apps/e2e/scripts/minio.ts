import { createHash } from "node:crypto";
import { AwsClient } from "aws4fetch";

export type MinioConfig = {
	endpoint: string;
	accessKeyId: string;
	secretAccessKey: string;
	bucket: string;
	allowedOrigins: string[];
};

export function minioConfigFromEnv(
	env: NodeJS.ProcessEnv = process.env,
): MinioConfig {
	return {
		endpoint: env.S3_ENDPOINT ?? "http://localhost:9000",
		accessKeyId: env.S3_ACCESS_KEY_ID ?? "minioadmin",
		secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "minioadmin-secret",
		bucket: env.S3_BUCKET ?? "marinho-dev",
		allowedOrigins: (
			env.S3_ALLOWED_ORIGINS ?? "http://localhost:3001,http://localhost:3101"
		).split(","),
	};
}

function corsDocument(origins: string[]): string {
	const allowed = origins
		.map((origin) => `<AllowedOrigin>${origin}</AllowedOrigin>`)
		.join("");
	return `<CORSConfiguration><CORSRule>${allowed}<AllowedMethod>PUT</AllowedMethod><AllowedMethod>GET</AllowedMethod><AllowedHeader>*</AllowedHeader><MaxAgeSeconds>3600</MaxAgeSeconds></CORSRule></CORSConfiguration>`;
}

async function waitUntilLive(endpoint: string, timeoutMs: number) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const live = await fetch(`${endpoint}/minio/health/live`)
			.then((response) => response.ok)
			.catch(() => false);
		if (live) return;
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(`MinIO não respondeu em ${endpoint}`);
}

export async function setupMinio(config: MinioConfig): Promise<void> {
	const endpoint = config.endpoint.replace(/\/$/, "");
	await waitUntilLive(endpoint, 30_000);
	const client = new AwsClient({
		accessKeyId: config.accessKeyId,
		secretAccessKey: config.secretAccessKey,
		service: "s3",
		region: "us-east-1",
	});
	const bucketUrl = `${endpoint}/${config.bucket}`;

	const head = await client.fetch(bucketUrl, { method: "HEAD" });
	if (head.status === 404) {
		const created = await client.fetch(bucketUrl, { method: "PUT" });
		if (!created.ok) {
			throw new Error(
				`MinIO recusou criar o bucket ${config.bucket}: ${created.status} ${await created.text()}`,
			);
		}
	} else if (!head.ok) {
		throw new Error(`MinIO respondeu ${head.status} ao conferir o bucket`);
	}

	const rules = corsDocument(config.allowedOrigins);
	const cors = await client.fetch(`${bucketUrl}?cors`, {
		method: "PUT",
		headers: {
			"Content-Type": "application/xml",
			"Content-MD5": createHash("md5").update(rules).digest("base64"),
		},
		body: rules,
	});
	if (!cors.ok) {
		throw new Error(
			`MinIO recusou o CORS: ${cors.status} ${await cors.text()}`,
		);
	}

	for (const origin of config.allowedOrigins) {
		const preflight = await fetch(`${bucketUrl}/cors-check`, {
			method: "OPTIONS",
			headers: {
				Origin: origin,
				"Access-Control-Request-Method": "PUT",
				"Access-Control-Request-Headers": "content-type",
			},
		});
		const allowed = preflight.headers.get("access-control-allow-origin");
		if (allowed !== origin && allowed !== "*") {
			throw new Error(
				`O MinIO não libera PUT de ${origin} (Access-Control-Allow-Origin: ${allowed}). Confira a regra de CORS do bucket.`,
			);
		}
	}
}

if (import.meta.main) {
	const config = minioConfigFromEnv();
	await setupMinio(config);
	console.log(
		`Bucket ${config.bucket} pronto em ${config.endpoint}, com CORS para ${config.allowedOrigins.join(", ")}.`,
	);
}
