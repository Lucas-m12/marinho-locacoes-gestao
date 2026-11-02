import { describe, expect, it } from "vitest";
import { canReadFile, fileExtension, isUploadAllowed } from "./uploads";

describe("isUploadAllowed", () => {
	it("aceita foto até 10 MB e recusa acima", () => {
		const photo = {
			purpose: "CHECKLIST_PHOTO" as const,
			contentType: "image/jpeg",
		};
		expect(isUploadAllowed({ ...photo, sizeBytes: 10 * 1024 * 1024 })).toBe(
			true,
		);
		expect(isUploadAllowed({ ...photo, sizeBytes: 10 * 1024 * 1024 + 1 })).toBe(
			false,
		);
	});

	it("aceita vídeo só no teste do checklist", () => {
		const video = { contentType: "video/mp4", sizeBytes: 1000 };
		expect(isUploadAllowed({ ...video, purpose: "CHECKLIST_VIDEO" })).toBe(
			true,
		);
		expect(isUploadAllowed({ ...video, purpose: "UNIT_PHOTO" })).toBe(false);
	});

	it("aceita PDF só em documento e comprovante", () => {
		const pdf = { contentType: "application/pdf", sizeBytes: 1000 };
		expect(isUploadAllowed({ ...pdf, purpose: "CUSTOMER_DOCUMENT" })).toBe(
			true,
		);
		expect(isUploadAllowed({ ...pdf, purpose: "RECEIPT" })).toBe(true);
		expect(isUploadAllowed({ ...pdf, purpose: "DAMAGE_PHOTO" })).toBe(false);
	});

	it("recusa SVG", () => {
		expect(
			isUploadAllowed({
				purpose: "UNIT_PHOTO",
				contentType: "image/svg+xml",
				sizeBytes: 10,
			}),
		).toBe(false);
	});
});

describe("canReadFile", () => {
	it("documento de cliente só para gestão e atendimento", () => {
		expect(canReadFile("MANAGER", "CUSTOMER_DOCUMENT")).toBe(true);
		expect(canReadFile("ATTENDANT", "CUSTOMER_DOCUMENT")).toBe(true);
		expect(canReadFile("EQUIPMENT", "CUSTOMER_DOCUMENT")).toBe(false);
		expect(canReadFile("EQUIPMENT", "CHECKLIST_PHOTO")).toBe(true);
	});
});

describe("fileExtension", () => {
	it("usa a extensão do nome em minúsculas", () => {
		expect(fileExtension("Foto.JPG")).toBe("jpg");
		expect(fileExtension("sem-extensao")).toBe("bin");
	});
});
