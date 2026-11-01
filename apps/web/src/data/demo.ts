import { isMockSource } from "./source";

export const canRestoreSampleData = isMockSource;

export async function restoreSampleData(): Promise<void> {
	if (import.meta.env.VITE_DATA_SOURCE !== "http") {
		const mock = await import("./mock");
		mock.restoreSampleData();
	}
}
